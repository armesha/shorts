import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
  copyFile,
  stat,
} from "node:fs/promises";
import { extname, resolve } from "node:path";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import type { Db } from "../db.ts";
import { cuttingBannerFilter } from "./cutting-banner.ts";
import { cuttingRenderCommand } from "../infra/cutting-render-resources.ts";
import { DAILY_CUTTING_EFFORT, DAILY_CUTTING_MODEL, planDailyCuts, readPreparedDailyPlan, type DailyClip } from "./daily-cutting-plan.ts";
import {
  extractCuttingTimecodes,
  cleanCuttingTimecodes,
  alignCutPlanToSpeech,
  autoCutLimits,
} from "./video-cutting-context.ts";
import {
  fetchSponsorBlock,
  sponsorBlockResult,
  sponsorTimeline,
  cleanSponsorWords,
  cuttingSourceRanges,
  type SponsorBlockResult,
  type SponsorLookup,
  type CutTimeline,
  type SourceRange,
} from "./video-cutting-sponsorblock.ts";
import {
  RateLimitError,
  withGlobalRenderSlot,
  withActiveLimit,
} from "../infra/rate-limits.ts";
import {
  addCuttingClipsToChannel,
  type CuttingChannelAdd,
} from "./video-cutting-channels.ts";
import {
  circleAdvertiserSource,
  listCircleAdvertisers,
  type CircleAdvertiser,
} from "./circle-advertisers.ts";
import {
  CUTTING_MODEL,
  CUTTING_EFFORT,
  MAX_SOURCE_SECONDS,
  CutRequestSchema,
  cuttingAss,
  cuttingPrompt,
  parseVideoVtt,
  validateCutPlan,
  type CutPart,
  type CutRequest,
  type TimedWord,
} from "./video-cutting-plan.ts";

export type CutStatus =
  | "queued"
  | "downloading"
  | "analyzing"
  | "rendering"
  | "completed"
  | "failed"
  | "cancelled";
export type CutClip = CutPart & {
  videoUrl: string;
  duration: number;
  sourceRanges?: SourceRange[];
};
export type CutJob = {
  id: string;
  userId: number;
  input: CutRequest;
  status: CutStatus;
  stage: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  duration?: number;
  originalDuration?: number;
  sponsorBlock?: SponsorBlockResult;
  plan?: CutPart[];
  clips: CutClip[];
  error?: string;
  sessionId?: string;
  channelAdds?: CuttingChannelAdd[];
  deletedParts?: number[];
  daily?: boolean;
  detectedMode?: "serial" | "highlights";
};
export type ProcessInput = {
  cwd: string;
  signal?: AbortSignal;
  stdin?: string;
  timeoutMs?: number;
};
export type ProcessRunner = (
  bin: string,
  args: string[],
  options: ProcessInput,
) => Promise<string>;

export const runCuttingProcess: ProcessRunner = (bin, args, options) =>
  new Promise((accept, reject) => {
    const env = Object.fromEntries(
      [
        "HOME",
        "PATH",
        "USER",
        "LOGNAME",
        "SHELL",
        "LANG",
        "LC_ALL",
        "CODEX_HOME",
        "XDG_RUNTIME_DIR",
        "TMPDIR",
      ].flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : [])),
    );
    const limited = cuttingRenderCommand(bin, args);
    const child = spawn(limited.bin, limited.args, {
      cwd: options.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      finished = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      if (!child.pid) return;
      try {
        process.platform !== "win32"
          ? process.kill(-child.pid, "SIGTERM")
          : child.kill("SIGTERM");
      } catch {
        /* already exited */
      }
      killTimer = setTimeout(() => {
        try {
          process.platform !== "win32"
            ? process.kill(-child.pid!, "SIGKILL")
            : child.kill("SIGKILL");
        } catch {
          /* already exited */
        }
      }, 3000);
      killTimer.unref();
    };
    const timer = setTimeout(terminate, options.timeoutMs ?? 30 * 60_000);
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      options.signal?.removeEventListener("abort", terminate);
      error ? reject(error) : accept(stdout);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 16_000_000) terminate();
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-6000);
    });
    child.on("error", () =>
      finish(
        new Error(
          `Не удалось запустить ${bin.includes("codex") ? "локальную сессию анализа" : "обработчик видео"}. Проверьте зависимости сервера.`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (options.signal?.aborted) return finish(new Error("Задача отменена."));
      if (code !== 0) {
        const hint =
          /sign in|not logged|401|authentication|auth.*required|login/i.test(
            stderr,
          )
            ? " Проверьте вход в локальную сессию на сервере."
            : /subtitles|captions/i.test(stderr)
              ? " Не удалось получить субтитры источника."
              : "";
        return finish(
          new Error(
            `Обработка завершилась с ошибкой.${hint} Можно повторить задачу.`,
          ),
        );
      }
      finish();
    });
    options.signal?.addEventListener("abort", terminate, { once: true });
    if (options.signal?.aborted) terminate();
    child.stdin.on("error", () => {});
    child.stdin.end(options.stdin || "");
  });

export function localPlannerArgs(dir: string) {
  return [
    "exec",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--disable",
    "shell_tool",
    "--disable",
    "multi_agent",
    "-c",
    'approval_policy="never"',
    "-c",
    'web_search="disabled"',
    "--model",
    CUTTING_MODEL,
    "-c",
    `model_reasoning_effort="${CUTTING_EFFORT}"`,
    "--json",
    "--output-schema",
    resolve(dir, "plan-schema.json"),
    "--output-last-message",
    resolve(dir, "plan-result.json"),
    "--cd",
    dir,
    "-",
  ];
}

export function russianSubtitleLanguage(metadata: { automatic_captions?: Record<string, unknown>; subtitles?: Record<string, unknown> }) {
  return ["ru-orig", "ru"].find(lang => [metadata.subtitles?.[lang], metadata.automatic_captions?.[lang]].some(track => Array.isArray(track) && track.length));
}

export async function takePrefetchedSource(root: string, videoId: string, destination: string) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Некорректный идентификатор видео.");
  const directory = resolve(root, "prefetch", videoId);
  const source = resolve(directory, "source.mp4");
  let marker: { id?: string };
  try { marker = JSON.parse(await readFile(resolve(directory, "ready.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  const file = await stat(source);
  if (marker.id !== videoId || !file.isFile() || file.size <= 0 || file.size > 2 * 1024 ** 3)
    throw new Error("Предварительно загруженное видео не прошло проверку.");
  await rename(source, destination);
  await rm(resolve(directory, "ready.json"), { force: true });
  return true;
}

export async function waitForPrefetchedSource(root: string, videoId: string, destination: string, signal: AbortSignal) {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Некорректный идентификатор видео.");
  const directory = resolve(root, "prefetch", videoId);
  let pending: { id?: string; pid?: number };
  try { pending = JSON.parse(await readFile(resolve(directory, "pending.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return takePrefetchedSource(root, videoId, destination); throw error; }
  if (pending.id !== videoId || !Number.isSafeInteger(pending.pid) || pending.pid! < 2) return false;
  let stoppedAt = 0;
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (await takePrefetchedSource(root, videoId, destination)) {
      await rm(resolve(directory, "pending.json"), { force: true });
      return true;
    }
    let running = false;
    try {
      const command = await readFile(`/proc/${pending.pid}/cmdline`, "utf8");
      running = command.includes("yt-dlp") && command.includes(videoId);
    } catch { /* process already exited */ }
    if (running) stoppedAt = 0;
    else if (!stoppedAt) stoppedAt = Date.now();
    else if (Date.now() - stoppedAt >= 10_000) break;
    await delay(2000, undefined, { signal });
  }
  await rm(resolve(directory, "pending.json"), { force: true });
  return false;
}

export async function probeCuttingMedia(
  path: string,
  run: ProcessRunner = runCuttingProcess,
  signal?: AbortSignal,
) {
  const data = JSON.parse(
    await run(
      process.env.VIDEO_CUTTING_FFPROBE || "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { cwd: process.cwd(), signal, timeoutMs: 30_000 },
    ),
  );
  const video = data.streams?.find((s: any) => s.codec_type === "video");
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0)
    throw new Error("Не удалось определить длительность видео.");
  return {
    duration,
    width: Number(video.width),
    height: Number(video.height),
    fps: String(video.avg_frame_rate),
    audio: data.streams.some((s: any) => s.codec_type === "audio"),
  };
}

export async function renderCuttingPart(input: {
  source: string;
  output: string;
  dir: string;
  part: CutPart;
  words: TimedWord[];
  subtitles: boolean;
  banner?: { item: CircleAdvertiser; file: string };
  signal?: AbortSignal;
  run?: ProcessRunner;
  timeline?: CutTimeline[];
  segments?: SourceRange[];
  hook?: string;
}) {
  const run = input.run || runCuttingProcess;
  const sections = input.segments || [{ start: input.part.start, end: input.part.end }];
  const duration = sections.reduce((sum, section) => sum + section.end - section.start, 0);
  const ass = `part-${input.part.number}.ass`;
  if (input.subtitles || input.hook) {
    let offset = 0;
    const mapped = sections.flatMap(section => {
      const shifted = input.words.filter(word => word.start >= section.start && word.end <= section.end && !/^\[(?:смех|аплодисменты|laughter|laughs?|applause)\]$/i.test(word.text))
        .map(word => ({ ...word, start: word.start - section.start + offset, end: word.end - section.start + offset }));
      offset += section.end - section.start;
      return shifted;
    });
    let overlay = cuttingAss(input.subtitles ? mapped : [], { ...input.part, start: 0, end: duration });
    if (input.hook) {
      const safe = input.hook.replace(/[{}\\\r\n]/g, " ").slice(0, 96).trim();
      const lines = safe.match(/.{1,28}(?:\s|$)|\S{1,28}/g)?.map(s => s.trim()).join("\\N") || "";
      if (lines) overlay += `Dialogue: 1,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an8\\pos(540,280)\\fs52}${lines}\n`;
    }
    await writeFile(resolve(input.dir, ass), overlay);
  }
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-filter_complex_threads",
    "1",
  ];
  const ranges = sections.flatMap(section => cuttingSourceRanges(section.start, section.end, input.timeline));
  if (!ranges.length)
    throw new Error("В части не осталось видео после удаления рекламы.");
  for (const range of ranges)
    args.push(
      "-reinit_filter",
      "0",
      "-threads",
      "2",
      "-ss",
      String(range.start),
      "-t",
      String(range.end - range.start),
      "-i",
      input.source,
    );
  if (input.banner) {
    if (/\.(png|jpe?g|webp)$/i.test(input.banner.file)) args.push("-loop", "1");
    else args.push("-stream_loop", "-1");
    if (extname(input.banner.file) === ".webm") args.push("-c:v", "libvpx-vp9");
    args.push("-i", input.banner.file);
  }
  let graph = ranges
    .map(
      (range, index) =>
        `[${index}:v]trim=duration=${range.end - range.start},setpts=PTS-STARTPTS,setsar=1[v${index}];[${index}:a]atrim=duration=${range.end - range.start},asetpts=PTS-STARTPTS[a${index}];`,
    )
    .join("");
  graph +=
    ranges.map((_, index) => `[v${index}][a${index}]`).join("") +
    `concat=n=${ranges.length}:v=1:a=1[cleanv][cleana];`;
  graph +=
    "[cleanv]fps=30,split=2[bgsrc][fgsrc];" +
    "[bgsrc]scale=192:342:force_original_aspect_ratio=increase,crop=192:342,gblur=sigma=8,eq=brightness=-0.15:saturation=0.6,scale=1080:1920[bg];" +
    "[fgsrc]scale=1080:608:force_original_aspect_ratio=decrease,pad=1080:608:(ow-iw)/2:(oh-ih)/2,setsar=1[fg];" +
    "[bg][fg]overlay=0:656:shortest=1[framed];";
  let label = "framed";
  if (input.banner) {
    graph += cuttingBannerFilter(ranges.length, input.banner.item, "framed", "branded");
    label = "branded";
  }
  graph += `[${label}]${input.subtitles || input.hook ? `ass=filename=${ass},` : ""}fps=30,format=yuv420p[out]`;
  const temporary = input.output.replace(/\.mp4$/, ".encoding.mp4");
  args.push(
    "-filter_complex",
    graph,
    "-map",
    "[out]",
    "-map",
    "[cleana]",
    "-t",
    String(duration),
    "-r",
    "30",
    "-fps_mode",
    "cfr",
    "-c:v",
    "libx264",
    "-preset",
    "superfast",
    "-crf",
    "20",
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    temporary,
  );
  try {
    await run(process.env.VIDEO_CUTTING_FFMPEG || "ffmpeg", args, {
      cwd: input.dir,
      signal: input.signal,
      timeoutMs: Math.max(5 * 60_000, duration * 12_000),
    });
    const result = await probeCuttingMedia(temporary, run, input.signal);
    if (
      result.width !== 1080 ||
      result.height !== 1920 ||
      result.fps !== "30/1" ||
      Math.abs(result.duration - duration) > 0.2
    )
      throw new Error(
        "Итоговый ролик не прошёл проверку формата или длительности.",
      );
    await rename(temporary, input.output);
    return result;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export class VideoCuttingService {
  private jobs = new Map<string, CutJob>();
  private controllers = new Map<string, AbortController>();
  private ready: Promise<void>;
  private pumping = false;
  private stopped = false;
  private root: string;
  private run: ProcessRunner;
  constructor(
    private options: {
      outputDir: string;
      db?: Db;
      root?: string;
      run?: ProcessRunner;
      sponsorLookup?: SponsorLookup;
      execute?: (job: CutJob, signal: AbortSignal) => Promise<void>;
    },
  ) {
    this.root = options.root || resolve(process.cwd(), "data/video-cutting");
    this.run = options.run || runCuttingProcess;
    this.ready = this.restore();
  }
  private file(job: CutJob) {
    return resolve(this.root, `u${job.userId}`, job.id, "job.json");
  }
  private snapshot(job: CutJob) {
    const copy = structuredClone(job);
    if (!Array.isArray(copy.clips)) return copy;
    for (const clip of copy.clips) {
      const expected = `/files/creator/cutting-u${job.userId}/${job.id}/part-${clip.number}.mp4`;
      if (typeof clip.videoUrl !== "string" || clip.videoUrl.split("?")[0] !== expected) continue;
      try {
        const file = statSync(resolve(this.options.outputDir, `creator/cutting-u${job.userId}/${job.id}/part-${clip.number}.mp4`));
        clip.videoUrl = `${expected}?v=${Math.floor(file.mtimeMs)}-${file.size}`;
      } catch { /* A removed or incomplete file remains unavailable. */ }
    }
    return copy;
  }
  private async save(job: CutJob) {
    job.updatedAt = new Date().toISOString();
    const file = this.file(job);
    await mkdir(resolve(file, ".."), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(job, null, 2));
    await rename(temp, file);
  }
  private async restore() {
    await mkdir(this.root, { recursive: true });
    for (const owner of await readdir(this.root)) {
      if (!/^u[1-9]\d*$/.test(owner)) continue;
      for (const id of await readdir(resolve(this.root, owner))) {
        if (!/^[a-f\d-]{36}$/.test(id)) continue;
        try {
          const job = JSON.parse(
            await readFile(resolve(this.root, owner, id, "job.json"), "utf8"),
          ) as CutJob;
          if (job.id !== id || `u${job.userId}` !== owner) continue;
          if (!["completed", "failed", "cancelled"].includes(job.status)) {
            job.status = "failed";
            job.stage = "Обработка прервана перезапуском. Повторите задачу.";
            job.error = job.stage;
            await this.save(job);
          }
          this.jobs.set(id, job);
        } catch {
          /* Ignore an incomplete or corrupt job record. */
        }
      }
    }
  }
  async list(userId: number) {
    await this.ready;
    return [...this.jobs.values()]
      .filter((j) => j.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map((j) => this.snapshot(j));
  }
  async dailyJobs(userId: number) {
    await this.ready;
    return [...this.jobs.values()].filter(j => j.userId === userId && j.daily).map(j => this.snapshot(j));
  }
  async get(userId: number, id: string) {
    await this.ready;
    const job = this.jobs.get(id);
    return job?.userId === userId ? this.snapshot(job) : null;
  }
  async create(userId: number, raw: unknown, daily = false) {
    await this.ready;
    const input = CutRequestSchema.parse(raw);
    if (
      [...this.jobs.values()].some(
        (j) =>
          j.userId === userId &&
          !["completed", "failed", "cancelled"].includes(j.status),
      )
    )
      throw new Error("Дождитесь завершения текущей нарезки или отмените её.");
    if (
      [...this.jobs.values()].filter((j) => j.status === "queued").length >= 20
    )
      throw new Error("Очередь заполнена. Попробуйте позже.");
    if (
      input.bannerId &&
      !listCircleAdvertisers().some((b) => b.id === input.bannerId)
    )
      throw new Error("Выбранный баннер недоступен. Выберите другой.");
    const now = new Date().toISOString();
    const job: CutJob = {
      id: randomUUID(),
      userId,
      input,
      status: "queued",
      stage: "В очереди",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      clips: [],
      ...(daily ? { daily: true } : {}),
    };
    this.jobs.set(job.id, job);
    try {
      await this.save(job);
    } catch (error) {
      this.jobs.delete(job.id);
      throw error;
    }
    void this.pump();
    return structuredClone(job);
  }
  async cancel(userId: number, id: string) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.userId !== userId) return null;
    if (!["completed", "failed", "cancelled"].includes(job.status)) {
      this.controllers.get(id)?.abort();
      job.status = "cancelled";
      job.stage = "Отменено";
      await this.save(job);
    }
    return structuredClone(job);
  }
  async addToChannel(
    userId: number,
    id: string,
    accountId: number,
    parts?: number[],
  ) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.userId !== userId) throw new Error("Нарезка не найдена.");
    if (!this.options.db) throw new Error("Добавление на канал недоступно.");
    return withActiveLimit(`cutting-edit:${userId}:${id}`, 1, async () => {
      const result = await addCuttingClipsToChannel(this.options.db!, {
        userId,
        job,
        accountId,
        parts,
        outputDir: this.options.outputDir,
      });
      job.channelAdds = [...(job.channelAdds || [])];
      for (const row of [...result.existing, ...result.added])
        if (
          !job.channelAdds.some(
            (old) => old.accountId === row.accountId && old.part === row.part,
          )
        )
          job.channelAdds.push(row);
      await this.save(job);
      return { ...result, job: structuredClone(job) };
    });
  }
  async deletePart(userId: number, id: string, part: number) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.userId !== userId) throw new Error("Нарезка не найдена.");
    if (
      !Number.isInteger(part) ||
      (!job.clips.some((clip) => clip.number === part) &&
        !job.deletedParts?.includes(part))
    )
      throw new Error("Готовая часть не найдена.");
    return withActiveLimit(`cutting-edit:${userId}:${id}`, 1, async () => {
      job.deletedParts = [...new Set([...(job.deletedParts || []), part])];
      job.clips = job.clips.filter((clip) => clip.number !== part);
      await this.save(job);
      const rel = `creator/cutting-u${userId}/${job.id}/part-${part}.mp4`;
      for (const item of this.options.db?.listCreatorGalleryItems(userId) || [])
        if (item.videoRel === rel)
          this.options.db!.deleteCreatorGalleryItem(item.id, userId);
      await rm(resolve(this.options.outputDir, rel), { force: true });
      return structuredClone(job);
    });
  }
  async deleteJob(userId: number, id: string) {
    await this.ready;
    const job = this.jobs.get(id);
    if (!job || job.userId !== userId) throw new Error("Нарезка не найдена.");
    if (!/^[a-f\d-]{36}$/.test(id) || !["completed", "failed", "cancelled"].includes(job.status) || this.controllers.has(id))
      throw new Error("Сначала дождитесь завершения или отмените обработку.");
    return withActiveLimit(`cutting-edit:${userId}:${id}`, 1, async () => {
      const prefix = `creator/cutting-u${userId}/${id}/`;
      for (const item of this.options.db?.listCreatorGalleryItems(userId) || [])
        if (item.videoRel?.startsWith(prefix)) this.options.db!.deleteCreatorGalleryItem(item.id, userId);
      await rm(resolve(this.options.outputDir, prefix), { recursive: true, force: true });
      await rm(resolve(this.root, `u${userId}`, id), { recursive: true, force: true });
      this.jobs.delete(id);
      return { ok: true };
    });
  }
  async close() {
    this.stopped = true;
    for (const controller of this.controllers.values()) controller.abort();
  }
  private async update(
    job: CutJob,
    status: CutStatus,
    stage: string,
    progress: number,
  ) {
    if (this.controllers.get(job.id)?.signal.aborted)
      throw new Error("Задача отменена.");
    Object.assign(job, { status, stage, progress });
    await this.save(job);
  }
  private async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (!this.stopped) {
        const job = [...this.jobs.values()].find((j) => j.status === "queued");
        if (!job) break;
        const controller = new AbortController();
        this.controllers.set(job.id, controller);
        try {
          await this.update(job, "downloading", "Получаем видео и субтитры", 5);
          controller.signal.throwIfAborted();
          await (this.options.execute
            ? this.options.execute(job, controller.signal)
            : this.execute(job, controller.signal));
          await this.update(job, "completed", "Готово", 100);
        } catch (error) {
          if (job.status !== "cancelled") {
            job.status = this.stopped ? "cancelled" : "failed";
            job.error =
              error instanceof Error
                ? error.message
                : "Не удалось обработать видео.";
            job.stage = job.error;
            await this.save(job);
          }
        } finally {
          this.controllers.delete(job.id);
          if (!this.options.execute) {
            const dir = resolve(this.file(job), "..");
            for (const file of await readdir(dir).catch(() => [])) {
              if (
                /^source(?:\.[\w-]+)*\.(?:mp4|mkv|webm|part|ytdl)$/.test(file) ||
                /^banner\.(?:mov|mp4|webm|mkv|png|jpe?g|webp)$/i.test(file)
              )
                await rm(resolve(dir, file), { force: true }).catch(() => {});
            }
          }
        }
      }
    } finally {
      this.pumping = false;
    }
  }
  private async execute(job: CutJob, signal: AbortSignal) {
    const dir = resolve(this.file(job), "..");
    const command = (
      bin: string,
      args: string[],
      extra: Partial<ProcessInput> = {},
    ) => this.run(bin, args, { cwd: dir, signal, ...extra });
    const ytdlp =
      process.env.VIDEO_CUTTING_YTDLP ||
      (existsSync(resolve(process.cwd(), ".venv-cutting/bin/yt-dlp"))
        ? resolve(process.cwd(), ".venv-cutting/bin/yt-dlp")
        : "yt-dlp");
    const common = [
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "30",
      "--retries",
      "2",
      "--js-runtimes",
      "node",
      "--remote-components",
      "ejs:github",
    ];
    const metadata = JSON.parse(
      await command(
        ytdlp,
        [
          ...common,
          "--skip-download",
          "--dump-single-json",
          "--",
          job.input.url,
        ],
        { timeoutMs: 120_000 },
      ),
    );
    const advertised = Number(metadata.duration);
    if (
      !Number.isFinite(advertised) ||
      advertised < 3 ||
      advertised > MAX_SOURCE_SECONDS ||
      metadata.is_live
    )
      throw new Error(
        "Поддерживается записанное видео длительностью от 3 секунд до 3 часов.",
      );
    job.title = String(metadata.title || "Видео").slice(0, 200);
    await writeFile(
      resolve(dir, "source.json"),
      JSON.stringify(
        {
          url: job.input.url,
          title: job.title,
          channel: metadata.channel,
          duration: advertised,
          timecodes: extractCuttingTimecodes(metadata, advertised),
        },
        null,
        2,
      ),
    );
    const language = russianSubtitleLanguage(metadata);
    if (!language)
      throw new Error(
        "У видео нет доступных русских субтитров. Выберите другое видео.",
      );
    await command(ytdlp, [
      ...common,
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      language,
      "--sub-format",
      "vtt",
      "-o",
      "source.%(ext)s",
      "--",
      job.input.url,
    ]);
    const files = await readdir(dir);
    const vtt = [
      "source.ru-orig.vtt",
      "source.ru.vtt",
    ].find((f) => files.includes(f));
    if (!vtt)
      throw new Error(
        "У видео нет доступных русских субтитров. Выберите другое видео.",
      );
    let words = parseVideoVtt(await readFile(resolve(dir, vtt), "utf8"), { includeReactions: !!job.daily });
    if (!words.length)
      throw new Error("Не удалось извлечь речь из субтитров видео.");
    if (words.length > 100_000)
      throw new Error(
        "Расшифровка слишком большая для одной задачи. Выберите более короткое видео.",
      );
    await writeFile(resolve(dir, "transcript.json"), JSON.stringify(words));
    await this.update(job, "downloading", "Скачиваем исходник", 15);
    const source = resolve(dir, "source.mp4");
    const videoId = new URL(job.input.url).searchParams.get("v")!;
    const prefetched = await waitForPrefetchedSource(this.root, videoId, source, signal);
    if (!prefetched) await command(ytdlp, [
      ...common,
      "--no-progress",
      "--max-filesize",
      "2G",
      "-f",
      "bv*[height<=1080][vcodec^=avc1]+ba[language=ru]/bv*[height<=1080][vcodec^=avc1]+ba/bv*[height<=1080]+ba/b[height<=1080]/b",
      "--merge-output-format",
      "mp4",
      "-o",
      "source.%(ext)s",
      "--",
      job.input.url,
    ]);
    if (!existsSync(source))
      throw new Error(
        "Источник не скачан. Возможно, видео ограничено или превышает 2 ГБ.",
      );
    const media = await probeCuttingMedia(source, this.run, signal);
    if (prefetched && Math.abs(media.duration - advertised) > 2)
      throw new Error("Длительность предварительно загруженного видео не совпадает с источником.");
    if (media.duration > MAX_SOURCE_SECONDS || !media.audio)
      throw new Error("Нужен видеоролик со звуком длительностью до 3 часов.");
    job.originalDuration = media.duration;
    job.sponsorBlock = sponsorBlockResult(media.duration, "disabled");
    if (job.input.sponsorBlock !== false) {
      job.sponsorBlock = sponsorBlockResult(media.duration, "checking");
      await this.update(
        job,
        "downloading",
        "Проверяем рекламные вставки в SponsorBlock",
        25,
      );
      try {
        const videoId = new URL(job.input.url).searchParams.get("v")!;
        job.sponsorBlock = await (
          this.options.sponsorLookup || fetchSponsorBlock
        )(videoId, media.duration, signal);
      } catch (error) {
        job.sponsorBlock.status = "unavailable";
        await this.save(job);
        throw error;
      }
    }
    await writeFile(
      resolve(dir, "sponsorblock.json"),
      JSON.stringify(job.sponsorBlock, null, 2),
    );
    const timeline = sponsorTimeline(media.duration, job.sponsorBlock.segments);
    const cleanDuration = job.sponsorBlock.cleanDuration;
    const timecodes = cleanCuttingTimecodes(
      extractCuttingTimecodes(metadata, media.duration),
      timeline,
    );
    if (
      cleanDuration <
      Math.max(2, job.input.mode === "manual" ? job.input.count! : 2)
    )
      throw new Error(
        "После удаления рекламы осталось слишком мало видео для выбранной нарезки.",
      );
    if (job.sponsorBlock.segments.length)
      words = cleanSponsorWords(words, timeline);
    if (!words.length)
      throw new Error(
        "После удаления рекламы в субтитрах не осталось речи для смыслового анализа.",
      );
    await writeFile(
      resolve(dir, "transcript-clean.json"),
      JSON.stringify(words),
    );
    job.duration = cleanDuration;
    await this.update(job, "analyzing", "Выбираем смысловые границы", 35);
    await writeFile(
      resolve(dir, "plan-schema.json"),
      JSON.stringify(zodPlanSchema(job.input, cleanDuration)),
    );
    let dailyAds: unknown;
    let detectedMode: string | undefined;
    if (job.daily) {
      const input = { title: job.title!, duration: cleanDuration, words, anchors: timecodes };
      const result = await readPreparedDailyPlan(resolve(this.root, "prefetch", videoId, "prepared.json"), input)
        || await planDailyCuts({ ...input, cwd: dir, signal });
      job.plan = result.plan;
      dailyAds = result.ads;
      detectedMode = result.detectedMode;
      job.detectedMode = result.detectedMode;
      job.sessionId = result.sessionId || undefined;
    } else {
    const events = await command(
      process.env.VIDEO_CUTTING_CODEX ||
        (existsSync(resolve(homedir(), ".local/bin/codex"))
          ? resolve(homedir(), ".local/bin/codex")
          : "codex"),
      localPlannerArgs(dir),
      {
        stdin: cuttingPrompt(
          job.input,
          cleanDuration,
          job.title!,
          words,
          timecodes,
        ),
        timeoutMs: 20 * 60_000,
      },
    );
    for (const line of events.split("\n")) {
      try {
        const event = JSON.parse(line);
        if (event.type === "thread.started") job.sessionId = event.thread_id;
      } catch {
        /* non-event */
      }
    }
    const raw = JSON.parse(
      await readFile(resolve(dir, "plan-result.json"), "utf8"),
    );
    job.plan = alignCutPlanToSpeech(
      validateCutPlan(raw, cleanDuration, job.input),
      words,
      timecodes,
      job.input.mode === "auto"
        ? autoCutLimits(cleanDuration).minimumPartSeconds
        : 1,
      job.input.mode === "auto"
        ? autoCutLimits(cleanDuration).maximumPartSeconds
        : Infinity,
    );
    }
    await writeFile(
      resolve(dir, "edit-plan.json"),
      JSON.stringify(
        {
          source: job.input.url,
          duration: cleanDuration,
          originalDuration: media.duration,
          sponsorBlock: job.sponsorBlock,
          timeline,
          timecodes,
          model: job.daily ? DAILY_CUTTING_MODEL : CUTTING_MODEL,
          effort: job.daily ? DAILY_CUTTING_EFFORT : CUTTING_EFFORT,
          parts: job.plan,
          ...(job.daily ? { detected_mode: detectedMode, detected_ads_to_exclude: dailyAds } : {}),
        },
        null,
        2,
      ),
    );
    const bannerItem = job.input.bannerId
      ? listCircleAdvertisers().find((b) => b.id === job.input.bannerId)
      : undefined;
    let banner: { item: CircleAdvertiser; file: string } | undefined;
    if (job.input.bannerId && !bannerItem)
      throw new Error(
        "Баннер удалён во время обработки. Выберите другой и повторите задачу.",
      );
    if (bannerItem) {
      const original = circleAdvertiserSource(bannerItem.id);
      const snapshot = resolve(dir, `banner${extname(original)}`);
      await copyFile(original, snapshot);
      banner = { item: bannerItem, file: snapshot };
    }
    const relDir = `creator/cutting-u${job.userId}/${job.id}`;
    await mkdir(resolve(this.options.outputDir, relDir), { recursive: true });
    for (const part of job.plan) {
      const dailyPart = job.daily ? part as DailyClip : undefined;
      const sections = dailyPart?.segments.map(s => ({ start: s.start_seconds, end: s.end_seconds }));
      const partDuration = sections?.reduce((n, s) => n + s.end - s.start, 0) ?? part.end - part.start;
      await this.update(
        job,
        "rendering",
        `Собираем часть ${part.number} из ${job.plan.length}`,
        45 + Math.floor((50 * (part.number - 1)) / job.plan.length),
      );
      const rel = `${relDir}/part-${part.number}.mp4`;
      while (true) {
        signal.throwIfAborted();
        try {
          await withGlobalRenderSlot(() =>
            renderCuttingPart({
              source,
              output: resolve(this.options.outputDir, rel),
              dir,
              part,
              words,
              subtitles: job.input.subtitles,
              banner,
              signal,
              run: this.run,
              timeline,
              segments: sections,
              hook: dailyPart?.on_screen_hook,
            }),
          );
          break;
        } catch (error) {
          if (!(error instanceof RateLimitError)) throw error;
          await delay(2000, undefined, { signal });
        }
      }
      this.options.db?.createCreatorGalleryItem({
        userId: job.userId,
        packId: job.daily ? "daily-video-cutting" : "video-cutting",
        packName: job.daily ? "Ежедневные нарезки" : "Нарезка видео",
        templateType: "montage",
        cardIndex: part.number - 1,
        title: part.title,
        text: part.reason,
        format: "mp4",
        videoRel: rel,
        durationSec: partDuration,
      });
      job.clips.push({
        ...part,
        videoUrl: `/files/${rel}`,
        duration: partDuration,
        sourceRanges: (sections || [{ start: part.start, end: part.end }]).flatMap(s => cuttingSourceRanges(s.start, s.end, timeline)),
      });
      await this.save(job);
    }
  }
}

function zodPlanSchema(input: CutRequest, duration: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["parts"],
    properties: {
      parts: {
        type: "array",
        minItems:
          input.mode === "manual" ? input.count : autoCutLimits(duration).min,
        maxItems:
          input.mode === "manual" ? input.count : autoCutLimits(duration).max,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["start", "end", "title", "reason"],
          properties: {
            start: { type: "number" },
            end: { type: "number" },
            title: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
    },
  };
}
