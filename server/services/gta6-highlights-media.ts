import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { link, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cutsFromSilence, detectSilenceLog, silenceStartsFromDetectLog } from "./video-cutting-audio.ts";
import { GTA6_BANNER_AREA, gta6LibraryBanners, type Gta6Library } from "./gta6-library.ts";
import {
  GTA6_HEIGHT,
  GTA6_WIDTH,
  baseGta6Lexicon,
  calibrateGta6,
  createGta6Cursor,
  gta6VideoFilter,
  type Gta6Class,
  type Gta6Highlight,
  type Gta6Label,
  type Gta6Segment,
} from "./gta6-highlights.ts";

export type CapturedRun = (
  bin: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal },
) => Promise<{ stdout: string; stderr: string }>;

export type Gta6Transcript = { language: string; segments: Gta6Segment[] };

export type Gta6SourcePlan = { sourceId: string; chunks: string[] };

export type Gta6ClipRecord = Gta6Highlight & { clip: string; filter: string };

export type Gta6Report = {
  published: false;
  sources: Array<{
    sourceId: string;
    chunks: string[];
    duration: number;
    language: string;
    segments: Gta6Segment[];
    highlights: Gta6ClipRecord[];
  }>;
};

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export function runCaptured(bin: string, args: string[], options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv; signal?: AbortSignal }) {
  return new Promise<{ stdout: string; stderr: string }>((accept, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const terminate = () => {
      if (!child.pid) return;
      try {
        process.platform !== "win32" ? process.kill(-child.pid, "SIGTERM") : child.kill("SIGTERM");
      } catch { /* already exited */ }
      setTimeout(() => {
        if (!child.pid) return;
        try {
          process.platform !== "win32" ? process.kill(-child.pid, "SIGKILL") : child.kill("SIGKILL");
        } catch { /* already exited */ }
      }, 3000).unref();
    };
    const timer = setTimeout(terminate, options.timeoutMs ?? 20 * 60_000);
    const onAbort = () => terminate();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) terminate();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : accept({ stdout, stderr });
    };
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-8000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(code == null
        ? `${basename(bin)} остановлен: источник не ответил вовремя.`
        : `${basename(bin)} завершился с кодом ${code}: ${stderr}`));
    });
  });
}

function childEnv() {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  env.HF_HUB_OFFLINE = "1";
  env.HF_HUB_DISABLE_TELEMETRY = "1";
  return env;
}

export async function probeMediaDuration(file: string, run: CapturedRun = runCaptured) {
  const { stdout } = await run(process.env.GTA6_FFPROBE || "ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file,
  ], { cwd: repoRoot, timeoutMs: 30_000, env: childEnv() });
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Не удалось прочитать длительность: ${basename(file)}`);
  return duration;
}

export async function transcribeGta6Media(file: string, options: { run?: CapturedRun; python?: string; root?: string } = {}): Promise<Gta6Transcript> {
  const root = options.root || repoRoot;
  const run = options.run ?? runCaptured;
  const python = options.python || resolve(root, "data/output/circle-pipeline/venv/bin/python");
  const script = resolve(root, "scripts/gta6-transcribe.py");
  const { stdout } = await run(python, [script, file], { cwd: root, timeoutMs: 20 * 60_000, env: childEnv() });
  let parsed: { language?: unknown; segments?: unknown };
  try { parsed = JSON.parse(stdout) as { language?: unknown; segments?: unknown }; }
  catch { throw new Error("Локальный Whisper вернул не JSON."); }
  if (typeof parsed.language !== "string" || !parsed.language || !Array.isArray(parsed.segments)) {
    throw new Error("Локальный Whisper вернул пустую расшифровку.");
  }
  const segments: Gta6Segment[] = [];
  for (const segment of parsed.segments) {
    if (!segment || typeof segment !== "object") throw new Error("Сегмент Whisper повреждён.");
    const item = segment as { start?: unknown; end?: unknown; text?: unknown };
    const start = Number(item.start);
    const end = Number(item.end);
    if (typeof item.text !== "string" || !item.text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      throw new Error("Сегмент Whisper повреждён.");
    }
    segments.push({ start, end, text: item.text.trim() });
  }
  return { language: parsed.language, segments };
}

export async function renderGta6Clip(input: {
  source: string;
  output: string;
  start: number;
  end: number;
  telegram?: boolean;
  sourceDuration?: number;
  run?: CapturedRun;
}) {
  const duration = input.sourceDuration ?? await probeMediaDuration(input.source, input.run);
  const start = Math.max(0, input.start);
  const end = Math.min(input.end, duration);
  if (!(end > start)) throw new Error("Окно хайлайта пустое.");
  if (start <= 0.05 && duration - end <= 0.25) throw new Error("Хайлайт совпал со всем исходником.");
  const filter = gta6VideoFilter(start, end, input.telegram === true);
  const audio = `[0:a]atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS[a]`;
  const probed = await (input.run ?? runCaptured)(process.env.GTA6_FFPROBE || "ffprobe", [
    "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", input.source,
  ], { cwd: repoRoot, timeoutMs: 30_000, env: childEnv() });
  const hasAudio = probed.stdout.trim().length > 0;
  const graph = hasAudio ? `${filter};${audio}` : filter;
  await mkdir(resolve(input.output, ".."), { recursive: true });
  const args = [
    "-hide_banner", "-loglevel", "error", "-y", "-i", input.source,
    "-filter_complex", graph,
    "-map", "[v]",
    ...(hasAudio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-t", (end - start).toFixed(3),
    "-r", "30", "-fps_mode", "cfr",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2",
    "-movflags", "+faststart",
    input.output,
  ];
  await (input.run ?? runCaptured)(process.env.GTA6_FFMPEG || "ffmpeg", args, {
    cwd: repoRoot,
    timeoutMs: Math.max(60_000, (end - start) * 20_000),
    env: childEnv(),
  });
  const check = await (input.run ?? runCaptured)(process.env.GTA6_FFPROBE || "ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "json", input.output,
  ], { cwd: repoRoot, timeoutMs: 30_000, env: childEnv() });
  const info = JSON.parse(check.stdout) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  const width = Number(info.streams?.[0]?.width);
  const height = Number(info.streams?.[0]?.height);
  const clipDuration = Number(info.format?.duration);
  if (width !== GTA6_WIDTH || height !== GTA6_HEIGHT || !Number.isFinite(clipDuration)) throw new Error("Клип не прошёл проверку кадра.");
  return { width, height, duration: clipDuration, filter, start, end };
}

export async function runGta6Highlights(options: {
  sources: Gta6SourcePlan[];
  outDir: string;
  telegram?: boolean;
  labels?: readonly Gta6Label[];
  transcribe?: (file: string) => Promise<Gta6Transcript>;
  probe?: (file: string) => Promise<number>;
  render?: (input: { source: string; output: string; start: number; end: number; telegram: boolean; sourceDuration: number; highlight: Gta6Highlight }) => Promise<{ filter: string }>;
}) {
  if (!options.sources.length || options.sources.some((source) => !source.sourceId || !source.chunks.length)) {
    throw new Error("Нужен хотя бы один локальный файл.");
  }
  const lexicon = options.labels?.length ? calibrateGta6(options.labels) : baseGta6Lexicon();
  const transcribe = options.transcribe ?? ((file: string) => transcribeGta6Media(file));
  const probe = options.probe ?? ((file: string) => probeMediaDuration(file));
  const render = options.render ?? ((input: { source: string; output: string; start: number; end: number; telegram: boolean; sourceDuration: number }) =>
    renderGta6Clip({ ...input, sourceDuration: input.sourceDuration }));
  const cursor = createGta6Cursor(lexicon);
  const report: Gta6Report = { published: false, sources: [] };
  await mkdir(options.outDir, { recursive: true });
  for (const source of options.sources) {
    let offset = 0;
    let duration = 0;
    const languages: string[] = [];
    const segments: Gta6Segment[] = [];
    const highlights: Gta6ClipRecord[] = [];
    for (let index = 0; index < source.chunks.length; index += 1) {
      const file = source.chunks[index]!;
      const transcript = await transcribe(file);
      const chunkDuration = await probe(file);
      languages.push(transcript.language);
      const placed = transcript.segments.map((segment) => ({
        start: segment.start + offset,
        end: segment.end + offset,
        text: segment.text,
      }));
      segments.push(...placed);
      const hits = cursor.push({
        sourceId: source.sourceId,
        index,
        offsetSeconds: offset,
        closed: true,
        segments: transcript.segments,
      });
      for (const hit of hits) {
        const clip = resolve(options.outDir, "clips", `${source.sourceId}-${hit.class}-${hit.start}-${hit.end}.mp4`);
        const rendered = await render({
          source: file,
          output: clip,
          start: hit.start - offset,
          end: hit.end - offset,
          telegram: options.telegram === true,
          sourceDuration: chunkDuration,
          highlight: hit,
        });
        highlights.push({ ...hit, clip, filter: rendered.filter });
      }
      offset += chunkDuration;
      duration += chunkDuration;
    }
    report.sources.push({
      sourceId: source.sourceId,
      chunks: [...source.chunks],
      duration,
      language: languages[0] || "",
      segments,
      highlights,
    });
  }
  await writeFile(resolve(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function sourcePlansFromInputs(inputs: readonly string[]): Gta6SourcePlan[] {
  const used = new Set<string>();
  return inputs.map((file) => {
    const stem = basename(file).replace(/[^\w.-]+/gu, "_").replace(/^_+|_+$/gu, "") || "source";
    let sourceId = stem;
    let suffix = 2;
    while (used.has(sourceId)) sourceId = `${stem}-${suffix++}`;
    used.add(sourceId);
    return { sourceId, chunks: [file] };
  });
}

const LIVE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be", "twitch.tv", "m.twitch.tv", "player.twitch.tv"]);
export const GTA6_LIVE_LIMIT = 5;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be"]);

export type LiveChannelRef = { key: string; folder: string; label: string; url: string };

export function liveChannelKey(raw: string): LiveChannelRef {
  const url = assertLivePage(raw);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "twitch.tv" || host === "m.twitch.tv" || host === "player.twitch.tv") {
    const login = (host === "player.twitch.tv" ? url.searchParams.get("channel") : url.pathname.split("/").filter(Boolean)[0])?.toLowerCase() || "";
    if (!/^[a-z0-9_]{2,25}$/u.test(login) || ["directory", "videos", "settings", "downloads", "subscriptions", "inventory", "search"].includes(login)) {
      throw new Error("Нужна ссылка на канал Twitch.");
    }
    const key = `twitch:${login}`;
    return { key, folder: key.replace(/[^a-z0-9_-]+/giu, "_"), label: `twitch.tv/${login}`, url: `https://www.twitch.tv/${login}` };
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const watch = url.searchParams.get("v") || "";
  let id = "";
  if (host === "youtu.be" && /^[\w-]{6,}$/u.test(parts[0] || "")) id = `v:${parts[0]}`;
  else if (/^[\w-]{6,}$/u.test(watch)) id = `v:${watch}`;
  else if (parts[0] === "live" && /^[\w-]{6,}$/u.test(parts[1] || "")) id = `v:${parts[1]}`;
  else if (parts[0]?.startsWith("@") && parts[1] === "live") id = `at:${parts[0].slice(1).toLowerCase()}`;
  else if ((parts[0] === "channel" || parts[0] === "c" || parts[0] === "user") && parts[1] && parts[2] === "live") id = `${parts[0]}:${parts[1]}`;
  if (!YOUTUBE_HOSTS.has(host) || !id) throw new Error("Нужна ссылка на трансляцию YouTube.");
  const key = `youtube:${id}`;
  const label = id.startsWith("v:") ? `youtube.com/${id.slice(2)}` : id.startsWith("at:") ? `youtube.com/@${id.slice(3)}` : `youtube.com/${id.slice(id.indexOf(":") + 1)}`;
  return { key, folder: key.replace(/[^a-z0-9_-]+/giu, "_"), label, url: url.href };
}

export function assertLivePage(raw: string) {
  let url: URL;
  try { url = new URL(raw); }
  catch { throw new Error("Нужна ссылка на прямой эфир YouTube или Twitch."); }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.protocol !== "https:" || url.username || url.password || !LIVE_HOSTS.has(host)) {
    throw new Error("Поддерживается только прямая https-ссылка на YouTube или Twitch.");
  }
  return url;
}

export function assertChunkMinutes(minutes: number) {
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 30) throw new Error("Кусок эфира должен быть от 5 до 30 минут.");
  return minutes;
}

function ytdlpBin() {
  if (process.env.GTA6_YTDLP) return process.env.GTA6_YTDLP;
  const local = resolve(repoRoot, ".venv-cutting/bin/yt-dlp");
  return existsSync(local) ? local : "yt-dlp";
}

function liveMissing(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /not currently live|is not live|no live streams/iu.test(message);
}

export async function recordLiveChunk(input: {
  url: string;
  file: string;
  seconds: number;
  signal?: AbortSignal;
  run?: CapturedRun;
  probe?: (file: string) => Promise<number>;
}) {
  const channel = liveChannelKey(input.url);
  const run = input.run ?? runCaptured;
  const ytdlp = ytdlpBin();
  const nice = ["/usr/bin/nice", "/bin/nice"].find((file) => existsSync(file));
  const common = ["--no-playlist", "--no-warnings", "--socket-timeout", "30", "--no-live-from-start"];
  await mkdir(resolve(input.file, ".."), { recursive: true });
  // One yt-dlp call both checks the live page and records it. A separate
  // --dump-single-json waits on the same slow player response and was killed
  // by restarts before any chunk file existed. 720p is enough for the 9:16 frame.
  try {
    await run(nice || ytdlp, [
      ...(nice ? ["-n", "15", ytdlp] : []),
      ...common,
      "--no-part",
      "--concurrent-fragments", "1",
      "--downloader", "m3u8:ffmpeg",
      "--downloader", "ffmpeg",
      "--downloader-args", `ffmpeg:-t ${input.seconds} -c copy`,
      "-f", "b[height<=720]/b[height<=1080]/b/bv*[height<=720]+ba/b",
      "--remux-video", "mkv",
      "-o", input.file,
      "--",
      channel.url,
    ], {
      cwd: repoRoot, timeoutMs: (input.seconds + 12 * 60) * 1000, env: childEnv(), signal: input.signal,
    });
  } catch (error) {
    if (liveMissing(error)) throw new Error("По ссылке сейчас нет прямого эфира.");
    if (!input.signal?.aborted) throw error;
  }
  const size = await stat(input.file).then((info) => info.size).catch(() => 0);
  if (size < 4096) return { ended: true, empty: true };
  const duration = await (input.probe ?? probeMediaDuration)(input.file).catch(() => 0);
  return { ended: input.signal?.aborted === true || duration + 5 < input.seconds, empty: !(duration > 0) };
}

let processTail: Promise<void> = Promise.resolve();

type LibraryTarget = { store: Gta6Library; root: string; title: string };

export function withGta6ProcessSlot<T>(job: () => Promise<T>): Promise<T> {
  const run = processTail.then(job, job);
  processTail = run.then(() => undefined, () => undefined);
  return run;
}

export function cutLiveChunkByAudio(input: {
  file: string;
  sourceId: string;
  outDir: string;
  min?: number;
  max?: number;
  duration?: number;
  silenceLog?: string;
  copy?: (range: { start: number; end: number }, output: string) => Promise<void>;
  library?: LibraryTarget;
}): Promise<Gta6Report> {
  return withGta6ProcessSlot(() => renderLiveChunk(input));
}

async function renderLiveChunk(input: {
  file: string;
  sourceId: string;
  outDir: string;
  min?: number;
  max?: number;
  duration?: number;
  silenceLog?: string;
  copy?: (range: { start: number; end: number }, output: string) => Promise<void>;
  library?: LibraryTarget;
}): Promise<Gta6Report> {
  const duration = input.duration ?? await probeMediaDuration(input.file);
  const silenceLog = input.silenceLog ?? await detectSilenceLog(input.file, 0, duration);
  const pieces = cutsFromSilence(duration, silenceStartsFromDetectLog(silenceLog), input.min ?? 3, input.max ?? 5);
  const highlights: Gta6ClipRecord[] = [];
  await mkdir(resolve(input.outDir, "clips"), { recursive: true });
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]!;
    const clip = resolve(input.outDir, "clips", `${input.sourceId}-audio-${index + 1}.mp4`);
    if (input.copy) await input.copy(piece, clip);
    else {
      const { renderCuttingPart } = await import("./video-cutting.ts");
      const { circleAdvertiserSource, circleAdvertiserState, listCircleAdvertisers } = await import("./circle-advertisers.ts");
      const activeId = circleAdvertiserState().activeAdvertiserId;
      const item = listCircleAdvertisers().find((entry) => entry.id === activeId);
      const bannerFile = item ? circleAdvertiserSource(item.id) : "";
      if (!item || !existsSync(bannerFile)) throw new Error("Не найден активный баннер для нарезок.");
      const render = {
        source: input.file,
        dir: input.outDir,
        part: { number: index + 1, start: piece.start, end: piece.end, title: "Эфир", reason: "Кусок эфира." },
        words: [],
        subtitles: false,
        light: true,
      };
      const area = input.library ? GTA6_BANNER_AREA : undefined;
      await renderCuttingPart({ ...render, output: clip, banner: { item, file: bannerFile, area } });
      if (input.library) {
        const banners = gta6LibraryBanners(input.library.root);
        await input.library.store.add(input.library.title, async (banner, output) => {
          if (banner === "shortrobot" && item.id === banners.shortrobot.item.id && bannerFile === banners.shortrobot.file) {
            await link(clip, output);
          } else {
            await renderCuttingPart({ ...render, output, banner: { ...banners[banner], area: GTA6_BANNER_AREA } });
          }
        });
      }
    }
    highlights.push({
      sourceId: input.sourceId,
      class: "first_look",
      text: "",
      triggerStart: piece.start,
      triggerEnd: piece.end,
      start: piece.start,
      end: piece.end,
      clip,
      filter: "audio",
    });
  }
  return {
    published: false,
    sources: [{ sourceId: input.sourceId, chunks: [input.file], duration, language: "", segments: [], highlights }],
  };
}

export async function followGta6Live(options: {
  url: string;
  outDir: string;
  minutes?: number;
  telegram?: boolean;
  labels?: readonly Gta6Label[];
  signal?: AbortSignal;
  record?: (input: { url: string; file: string; seconds: number; signal?: AbortSignal }) => Promise<{ ended: boolean; empty?: boolean }>;
  processChunk?: (input: { file: string; index: number; sourceId: string }) => Promise<Gta6Report>;
  remove?: (file: string) => Promise<void>;
  log?: (line: string) => void;
  maxChunks?: number;
  audioCuts?: { min: number; max: number };
  library?: LibraryTarget;
}) {
  const page = assertLivePage(options.url);
  const minutes = assertChunkMinutes(options.minutes ?? 10);
  if (options.maxChunks != null && (!Number.isInteger(options.maxChunks) || options.maxChunks < 1 || options.maxChunks > 12)) {
    throw new Error("Подряд можно записать от 1 до 12 кусков.");
  }
  const seconds = minutes * 60;
  const stop = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, stop.signal]) : stop.signal;
  const record = options.record ?? ((input: { url: string; file: string; seconds: number; signal?: AbortSignal }) => recordLiveChunk(input));
  const processChunk = options.processChunk ?? (options.audioCuts
    ? (input: { file: string; sourceId: string }) => cutLiveChunkByAudio({
      file: input.file, sourceId: input.sourceId, outDir: options.outDir,
      min: options.audioCuts?.min, max: options.audioCuts?.max, library: options.library,
    })
    : (input: { file: string; sourceId: string }) => withGta6ProcessSlot(() => runGta6Highlights({
      sources: [{ sourceId: input.sourceId, chunks: [input.file] }],
      outDir: options.outDir,
      telegram: options.telegram,
      labels: options.labels,
    })));
  const remove = options.remove ?? ((file: string) => rm(file, { force: true }));
  const log = options.log ?? (() => {});
  await mkdir(resolve(options.outDir, "incoming"), { recursive: true });
  const report: Gta6Report = { published: false, sources: [] };
  const open = (index: number) => {
    const file = resolve(options.outDir, "incoming", `chunk-${index}.mkv`);
    log(`Подключаюсь к эфиру, кусок ${index + 1}, ${minutes} мин.`);
    return record({ url: page.href, file, seconds, signal }).then((result) => ({ ...result, file, index }));
  };
  let pending = open(0);
  try {
    while (!signal.aborted) {
      const current = await pending;
      const withinHour = options.maxChunks == null || current.index + 1 < options.maxChunks;
      const continueLive = !current.ended && !signal.aborted && withinHour;
      if (continueLive) pending = open(current.index + 1);
      if (current.empty) {
        await remove(current.file);
        log(`Кусок ${current.index + 1} пустой и удалён.`);
      } else {
        log(`Кусок ${current.index + 1} закрыт, нарезаю.`);
        const piece = await processChunk({ file: current.file, index: current.index, sourceId: `live-${current.index + 1}` });
        report.sources.push(...piece.sources);
        await writeFile(resolve(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
        await remove(current.file);
        const clips = piece.sources.reduce((count, source) => count + source.highlights.length, 0);
        log(`Исходный кусок ${current.index + 1} удалён. Клипов: ${clips}.`);
      }
      if (!continueLive) break;
    }
  } catch (error) {
    stop.abort();
    await pending.catch(() => undefined);
    throw error;
  }
  await writeFile(resolve(options.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export type { Gta6Class };
