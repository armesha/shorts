#!/usr/bin/env node

import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const poolFile = resolve(arg("pool", "assets/audio-avatar-backgrounds/pool.json"));
const gameplay = resolve(arg("gameplay", "assets/fact-videos/voiced-memes-ru/sources/minecraft-parkour-6h.mp4"));
const meme = resolve(arg("meme"));
const avatar = resolve(arg("avatar"));
const outputDir = resolve(arg("output", "tmp/avatar-style-previews"));
const pool = JSON.parse(readFileSync(poolFile, "utf8"));
mkdirSync(outputDir, { recursive: true });

for (let index = 0; index < pool.backgrounds.length; index += 1) {
  const background = resolve(resolve(poolFile, ".."), pool.backgrounds[index].file);
  const ringColor = String(pool.ringColors[index % pool.ringColors.length]).replace("#", "0x");
  const gameplayAt = 401 + index * 977;
  const filter = [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.1:saturation=0.9[base]",
    "[1:v]scale=940:940:force_original_aspect_ratio=decrease,pad=940:940:(ow-iw)/2:(oh-ih)/2:color=white[meme]",
    "[2:v]scale=520:520:force_original_aspect_ratio=increase,crop=520:520,format=rgba[room]",
    "[3:v]scale=520:520,format=rgba[person]",
    "[room][person]overlay=0:0:format=auto[scene]",
    `color=c=${ringColor}:s=540x540,format=rgba[ringColor]`,
    "color=c=black:s=540x540,format=gray,geq=lum='if(lte((X-270)*(X-270)+(Y-270)*(Y-270),270*270),255,0)'[ringMask]",
    "[ringColor][ringMask]alphamerge[ring]",
    "color=c=black:s=520x520,format=gray,geq=lum='if(lte((X-260)*(X-260)+(Y-260)*(Y-260),260*260),255,0)'[sceneMask]",
    "[scene][sceneMask]alphamerge[circle]",
    "[base][meme]overlay=70:90[tmp1]",
    "[tmp1][ring]overlay=270:1150:format=auto[tmp2]",
    "[tmp2][circle]overlay=280:1160:format=auto[out]",
  ].join(";");
  const output = resolve(outputDir, `preview-${String(index + 1).padStart(2, "0")}.png`);
  const result = spawnSync(ffmpegPath, [
    "-y", "-hide_banner", "-loglevel", "error", "-ss", String(gameplayAt), "-i", gameplay,
    "-i", meme, "-i", background, "-i", avatar,
    "-filter_complex", filter, "-map", "[out]", "-frames:v", "1", output,
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Не удалось собрать preview-${index + 1}`);
}

process.stdout.write(`${JSON.stringify({ outputDir, count: pool.backgrounds.length }, null, 2)}\n`);
