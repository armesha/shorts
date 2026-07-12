import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const cwd = process.cwd();
const input = resolve(cwd, process.argv[2] || "tmp/vitek-death-reaction/vitek-death-reaction-fumiriya.mp4");
const packId = "voiced-memes-ru";
const item = {
  id: "vmru_001_every_ten_seconds",
  title: "Каждые 10 секунд",
  theme: "мемы",
  voice: "Витёк · Gacrux · Фумирия",
};

if (!existsSync(input)) throw new Error(`Готовый MP4 не найден: ${input}`);

const runtimeVideo = resolve(cwd, `assets/fact-videos/${packId}/${item.id}.mp4`);
const demoVideo = resolve(cwd, `data/output/admin-demos/${item.id}.mp4`);
const demoPoster = resolve(cwd, `data/output/admin-demos/${item.id}.jpg`);
for (const file of [runtimeVideo, demoVideo, demoPoster]) mkdirSync(dirname(file), { recursive: true });
copyFileSync(input, runtimeVideo);
copyFileSync(input, demoVideo);

const poster = spawnSync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", input, "-frames:v", "1", demoPoster], { stdio: "inherit" });
if (poster.status !== 0) throw new Error(`Не удалось создать постер (${poster.status ?? "signal"})`);

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", input], { encoding: "utf8" });
if (probe.status !== 0) throw new Error(`ffprobe завершился с кодом ${probe.status ?? "signal"}`);
const durationSec = Number(probe.stdout.trim());
if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error("Не удалось определить длительность MP4");
const dur = `${Math.floor(durationSec / 60)}:${String(Math.round(durationSec % 60)).padStart(2, "0")}`;

const manifestPath = resolve(cwd, "data/output/admin-demos/manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { packs: [] };
manifest.packs = Array.isArray(manifest.packs) ? manifest.packs : [];
const now = new Date().toISOString();
let pack = manifest.packs.find((entry) => entry.id === packId);
if (!pack) {
  pack = { id: packId, title: "Озвучка мемов", lang: "ru", items: [] };
  manifest.packs.push(pack);
}
pack.title = "Озвучка мемов";
pack.lang = "ru";
pack.items = Array.isArray(pack.items) ? pack.items : [];
const previous = pack.items.find((entry) => entry.id === item.id);
const manifestItem = {
  ...item,
  dur,
  createdAt: previous?.createdAt || now,
  updatedAt: now,
};
pack.items = [...pack.items.filter((entry) => entry.id !== item.id), manifestItem];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(JSON.stringify({ packId, item: manifestItem, runtimeVideo, demoVideo, demoPoster }, null, 2));
