import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import ffmpegPath from "ffmpeg-static";
import { circleProjectDir } from "./circle-workspace.ts";
import { circleSourceOwnerId } from "./circle-source-library.ts";
const exec = promisify(execFile);
export type MontageSegment = { start: number; end: number };
export function validateMontageSegments(value: unknown): MontageSegment[] {
  if (!Array.isArray(value) || !value.length || value.length > 10)
    throw new Error("Добавьте от 1 до 10 фрагментов.");
  const result = value.map((v) => ({
    start: Number(v?.start),
    end: Number(v?.end),
  }));
  if (
    result.some(
      (v) =>
        !Number.isFinite(v.start) ||
        !Number.isFinite(v.end) ||
        v.start < 0 ||
        v.end <= v.start,
    )
  )
    throw new Error("Укажите начало и конец каждого фрагмента в секундах.");
  if (result.reduce((sum, v) => sum + v.end - v.start, 0) > 60.01)
    throw new Error("Общая длительность — до 60 секунд.");
  return result;
}
export async function renderMontageTemplate(input: {
  userId: number;
  source: string;
  segments: MontageSegment[];
  outputDir: string;
}) {
  if (
    !/^[^/\\]+$/.test(input.source) ||
    circleSourceOwnerId(input.source) !== input.userId
  )
    throw new Error("Выберите своё загруженное видео.");
  const base = await realpath(resolve(circleProjectDir(), "downloads"));
  const source = await realpath(resolve(base, input.source));
  if (!source.startsWith(base + sep)) throw new Error("Видео недоступно.");
  let probe = "";
  try {
    await exec(ffmpegPath!, ["-hide_banner", "-i", source], {
      maxBuffer: 512_000,
    });
  } catch (error) {
    probe = String((error as { stderr?: string }).stderr || "");
  }
  if (!/Video:/.test(probe))
    throw new Error("Файл не удалось прочитать как видео.");
  const audio = /Audio:/.test(probe);
  const duration = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const seconds = duration
    ? Number(duration[1]) * 3600 +
      Number(duration[2]) * 60 +
      Number(duration[3])
    : null;
  const segments = validateMontageSegments(input.segments);
  if (seconds != null && segments.some((s) => s.end > seconds + 0.05))
    throw new Error("Конец фрагмента выходит за длительность видео.");
  const rel = `creator/montage-u${input.userId}/${randomUUID()}.mp4`,
    output = resolve(input.outputDir, rel);
  await mkdir(resolve(input.outputDir, `creator/montage-u${input.userId}`), {
    recursive: true,
  });
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const segment of segments)
    args.push(
      "-ss",
      String(segment.start),
      "-t",
      String(segment.end - segment.start),
      "-i",
      source,
    );
  const graph: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    graph.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,setpts=PTS-STARTPTS[v${i}]`,
    );
    if (audio) graph.push(`[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
  }
  graph.push(
    segments.map((_, i) => `[v${i}]${audio ? `[a${i}]` : ""}`).join("") +
      `concat=n=${segments.length}:v=1:a=${audio ? 1 : 0}[outv]${audio ? "[outa]" : ""}`,
  );
  args.push("-filter_complex", graph.join(";"), "-map", "[outv]");
  if (audio) args.push("-map", "[outa]", "-c:a", "aac", "-b:a", "160k");
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "2",
    "-movflags",
    "+faststart",
    output,
  );
  try {
    await exec(ffmpegPath!, args, { timeout: 180_000, maxBuffer: 1024_000 });
  } catch {
    await rm(output, { force: true });
    throw new Error(
      "Не удалось собрать нарезку. Проверьте фрагменты и исходное видео.",
    );
  }
  return {
    videoRel: rel,
    durationSec: segments.reduce((sum, s) => sum + s.end - s.start, 0),
  };
}
