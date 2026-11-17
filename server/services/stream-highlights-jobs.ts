import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { normalizeVideoUrl } from "./video-cutting-plan.ts";
import {
  planStreamHighlights,
  STREAM_HIGHLIGHT_MODEL,
  type HighlightExample,
  type StreamClipDraft,
  type StreamRating,
} from "./stream-highlights.ts";
import { loadYoutubeSubtitleSource, type StreamSource } from "./stream-highlights-source.ts";

export type StreamClip = StreamClipDraft & {
  rating: StreamRating | null;
  note: string;
  userStart: number | null;
  userEnd: number | null;
};
export type StreamJobStatus = "queued" | "fetching" | "analyzing" | "ready" | "failed" | "cancelled";
export type StreamJob = {
  id: string;
  userId: number;
  url: string;
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  status: StreamJobStatus;
  stage: string;
  error: string;
  model: string;
  clips: StreamClip[];
  createdAt: string;
};

const reviewSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  rating: z.enum(["interesting", "maybe", "boring"]).nullable().optional(),
  start: z.number().finite().optional(),
  end: z.number().finite().optional(),
  note: z.string().max(600).optional(),
}).strict();
export type StreamReviewInput = z.infer<typeof reviewSchema>;

const active = new Set<StreamJobStatus>(["queued", "fetching", "analyzing"]);
const idPattern = /^[a-f0-9]{16}$/u;

function storedClip(clip: StreamClipDraft): StreamClip {
  return { ...clip, rating: null, note: "", userStart: null, userEnd: null };
}

export function highlightExamples(jobs: readonly StreamJob[], userId: number): HighlightExample[] {
  return jobs
    .filter((job) => job.userId === userId && job.status === "ready")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .flatMap((job) => job.clips.filter((clip) => clip.rating).map((clip) => ({
      rating: clip.rating!,
      momentType: clip.momentType,
      title: clip.title,
      reason: clip.reason,
      note: clip.note.slice(0, 300),
      seconds: (clip.userEnd ?? clip.end) - (clip.userStart ?? clip.start),
    })))
    .slice(0, 16);
}

export class StreamHighlightJobs {
  private jobs = new Map<string, StreamJob>();
  private controllers = new Map<string, AbortController>();
  private writes = new Map<string, Promise<unknown>>();
  private ready: Promise<void> | null = null;
  private pumping = false;

  constructor(private root: string, private options: {
    loadSource?: (url: string, dir: string, signal: AbortSignal) => Promise<StreamSource>;
    plan?: (input: {
      title: string;
      channel: string;
      duration: number;
      words: StreamSource["words"];
      examples: HighlightExample[];
      cwd: string;
      signal: AbortSignal;
    }) => Promise<StreamClipDraft[]>;
  } = {}) {}

  private key(job: { userId: number; id: string }) {
    return `${job.userId}/${job.id}`;
  }

  private async ensure() {
    if (!this.ready) this.ready = this.recover();
    await this.ready;
  }

  private async recover() {
    const users = await readdir(this.root).catch(() => []);
    for (const userDir of users) {
      if (!/^u\d+$/u.test(userDir)) continue;
      const userId = Number(userDir.slice(1));
      const ids = await readdir(resolve(this.root, userDir)).catch(() => []);
      for (const id of ids) {
        if (!idPattern.test(id)) continue;
        try {
          const job = JSON.parse(await readFile(resolve(this.root, userDir, id, "job.json"), "utf8")) as StreamJob;
          if (job.userId !== userId || job.id !== id) continue;
          if (active.has(job.status)) {
            job.status = "failed";
            job.error = "Разбор прерван перезапуском сервера.";
            job.stage = job.error;
            await this.persist(job);
          }
          this.jobs.set(this.key(job), job);
        } catch {
          /* повреждённая задача не блокирует остальные */
        }
      }
    }
  }

  private file(job: StreamJob) {
    return resolve(this.root, `u${job.userId}`, job.id, "job.json");
  }

  private async save(job: StreamJob) {
    const file = this.file(job);
    await mkdir(resolve(file, ".."), { recursive: true });
    const temp = `${file}.tmp`;
    await writeFile(temp, `${JSON.stringify(job)}\n`);
    await rename(temp, file);
  }

  private persist(job: StreamJob) {
    const key = this.key(job);
    const run = (this.writes.get(key) ?? Promise.resolve()).then(() => this.save(job));
    this.writes.set(key, run.then(() => undefined, () => undefined));
    return run;
  }

  async list(userId: number) {
    await this.ensure();
    return [...this.jobs.values()]
      .filter((job) => job.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 20);
  }

  async start(userId: number, rawUrl: string) {
    await this.ensure();
    const url = normalizeVideoUrl(rawUrl);
    if ([...this.jobs.values()].some((job) => job.userId === userId && active.has(job.status)))
      throw new Error("Дождитесь завершения текущего разбора.");
    const job: StreamJob = {
      id: randomBytes(8).toString("hex"),
      userId,
      url,
      videoId: new URL(url).searchParams.get("v")!,
      title: "",
      channel: "",
      duration: 0,
      status: "queued",
      stage: "В очереди",
      error: "",
      model: STREAM_HIGHLIGHT_MODEL,
      clips: [],
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(this.key(job), job);
    await this.persist(job);
    void this.pump();
    return this.list(userId);
  }

  async review(userId: number, id: string, raw: unknown) {
    await this.ensure();
    const parsed = reviewSchema.safeParse(raw);
    if (!parsed.success || !idPattern.test(id)) throw new Error("Проверьте оценку и границы.");
    const job = this.jobs.get(`${userId}/${id}`);
    if (!job) throw new Error("Разбор не найден.");
    if (job.status !== "ready") throw new Error("Оценку можно сохранить после готового разбора.");
    const clip = job.clips.find((item) => item.slug === parsed.data.slug);
    if (!clip) throw new Error("Ролик не найден.");
    if (parsed.data.start != null || parsed.data.end != null) {
      const start = parsed.data.start;
      const end = parsed.data.end;
      if (start == null || end == null) throw new Error("Укажите и начало, и конец.");
      const length = end - start;
      if (!(start >= 0) || !(end <= job.duration + 0.05) || !(length >= 3) || !(length <= 300))
        throw new Error("Границы должны лежать внутри записи и длиться от 3 секунд до 5 минут.");
      clip.userStart = Math.round(start * 100) / 100;
      clip.userEnd = Math.round(end * 100) / 100;
    }
    if (parsed.data.rating !== undefined) clip.rating = parsed.data.rating;
    if (parsed.data.note !== undefined) clip.note = parsed.data.note.trim();
    await this.persist(job);
    return this.list(userId);
  }

  async cancel(userId: number, id: string) {
    await this.ensure();
    if (!idPattern.test(id)) throw new Error("Разбор не найден.");
    const job = this.jobs.get(`${userId}/${id}`);
    if (!job || !active.has(job.status)) throw new Error("Этот разбор уже не идёт.");
    job.status = "cancelled";
    job.stage = "Отменено";
    job.error = "";
    this.controllers.get(this.key(job))?.abort();
    await this.persist(job);
    return this.list(userId);
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (true) {
        const job = [...this.jobs.values()].find((item) => item.status === "queued");
        if (!job) break;
        const controller = new AbortController();
        this.controllers.set(this.key(job), controller);
        const dir = resolve(this.file(job), "..");
        try {
          job.status = "fetching";
          job.stage = "Получаем субтитры";
          await this.persist(job);
          if (job.status !== "fetching") continue;
          const source = await (this.options.loadSource ?? loadYoutubeSubtitleSource)(job.url, dir, controller.signal);
          if (job.status !== "fetching") continue;
          job.title = source.title;
          job.channel = source.channel;
          job.duration = source.duration;
          job.videoId = source.videoId;
          job.status = "analyzing";
          job.stage = "Ищем моменты";
          await this.persist(job);
          if ((job.status as StreamJobStatus) !== "analyzing") continue;
          const examples = highlightExamples([...this.jobs.values()], job.userId);
          const clips = await (this.options.plan ?? planStreamHighlights)({
            title: source.title,
            channel: source.channel,
            duration: source.duration,
            words: source.words,
            examples,
            cwd: dir,
            signal: controller.signal,
          });
          if ((job.status as StreamJobStatus) !== "analyzing") continue;
          job.clips = clips.map(storedClip);
          job.status = "ready";
          job.stage = clips.length ? `Найдено роликов: ${clips.length}` : "Моментов для отдельного ролика не найдено.";
          job.error = "";
          await this.persist(job);
        } catch (error) {
          if (job.status === "cancelled") continue;
          job.status = "failed";
          job.error = error instanceof Error ? error.message.slice(0, 2000) : "Не удалось разобрать запись.";
          job.stage = "Ошибка";
          await this.persist(job);
        } finally {
          this.controllers.delete(this.key(job));
        }
      }
    } finally {
      this.pumping = false;
    }
  }
}

