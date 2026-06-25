#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../src/render.ts";

const USAGE_SCHEMA = "long-video-usage/v1";
const DECK_ID = process.env.DECK_ID || "long-islamic-ar";
const TITLE = process.env.LONG_VIDEO_TITLE || "القرآن والحديث والدعاء";
const SOURCE_DECK_ID = "islamic";
const SOURCE_FILE = process.env.SOURCE_FILE || "data/islamic/cards.json";
const DATA_DIR = resolve("data", DECK_ID);
const ASSET_DIR = resolve("assets/fact-videos", DECK_ID);
const OUTPUT_DIR = resolve("data/output", DECK_ID);
const BG_DIR = resolve("assets/backgrounds/islamic_templates");
const AMBIENT_FILE = process.env.AMBIENT_FILE || "assets/audio/islamic/ambient-long-wind-11m.mp3";

const VIDEO_WIDTH = Number(process.env.VIDEO_WIDTH || 1920);
const VIDEO_HEIGHT = Number(process.env.VIDEO_HEIGHT || 1080);
const FPS = Number(process.env.FPS || 30);
const FADE_SEC = Number(process.env.FADE_SEC || 0.8);
const TARGET_SEQUENCE = (process.env.TARGET_SEC_SEQUENCE || "430,505,560,610,650")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((x) => Number.isFinite(x) && x > 0);
const MIN_SCENE_SEC = Number(process.env.MIN_SCENE_SEC || 16);
const MAX_SCENE_SEC = Number(process.env.MAX_SCENE_SEC || 48);
const CHARS_PER_SEC = Number(process.env.CHARS_PER_SEC || 18);
const EXTRA_READ_SEC = Number(process.env.EXTRA_READ_SEC || 9);
const AMBIENT_VOLUME = Number(process.env.AMBIENT_VOLUME || 0.18);
const EPISODE_START = Math.max(1, Number(process.env.EPISODE_START || 1));
const EPISODE_COUNT = Math.max(1, Number(process.env.EPISODE_COUNT || 5));
const KEEP_WORK = process.env.KEEP_WORK === "1";
const FFMPEG = process.env.FFMPEG || (existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE || (existsSync("/usr/bin/ffprobe") ? "/usr/bin/ffprobe" : "ffprobe");

const BG_FILES = [
  "islamic_ai_emerald_arch.jpg",
  "islamic_ai_navy_dome.jpg",
  "islamic_ai_sapphire_mihrab.jpg",
  "islamic_ai_courtyard.jpg",
  "islamic_ai_turquoise_mosaic.jpg",
  "islamic_ai_open_book.jpg",
  "islamic_mosque_arch.jpg",
  "islamic_light_beam.jpg",
];

const DESCRIPTIONS = [
  "مقاطع هادئة من القرآن والحديث والدعاء، بنص عربي واضح وخلفية ساكنة وصوت طبيعي غير موسيقي يساعد على القراءة والتأمل.",
  "حلقة جديدة تجمع آيات وأحاديث وأدعية مختارة في عرض طويل ومريح، مع انتقالات ناعمة وصوت هادئ بلا آلات موسيقية.",
  "تلاوة بصرية هادئة للنصوص: آيات من القرآن، أحاديث نبوية، وأدعية مأثورة، مرتبة للقراءة الهادئة والمراجعة.",
  "وقت هادئ مع الذكر والدعاء: نص عربي واضح، خلفيات إسلامية ساكنة، وصوت طبيعي خفيف بدون موسيقى.",
  "مجموعة طويلة من الآيات والأحاديث والأدعية للقراءة والتدبر، بإيقاع بطيء وانتقالات لطيفة وصوت محيط غير موسيقي.",
];

const TITLES = [
  "آيات وأحاديث وأدعية للسكينة",
  "وقت هادئ مع القرآن والحديث والدعاء",
  "تلاوة بصرية للذكر والدعاء",
  "آيات وأذكار للتدبر والطمأنينة",
  "مجموعة هادئة من القرآن والسنة والدعاء",
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

function arNum(value) {
  return new Intl.NumberFormat("ar-EG", { useGrouping: false }).format(value);
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

function loadSourceItems() {
  const cards = readJson(SOURCE_FILE);
  if (!Array.isArray(cards)) throw new Error(`Expected array in ${SOURCE_FILE}`);
  return cards
    .map((card, index) => ({
      id: index + 1,
      type: cleanText(card.type || "ayah"),
      arabic: cleanText(card.arabic),
      ref: cleanText(card.ref),
      refEn: cleanText(card.ref_en),
      theme: cleanText(card.theme),
    }))
    .filter((card) => card.arabic && card.ref);
}

function selectScenes(items, episode, seen, targetSec) {
  const picked = [];
  let total = 0;
  for (const item of items) {
    const id = String(item.id);
    if (seen.has(id)) continue;
    const chars = charCount(item.arabic);
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
    arabic: item.arabic,
    ref: item.ref,
    refEn: item.refEn,
    theme: item.theme,
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

function viewerDescription(episode) {
  return DESCRIPTIONS[(Math.max(1, Number(episode) || 1) - 1) % DESCRIPTIONS.length];
}

function viewerTitle(episode) {
  return TITLES[(Math.max(1, Number(episode) || 1) - 1) % TITLES.length] || `${TITLE} | الحلقة ${episode}`;
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

function ensureAmbientBed() {
  if (existsSync(AMBIENT_FILE) && (ffprobeDuration(AMBIENT_FILE) || 0) >= 700) return;
  run(FFMPEG, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-filter_complex",
    "anoisesrc=color=brown:amplitude=0.42:duration=720[b];" +
      "anoisesrc=color=pink:amplitude=0.13:duration=720,highpass=f=1400,lowpass=f=5200[h];" +
      "[b]lowpass=f=360,tremolo=f=0.11:d=0.35[w];" +
      "[w][h]amix=inputs=2:weights=0.8 0.32:normalize=0,loudnorm=I=-28:TP=-4[a]",
    "-map",
    "[a]",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-b:a",
    "128k",
    AMBIENT_FILE,
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

function typeLabel(type) {
  if (type === "hadith") return "حديث";
  if (type === "dua") return "دعاء";
  return "آية";
}

function landscapeHtml(scene, totalScenes, episode) {
  const bg = bgDataUrl(BG_FILES[(episode + scene.order - 2) % BG_FILES.length]);
  return `<!doctype html>
<html lang="ar">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${VIDEO_WIDTH}px; height: ${VIDEO_HEIGHT}px; overflow: hidden; background: #050604; }
    body {
      font-family: "Noto Naskh Arabic", "Noto Sans Arabic", serif;
      color: #f7ecd2;
      background: ${bg ? `url("${bg}") center/cover no-repeat` : "#07100d"};
    }
    body::before {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(0,0,0,0.78), rgba(0,0,0,0.28) 48%, rgba(0,0,0,0.76)),
        radial-gradient(ellipse at center, rgba(0,0,0,0.2), rgba(0,0,0,0.68));
    }
    .shell {
      position: absolute;
      inset: 56px 82px;
      display: grid;
      grid-template-columns: 1fr 270px;
      gap: 34px;
    }
    .panel {
      min-width: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 28px;
      padding: 54px 66px 44px;
      border: 2px solid rgba(230,199,137,0.38);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(5,7,6,0.72), rgba(5,7,6,0.54)),
        radial-gradient(ellipse at center, rgba(230,199,137,0.11), rgba(0,0,0,0));
      box-shadow: 0 30px 90px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.08);
    }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      direction: rtl;
      color: #e6c789;
      font-size: 31px;
      line-height: 1.15;
      font-weight: 800;
    }
    .badge {
      padding: 8px 16px 7px;
      border-radius: 4px;
      background: rgba(230,199,137,0.16);
      border: 1px solid rgba(230,199,137,0.34);
      color: #f7ecd2;
    }
    .verseBox {
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 16px 20px;
      direction: rtl;
      text-align: center;
    }
    .verse {
      width: 100%;
      color: #fbf0d6;
      font-size: 58px;
      line-height: 1.58;
      font-weight: 500;
      text-shadow: 0 2px 16px rgba(0,0,0,0.82), 0 0 4px rgba(0,0,0,0.8);
      overflow-wrap: break-word;
    }
    .ref {
      direction: rtl;
      text-align: center;
      border-top: 1px solid rgba(230,199,137,0.44);
      padding-top: 21px;
      color: #e6c789;
      font-size: 34px;
      line-height: 1.25;
      font-weight: 800;
      text-shadow: 0 2px 12px rgba(0,0,0,0.88);
    }
    .side {
      padding: 42px 28px;
      border-radius: 8px;
      border: 1px solid rgba(230,199,137,0.32);
      background: rgba(4, 8, 7, 0.72);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      text-align: center;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    }
    .brand {
      direction: rtl;
      color: #f7ecd2;
      font-size: 32px;
      line-height: 1.34;
      font-weight: 900;
    }
    .orn {
      margin-top: 28px;
      color: #e6c789;
      font-size: 58px;
      line-height: 1;
    }
    .count {
      color: #e6c789;
      font-size: 70px;
      line-height: 1;
      font-weight: 900;
    }
    .count small {
      display: block;
      margin-top: 12px;
      color: rgba(247,236,210,0.7);
      font-size: 26px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="top">
        <span class="badge">${typeLabel(scene.type)}</span>
        <span>الحلقة ${arNum(episode)}</span>
      </div>
      <section id="verseBox" class="verseBox"><div id="verse" class="verse">${escHtml(scene.arabic)}</div></section>
      <footer id="ref" class="ref">${escHtml(scene.ref)}</footer>
    </section>
    <aside class="side">
      <div>
        <div class="brand">${escHtml(TITLE)}</div>
        <div class="orn">۞</div>
      </div>
      <div class="count">${arNum(scene.order)}<small>من ${arNum(totalScenes)}</small></div>
    </aside>
  </main>
  <script>
    const box = document.getElementById("verseBox");
    const verse = document.getElementById("verse");
    let size = 58;
    while (size > 30 && (verse.scrollHeight > box.clientHeight || verse.scrollWidth > box.clientWidth)) {
      size -= 2;
      verse.style.fontSize = size + "px";
    }
    const ref = document.getElementById("ref");
    let refSize = 34;
    while (refSize > 24 && ref.scrollHeight > 92) {
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
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#050604`,
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

function addAmbient(silentVideo, finalVideo, totalSec) {
  ensureAmbientBed();
  const ambientDuration = ffprobeDuration(AMBIENT_FILE);
  if (!ambientDuration || ambientDuration < totalSec - 0.5) {
    throw new Error(`Islamic ambient bed must cover the whole video: ambient=${ambientDuration ?? "unknown"}s video=${totalSec}s`);
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
    AMBIENT_FILE,
    "-filter_complex",
    `[1:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS,volume=${AMBIENT_VOLUME},afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart}:d=4[a]`,
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
  addAmbient(silentVideo, finalVideo, plannedDurationSec);
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
    lang: "ar",
    mode: "longVideoCompilation",
    format: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    staticImage: true,
    transitionSec: FADE_SEC,
    durationSec: actualDurationSec ? Number(actualDurationSec.toFixed(2)) : plannedDurationSec,
    targetDurationSec: targetSec,
    plannedDurationSec,
    sceneCount: scenes.length,
    music: basename(AMBIENT_FILE),
    audioMode: "nonInstrumentalAmbient",
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
  ensureAmbientBed();
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
          targetDurationSec: ep.targetSec,
          scenes: ep.scenes.length,
          plannedDurationSec: ep.plannedDurationSec,
          plannedDurationMin: Number((ep.plannedDurationSec / 60).toFixed(2)),
        })),
        ambient: AMBIENT_FILE,
        ambientDurationSec: ffprobeDuration(AMBIENT_FILE),
        video: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
        staticScenes: true,
        fadeSec: FADE_SEC,
        sourceKind: "islamicDeck",
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
    sourceSelection: "Deterministic top slice from the exact Islamic Arabic deck, without rewriting Quran, hadith, or dua text.",
    audio: {
      file: AMBIENT_FILE,
      mode: "single continuous non-instrumental synthesized wind/rain ambient bed for the whole long video; no instruments, no melody, no per-scene restarts",
      licenseNote: "Generated locally with ffmpeg noise sources; no external copyrighted music and no attribution required.",
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
      staticScenes: true,
    },
  });
  await writeUsageLedger(mergedVideos);

  console.log(
    JSON.stringify(
      {
        ok: true,
        videos: builtVideos.map((video) => ({
          file: video.file,
          sceneCount: video.sceneCount,
          durationSec: video.durationSec,
          plannedDurationSec: video.plannedDurationSec,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
