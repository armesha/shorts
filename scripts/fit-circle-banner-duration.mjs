import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || "") : fallback;
}

function seconds(value) {
  return Math.max(0, value).toFixed(3);
}

function probeDuration(file) {
  const result = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "info", "-i", file,
    "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const details = `${result.stderr || ""}\n${result.stdout || ""}`;
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i.exec(details);
  if (result.error) throw result.error;
  if (!match) throw new Error(`Не удалось определить длительность видео: ${file}`);
  const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Некорректная длительность видео: ${file}`);
  }
  return duration;
}

const ffmpeg = ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : "ffmpeg";
const bannerArg = argument("banner");
const videoArg = argument("video");
const outputArg = argument("output");
const requestedDuration = Number(argument("duration"));

if (!bannerArg || !outputArg || (!videoArg && !(requestedDuration > 0))) {
  console.error(
    "Использование: npm run circle:banner:fit -- --banner <banner.mov> "
      + "(--video <video.mp4> | --duration <секунды>) --output <banner-fitted.mov>",
  );
  process.exitCode = 1;
} else {
  const banner = resolve(process.cwd(), bannerArg);
  const targetVideo = videoArg ? resolve(process.cwd(), videoArg) : "";
  const output = resolve(process.cwd(), outputArg);
  if (!existsSync(banner)) throw new Error(`Баннер не найден: ${banner}`);
  if (targetVideo && !existsSync(targetVideo)) throw new Error(`Целевое видео не найдено: ${targetVideo}`);
  if (extname(output).toLowerCase() !== ".mov") {
    throw new Error("Результат должен быть MOV, чтобы сохранить альфа-канал.");
  }
  const duration = requestedDuration > 0 ? requestedDuration : probeDuration(targetVideo);
  probeDuration(banner);

  await mkdir(dirname(output), { recursive: true });
  const temporary = resolve(dirname(output), `.${randomUUID()}.tmp.mov`);
  try {
    const result = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-stream_loop", "-1", "-i", banner,
      "-map", "0:v:0", "-an", "-sn", "-dn",
      "-vf", `fps=60,trim=duration=${seconds(duration)},setpts=PTS-STARTPTS,format=yuva444p10le`,
      "-t", seconds(duration),
      "-c:v", "prores_ks", "-profile:v", "4", "-pix_fmt", "yuva444p10le",
      "-vendor", "apl0", "-movflags", "+faststart",
      temporary,
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error((result.stderr || "").split(/\r?\n/).filter(Boolean).slice(-12).join(" "));
    }
    await rename(temporary, output);
    console.log(JSON.stringify({
      banner,
      targetVideo: targetVideo || undefined,
      output,
      durationSec: duration,
      mode: "loop-without-speed-change",
    }, null, 2));
  } finally {
    await rm(temporary, { force: true });
  }
}
