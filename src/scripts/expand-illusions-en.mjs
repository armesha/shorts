import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = process.cwd();
const DATA_PATH = resolve(ROOT, "data/illusions-en/videos.json");
const SOURCE_PATH = resolve(ROOT, "data/illusions-en/sources.json");
const ASSET_DIR = resolve(ROOT, "assets/fact-videos/illusions-en");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const count = Math.max(1, Number(process.argv[2] || 100));
const force = process.argv.includes("--force");

const subjects = [
  "rings",
  "grid",
  "spiral",
  "dots",
  "stripes",
  "tunnel",
  "checkerboard",
  "waves",
  "lines",
  "circle",
  "pattern",
  "frame",
  "shadow field",
  "color field",
  "corridor",
  "pinwheel",
  "ladder",
  "tiles",
  "orbit",
  "rays",
];

const effects = [
  "seem to breathe",
  "appear to drift",
  "look tilted",
  "hide a wobble",
  "pull your eyes inward",
  "seem to rotate",
  "change brightness",
  "make the center pulse",
  "bend at the edges",
  "look like they move",
  "create a false depth",
  "make straight lines feel curved",
  "shift when you blink",
  "make the background shimmer",
  "seem to expand",
  "make the center float",
  "create a moving afterimage",
  "turn still shapes into motion",
  "make the colors vibrate",
  "confuse your depth perception",
];

function loadVideos() {
  return JSON.parse(readFileSync(DATA_PATH, "utf8"));
}

function saveVideos(videos) {
  writeFileSync(DATA_PATH, `${JSON.stringify(videos, null, 2)}\n`);
}

function titleFor(index, usedTitles) {
  for (let offset = 0; offset < subjects.length * effects.length; offset++) {
    const subject = subjects[(index + offset) % subjects.length];
    const effect = effects[(index * 7 + offset) % effects.length];
    const title = `Watch the ${subject} ${effect}`;
    if (!usedTitles.has(title)) return title;
  }
  return `Optical illusion variant ${String(index + 1).padStart(3, "0")}`;
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
  for (let i = 1; i <= count; i++) {
    const rel = `illusions-en/expanded-${String(i).padStart(3, "0")}.mp4`;
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
    }
  }

  saveVideos(videos);
  const sourceDoc = {
    deckId: "illusions-en",
    generatedExpansion: {
      count,
      files: added,
      rights: "Original local variants generated from the project's existing optical-illusion pack; no external media added.",
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
