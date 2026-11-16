import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import {
  assertChunkMinutes,
  followGta6Live,
  GTA6_LIVE_LIMIT,
  liveChannelKey,
  type Gta6Report,
} from "./gta6-highlights-media.ts";

export type Gta6LiveClip = { file: string; class: string };
export type Gta6LiveChannel = {
  id: string;
  url: string;
  label: string;
  minutes: number;
  telegram: boolean;
  running: boolean;
  line: string;
  error: string;
  clips: Gta6LiveClip[];
};
export type Gta6LiveView = { limit: number; used: number; channels: Gta6LiveChannel[] };

type StoredChannel = Omit<Gta6LiveChannel, "running">;
type Stored = { channels: StoredChannel[] };

function clipsFrom(report: Gta6Report): Gta6LiveClip[] {
  return report.sources.flatMap((source) => source.highlights.map((hit) => ({
    file: basename(hit.clip),
    class: hit.class,
  }))).filter((clip) => /^[\w.-]+\.mp4$/u.test(clip.file));
}

function cleanClip(clip: unknown): Gta6LiveClip | null {
  if (!clip || typeof clip !== "object") return null;
  const file = (clip as { file?: unknown }).file;
  const name = (clip as { class?: unknown }).class;
  return typeof file === "string" && /^[\w.-]+\.mp4$/u.test(file) && typeof name === "string" ? { file, class: name } : null;
}

export class Gta6LiveSessions {
  private active = new Map<string, { userId: number; stop: AbortController; token: symbol; folder: string }>();
  private tasks = new Map<string, Promise<void>>();
  private writes = new Map<number, Promise<void>>();

  constructor(private readonly root: string, private readonly follow: typeof followGta6Live = followGta6Live) {}

  private dir(userId: number) { return resolve(this.root, `u${userId}`); }

  private async read(userId: number): Promise<Stored> {
    try {
      const parsed = JSON.parse(await readFile(resolve(this.dir(userId), "state.json"), "utf8")) as { channels?: unknown };
      if (!Array.isArray(parsed.channels)) return { channels: [] };
      return {
        channels: parsed.channels.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const row = item as Partial<StoredChannel>;
          const minutes = Number(row.minutes);
          if (typeof row.id !== "string" || !/^[\w.-]+$/u.test(row.id) || typeof row.url !== "string" || typeof row.label !== "string") return [];
          return [{
            id: row.id,
            url: row.url,
            label: row.label,
            minutes: Number.isInteger(minutes) && minutes >= 10 && minutes <= 15 ? minutes : 10,
            telegram: row.telegram === true,
            line: typeof row.line === "string" ? row.line : "",
            error: typeof row.error === "string" ? row.error : "",
            clips: Array.isArray(row.clips) ? row.clips.flatMap((clip) => cleanClip(clip) ?? []) : [],
          }];
        }),
      };
    } catch {
      return { channels: [] };
    }
  }

  private async write(userId: number, state: Stored) {
    await mkdir(this.dir(userId), { recursive: true });
    await writeFile(resolve(this.dir(userId), "state.json"), `${JSON.stringify(state)}\n`);
  }

  private update(userId: number, change: (state: Stored) => Stored) {
    const prev = this.writes.get(userId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
      await this.write(userId, change(await this.read(userId)));
    });
    this.writes.set(userId, run.then(() => undefined, () => undefined));
    return run;
  }

  private running(userId: number, folder: string) {
    return [...this.active.values()].some((item) => item.userId === userId && item.folder === folder && item.token);
  }

  async view(userId: number): Promise<Gta6LiveView> {
    const stored = await this.read(userId);
    return {
      limit: GTA6_LIVE_LIMIT,
      used: this.active.size,
      channels: stored.channels.map((channel) => ({ ...channel, running: this.running(userId, channel.id) })),
    };
  }

  async start(userId: number, input: { url: string; minutes?: number; telegram?: boolean }) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Некорректный пользователь.");
    const channel = liveChannelKey(input.url);
    const minutes = assertChunkMinutes(input.minutes ?? 10);
    const telegram = input.telegram === true;
    if (this.active.has(channel.key)) throw new Error("Этот канал уже идёт.");
    if (this.active.size >= GTA6_LIVE_LIMIT) throw new Error("Уже следим за 5 каналами.");
    const token = Symbol(channel.folder);
    const stop = new AbortController();
    this.active.set(channel.key, { userId, stop, token, folder: channel.folder });
    const row: StoredChannel = {
      id: channel.folder,
      url: channel.url,
      label: channel.label,
      minutes,
      telegram,
      line: `Пишу кусок 1, ${minutes} мин.`,
      error: "",
      clips: [],
    };
    try {
      await this.update(userId, (state) => ({ channels: [...state.channels.filter((item) => item.id !== channel.folder), row] }));
    } catch (error) {
      if (this.active.get(channel.key)?.token === token) this.active.delete(channel.key);
      throw error;
    }
    const taskKey = `${userId}:${channel.folder}`;
    const task = this.follow({
      url: channel.url,
      outDir: resolve(this.dir(userId), channel.folder),
      minutes,
      telegram,
      signal: stop.signal,
      log: (line) => { void this.note(userId, channel.folder, token, line); },
    }).then(async (report) => {
      const clips = clipsFrom(report);
      await this.patch(userId, channel.folder, token, {
        line: stop.signal.aborted ? "Остановлено" : "Эфир закончился",
        error: "",
        ...(clips.length ? { clips } : {}),
      });
    }).catch(async (error: unknown) => {
      await this.patch(userId, channel.folder, token, { error: error instanceof Error ? error.message : "Не удалось вести эфир.", line: "" });
    }).finally(() => {
      if (this.active.get(channel.key)?.token === token) this.active.delete(channel.key);
      this.tasks.delete(taskKey);
    });
    this.tasks.set(taskKey, task);
    return this.view(userId);
  }

  async stop(userId: number, id: string) {
    const found = [...this.active.entries()].find(([, item]) => item.userId === userId && item.folder === id);
    if (!found) throw new Error("Канал не найден.");
    found[1].stop.abort();
    return this.view(userId);
  }

  settled(userId: number) {
    const jobs = [...this.tasks.entries()].filter(([key]) => key.startsWith(`${userId}:`)).map(([, task]) => task);
    return Promise.all(jobs).then(() => undefined);
  }

  clipFile(userId: number, channelId: string, file: string) {
    if (!/^[\w.-]+$/u.test(channelId) || basename(file) !== file || !/^[\w.-]+\.mp4$/u.test(file)) throw new Error("Некорректный файл.");
    const root = resolve(this.dir(userId));
    const path = resolve(root, channelId, "clips", file);
    if (!path.startsWith(root + sep)) throw new Error("Некорректный файл.");
    return path;
  }

  private async patch(userId: number, folder: string, token: symbol, partial: Partial<StoredChannel>) {
    const current = [...this.active.values()].find((item) => item.userId === userId && item.folder === folder);
    if (current && current.token !== token) return;
    await this.update(userId, (state) => ({
      channels: state.channels.map((channel) => channel.id === folder ? { ...channel, ...partial } : channel),
    }));
  }

  private async note(userId: number, folder: string, token: symbol, line: string) {
    let clips: Gta6LiveClip[] = [];
    try {
      clips = clipsFrom(JSON.parse(await readFile(resolve(this.dir(userId), folder, "report.json"), "utf8")) as Gta6Report);
    } catch { /* отчёт появляется после первого куска */ }
    await this.patch(userId, folder, token, { line, ...(clips.length ? { clips } : {}), error: "" });
  }
}
