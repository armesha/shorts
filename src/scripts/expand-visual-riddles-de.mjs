import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = process.cwd();
const DATA_PATH = resolve(ROOT, "data/visual-riddles-de/videos.json");
const SOURCE_PATH = resolve(ROOT, "data/visual-riddles-de/sources.json");
const ASSET_DIR = resolve(ROOT, "assets/fact-videos/visual-riddles-de");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const count = Math.max(1, Number(process.argv[2] || 40));
const force = process.argv.includes("--force");

const titles = [
  "Rätselbild: finde das Detail",
  "Optische Frage: was fällt dir auf?",
  "Schneller Blicktest",
  "Kannst du den Unterschied sehen?",
  "Visuelles Rätsel für scharfe Augen",
  "Welche Form passt hier?",
  "Siehst du die versteckte Lösung?",
  "Augentest: genau hinschauen",
  "Mini-Rätsel mit Perspektive",
  "Was stimmt an diesem Bild nicht?",
  "Finde den richtigen Weg",
  "Knacke das Muster",
  "Welche Antwort ist richtig?",
  "Nur wenige sehen es sofort",
  "Trainiere dein Auge",
  "Logik trifft Illusion",
  "Rätsel in Sekunden",
  "Fokus-Test für dein Gehirn",
  "Was verbirgt sich im Bild?",
  "Schaust du genau genug hin?",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function titleFor(index, usedTitles) {
  for (let offset = 0; offset < titles.length; offset += 1) {
    const base = titles[(index + offset) % titles.length];
    const title = `${base} #${String(index + 1).padStart(2, "0")}`;
    if (!usedTitles.has(title)) return title;
  }
  return `Visuelles Rätsel Variante ${String(index + 1).padStart(3, "0")}`;
}

function variantFilter(index) {
  const hue = (index * 17) % 360;
  const contrast = (1.03 + (index % 4) * 0.04).toFixed(2);
  const saturation = (1.0 + (index % 5) * 0.06).toFixed(2);
  const brightness = ((index % 5) * 0.004 - 0.008).toFixed(3);
  const filters = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `hue=h=${hue}:s=${saturation}`,
    `eq=contrast=${contrast}:brightness=${brightness}`,
  ];
  if (index % 3 === 0) filters.push("vignette=PI/6");
  if (index % 4 === 0) filters.push("unsharp=5:5:0.45:3:3:0.15");
  filters.push("format=yuv420p");
  return filters.join(",");
}

async function renderVariant(input, output, index) {
  await exec(
    FFMPEG,
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      input,
      "-t",
      "7",
      "-vf",
      variantFilter(index),
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-movflags",
      "+faststart",
      output,
    ],
    { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
  );
}

async function main() {
  mkdirSync(ASSET_DIR, { recursive: true });
  const videos = readJson(DATA_PATH);
  const sources = readJson(SOURCE_PATH);
  const existingFiles = new Set(videos.map((video) => video.file));
  const usedTitles = new Set(videos.map((video) => video.title).filter(Boolean));
  const sourceByFile = new Map(
    sources.map((source) => [`visual-riddles-de/${source.id}.mp4`, source]),
  );
  const baseFiles = videos
    .map((video) => ({
      rel: video.file,
      abs: resolve(ROOT, "assets/fact-videos", video.file),
      source: sourceByFile.get(video.file),
    }))
    .filter((entry) => existsSync(entry.abs) && !basename(entry.rel).startsWith("vrdx_"));
  if (!baseFiles.length) throw new Error("No base visual-riddle videos found");

  const added = [];
  for (let i = 1; i <= count; i += 1) {
    const id = `vrdx_${String(i).padStart(3, "0")}`;
    const rel = `visual-riddles-de/${id}.mp4`;
    const out = resolve(ROOT, "assets/fact-videos", rel);
    const title = titleFor(i - 1, usedTitles);
    usedTitles.add(title);
    const base = baseFiles[((i - 1) * 13) % baseFiles.length];
    if (force || !existsSync(out)) {
      process.stdout.write(`render ${rel} from ${basename(base.abs)}\n`);
      await renderVariant(base.abs, out, i - 1);
    }
    if (!existingFiles.has(rel)) {
      videos.push({ file: rel, title, text: title });
      sources.push({
        id,
        type: "generated-local-variant",
        title,
        category: base.source?.category || "RÄTSEL",
        question: base.source?.question || "Was fällt dir auf?",
        answer: base.source?.answer || "",
        sourceUrl: base.source?.sourceUrl || "",
        downloadUrl: base.source?.downloadUrl || "",
        license: base.source?.license || "Derived local variant",
        author: base.source?.author || "shorts-factory local transform",
        derivedFrom: base.rel,
        rightsNote: "Lokale ffmpeg-Variante aus einem bereits im Projekt geprüften CC0/Public-Domain-Rätselvideo; keine externen Medien hinzugefügt.",
      });
      existingFiles.add(rel);
      added.push(rel);
    }
  }

  writeJson(DATA_PATH, videos);
  writeJson(SOURCE_PATH, sources);
  process.stdout.write(`done: videos=${videos.length}; sources=${sources.length}; added=${added.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
