#!/usr/bin/env node

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

function typeFor(title) {
  if (/subway/i.test(title)) return "subway-surfers";
  if (/roblox/i.test(title)) return "roblox";
  if (/gta/i.test(title)) return "gta";
  if (/forza/i.test(title)) return "forza";
  if (/minecraft/i.test(title)) return "minecraft";
  return "other";
}

function readableVideo(file) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return probe.status === 0 && Number(probe.stdout.trim()) > 0;
}

const channel = arg("channel", "https://www.youtube.com/@OrbitalNCG/videos");
const ytdlp = resolve(arg("yt-dlp", "tmp/yt-dlp"));
const sourceDir = resolve(arg("source-dir", "assets/fact-videos/voiced-memes-ru/sources"));
const configPath = resolve(arg("config", "data/voiced-memes-ru/gameplay-sources.json"));
const download = process.argv.includes("--download");
const clean = process.argv.includes("--clean");
const shardCount = Math.max(1, Number(arg("shard-count", "1")) || 1);
const shardIndex = Math.max(0, Number(arg("shard-index", "0")) || 0);
if (shardIndex >= shardCount) throw new Error("--shard-index должен быть меньше --shard-count");
if (!existsSync(ytdlp)) throw new Error(`yt-dlp не найден: ${ytdlp}`);

if (clean && existsSync(sourceDir)) {
  rmSync(sourceDir, { recursive: true, force: true });
}
mkdirSync(sourceDir, { recursive: true });

const listing = spawnSync(ytdlp, ["--flat-playlist", "--no-warnings", "--dump-single-json", channel], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
if (listing.status !== 0) throw new Error(listing.stderr || "Не удалось прочитать канал");
const playlist = JSON.parse(listing.stdout);
const sources = (Array.isArray(playlist.entries) ? playlist.entries : [])
  .filter((entry) => /vertical/i.test(String(entry.title || "")))
  .map((entry) => ({
    id: `orbital-${entry.id}`,
    type: typeFor(String(entry.title || "")),
    file: `assets/fact-videos/voiced-memes-ru/sources/orbital-${entry.id}.mp4`,
    sourceUrl: `https://www.youtube.com/watch?v=${entry.id}`,
    title: String(entry.title || ""),
    durationSec: Number(entry.duration) || 0,
    rights: "User selected the OrbitalNCG channel and confirmed its videos are cleared for this use.",
  }));
writeJsonAtomic(configPath, {
  pack: "voiced-memes-ru",
  channel,
  selection: "Choose gameplay types evenly; then choose a least-used vertical source within that type at random.",
  sources,
});

let downloaded = 0;
let skipped = 0;
const failed = [];
if (download) {
  for (const [index, source] of sources.entries()) {
    if (index % shardCount !== shardIndex) continue;
    const output = resolve(source.file);
    if (existsSync(output) && readableVideo(output)) {
      skipped += 1;
      continue;
    }
    rmSync(`${output}.part`, { force: true });
    const result = spawnSync(ytdlp, [
      "--no-playlist", "--no-warnings", "--write-info-json", "--no-write-thumbnail",
      "-f", "bv*[ext=mp4][height<=1080]/bv*[ext=mp4]",
      "-o", output.replace(/\.mp4$/, ".%(ext)s"), source.sourceUrl,
    ], { stdio: "inherit" });
    if (result.status === 0 && existsSync(output) && readableVideo(output)) downloaded += 1;
    else failed.push({ id: source.id, url: source.sourceUrl });
  }
}

const byType = Object.fromEntries([...new Set(sources.map((source) => source.type))].map((type) => [type, sources.filter((source) => source.type === type).length]));
const ready = sources.filter((source) => readableVideo(resolve(source.file))).length;
const assigned = sources.filter((_, index) => index % shardCount === shardIndex).length;
console.log(JSON.stringify({ channelVideos: playlist.entries?.length ?? 0, verticalSources: sources.length, byType, totalMinutes: Math.round(sources.reduce((sum, source) => sum + source.durationSec, 0) / 60), shard: `${shardIndex + 1}/${shardCount}`, assigned, downloaded, skipped, ready, failed }, null, 2));
