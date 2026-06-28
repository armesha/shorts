import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = process.cwd();
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const firstArg = String(process.argv[2] || "");
const lang = firstArg === "en" || firstArg === "de" ? firstArg : "de";
const countArg = firstArg === "en" || firstArg === "de" ? process.argv[3] : process.argv[2];
const deckId = `visual-riddles-${lang}`;
const DATA_PATH = resolve(ROOT, `data/${deckId}/videos.json`);
const SOURCE_PATH = resolve(ROOT, `data/${deckId}/sources.json`);
const ASSET_DIR = resolve(ROOT, `assets/fact-videos/${deckId}`);

const count = Math.max(1, Number(countArg || 40));
const force = process.argv.includes("--force");

const titleByLang = {
  de: [
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
  ],
  en: [
    "Quick visual riddle",
    "Spot the hidden detail",
    "Fast attention test",
    "Can you see the difference?",
    "Visual puzzle for sharp eyes",
    "Which shape fits here?",
    "Find the hidden answer",
    "Eye test: look closely",
    "Mini perspective puzzle",
    "What is wrong in this picture?",
    "Find the right path",
    "Crack the pattern",
    "Which answer is correct?",
    "Few people see it instantly",
    "Train your eyes",
    "Logic meets illusion",
    "Riddle in seconds",
    "Focus test for your brain",
    "What is hiding in the image?",
    "Are you looking closely enough?",
  ],
};
const titles = titleByLang[lang];
const variantPrefix = lang === "de" ? "vrdx" : "vrex";

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
    sources.map((source) => [`${deckId}/${source.id}.mp4`, source]),
  );
  const baseFiles = videos
    .map((video) => ({
      rel: video.file,
      abs: resolve(ROOT, "assets/fact-videos", video.file),
      source: sourceByFile.get(video.file),
    }))
    .filter((entry) => existsSync(entry.abs) && entry.source?.type !== "generated-local-variant" && !basename(entry.rel).startsWith(`${variantPrefix}_`));
  if (!baseFiles.length) throw new Error("No base visual-riddle videos found");

  let nextIndex = 1;
  for (const rel of existingFiles) {
    const match = basename(rel).match(new RegExp(`^${variantPrefix}_(\\d+)\\.mp4$`));
    if (match) nextIndex = Math.max(nextIndex, Number(match[1]) + 1);
  }

  const added = [];
  for (let i = 1; i <= count; i += 1) {
    const index = nextIndex + i - 1;
    const id = `${variantPrefix}_${String(index).padStart(3, "0")}`;
    const rel = `${deckId}/${id}.mp4`;
    const out = resolve(ROOT, "assets/fact-videos", rel);
    const title = titleFor(index - 1, usedTitles);
    usedTitles.add(title);
    const base = baseFiles[((index - 1) * 13) % baseFiles.length];
    if (force || !existsSync(out)) {
      process.stdout.write(`render ${rel} from ${basename(base.abs)}\n`);
      await renderVariant(base.abs, out, index - 1);
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
        rightsNote:
          lang === "de"
            ? "Lokale ffmpeg-Variante aus einem bereits im Projekt geprüften CC0/Public-Domain-Rätselvideo; keine externen Medien hinzugefügt."
            : "Local ffmpeg variant derived from an already project-reviewed CC0/Public-Domain visual-riddle video; no external media added.",
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
