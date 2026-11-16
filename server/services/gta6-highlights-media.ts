import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
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

export function runCaptured(bin: string, args: string[], options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) {
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
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : accept({ stdout, stderr });
    };
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-8000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${bin} завершился с кодом ${code}: ${stderr}`));
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

export type { Gta6Class };
