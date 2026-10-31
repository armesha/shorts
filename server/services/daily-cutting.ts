import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { runCuttingProcess, type VideoCuttingService } from "./video-cutting.ts";

const stateSchema = z.object({ ownerId: z.number().int().positive(), enabled: z.boolean(),
  lastDay: z.string().optional(), sequence: z.number().int().nonnegative(),
  selected: z.array(z.string().regex(/^[\w-]{11}$/)),
  pending: z.object({ id: z.string().regex(/^[\w-]{11}$/), day: z.string(), jobId: z.string().optional() }).optional(),
  error: z.string().optional() }).strict();
type State = z.infer<typeof stateSchema>;
export const DAILY_CHANNELS = [
  { name: "Jane Kravitz", url: "https://www.youtube.com/channel/UCtlDForpy1QJCqgqxylxPHg/videos" },
  { name: "Настя Джексон", url: "https://www.youtube.com/channel/UCU67BLdoLR5CqVjeNtJWj-w/videos" },
  { name: "Маруся Черничкина", url: "https://www.youtube.com/channel/UCMiWy2TJ3MckIwuzyyleRcw/videos" },
  { name: "netcore", url: "https://www.youtube.com/@netcore1460/videos" },
  { name: "Чернец", url: "https://www.youtube.com/channel/UC7bjKwKv9nwxc3HZh6NoqZg/videos" },
  { name: "Алина Мурадимова", url: "https://www.youtube.com/channel/UCVALO-Jz4GponxZDbSqxvgg/videos" },
  { name: "Pepesis", url: "https://www.youtube.com/channel/UC9rF9YTuHZ2q8bxMAJpJSAQ/videos", rulesOnly: true },
  { name: "Erica Docs", url: "https://www.youtube.com/channel/UCf607OPvvIdjRCgaxDMXLqw/videos" },
  { name: "ALINA ASMR", url: "https://www.youtube.com/channel/UCLTKmi3Bl3w5P4EChtW5c7g/videos" },
] as const;
export type ChannelVideo = { id: string; views: number; duration?: number; live?: boolean; title?: string };
export function selectDailyVideo(videos: ChannelVideo[], seen: Set<string>, popular: boolean) {
  const eligible = videos.filter(v => /^[\w-]{11}$/.test(v.id) && !seen.has(v.id) && !v.live && v.duration != null && v.duration >= 120 && v.duration <= 10800 && (!popular || v.views > 0));
  if (popular) eligible.sort((a, b) => b.views - a.views);
  return eligible[0];
}
export function pragueDay(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export class DailyCuttingService {
  private state?: State;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private closed = false;
  private broken = false;
  private controller?: AbortController;
  private saveQueue: Promise<void> = Promise.resolve();
  private readonly file: string;
  constructor(private readonly cutting: VideoCuttingService, private readonly options: { file?: string; now?: () => Date; fetch?: () => Promise<ChannelVideo[]>; log?: (s: string) => void } = {}) {
    this.file = options.file || resolve(process.cwd(), "data/video-cutting/daily-state.json");
  }
  private async save() {
    this.saveQueue = this.saveQueue.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.state), { mode: 0o600 });
      await rename(tmp, this.file);
    });
    await this.saveQueue;
  }
  async start() {
    try { this.state = stateSchema.parse(JSON.parse(await readFile(this.file, "utf8"))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") { this.broken = true; throw e; } }
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
    void this.tick();
  }
  close() { this.closed = true; this.controller?.abort(); if (this.timer) clearInterval(this.timer); }
  async info(ownerId: number) {
    if (this.broken) return { enabled: false, jobs: [], error: "Не удалось прочитать историю расписания. Запуск остановлен." };
    if (!this.state || this.state.ownerId !== ownerId) return { enabled: false, jobs: [] };
    return { ...this.state, jobs: (await this.cutting.dailyJobs(ownerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  }
  async enable(ownerId: number) {
    if (this.broken) throw new Error("Повреждена история расписания.");
    if (this.state && this.state.ownerId !== ownerId) throw new Error("Расписание принадлежит другому пользователю.");
    this.state ||= { ownerId, enabled: false, sequence: 0, selected: [] };
    this.state.enabled = true;
    await this.save();
    void this.tick();
    return this.info(ownerId);
  }
  async disable(ownerId: number) {
    if (!this.state || this.state.ownerId !== ownerId) throw new Error("Расписание не найдено.");
    this.state.enabled = false;
    await this.save();
    return this.info(ownerId);
  }
  private async fetchVideos(channel: typeof DAILY_CHANNELS[number], signal: AbortSignal): Promise<ChannelVideo[]> {
    const bin = process.env.VIDEO_CUTTING_YTDLP || (existsSync(resolve(process.cwd(), ".venv-cutting/bin/yt-dlp")) ? resolve(process.cwd(), ".venv-cutting/bin/yt-dlp") : "yt-dlp");
    const output = await runCuttingProcess(bin, ["--no-warnings", "--flat-playlist", "--dump-json", "--", channel.url], { cwd: process.cwd(), timeoutMs: 300_000, signal });
    const videos = output.split("\n").filter(Boolean).map(line => {
      const v = JSON.parse(line);
      return { id: String(v.id), title: String(v.title || ""), views: Number(v.view_count) || 0, duration: Number(v.duration) || undefined, live: v.live_status === "is_live" || v.live_status === "is_upcoming" };
    });
    return "rulesOnly" in channel ? videos.filter(v => /правил|rules/i.test(v.title)) : videos;
  }
  async tick() {
    if (this.busy || this.closed || this.broken || !this.state?.enabled) return;
    this.busy = true;
    this.controller = new AbortController();
    try {
      const state = this.state;
      const day = pragueDay(this.options.now?.() || new Date());
      const jobs = await this.cutting.dailyJobs(state.ownerId);
      if (state.pending && !state.pending.jobId) {
        const existing = jobs.find(j => new URL(j.input.url).searchParams.get("v") === state.pending!.id);
        if (existing) { state.pending.jobId = existing.id; state.lastDay = pragueDay(new Date(existing.createdAt)); await this.save(); }
      }
      if (state.pending?.jobId) {
        const current = jobs.find(j => j.id === state.pending!.jobId);
        if (!current) throw new Error("Не найдена сохранённая задача нарезки; расписание ожидает проверки.");
        if (!["completed", "failed", "cancelled"].includes(current.status)) return;
        state.pending = undefined;
        state.error = undefined;
        await this.save();
      }
      if (!state.pending && state.lastDay !== day) {
        const seen = new Set([...state.selected, ...jobs.map(j => new URL(j.input.url).searchParams.get("v") || "")]);
        let chosen: ChannelVideo | undefined;
        const first = Math.floor(state.sequence / 2) % DAILY_CHANNELS.length;
        for (let offset = 0; offset < DAILY_CHANNELS.length; offset++) {
          const channel = DAILY_CHANNELS[(first + offset) % DAILY_CHANNELS.length];
          try {
            const videos = await (this.options.fetch?.() || this.fetchVideos(channel, this.controller.signal));
            if (!state.enabled || this.closed) return;
            chosen = selectDailyVideo(videos, seen, state.sequence % 2 === 0);
            if (chosen) break;
          } catch { if (this.closed) return; this.options.log?.(`Не удалось получить список канала ${channel.name}.`); }
        }
        if (!chosen) throw new Error("Нет подходящих новых видео канала.");
        state.pending = { id: chosen.id, day };
        state.selected.push(chosen.id);
        state.lastDay = day;
        state.sequence++;
        await this.save();
      }
      if (state.pending && !state.pending.jobId && state.enabled) {
        const job = await this.cutting.create(state.ownerId, { url: `https://www.youtube.com/watch?v=${state.pending.id}`, mode: "auto", bannerId: null, subtitles: true, sponsorBlock: true }, true);
        state.pending.jobId = job.id;
        state.lastDay = pragueDay(this.options.now?.() || new Date(job.createdAt));
        state.error = undefined;
        await this.save();
      }
    } catch (e) {
      if (this.state && !this.closed) { this.state.error = e instanceof Error ? e.message : "Ошибка ежедневной нарезки."; await this.save().catch(() => {}); }
      this.options.log?.("Не удалось запустить ежедневную нарезку.");
    } finally { this.busy = false; this.controller = undefined; }
  }
}
