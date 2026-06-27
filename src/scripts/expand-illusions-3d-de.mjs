import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = process.cwd();
const DATA_PATH = resolve(ROOT, "data/illusions-3d-de/videos.json");
const SOURCE_PATH = resolve(ROOT, "data/illusions-3d-de/sources.json");
const ASSET_DIR = resolve(ROOT, "assets/fact-videos/illusions-3d-de");
const FFMPEG = process.env.FFMPEG || "ffmpeg";

const count = Math.max(1, Number(process.argv[2] || 120));
const force = process.argv.includes("--force");

const actions = [
  "Dreh die Figur mit deiner Gedankenkraft",
  "Ändere die Richtung nur mit deinem Blick",
  "Lass die Form im Kopf umspringen",
  "Fixiere die Mitte und warte auf den Wechsel",
  "Entscheide, wohin sich die Figur dreht",
  "Halte den Blick ruhig und sieh den Flip",
  "Bring die Rotation gedanklich zum Kippen",
  "Sieh, wie dein Gehirn die Tiefe neu baut",
  "Blinke kurz und prüfe die Richtung noch einmal",
  "Fokussiere die Kante und drehe das Bild im Kopf",
];

const objects = [
  "Würfel",
  "Tetraeder",
  "Oktaeder",
  "Ikosaeder",
  "Ring",
  "Rahmen",
  "Gitter",
  "Stern",
  "Knoten",
  "Körper",
];

function loadVideos() {
  return JSON.parse(readFileSync(DATA_PATH, "utf8"));
}

function saveVideos(videos) {
  writeFileSync(DATA_PATH, `${JSON.stringify(videos, null, 2)}\n`);
}

function titleFor(index, usedTitles) {
  for (let offset = 0; offset < actions.length * objects.length; offset += 1) {
    const action = actions[(index + offset) % actions.length];
    const object = objects[(index * 5 + offset) % objects.length];
    const title = `${action}: ${object}`;
    if (!usedTitles.has(title)) return title;
  }
  return `3D-Drehillusion ${String(index + 1).padStart(3, "0")}`;
}

function variantFilter(index) {
  const hue = (index * 19) % 360;
  const saturation = (0.96 + (index % 5) * 0.07).toFixed(2);
  const contrast = (1.02 + (index % 4) * 0.04).toFixed(2);
  const brightness = ((index % 5) * 0.005 - 0.01).toFixed(3);
  const angle = index % 2 === 0 ? "" : ",hflip";
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    `hue=h=${hue}:s=${saturation}`,
    `eq=contrast=${contrast}:brightness=${brightness}`,
    "format=yuv420p",
  ].join(",") + angle;
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
      "30",
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
  const existingFiles = new Set(videos.map((video) => video.file));
  const usedTitles = new Set(videos.map((video) => video.title).filter(Boolean));
  const baseFiles = videos
    .map((video) => resolve(ROOT, "assets/fact-videos", video.file))
    .filter((file) => existsSync(file) && !basename(file).startsWith("expanded-"));
  if (!baseFiles.length) throw new Error("No base 3D illusion videos found");

  const added = [];
  for (let i = 1; i <= count; i += 1) {
    const rel = `illusions-3d-de/expanded-${String(i).padStart(3, "0")}.mp4`;
    const out = resolve(ROOT, "assets/fact-videos", rel);
    const title = titleFor(i - 1, usedTitles);
    usedTitles.add(title);
    if (force || !existsSync(out)) {
      const input = baseFiles[((i - 1) * 13) % baseFiles.length];
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
    deckId: "illusions-3d-de",
    generatedExpansion: {
      count,
      files: added,
      rights: "Lokale Varianten aus bestehenden 3D-Illusionsvideos des Projekts; keine externen Medien hinzugefügt.",
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
