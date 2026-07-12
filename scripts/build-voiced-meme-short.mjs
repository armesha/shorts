#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function probeDuration(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ], { encoding: "utf8" });
  const value = Number(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(value) || value <= 0) throw new Error(`Не удалось прочитать длительность ${file}`);
  return value;
}

const meme = resolve(arg("meme"));
const avatar = resolve(arg("avatar"));
const gameplay = resolve(arg("gameplay", "assets/fact-videos/voiced-memes-ru/sources/minecraft-parkour-6h.mp4"));
const output = resolve(arg("output", "tmp/voiced-meme-short.mp4"));
const history = resolve(arg("history", "tmp/gameplay-segments/history.json"));
const avatarBackground = resolve(arg("avatar-background", "assets/audio-avatar-backgrounds/shino-cozy-room.png"));
const ringColor = arg("ring-color", "#f5c7a4");
for (const file of [meme, avatar, gameplay, avatarBackground]) {
  if (!file || !existsSync(file)) throw new Error(`Файл не найден: ${file}`);
}

const duration = probeDuration(avatar);
const picker = spawnSync(process.execPath, [
  resolve("scripts/select-gameplay-segment.mjs"),
  "--source", gameplay,
  "--duration", String(duration),
  "--history", history,
], { encoding: "utf8" });
if (picker.status !== 0) throw new Error(picker.stderr || "Не удалось выбрать фрагмент геймплея");
const segment = JSON.parse(picker.stdout.trim());

const filter = [
  "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.1:saturation=0.9[bg]",
  "[1:v]scale=940:940:force_original_aspect_ratio=decrease,pad=940:940:(ow-iw)/2:(oh-ih)/2:color=white[meme]",
  "[2:v]scale=520:520,format=rgba[avatar]",
  "[3:v]scale=520:520:force_original_aspect_ratio=increase,crop=520:520,format=rgba[avatarBg]",
  "[avatarBg][avatar]overlay=0:0:format=auto[avatarComposed]",
  `color=c=${ringColor}:s=540x540,format=rgba[ringColor]`,
  "color=c=black:s=540x540,format=gray,geq=lum='if(lte((X-270)*(X-270)+(Y-270)*(Y-270),270*270),255,0)'[ringMask]",
  "[ringColor][ringMask]alphamerge[ring]",
  "color=c=black:s=520x520,format=gray,geq=lum='if(lte((X-260)*(X-260)+(Y-260)*(Y-260),260*260),255,0)'[avatarMask]",
  "[avatarComposed][avatarMask]alphamerge[avatarCircle]",
  "[bg][meme]overlay=70:90[tmp1]",
  "[tmp1][ring]overlay=270:1150:format=auto[tmp2]",
  "[tmp2][avatarCircle]overlay=280:1160:format=auto[outv]",
].join(";");

mkdirSync(dirname(output), { recursive: true });
const render = spawnSync(ffmpegPath, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-ss", String(segment.start), "-i", gameplay,
  "-loop", "1", "-i", meme,
  "-i", avatar,
  "-loop", "1", "-i", avatarBackground,
  "-filter_complex", filter,
  "-map", "[outv]", "-map", "2:a?", "-t", String(duration), "-r", "30",
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output,
], { stdio: "inherit" });
if (render.status !== 0) throw new Error(`ffmpeg завершился с кодом ${render.status ?? "signal"}`);
writeFileSync(`${output}.segment.json`, `${JSON.stringify(segment, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, segment }, null, 2)}\n`);
