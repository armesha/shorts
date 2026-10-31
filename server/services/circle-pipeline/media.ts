import { execFile } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const MAX_DURATION_SECONDS = 180;

/** Prepare bounded visual and audio evidence; caller must treat extraction errors as unreviewed. */
export async function prepareCircleEvidence(source: string, directory: string): Promise<{
  duration: number; frames: string[]; audio: string | null;
}> {
  const result = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type",
    "-of", "json", source], { timeout: 30_000, maxBuffer: 128_000 });
  const probe = JSON.parse(result.stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  const duration = Number(probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS ||
      !probe.streams?.some(stream => stream.codec_type === "video")) throw new Error("Invalid source video");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const framesDir = resolve(directory, "frames");
  await mkdir(framesDir, { recursive: false, mode: 0o700 });
  await exec(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", source,
    "-vf", "fps=1,scale=512:512:force_original_aspect_ratio=decrease", "-q:v", "3",
    resolve(framesDir, "%04d.jpg")], { timeout: 120_000, maxBuffer: 128_000 });
  const frames = (await readdir(framesDir)).filter(name => /^\d{4}\.jpg$/.test(name)).sort()
    .map(name => resolve(framesDir, name));
  if (!frames.length) throw new Error("No review frames extracted");
  let audio: string | null = null;
  if (probe.streams.some(stream => stream.codec_type === "audio")) {
    audio = resolve(directory, "audio.wav");
    await exec(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", source,
      "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audio],
    { timeout: 120_000, maxBuffer: 128_000 });
  }
  return { duration, frames, audio };
}

/** Ensure an apparently successful render really contains the expected video and audio. */
export async function validateRenderedCircle(file: string, expectedDuration: number, audioPresent: boolean): Promise<void> {
  const result = await exec("ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height", "-of", "json", file],
  { timeout: 30_000, maxBuffer: 128_000 });
  const media = JSON.parse(result.stdout) as { format?: { duration?: string }; streams?: {
    codec_type?: string; codec_name?: string; width?: number; height?: number;
  }[] };
  const video = media.streams?.find(stream => stream.codec_type === "video");
  const duration = Number(media.format?.duration);
  if (video?.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920 ||
      !Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 0.5 ||
      (audioPresent && !media.streams?.some(stream => stream.codec_type === "audio")))
    throw new Error("Rendered circle failed media verification");
}
