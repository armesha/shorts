import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  MAX_SOURCE_SECONDS,
  normalizeVideoUrl,
  parseVideoVtt,
  type TimedWord,
} from "./video-cutting-plan.ts";
import { runCuttingProcess, russianSubtitleLanguage, type ProcessRunner } from "./video-cutting.ts";

export type StreamSource = {
  url: string;
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  words: TimedWord[];
};

const commonArgs = [
  "--no-playlist",
  "--no-warnings",
  "--socket-timeout", "30",
  "--retries", "2",
  "--js-runtimes", "node",
  "--remote-components", "ejs:github",
];

export async function loadYoutubeSubtitleSource(url: string, dir: string, signal: AbortSignal, run: ProcessRunner = runCuttingProcess): Promise<StreamSource> {
  const normalized = normalizeVideoUrl(url);
  const videoId = new URL(normalized).searchParams.get("v")!;
  const ytdlp = process.env.VIDEO_CUTTING_YTDLP
    || (existsSync(resolve(process.cwd(), ".venv-cutting/bin/yt-dlp")) ? resolve(process.cwd(), ".venv-cutting/bin/yt-dlp") : "yt-dlp");
  const metadata = JSON.parse(await run(ytdlp, [...commonArgs, "--skip-download", "--dump-single-json", "--", normalized], { cwd: dir, signal, timeoutMs: 120_000 })) as {
    title?: unknown;
    channel?: unknown;
    uploader?: unknown;
    duration?: unknown;
    is_live?: unknown;
    subtitles?: Record<string, unknown>;
    automatic_captions?: Record<string, unknown>;
  };
  const duration = Number(metadata.duration);
  if (metadata.is_live) throw new Error("Это прямой эфир. Для эфира используйте блок трансляции, а для разбора — уже сохранённую запись.");
  if (!Number.isFinite(duration) || duration < 3 || duration > MAX_SOURCE_SECONDS)
    throw new Error("Нужна запись длительностью от 3 секунд до 3 часов.");
  const language = russianSubtitleLanguage(metadata);
  if (!language) throw new Error("У видео нет доступных русских субтитров. Выберите другое видео.");
  await run(ytdlp, [
    ...commonArgs,
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", language,
    "--sub-format", "vtt",
    "-o", "source.%(ext)s",
    "--", normalized,
  ], { cwd: dir, signal, timeoutMs: 180_000 });
  const files = await readdir(dir);
  const vtt = ["source.ru-orig.vtt", "source.ru.vtt"].find((file) => files.includes(file));
  if (!vtt) throw new Error("У видео нет доступных русских субтитров. Выберите другое видео.");
  const words = parseVideoVtt(await readFile(resolve(dir, vtt), "utf8"), { includeReactions: true });
  if (!words.length) throw new Error("Не удалось извлечь речь из субтитров видео.");
  if (words.length > 100_000) throw new Error("Расшифровка слишком большая для одного разбора. Выберите более короткое видео.");
  return {
    url: normalized,
    videoId,
    title: String(metadata.title || "Видео").slice(0, 200),
    channel: String(metadata.channel || metadata.uploader || "").slice(0, 200),
    duration,
    words,
  };
}
