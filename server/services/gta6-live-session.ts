import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  assertChunkMinutes,
  assertLivePage,
  followGta6Live,
  type Gta6Report,
} from "./gta6-highlights-media.ts";

export type Gta6LiveClip = { file: string; class: string };
export type Gta6LiveView = {
  running: boolean;
  url: string;
  minutes: number;
  telegram: boolean;
  line: string;
  error: string;
  clips: Gta6LiveClip[];
};

const EMPTY: Gta6LiveView = { running: false, url: "", minutes: 10, telegram: false, line: "", error: "", clips: [] };

function clipsFrom(report: Gta6Report): Gta6LiveClip[] {
  return report.sources.flatMap((source) => source.highlights.map((hit) => ({
    file: basename(hit.clip),
    class: hit.class,
  }))).filter((clip) => /^[\w.-]+\.mp4$/u.test(clip.file));
}

export class Gta6LiveSessions {
  private active = new Map<number, AbortController>();
  private tokens = new Map<number, symbol>();
  private tasks = new Map<number, Promise<void>>();

  constructor(private readonly root: string, private readonly follow: typeof followGta6Live = followGta6Live) {}

  private dir(userId: number) { return resolve(this.root, `u${userId}`); }

  private async read(userId: number): Promise<Gta6LiveView> {
    try {
      const parsed = JSON.parse(await readFile(resolve(this.dir(userId), "state.json"), "utf8")) as Partial<Gta6LiveView>;
      const minutes = Number(parsed.minutes);
      return {
        running: false,
        url: typeof parsed.url === "string" ? parsed.url : "",
        minutes: Number.isInteger(minutes) && minutes >= 10 && minutes <= 15 ? minutes : 10,
        telegram: parsed.telegram === true,
        line: typeof parsed.line === "string" ? parsed.line : "",
        error: typeof parsed.error === "string" ? parsed.error : "",
        clips: Array.isArray(parsed.clips) ? parsed.clips.flatMap((clip) => {
          if (!clip || typeof clip !== "object") return [];
          const file = (clip as { file?: unknown }).file;
          const name = (clip as { class?: unknown }).class;
          return typeof file === "string" && /^[\w.-]+\.mp4$/u.test(file) && typeof name === "string" ? [{ file, class: name }] : [];
        }) : [],
      };
    } catch {
      return { ...EMPTY, clips: [] };
    }
  }

  private async write(userId: number, state: Gta6LiveView) {
    await mkdir(this.dir(userId), { recursive: true });
    await writeFile(resolve(this.dir(userId), "state.json"), `${JSON.stringify(state)}\n`);
  }

  private async patch(userId: number, token: symbol, partial: Partial<Gta6LiveView>) {
    if (this.tokens.get(userId) !== token) return;
    const current = await this.read(userId);
    await this.write(userId, { ...current, ...partial, running: this.active.has(userId) });
  }

  async view(userId: number): Promise<Gta6LiveView> {
    const stored = await this.read(userId);
    return { ...stored, running: this.active.has(userId) };
  }

  async start(userId: number, input: { url: string; minutes?: number; telegram?: boolean }) {
    if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Некорректный пользователь.");
    if (this.active.has(userId)) throw new Error("Эфир уже идёт.");
    const url = assertLivePage(input.url).href;
    const minutes = assertChunkMinutes(input.minutes ?? 10);
    const telegram = input.telegram === true;
    const token = Symbol(userId);
    const stop = new AbortController();
    this.tokens.set(userId, token);
    this.active.set(userId, stop);
    await this.write(userId, { running: true, url, minutes, telegram, line: `Пишу кусок 1, ${minutes} мин.`, error: "", clips: (await this.read(userId)).clips });
    const task = this.follow({
      url,
      outDir: this.dir(userId),
      minutes,
      telegram,
      signal: stop.signal,
      log: (line) => { void this.note(userId, token, line); },
    }).then(async (report) => {
      await this.patch(userId, token, {
        line: stop.signal.aborted ? "Остановлено" : "Эфир закончился",
        error: "",
        clips: clipsFrom(report),
      });
    }).catch(async (error: unknown) => {
      await this.patch(userId, token, { error: error instanceof Error ? error.message : "Не удалось вести эфир.", line: "" });
    }).finally(() => {
      if (this.tokens.get(userId) === token) {
        this.active.delete(userId);
        this.tasks.delete(userId);
      }
    });
    this.tasks.set(userId, task);
    return this.view(userId);
  }

  async stop(userId: number) {
    this.active.get(userId)?.abort();
    return this.view(userId);
  }

  settled(userId: number) {
    return this.tasks.get(userId) ?? Promise.resolve();
  }

  clipFile(userId: number, file: string) {
    if (basename(file) !== file || !/^[\w.-]+\.mp4$/u.test(file)) throw new Error("Некорректный файл.");
    return resolve(this.dir(userId), "clips", file);
  }

  private async note(userId: number, token: symbol, line: string) {
    let clips: Gta6LiveClip[] = [];
    try {
      clips = clipsFrom(JSON.parse(await readFile(resolve(this.dir(userId), "report.json"), "utf8")) as Gta6Report);
    } catch { /* отчёт появляется после первого куска */ }
    await this.patch(userId, token, { line, clips, error: "" });
  }
}
