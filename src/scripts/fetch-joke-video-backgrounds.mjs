import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "assets/fact-videos/joke-backgrounds");
const TMP_DIR = resolve(ROOT, "temp/joke-video-backgrounds");
const LEDGER = resolve(ROOT, "data/joke-video-backgrounds/sources.json");
const FFMPEG = ffmpegPath || "ffmpeg";

const SEARCHES = [
  { slug: "stage-lights", query: "abstract colorful light beams no people" },
  { slug: "confetti-dark", query: "confetti dark background no people" },
  { slug: "neon-bokeh", query: "neon bokeh lights abstract no people" },
  { slug: "theater-empty", query: "empty theater stage lights" },
  { slug: "color-bokeh", query: "colorful bokeh lights no people" },
  { slug: "soft-shadows", query: "abstract moving shadows wall no people no text" },
];

const REJECTED_PEXELS_IDS = new Set([
  15811516, // silhouettes/crowd visible
  3826635, // readable wall text
]);

function loadPexelsKey() {
  if (!process.env.PEXELS_API_KEY) {
    try {
      process.loadEnvFile(resolve(ROOT, ".env"));
    } catch {
      /* already set or intentionally absent */
    }
  }
  const key = process.env.PEXELS_API_KEY || "";
  if (!key) throw new Error("PEXELS_API_KEY missing");
  return key;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed`);
}

function pickVideoFile(video) {
  const files = (video.video_files || [])
    .filter((f) => String(f.file_type || "").includes("mp4") && f.link)
    .map((f) => ({
      ...f,
      portraitScore: (Number(f.height) || 0) >= (Number(f.width) || 0) ? 2 : 0,
      qualityScore: String(f.quality || "").toLowerCase() === "hd" ? 1 : 0,
    }))
    .sort((a, b) => {
      const as = a.portraitScore * 10 + a.qualityScore * 3 + Math.min(Number(a.height) || 0, 1920) / 1000;
      const bs = b.portraitScore * 10 + b.qualityScore * 3 + Math.min(Number(b.height) || 0, 1920) / 1000;
      return bs - as;
    });
  return files[0] || null;
}

async function pexelsSearchVideo(key, query) {
  const url =
    "https://api.pexels.com/videos/search?" +
    new URLSearchParams({
      query,
      orientation: "portrait",
      per_page: "8",
      size: "medium",
    });
  const r = await fetch(url, { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`Pexels video HTTP ${r.status} for "${query}"`);
  const json = await r.json();
  return Array.isArray(json.videos) ? json.videos : [];
}

async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download HTTP ${r.status}`);
  const ab = await r.arrayBuffer();
  writeFileSync(dest, Buffer.from(ab));
}

async function main() {
  const key = loadPexelsKey();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(resolve(ROOT, "data/joke-video-backgrounds"), { recursive: true });

  const ledger = {
    createdAt: new Date().toISOString(),
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    note: "Local short vertical motion backgrounds for joke/anecdote overlays. Avoid recognizable people/logos in manual review.",
    files: [],
  };

  for (const search of SEARCHES) {
    const videos = await pexelsSearchVideo(key, search.query);
    let picked = null;
    let file = null;
    for (const video of videos) {
      if (REJECTED_PEXELS_IDS.has(Number(video.id))) continue;
      const candidate = pickVideoFile(video);
      if (!candidate) continue;
      picked = video;
      file = candidate;
      break;
    }
    if (!picked || !file) {
      console.warn(`No Pexels video for ${search.slug}`);
      continue;
    }

    const dest = resolve(OUT_DIR, `${search.slug}-${picked.id}.mp4`);
    const raw = resolve(TMP_DIR, `${search.slug}-${picked.id}-raw.mp4`);
    if (!existsSync(dest)) {
      console.log(`download ${search.slug} pexels:${picked.id}`);
      await download(file.link, raw);
      run(FFMPEG, [
        "-y",
        "-i",
        raw,
        "-t",
        "8",
        "-an",
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "29",
        "-pix_fmt",
        "yuv420p",
        dest,
      ]);
      rmSync(raw, { force: true });
    }
    ledger.files.push({
      file: dest.replace(`${ROOT}/`, ""),
      query: search.query,
      pexelsId: picked.id,
      pageUrl: picked.url || "",
      photographer: picked.user?.name || "",
      photographerUrl: picked.user?.url || "",
      license: "Pexels License",
      licenseUrl: "https://www.pexels.com/license/",
    });
  }

  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`wrote ${LEDGER.replace(`${ROOT}/`, "")}; files=${ledger.files.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
