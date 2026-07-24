import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import puppeteer from "puppeteer-core";
import { chromePath } from "../../src/core/chrome.ts";
import {
  circleAdvertiserSource,
  circleAdvertiserState,
  type CircleAdvertiser,
} from "./circle-advertisers.ts";
import type { CircleLayout } from "./circle-templates.ts";
import { circleProjectDir, ensureCircleWorkspace } from "./circle-workspace.ts";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const packagedFfmpeg = ffmpegPath as unknown as string | null;
const ffmpeg = packagedFfmpeg && existsSync(packagedFfmpeg)
  ? packagedFfmpeg
  : (process.env.FFMPEG_PATH?.trim() || "ffmpeg");
let runtimeStateQueue = Promise.resolve();

type MediaProbe = {
  durationSec: number;
  hasAudio: boolean;
};

type SegmentState = {
  version: 1;
  files: Record<string, { used: Array<{ start: number; end: number }> }>;
};

type PuzzleState = {
  version: 1;
  recent: string[];
};

type ActiveBanner = {
  item: CircleAdvertiser;
  file: string;
};

export interface CircleVideoRenderInput {
  sourceFile: string;
  gameplayFile: string;
  outputFile: string;
  layout: CircleLayout;
  durationOverrideSec?: number;
  encoderPreset?: "ultrafast" | "superfast" | "veryfast" | "faster" | "fast" | "medium";
}

export interface CircleVideoRenderResult {
  file: string;
  durationSec: number;
  gameplayStartSec: number;
  puzzle: string;
}

function runFfmpeg(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpeg, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-30_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(stderr);
      else {
        const details = stderr.split(/\r?\n/).filter(Boolean).slice(-14).join(" ");
        reject(new Error(details || `FFmpeg завершился с кодом ${code}`));
      }
    });
  });
}

async function probeMedia(file: string): Promise<MediaProbe> {
  if (!existsSync(file)) throw new Error(`Видеофайл не найден: ${basename(file)}`);
  const stderr = await runFfmpeg([
    "-hide_banner", "-loglevel", "info", "-i", file,
    "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
  ], dirname(file));
  const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i.exec(stderr);
  if (!duration) throw new Error(`Не удалось определить длительность видео: ${basename(file)}`);
  const durationSec = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`Видео имеет некорректную длительность: ${basename(file)}`);
  }
  return { durationSec, hasAudio: /\bAudio:\s/i.test(stderr) };
}

function listVideos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "ru-RU"));
}

export function listCircleGameplays(root = circleProjectDir()): string[] {
  return listVideos(resolve(root, "gameplay"));
}

function readJson<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as T;
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

async function withRuntimeState<T>(task: () => Promise<T>): Promise<T> {
  let release = () => {};
  const previous = runtimeStateQueue;
  runtimeStateQueue = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function rangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end - 0.05 && right.start < left.end - 0.05;
}

async function pickGameplayStart(
  root: string,
  gameplayFile: string,
  gameplayDuration: number,
  clipDuration: number,
): Promise<number> {
  return withRuntimeState(async () => {
    const file = resolve(root, ".runtime", "gameplay-segments.json");
    const state = readJson<SegmentState>(file, { version: 1, files: {} });
    if (!state.files || typeof state.files !== "object") state.files = {};
    const key = basename(gameplayFile);
    const record = state.files[key] && Array.isArray(state.files[key].used)
      ? state.files[key]
      : { used: [] };
    const maxStart = Math.max(0, gameplayDuration - clipDuration);
    const candidates: number[] = [];
    for (let start = 0; start <= maxStart + 0.05; start += clipDuration) {
      candidates.push(Number(Math.min(start, maxStart).toFixed(3)));
    }
    if (!candidates.length) candidates.push(0);
    const available = candidates.filter((start) => {
      const candidate = { start, end: start + clipDuration };
      return !record.used.some((range) => rangesOverlap(candidate, range));
    });
    const pool = available.length ? available : candidates;
    if (!available.length) record.used = [];
    const start = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    record.used.push({ start, end: start + clipDuration });
    record.used = record.used.slice(-300);
    state.files[key] = record;
    await writeJson(file, state);
    return start;
  });
}

function randomPuzzle(): string {
  const multiplication = Math.random() < 0.55;
  if (multiplication) {
    const left = 2 + Math.floor(Math.random() * 11);
    const right = 2 + Math.floor(Math.random() * 10);
    const subtract = 2 + Math.floor(Math.random() * Math.max(3, left * right - 2));
    return `${left} × ${right} − ${subtract} = ?`;
  }
  const left = 12 + Math.floor(Math.random() * 78);
  const add = 4 + Math.floor(Math.random() * 46);
  const subtract = 3 + Math.floor(Math.random() * Math.max(4, left + add - 3));
  return `${left} + ${add} − ${subtract} = ?`;
}

async function pickPuzzle(root: string): Promise<string> {
  return withRuntimeState(async () => {
    const file = resolve(root, ".runtime", "puzzles.json");
    const state = readJson<PuzzleState>(file, { version: 1, recent: [] });
    const recent = Array.isArray(state.recent) ? state.recent.filter((item) => typeof item === "string") : [];
    let puzzle = randomPuzzle();
    for (let attempt = 0; attempt < 80 && recent.includes(puzzle); attempt++) puzzle = randomPuzzle();
    await writeJson(file, { version: 1, recent: [...recent, puzzle].slice(-250) });
    return puzzle;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderPuzzleOverlay(file: string, layout: CircleLayout, puzzle: string): Promise<void> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;background:transparent;overflow:hidden}
    body{font-family:"DejaVu Sans",Arial,sans-serif;color:#fff}
    .p{position:absolute;left:${layout.puzzle.x}px;top:${layout.puzzle.y}px;width:${layout.puzzle.width}px;text-align:center;
      font-weight:900;text-shadow:0 4px 10px rgba(0,0,0,.85),0 2px 2px rgba(0,0,0,.95)}
    .l{font-size:${layout.puzzle.labelSize}px;line-height:1.05;letter-spacing:.025em}
    .e{margin-top:${layout.puzzle.gap}px;font-size:${layout.puzzle.puzzleSize}px;line-height:1.08;white-space:nowrap}
  </style></head><body><div class="p"><div class="l">РЕШИ ЗА 3 СЕК</div><div class="e">${escapeHtml(puzzle)}</div></div></body></html>`;
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: file as `${string}.png`,
      type: "png",
      omitBackground: true,
      clip: { x: 0, y: 0, width: 1080, height: 1920 },
    });
  } finally {
    await browser.close();
  }
}

function activeBanner(): ActiveBanner | null {
  const state = circleAdvertiserState();
  if (!state.bannerEnabled || !state.activeAdvertiserId) return null;
  const item = state.advertisers.find((entry) => entry.id === state.activeAdvertiserId);
  if (!item) return null;
  const file = circleAdvertiserSource(item.id);
  return existsSync(file) ? { item, file } : null;
}

function seconds(value: number): string {
  return Math.max(0, value).toFixed(3);
}

function bannerEnable(layout: CircleLayout): string {
  const start = Math.max(0, layout.banner.startSeconds || 0);
  const repeat = Math.max(0, layout.banner.repeatEverySeconds || 0);
  if (!repeat) return `gte(t,${start})`;
  const visible = Math.max(0.5, Math.min(8, repeat));
  return `gte(t,${start})*lt(mod(t-${start},${repeat}),${visible})`;
}

function circleMask(size: number, duration: number): string {
  const expression = "if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2),(W/2)*(W/2)),255,0)";
  return `color=c=white:s=${size}x${size}:r=30:d=${seconds(duration)},format=gray,geq=lum='${expression}'[circlemask]`;
}

export async function renderCircleVideo(input: CircleVideoRenderInput): Promise<CircleVideoRenderResult> {
  const root = ensureCircleWorkspace();
  const [sourceProbe, gameplayProbe] = await Promise.all([
    probeMedia(input.sourceFile),
    probeMedia(input.gameplayFile),
  ]);
  const requestedDuration = Number(input.durationOverrideSec);
  const durationSec = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(sourceProbe.durationSec, requestedDuration)
    : Math.min(sourceProbe.durationSec, 180);
  if (durationSec < 0.1) throw new Error("Видеокружок слишком короткий.");

  const [gameplayStartSec, puzzle] = await Promise.all([
    pickGameplayStart(root, input.gameplayFile, gameplayProbe.durationSec, durationSec),
    pickPuzzle(root),
  ]);
  const puzzleFile = resolve(root, ".runtime", `puzzle-${randomUUID()}.png`);
  const temporaryOutput = `${input.outputFile}.${randomUUID()}.tmp.mp4`;
  await mkdir(dirname(input.outputFile), { recursive: true });
  await renderPuzzleOverlay(puzzleFile, input.layout, puzzle);

  const banner = activeBanner();
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-stream_loop", "-1", "-ss", seconds(gameplayStartSec), "-i", input.gameplayFile,
    "-i", input.sourceFile,
    "-loop", "1", "-framerate", "30", "-i", puzzleFile,
  ];
  if (banner) {
    if (/\.(png|jpe?g|webp)$/i.test(banner.file)) {
      args.push("-loop", "1", "-framerate", "30", "-i", banner.file);
    } else {
      args.push("-stream_loop", "-1", "-i", banner.file);
    }
  }

  const size = input.layout.circle.size;
  const filters = [
    `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,trim=duration=${seconds(durationSec)},setpts=PTS-STARTPTS[background]`,
    `[1:v]scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},setsar=1,fps=30,trim=duration=${seconds(durationSec)},setpts=PTS-STARTPTS,format=rgba[circlebase]`,
    circleMask(size, durationSec),
    "[circlebase][circlemask]alphamerge[circle]",
    `[background][circle]overlay=x=${input.layout.circle.x}:y=${input.layout.circle.y}:eof_action=pass:shortest=0[withcircle]`,
    `[2:v]format=rgba,fps=30,trim=duration=${seconds(durationSec)},setpts=PTS-STARTPTS[puzzle]`,
    "[withcircle][puzzle]overlay=0:0:eof_action=repeat:shortest=0[withpuzzle]",
  ];
  let videoMap = "withpuzzle";
  if (banner) {
    const item = banner.item;
    const crop = item.fullFrame !== false ? "crop=900:260:90:830," : "";
    const transparency = item.transparent !== false
      ? "format=rgba"
      : `format=rgba,chromakey=${(item.chromaColor || "#00ff00").replace("#", "0x")}:${item.similarity ?? 0.18}:${item.blend ?? 0.08}`;
    filters.push(
      `[3:v]${crop}scale=${input.layout.banner.width}:${input.layout.banner.height}:flags=lanczos,${transparency},fps=30,trim=duration=${seconds(durationSec)},setpts=PTS-STARTPTS[ad]`,
      `[withpuzzle][ad]overlay=x=${input.layout.banner.x}:y=${input.layout.banner.y}:enable='${bannerEnable(input.layout)}':eof_action=repeat:shortest=0[withbanner]`,
    );
    videoMap = "withbanner";
  }
  if (sourceProbe.hasAudio) {
    filters.push(`[1:a]atrim=duration=${seconds(durationSec)},asetpts=PTS-STARTPTS,apad=pad_dur=${seconds(durationSec)}[circleaudio]`);
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${videoMap}]`,
  );
  if (sourceProbe.hasAudio) args.push("-map", "[circleaudio]");
  args.push(
    "-t", seconds(durationSec),
    "-c:v", "libx264",
    "-preset", input.encoderPreset || "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", "30",
  );
  if (sourceProbe.hasAudio) args.push("-c:a", "aac", "-b:a", "160k");
  args.push("-movflags", "+faststart", temporaryOutput);

  try {
    await runFfmpeg(args, root);
    if (!existsSync(temporaryOutput)) throw new Error("FFmpeg не создал итоговый MP4.");
    await rename(temporaryOutput, input.outputFile);
  } finally {
    await rm(temporaryOutput, { force: true });
    await rm(puzzleFile, { force: true });
  }
  return {
    file: input.outputFile,
    durationSec,
    gameplayStartSec,
    puzzle,
  };
}
