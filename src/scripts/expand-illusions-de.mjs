import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = process.cwd();
const DATA_PATH = resolve(ROOT, "data/illusions-de/videos.json");
const SOURCE_PATH = resolve(ROOT, "data/illusions-de/sources.json");
const ASSET_DIR = resolve(ROOT, "assets/fact-videos/illusions-de");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const count = Math.max(1, Number(process.argv[2] || 100));
const force = process.argv.includes("--force");

const subjects = [
  "Ringe",
  "Gitter",
  "Spirale",
  "Punkte",
  "Streifen",
  "Tunnel",
  "Schachbrett",
  "Wellen",
  "Linien",
  "Kreis",
  "Muster",
  "Rahmen",
  "Schattenfeld",
  "Farbfeld",
  "Korridor",
  "Wirbel",
  "Leiter",
  "Kacheln",
  "Orbit",
  "Strahlen",
];

const effects = [
  "scheinbar atmen",
  "den Mittelpunkt pulsieren lassen",
  "sich ausdehnen",
  "zu driften scheinen",
  "sich an den Rändern biegen",
  "die Mitte schweben lassen",
  "schief wirken",
  "sich zu bewegen scheinen",
  "ein Nachbild erzeugen",
  "ein Wackeln verstecken",
  "falsche Tiefe erzeugen",
  "gerade Linien krümmen",
  "beim Blinzeln springen",
  "den Hintergrund flimmern lassen",
  "nach innen ziehen",
  "sich zu drehen scheinen",
  "die Helligkeit verändern",
  "die Tiefe verwirren",
  "Farben vibrieren lassen",
  "stille Formen in Bewegung verwandeln",
];

function loadVideos() {
  return JSON.parse(readFileSync(DATA_PATH, "utf8"));
}

function saveVideos(videos) {
  writeFileSync(DATA_PATH, `${JSON.stringify(videos, null, 2)}\n`);
}

function titleFor(index, usedTitles) {
  for (let offset = 0; offset < subjects.length * effects.length; offset += 1) {
    const subject = subjects[(index + offset) % subjects.length];
    const effect = effects[(index * 7 + offset) % effects.length];
    const title = `Sieh, wie die ${subject} ${effect}`;
    if (!usedTitles.has(title)) return title;
  }
  return `Optische Täuschung Variante ${String(index + 1).padStart(3, "0")}`;
}

function variantFilter(index) {
  const hue = (index * 23) % 360;
  const saturation = (1.0 + (index % 5) * 0.08).toFixed(2);
  const contrast = (1.02 + (index % 4) * 0.05).toFixed(2);
  const brightness = ((index % 5) * 0.006 - 0.012).toFixed(3);
  const filters = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `hue=h=${hue}:s=${saturation}`,
    `eq=contrast=${contrast}:brightness=${brightness}`,
  ];
  if (index % 4 === 0) filters.push("vignette=PI/5");
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
  const videos = loadVideos();
  const existingFiles = new Set(videos.map((v) => v.file));
  const usedTitles = new Set(videos.map((v) => v.title).filter(Boolean));
  const baseFiles = videos
    .map((v) => resolve(ROOT, "assets/fact-videos", v.file))
    .filter((file) => existsSync(file) && !basename(file).startsWith("expanded-"));
  if (!baseFiles.length) throw new Error("No base illusion videos found");

  const added = [];
  for (let i = 1; i <= count; i += 1) {
    const rel = `illusions-de/expanded-${String(i).padStart(3, "0")}.mp4`;
    const out = resolve(ROOT, "assets/fact-videos", rel);
    const title = titleFor(i - 1, usedTitles);
    usedTitles.add(title);
    if (force || !existsSync(out)) {
      const input = baseFiles[((i - 1) * 11) % baseFiles.length];
      process.stdout.write(`render ${rel} from ${basename(input)}\n`);
      await renderVariant(input, out, i - 1);
    }
    if (!existingFiles.has(rel)) {
      videos.push({ file: rel, title, text: title });
      existingFiles.add(rel);
      added.push(rel);
    } else {
      const existing = videos.find((video) => video.file === rel);
      if (existing) {
        existing.title = title;
        existing.text = title;
      }
    }
  }

  saveVideos(videos);
  const sourceDoc = {
    deckId: "illusions-de",
    generatedExpansion: {
      count,
      files: added,
      rights: "Original local variants generated from the project's existing German optical-illusion pack; no external media added.",
      tool: "ffmpeg transform variants",
    },
  };
  writeFileSync(SOURCE_PATH, `${JSON.stringify(sourceDoc, null, 2)}\n`);
  process.stdout.write(`done: videos=${videos.length}; added=${added.length}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
