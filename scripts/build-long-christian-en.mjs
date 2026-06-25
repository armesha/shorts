#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../src/render.ts";

const USAGE_SCHEMA = "long-video-usage/v1";
const DECK_ID = process.env.DECK_ID || "long-christian-en";
const TITLE = process.env.LONG_VIDEO_TITLE || "The Faithful Journey";
const SOURCE_DECK_ID = "christian";
const SOURCE_FILE = process.env.SOURCE_FILE || "data/christian/cards.json";
const DATA_DIR = resolve("data", DECK_ID);
const ASSET_DIR = resolve("assets/fact-videos", DECK_ID);
const OUTPUT_DIR = resolve("data/output", DECK_ID);
const BG_DIR = resolve("assets/backgrounds/christian_protestant_templates");
const AUDIO_FILE = process.env.AUDIO_FILE || "assets/audio/christian/pad-long-sanctuary-11m.mp3";

const VIDEO_WIDTH = Number(process.env.VIDEO_WIDTH || 1920);
const VIDEO_HEIGHT = Number(process.env.VIDEO_HEIGHT || 1080);
const FPS = Number(process.env.FPS || 30);
const FADE_SEC = Number(process.env.FADE_SEC || 0.8);
const TARGET_SEQUENCE = (process.env.TARGET_SEC_SEQUENCE || "430,455,480,505,530,555,580,605,630,650")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x > 0);
const MIN_SCENE_SEC = Number(process.env.MIN_SCENE_SEC || 24);
const MAX_SCENE_SEC = Number(process.env.MAX_SCENE_SEC || 44);
const CHARS_PER_SEC = Number(process.env.CHARS_PER_SEC || 15);
const EXTRA_READ_SEC = Number(process.env.EXTRA_READ_SEC || 8);
const AUDIO_VOLUME = Number(process.env.AUDIO_VOLUME || 0.2);
const EPISODE_START = Math.max(1, Number(process.env.EPISODE_START || 1));
const EPISODE_COUNT = Math.max(1, Number(process.env.EPISODE_COUNT || 10));
const KEEP_WORK = process.env.KEEP_WORK === "1";
const FFMPEG = process.env.FFMPEG || (existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE || (existsSync("/usr/bin/ffprobe") ? "/usr/bin/ffprobe" : "ffprobe");

const BG_FILES = [
  "protestant_ai_open_bible_glow.jpg",
  "protestant_ai_empty_pews_warm.jpg",
  "protestant_ai_stained_glow.jpg",
  "protestant_ai_forest_path.jpg",
  "protestant_ai_lake_chapel.jpg",
  "protestant_ai_hill_sunrise.jpg",
  "protestant_ai_walnut_cross.jpg",
  "protestant_bible_corner.jpg",
  "protestant_photo_pulpit_bible.jpg",
  "protestant_photo_rainy_bible.jpg",
  "protestant_wooden_cross.jpg",
  "protestant_worship_hall.jpg",
];

const TITLES = [
  "Peaceful KJV Bible Reading for a Quiet Morning",
  "Scripture for Faith, Strength, and Rest",
  "KJV Bible Verses for Prayer and Reflection",
  "A Calm Walk Through Scripture",
  "Bible Passages for Hope, Grace, and Peace",
  "Evening Scripture Reading from the KJV",
  "Words of Faith for a Steady Heart",
  "KJV Scripture Collection for Quiet Time",
  "Bible Verses for Trusting God",
  "A Peaceful Scripture Journey",
];

const DESCRIPTIONS = [
  "A calm long-form KJV scripture reading with clear text, soft transitions, and a quiet original pad for prayer and reflection.",
  "Settle into a peaceful collection of Bible passages from the King James Version, arranged for slow reading, prayer, and quiet time.",
  "A gentle scripture video for reflection: KJV passages, steady pacing, soft fades, and a calm background sound that stays out of the way.",
  "Read through selected Bible verses in a quiet long-form format, made for devotion, rest, and a steady moment of faith.",
  "A peaceful KJV scripture collection with readable cards and soft transitions for prayer, reflection, and evening quiet time.",
];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function charCount(text) {
  return cleanText(text).replace(/\s+/g, " ").trim().length;
}

function durationFor(chars) {
  return clamp(MIN_SCENE_SEC, MAX_SCENE_SEC, Math.ceil(chars / CHARS_PER_SEC + EXTRA_READ_SEC));
}

function targetSecForEpisode(episode) {
  return TARGET_SEQUENCE[(Math.max(1, Number(episode) || 1) - 1) % TARGET_SEQUENCE.length] || 510;
}

function viewerTitle(episode) {
  return TITLES[(Math.max(1, Number(episode) || 1) - 1) % TITLES.length] || `${TITLE} | Episode ${episode}`;
}

function viewerDescription(episode) {
  return DESCRIPTIONS[(Math.max(1, Number(episode) || 1) - 1) % DESCRIPTIONS.length];
}

function loadSourceItems() {
  const cards = readJson(SOURCE_FILE);
  if (!Array.isArray(cards)) throw new Error(`Expected array in ${SOURCE_FILE}`);
  return cards
    .map((card, index) => ({
      id: index + 1,
      type: cleanText(card.type || "verse"),
      text: cleanText(card.text),
      ref: cleanText(card.ref),
      theme: cleanText(card.theme),
      book: cleanText(card.book),
      testament: cleanText(card.testament),
    }))
    .filter((card) => card.text && card.ref);
}

function selectScenes(items, episode, seen, targetSec) {
  const picked = [];
  let total = 0;
  for (const item of items) {
    const id = String(item.id);
    if (seen.has(id)) continue;
    const chars = charCount(item.text);
    const durationSec = durationFor(chars);
    picked.push({ ...item, chars, durationSec });
    seen.add(id);
    total += durationSec;
    if (total >= targetSec * 0.98) break;
  }
  return picked.map((item, index) => ({
    order: index + 1,
    sourceDeck: SOURCE_DECK_ID,
    sourceId: item.id,
    type: item.type,
    title: item.ref,
    text: item.text,
    ref: item.ref,
    theme: item.theme,
    book: item.book,
    testament: item.testament,
    chars: item.chars,
    durationSec: item.durationSec,
    readModel: {
      charsPerSec: CHARS_PER_SEC,
      extraSec: EXTRA_READ_SEC,
      minSec: MIN_SCENE_SEC,
      maxSec: MAX_SCENE_SEC,
    },
  }));
}

function videoIdFor(episode) {
  return `${DECK_ID}-${String(episode).padStart(3, "0")}`;
}

function finalRelFor(videoId) {
  return `${DECK_ID}/${videoId}.mp4`;
}

function finalVideoFor(videoId) {
  return resolve(ASSET_DIR, `${videoId}.mp4`);
}

function workDirFor(videoId) {
  return resolve(OUTPUT_DIR, `work-${videoId}`);
}

function contactSheetFor(videoId) {
  return resolve(OUTPUT_DIR, `contact-${videoId}.jpg`);
}

function contactSheetRelFor(videoId) {
  return `data/output/${DECK_ID}/contact-${videoId}.jpg`;
}

function usagePath() {
  return resolve(DATA_DIR, "usage.json");
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

function ffprobeDuration(path) {
  try {
    const out = execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], {
      encoding: "utf8",
    }).trim();
    return Number(out);
  } catch {
    return null;
  }
}

function ensureAudioBed() {
  if (existsSync(AUDIO_FILE) && (ffprobeDuration(AUDIO_FILE) || 0) >= 700) return;
  mkdirSync(dirname(resolve(AUDIO_FILE)), { recursive: true });
  run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-filter_complex",
    "sine=frequency=196:duration=720:sample_rate=44100[a1];" +
      "sine=frequency=246.94:duration=720:sample_rate=44100[a2];" +
      "sine=frequency=293.66:duration=720:sample_rate=44100[a3];" +
      "sine=frequency=392:duration=720:sample_rate=44100[a4];" +
      "anoisesrc=color=pink:amplitude=0.015:duration=720[n];" +
      "[a1][a2][a3][a4][n]amix=inputs=5:weights=0.18 0.13 0.10 0.08 0.04:normalize=0," +
      "lowpass=f=2600,aecho=0.45:0.5:1800|2600:0.18|0.11,tremolo=f=0.12:d=0.12,loudnorm=I=-29:TP=-4[a]",
    "-map",
    "[a]",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-b:a",
    "128k",
    AUDIO_FILE,
  ]);
}

function concatListLine(path) {
  return `file '${resolve(path).replace(/'/g, "'\\''")}'`;
}

function bgDataUrl(name) {
  const file = existsSync(resolve(BG_DIR, name)) ? name : BG_FILES.find((f) => existsSync(resolve(BG_DIR, f)));
  if (!file) return "";
  const buf = readFileSync(resolve(BG_DIR, file));
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function typeLabel(scene) {
  if (scene.book) return scene.book;
  return scene.type === "verse" ? "KJV Scripture" : "Bible";
}

function landscapeHtml(scene, totalScenes, episode) {
  const bg = bgDataUrl(BG_FILES[(episode + scene.order - 2) % BG_FILES.length]);
  const verse = escHtml(scene.text);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${VIDEO_WIDTH}px; height: ${VIDEO_HEIGHT}px; overflow: hidden; background: #100d09; }
    body {
      font-family: "Liberation Serif", "Georgia", serif;
      color: #f8edd8;
      background: ${bg ? `url("${bg}") center/cover no-repeat` : "#17110a"};
    }
    body::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(11,8,5,0.82), rgba(25,18,10,0.34) 48%, rgba(11,8,5,0.78)),
        radial-gradient(ellipse at 48% 42%, rgba(242,198,121,0.12), rgba(0,0,0,0.62) 70%);
    }
    .shell {
      position: absolute;
      inset: 58px 82px;
      display: grid;
      grid-template-columns: 1fr 292px;
      gap: 34px;
    }
    .panel {
      min-width: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 26px;
      padding: 50px 68px 44px;
      border: 2px solid rgba(238,199,128,0.36);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(20,14,8,0.76), rgba(28,20,12,0.58)),
        radial-gradient(ellipse at center, rgba(238,199,128,0.12), rgba(0,0,0,0));
      box-shadow: 0 30px 90px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.1);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 26px;
      color: #eec780;
      font-family: "Liberation Sans", "Arial", sans-serif;
      font-size: 25px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: 0;
    }
    .badge {
      max-width: 70%;
      padding: 8px 15px 7px;
      border-radius: 4px;
      background: rgba(238,199,128,0.16);
      border: 1px solid rgba(238,199,128,0.35);
      color: #fff2d9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .verseBox {
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 14px 14px 10px;
      text-align: center;
    }
    .verse {
      width: 100%;
      color: #fff3dc;
      font-size: 50px;
      line-height: 1.36;
      font-weight: 600;
      text-shadow: 0 2px 18px rgba(0,0,0,0.82), 0 0 4px rgba(0,0,0,0.84);
      overflow-wrap: break-word;
    }
    .ref {
      text-align: center;
      border-top: 1px solid rgba(238,199,128,0.42);
      padding-top: 20px;
      color: #eec780;
      font-family: "Liberation Sans", "Arial", sans-serif;
      font-size: 31px;
      line-height: 1.25;
      font-weight: 900;
      text-shadow: 0 2px 12px rgba(0,0,0,0.9);
    }
    .side {
      padding: 42px 28px;
      border-radius: 8px;
      border: 1px solid rgba(238,199,128,0.32);
      background: rgba(18, 12, 7, 0.72);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .brand {
      color: #fff3dc;
      font-family: "Liberation Sans", "Arial", sans-serif;
      font-size: 30px;
      line-height: 1.25;
      font-weight: 900;
    }
    .mark {
      margin-top: 30px;
      width: 74px;
      height: 74px;
      border: 2px solid rgba(238,199,128,0.62);
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: #eec780;
      font-size: 42px;
      line-height: 1;
    }
    .count {
      color: #eec780;
      font-family: "Liberation Sans", "Arial", sans-serif;
      font-size: 68px;
      line-height: 1;
      font-weight: 900;
    }
    .count small {
      display: block;
      margin-top: 12px;
      color: rgba(255,243,220,0.72);
      font-size: 23px;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="top">
        <span class="badge">${escHtml(typeLabel(scene))}</span>
        <span>Episode ${episode}</span>
      </div>
      <section id="verseBox" class="verseBox"><div id="verse" class="verse">${verse}</div></section>
      <footer id="ref" class="ref">${escHtml(scene.ref)}</footer>
    </section>
    <aside class="side">
      <div>
        <div class="brand">${escHtml(TITLE)}</div>
        <div class="mark">✝</div>
      </div>
      <div class="count">${scene.order}<small>of ${totalScenes}</small></div>
    </aside>
  </main>
  <script>
    const box = document.getElementById("verseBox");
    const verse = document.getElementById("verse");
    let size = 50;
    while (size > 28 && (verse.scrollHeight > box.clientHeight || verse.scrollWidth > box.clientWidth)) {
      size -= 2;
      verse.style.fontSize = size + "px";
    }
    const ref = document.getElementById("ref");
    let refSize = 31;
    while (refSize > 22 && ref.scrollHeight > 84) {
      refSize -= 1;
      ref.style.fontSize = refSize + "px";
    }
    window.__fitted = true;
  </script>
</body>
</html>`;
}

async function renderScene(browser, scene, pngPath, totalScenes, episode) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(landscapeHtml(scene, totalScenes, episode), { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    await mkdir(dirname(pngPath), { recursive: true });
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: VIDEO_WIDTH, height: VIDEO_HEIGHT } });
    await writeFile(pngPath, buf);
  } finally {
    await page.close();
  }
}

function buildClip(scene, pngPath, clipPath) {
  const fadeStart = Math.max(0, scene.durationSec - FADE_SEC);
  const vf = [
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#100d09`,
    `trim=duration=${scene.durationSec}`,
    `fps=${FPS}`,
    `fade=t=in:st=0:d=${FADE_SEC}`,
    `fade=t=out:st=${fadeStart}:d=${FADE_SEC}`,
    "setsar=1",
    "format=yuv420p",
  ].join(",");
  run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-framerate",
    String(FPS),
    "-t",
    String(scene.durationSec),
    "-i",
    pngPath,
    "-vf",
    vf,
    "-r",
    String(FPS),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    clipPath,
  ]);
}

function buildContactSheet(workDir, contactSheet, sceneCount) {
  const cols = 5;
  const rows = Math.ceil(sceneCount / cols);
  run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-framerate",
    "1",
    "-i",
    resolve(workDir, "scene-%03d.png"),
    "-vf",
    `scale=320:180,tile=${cols}x${rows}:margin=6:padding=4:color=black`,
    "-frames:v",
    "1",
    contactSheet,
  ]);
}

function addAudio(silentVideo, finalVideo, totalSec) {
  ensureAudioBed();
  const audioDuration = ffprobeDuration(AUDIO_FILE);
  if (!audioDuration || audioDuration < totalSec - 0.5) {
    throw new Error(`Christian audio bed must cover the whole video: audio=${audioDuration ?? "unknown"}s video=${totalSec}s`);
  }
  const fadeStart = Math.max(0, totalSec - 4);
  run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    silentVideo,
    "-i",
    AUDIO_FILE,
    "-filter_complex",
    `[1:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS,volume=${AUDIO_VOLUME},afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart}:d=4[a]`,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    finalVideo,
  ]);
}

async function buildEpisode({ episode, videoId, targetSec, scenes, plannedDurationSec }) {
  const workDir = workDirFor(videoId);
  const finalVideo = finalVideoFor(videoId);
  const finalRel = finalRelFor(videoId);
  const contactSheet = contactSheetFor(videoId);

  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await mkdir(ASSET_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const clips = [];
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    for (const scene of scenes) {
      const num = String(scene.order).padStart(3, "0");
      const png = resolve(workDir, `scene-${num}.png`);
      const clip = resolve(workDir, `clip-${num}.mp4`);
      console.log(`${videoId} scene ${num}/${String(scenes.length).padStart(3, "0")}: ${scene.ref} (${scene.chars} chars, ${scene.durationSec}s)`);
      await renderScene(browser, scene, png, scenes.length, episode);
      buildClip(scene, png, clip);
      clips.push(clip);
    }
  } finally {
    await browser.close();
  }

  const listFile = resolve(workDir, "clips.txt");
  const silentVideo = resolve(workDir, `${videoId}-silent.mp4`);
  await writeFile(listFile, clips.map(concatListLine).join("\n") + "\n", "utf8");
  run(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", silentVideo]);
  addAudio(silentVideo, finalVideo, plannedDurationSec);
  buildContactSheet(workDir, contactSheet, scenes.length);

  const actualDurationSec = ffprobeDuration(finalVideo);
  const builtAt = new Date().toISOString();
  await writeJson(resolve(DATA_DIR, `scenes-${String(episode).padStart(3, "0")}.json`), scenes);
  if (episode === 1) await writeJson(resolve(DATA_DIR, "scenes.json"), scenes);
  if (!KEEP_WORK) await rm(workDir, { recursive: true, force: true });

  return {
    file: finalRel,
    title: viewerTitle(episode),
    text: viewerDescription(episode),
    lang: "en",
    mode: "longVideoCompilation",
    format: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    staticImage: true,
    transitionSec: FADE_SEC,
    durationSec: actualDurationSec ? Number(actualDurationSec.toFixed(2)) : plannedDurationSec,
    targetDurationSec: targetSec,
    plannedDurationSec,
    sceneCount: scenes.length,
    music: basename(AUDIO_FILE),
    audioMode: "synthSacredPad",
    source: SOURCE_FILE,
    builtAt,
  };
}

function buildEpisodePlan(items) {
  const endEpisode = EPISODE_START + EPISODE_COUNT - 1;
  const seen = new Set();
  const episodes = [];
  for (let episode = 1; episode <= endEpisode; episode++) {
    const targetSec = targetSecForEpisode(episode);
    const scenes = selectScenes(items, episode, seen, targetSec);
    const plannedDurationSec = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
    episodes.push({ episode, videoId: videoIdFor(episode), targetSec, scenes, plannedDurationSec });
  }
  return episodes.filter((episode) => episode.episode >= EPISODE_START);
}

function episodeFromVideo(video) {
  const match = String(video.file || "").match(/-(\d{3})\.mp4$/);
  if (!match) throw new Error(`Cannot infer long-video episode from file: ${video.file}`);
  return Number(match[1]);
}

function scenesPathForEpisode(episode) {
  const suffixPath = resolve(DATA_DIR, `scenes-${String(episode).padStart(3, "0")}.json`);
  if (existsSync(suffixPath)) return suffixPath;
  if (episode === 1) {
    const legacyPath = resolve(DATA_DIR, "scenes.json");
    if (existsSync(legacyPath)) return legacyPath;
  }
  throw new Error(`Missing scenes file for long-video episode ${episode}`);
}

function sourceIdKey(value) {
  return String(value);
}

function readScenesForVideo(video) {
  return readJson(scenesPathForEpisode(episodeFromVideo(video)));
}

function buildUsageLedger(videos) {
  const used = new Map();
  const duplicateUses = [];
  const videoEntries = videos.map((video) => {
    const scenes = readScenesForVideo(video);
    const sceneEntries = scenes.map((scene) => {
      const sourceId = Number(scene.sourceId);
      const key = sourceIdKey(sourceId);
      const usageRef = {
        sourceDeck: scene.sourceDeck || SOURCE_DECK_ID,
        sourceId,
        videoFile: video.file,
        videoTitle: video.title,
        order: Number(scene.order),
      };
      if (used.has(key)) duplicateUses.push({ sourceId, first: used.get(key), duplicate: usageRef });
      else used.set(key, usageRef);
      return {
        order: Number(scene.order),
        sourceDeck: scene.sourceDeck || SOURCE_DECK_ID,
        sourceId,
        title: scene.title,
        chars: Number(scene.chars),
        durationSec: Number(scene.durationSec),
      };
    });
    return {
      file: video.file,
      title: video.title,
      durationSec: Number(video.durationSec ?? video.plannedDurationSec ?? 0),
      sceneCount: sceneEntries.length,
      sourceIds: sceneEntries.map((scene) => scene.sourceId),
      scenes: sceneEntries,
    };
  });
  if (duplicateUses.length > 0) {
    throw new Error(`Duplicate source cards in long videos: ${JSON.stringify(duplicateUses.slice(0, 10), null, 2)}`);
  }
  const usedSourceIds = Array.from(used.values())
    .map((ref) => ref.sourceId)
    .sort((a, b) => a - b);
  return {
    schemaVersion: USAGE_SCHEMA,
    deck: DECK_ID,
    sourceDeck: SOURCE_DECK_ID,
    sourceFile: SOURCE_FILE,
    generatedAt: new Date().toISOString(),
    totalVideos: videoEntries.length,
    totalScenes: usedSourceIds.length,
    usedSourceIds,
    selectionRule: "Every future long-video episode must exclude sourceIds already listed here unless that exact video is being intentionally rebuilt.",
    videos: videoEntries,
  };
}

function readExistingUsageRefs(excludeFiles = new Set()) {
  const videosPath = resolve(DATA_DIR, "videos.json");
  if (!existsSync(videosPath)) return new Map();
  const videos = readJson(videosPath).filter((video) => !excludeFiles.has(video.file));
  const refs = new Map();
  for (const video of videos) {
    const scenes = readScenesForVideo(video);
    for (const scene of scenes) {
      refs.set(sourceIdKey(scene.sourceId), {
        sourceDeck: scene.sourceDeck || SOURCE_DECK_ID,
        sourceId: Number(scene.sourceId),
        videoFile: video.file,
        videoTitle: video.title,
        order: Number(scene.order),
      });
    }
  }
  return refs;
}

function assertNoPreviouslyUsedScenes(episodes) {
  const rebuiltFiles = new Set(episodes.map((episode) => finalRelFor(episode.videoId)));
  const existingRefs = readExistingUsageRefs(rebuiltFiles);
  const conflicts = [];
  for (const episode of episodes) {
    for (const scene of episode.scenes) {
      const ref = existingRefs.get(sourceIdKey(scene.sourceId));
      if (ref) {
        conflicts.push({
          sourceId: scene.sourceId,
          title: scene.title,
          plannedVideo: finalRelFor(episode.videoId),
          alreadyUsedIn: ref.videoFile,
          alreadyUsedOrder: ref.order,
        });
      }
    }
  }
  if (conflicts.length > 0) {
    throw new Error(`Planned long-video scenes reuse already published cards: ${JSON.stringify(conflicts.slice(0, 10), null, 2)}`);
  }
}

async function writeUsageLedger(videos) {
  await writeJson(usagePath(), buildUsageLedger(videos));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const writeUsageOnly = process.argv.includes("--write-usage");
  ensureAudioBed();
  if (writeUsageOnly) {
    const videosPath = resolve(DATA_DIR, "videos.json");
    const videos = existsSync(videosPath) ? readJson(videosPath) : [];
    await writeUsageLedger(videos);
    console.log(JSON.stringify({ ok: true, usage: `data/${DECK_ID}/usage.json`, videos: videos.length }, null, 2));
    return;
  }

  const items = loadSourceItems();
  const episodes = buildEpisodePlan(items);
  console.log(
    JSON.stringify(
      {
        deck: DECK_ID,
        episodeStart: EPISODE_START,
        episodeCount: EPISODE_COUNT,
        episodes: episodes.map((ep) => ({
          episode: ep.episode,
          title: viewerTitle(ep.episode),
          targetDurationSec: ep.targetSec,
          scenes: ep.scenes.length,
          plannedDurationSec: ep.plannedDurationSec,
          plannedDurationMin: Number((ep.plannedDurationSec / 60).toFixed(2)),
        })),
        audio: AUDIO_FILE,
        audioDurationSec: ffprobeDuration(AUDIO_FILE),
        video: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
        staticScenes: true,
        fadeSec: FADE_SEC,
        sourceKind: "christianKjvDeck",
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    for (const ep of episodes) {
      console.log(`\n${ep.videoId} (${Math.round(ep.plannedDurationSec)}s)`);
      for (const scene of ep.scenes) {
        console.log(`${String(scene.order).padStart(2, "0")}. ${scene.ref} | ${scene.chars} chars | ${scene.durationSec}s`);
      }
    }
    return;
  }

  assertNoPreviouslyUsedScenes(episodes);
  const builtVideos = [];
  for (const episode of episodes) {
    builtVideos.push(await buildEpisode(episode));
  }

  const videosPath = resolve(DATA_DIR, "videos.json");
  const existingVideos = existsSync(videosPath) ? readJson(videosPath) : [];
  const builtFiles = new Set(builtVideos.map((video) => video.file));
  const mergedVideos = [
    ...existingVideos
      .filter((video) => !builtFiles.has(video.file))
      .map((video) => {
        const episode = episodeFromVideo(video);
        return { ...video, title: viewerTitle(episode), text: viewerDescription(episode) };
      }),
    ...builtVideos,
  ].sort((a, b) => String(a.file).localeCompare(String(b.file)));
  await writeJson(videosPath, mergedVideos);
  await writeJson(resolve(DATA_DIR, "index.json"), {
    total: mergedVideos.length,
    packs: 1,
    packSize: 1,
    range: [
      Math.min(...mergedVideos.map((video) => Math.round(video.durationSec ?? video.plannedDurationSec ?? 0))),
      Math.max(...mergedVideos.map((video) => Math.round(video.durationSec ?? video.plannedDurationSec ?? 0))),
    ],
  });
  await writeJson(resolve(DATA_DIR, "sources.json"), {
    deck: DECK_ID,
    mode: "longVideoCompilation",
    sourceDeck: SOURCE_DECK_ID,
    sourceFile: SOURCE_FILE,
    sourceSelection: "Deterministic top slice from the exact KJV Christian deck, without rewriting Bible text.",
    audio: {
      file: AUDIO_FILE,
      mode: "single continuous locally synthesized quiet sacred pad for the whole long video; no per-scene restarts",
      licenseNote: "Generated locally by ffmpeg sine/noise filters for this pack; no external copyrighted source.",
    },
    output: {
      videos: mergedVideos.map((video) => video.file),
      contactSheets: episodes.map((ep) => contactSheetRelFor(ep.videoId)),
      builtAt: new Date().toISOString(),
      format: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    },
    timing: {
      episodeTargets: mergedVideos.map((video) => ({
        file: video.file,
        targetSec: targetSecForEpisode(episodeFromVideo(video)),
      })),
      formula: `clamp(${MIN_SCENE_SEC}, ${MAX_SCENE_SEC}, ceil(chars / ${CHARS_PER_SEC} + ${EXTRA_READ_SEC}))`,
      fadeSec: FADE_SEC,
      fps: FPS,
    },
    rules: {
      staticImage: true,
      oneAudioBedForWholeVideo: true,
      smoothTransitions: true,
      youtubeMetadataReady: true,
      naturalDescriptions: true,
      variedTitles: true,
      trackUsedSourceIds: true,
    },
  });
  await writeUsageLedger(mergedVideos);
  console.log(JSON.stringify({ ok: true, videos: mergedVideos.length, out: `data/${DECK_ID}/videos.json` }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
