#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../src/render.ts";

const DEFAULT_MUSIC_FILE = "assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus";
const DEFAULT_MUSIC_TITLE = "Swingin' the Operas";
const DEFAULT_MUSIC_AUTHOR = "Fats Waller";
const DEFAULT_MUSIC_SOURCE_PAGE = "https://commons.wikimedia.org/wiki/File:Swingin%27_the_Operas_by_Fats_Waller_(1939,_Jazz_piano).opus";
const DEFAULT_MUSIC_SOURCE_URL = "https://upload.wikimedia.org/wikipedia/commons/9/96/Swingin%27_the_Operas_by_Fats_Waller_%281939%2C_Jazz_piano%29.opus";
const DEFAULT_MUSIC_LICENSE_NOTE = "Wikimedia Commons marks the file as Public Domain / free of known copyright restrictions.";
const USAGE_SCHEMA = "long-video-usage/v1";

const FIRST_SERIES_IDS = [
  3, 6, 8, 25, 30, 37, 44, 52, 59, 71, 89, 217, 92, 108, 116, 132, 135,
  164, 176, 177, 191, 197, 199, 218, 225, 245, 258, 263, 205, 284, 285,
  286, 288,
];

const PROFILE = process.env.LONG_VIDEO_PROFILE || "default";
const PROFILES = {
  default: {
    deckId: "long-anecdotes-ru",
    title: "Русские анекдоты",
    titles: [
      "Русские анекдоты для легкого вечера",
      "Смешные истории на русском для отдыха",
      "Большой сборник русских анекдотов",
      "Русские анекдоты без спешки",
      "Легкий юмор на русском для хорошего настроения",
      "Анекдоты и смешные истории для паузы",
    ],
    visualStyle: "paper",
    sourceDeckId: "ru",
    sourceFile: "data/anecdotes/titled.json",
    sourceKind: "builtinDeck",
    sourceSelection:
      "Deterministic first-series allow-list from the existing RU anecdote deck, with future fallback candidates filtered by local safety terms.",
    episodeCount: 1,
    minSourceChars: 240,
    maxSourceChars: 430,
    firstSeriesIds: FIRST_SERIES_IDS,
    descriptions: [
      "Первый большой сборник русских анекдотов для спокойного просмотра: короткие смешные истории, плавные паузы и лёгкая музыка. Включайте, отдыхайте и делитесь выпуском с теми, кто любит простой добрый юмор.",
      "Новая подборка русских анекдотов для вечернего отдыха: лёгкие истории, понятный темп и плавная смена карточек. Подходит, чтобы включить фоном или посмотреть целиком без спешки.",
      "Ещё один выпуск с русскими анекдотами в спокойном формате: короткие забавные сюжеты, мягкие переходы и музыка, которая не мешает читать. Хороший вариант для паузы и хорошего настроения.",
      "Свежий длинный выпуск с анекдотами на русском: простые смешные истории идут одна за другой в удобном темпе. Смотрите, отдыхайте и отправляйте друзьям, если хочется лёгкого юмора.",
    ],
  },
  soul: {
    deckId: "long-anecdotes-soul-ru",
    title: "Русские анекдоты",
    titles: [
      "Русские анекдоты: легкий вечерний сборник",
      "Смешные истории для хорошего настроения",
      "Добрая подборка анекдотов для отдыха",
      "Русские анекдоты: новый спокойный выпуск",
      "Легкий юмор на вечер",
      "Смешные анекдоты без спешки",
      "Русские анекдоты: теплая подборка",
      "Истории для улыбки и отдыха",
      "Большой выпуск анекдотов для настроения",
      "Русские анекдоты: вечерний юмор",
      "Смешной сборник для спокойного просмотра",
      "Русские анекдоты: еще один хороший выпуск",
    ],
    visualStyle: "soul",
    musicFile: "assets/audio/long-videos/chopin-allegro-de-concert-op-46-cc0.mp3",
    musicTitle: "Allegro de Concert Op. 46 in A Major",
    musicAuthor: "Frédéric Chopin",
    musicSourcePage: "https://commons.wikimedia.org/wiki/File:Allegro_de_Concert_Op._46_in_A_Major.mp3",
    musicSourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/Allegro_de_Concert_Op._46_in_A_Major.mp3",
    musicLicenseNote: "Wikimedia Commons lists this recording under Creative Commons CC0 1.0 Universal Public Domain Dedication.",
    sourceDeckId: "pack:анекдоты-ру-впн-mqe5ovw1",
    sourceFile: "data/packs/анекдоты-ру-впн-mqe5ovw1.json",
    sourceKind: "customPack",
    sourceSelection:
      "Deterministic top slice from the channel custom pack, split into individual joke scenes and filtered by local safety terms.",
    episodeCount: 2,
    targetSecSequence: [510, 510, 430, 455, 480, 505, 530, 555, 580, 605, 630, 650],
    minSourceChars: 90,
    maxSourceChars: 330,
    firstSeriesIds: [],
    descriptions: [
      "Большой выпуск русских анекдотов: лёгкие смешные истории, спокойный темп и музыка, которая не мешает читать. Подходит для отдыха и хорошего настроения.",
      "Вторая подборка русских анекдотов: короткие забавные истории идут одна за другой, без спешки и резких переходов. Включайте, смотрите и делитесь с друзьями.",
    ],
  },
};
const ACTIVE_PROFILE = PROFILES[PROFILE];
if (!ACTIVE_PROFILE) throw new Error(`Unknown LONG_VIDEO_PROFILE=${PROFILE}`);

const DECK_ID = process.env.DECK_ID || ACTIVE_PROFILE.deckId;
const TITLE = process.env.LONG_VIDEO_TITLE || ACTIVE_PROFILE.title;
const SOURCE_DECK_ID = process.env.SOURCE_DECK_ID || ACTIVE_PROFILE.sourceDeckId;
const SOURCE_FILE = process.env.SOURCE_FILE || ACTIVE_PROFILE.sourceFile;
const MUSIC_FILE = process.env.MUSIC_FILE || ACTIVE_PROFILE.musicFile || DEFAULT_MUSIC_FILE;
const MUSIC_TITLE = process.env.MUSIC_TITLE || ACTIVE_PROFILE.musicTitle || DEFAULT_MUSIC_TITLE;
const MUSIC_AUTHOR = process.env.MUSIC_AUTHOR || ACTIVE_PROFILE.musicAuthor || DEFAULT_MUSIC_AUTHOR;
const MUSIC_SOURCE_PAGE = process.env.MUSIC_SOURCE_PAGE || ACTIVE_PROFILE.musicSourcePage || DEFAULT_MUSIC_SOURCE_PAGE;
const MUSIC_SOURCE_URL = process.env.MUSIC_SOURCE_URL || ACTIVE_PROFILE.musicSourceUrl || DEFAULT_MUSIC_SOURCE_URL;
const MUSIC_LICENSE_NOTE = process.env.MUSIC_LICENSE_NOTE || ACTIVE_PROFILE.musicLicenseNote || DEFAULT_MUSIC_LICENSE_NOTE;
const DATA_DIR = resolve("data", DECK_ID);
const ASSET_DIR = resolve("assets/fact-videos", DECK_ID);
const OUTPUT_DIR = resolve("data/output", DECK_ID);

const VIDEO_WIDTH = Number(process.env.VIDEO_WIDTH || 1920);
const VIDEO_HEIGHT = Number(process.env.VIDEO_HEIGHT || 1080);
const FPS = Number(process.env.FPS || 30);
const FADE_SEC = Number(process.env.FADE_SEC || 0.8);
const TARGET_SEC = Number(process.env.TARGET_SEC || 510);
const MIN_SCENE_SEC = Number(process.env.MIN_SCENE_SEC || 11);
const MAX_SCENE_SEC = Number(process.env.MAX_SCENE_SEC || 18);
const CHARS_PER_SEC = Number(process.env.CHARS_PER_SEC || 22);
const EXTRA_READ_SEC = Number(process.env.EXTRA_READ_SEC || 3);
const READ_TIME_FACTOR = Number(process.env.READ_TIME_FACTOR || 0.88);
const MUSIC_VOLUME = Number(process.env.MUSIC_VOLUME || 0.24);
const EPISODE_START = Math.max(1, Number(process.env.EPISODE_START || 1));
const EPISODE_COUNT = Math.max(1, Number(process.env.EPISODE_COUNT || ACTIVE_PROFILE.episodeCount || 1));
const MIN_SOURCE_CHARS = Number(process.env.MIN_SOURCE_CHARS || ACTIVE_PROFILE.minSourceChars || 240);
const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS || ACTIVE_PROFILE.maxSourceChars || 430);
const KEEP_WORK = process.env.KEEP_WORK === "1";
const FFMPEG = process.env.FFMPEG || (existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg");
const FFPROBE = process.env.FFPROBE || (existsSync("/usr/bin/ffprobe") ? "/usr/bin/ffprobe" : "ffprobe");

const TITLE_OVERRIDES = new Map([
  [44, "Биатлонист"],
  [132, "Жвачка в самолете"],
  [135, "Кошка и холодильник"],
  [164, "Деловое письмо"],
  [177, "Сосед с перфоратором"],
  [217, "Розыгрыш с яйцами"],
  [205, "Компьютерный холодильник"],
  [284, "Рубашка и носки"],
  [285, "Тараканы и гидра"],
  [286, "Домашние дела"],
  [288, "Компас и топор"],
]);

const BLOCKLIST =
  /путин|президент|правитель|радиоактив|пенис|отсос|матюк|похаб|налог|хохл|кацап|украин|армян|чукч|негр|секс|проститут|геи|мусульман|христ|религи|алкогол|водк|коньяк|виски|ром|джин|пиво|вино|пьян|наркот|бомбард|войн|полит|брежнев|косыгин|коррупц|олигарх|конча|туалет|дерьм|труп|похорон|эпилеп|пистолет|революц|генсек|шлюх|любовник|беремен|лифчик|уби|кров/i;

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

function formatJokeText(value) {
  return cleanText(value)
    .replace(/([:!?])-\s*/g, "$1\n- ")
    .replace(/([.?!])(?=[А-ЯЁA-Z])/g, "$1 ")
    .replace(/([а-яёa-z0-9])([А-ЯЁ])/g, "$1 $2")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function durationFor(chars) {
  return clamp(MIN_SCENE_SEC, MAX_SCENE_SEC, Math.ceil((chars / CHARS_PER_SEC + EXTRA_READ_SEC) * READ_TIME_FACTOR));
}

function isSafeCandidate(item) {
  const title = String(item?.title || "");
  const text = cleanText(item?.text || "");
  if (!title || !text) return false;
  const chars = charCount(text);
  if (chars < MIN_SOURCE_CHARS || chars > MAX_SOURCE_CHARS) return false;
  return !BLOCKLIST.test(`${title}\n${text}`);
}

function loadSourceItems() {
  if (ACTIVE_PROFILE.sourceKind !== "customPack") return readJson(SOURCE_FILE);

  const pack = readJson(SOURCE_FILE);
  const cards = Array.isArray(pack.cards) ? pack.cards : [];
  const items = [];
  cards.forEach((card, cardIndex) => {
    const values = card?.values ?? {};
    const title = cleanText(values.title || pack.name || TITLE) || TITLE;
    const jokes = Array.isArray(values.text) ? values.text : values.text ? [values.text] : [];
    jokes.forEach((joke, jokeIndex) => {
      const text = formatJokeText(joke);
      items.push({
        id: `${cardIndex + 1}.${jokeIndex + 1}`,
        title,
        text,
        sourceCard: cardIndex + 1,
        sourceJoke: jokeIndex + 1,
      });
    });
  });
  return items;
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
  const variants = ACTIVE_PROFILE.descriptions;
  return variants[(Math.max(1, Number(episode) || 1) - 1) % variants.length];
}

function viewerTitle(episode) {
  const variants = ACTIVE_PROFILE.titles;
  if (!Array.isArray(variants) || variants.length === 0) return `${TITLE} | Выпуск ${episode}`;
  return variants[(Math.max(1, Number(episode) || 1) - 1) % variants.length];
}

function targetSecForEpisode(episode) {
  if (process.env.TARGET_SEC) return TARGET_SEC;
  const seq = ACTIVE_PROFILE.targetSecSequence;
  if (Array.isArray(seq) && seq.length > 0) {
    return Number(seq[(Math.max(1, Number(episode) || 1) - 1) % seq.length]) || TARGET_SEC;
  }
  return TARGET_SEC;
}

function selectScenes(items, episode, seen, targetSec) {
  const byId = new Map(items.map((item) => [Number(item.id), item]));
  const picked = [];
  if (episode === 1 && ACTIVE_PROFILE.firstSeriesIds.length > 0) {
    for (const id of ACTIVE_PROFILE.firstSeriesIds) {
      const item = byId.get(id);
      if (!item) throw new Error(`Missing source anecdote id=${id}`);
      picked.push(item);
      seen.add(String(item.id));
    }
  }

  let total = picked.reduce((sum, item) => sum + durationFor(charCount(item.text)), 0);
  if (total < targetSec * 0.95) {
    for (const item of items) {
      const id = String(item.id);
      if (seen.has(id) || !isSafeCandidate(item)) continue;
      picked.push(item);
      seen.add(id);
      total += durationFor(charCount(item.text));
      if (total >= targetSec * 0.98) break;
    }
  }

  return picked.map((item, index) => {
    const text = cleanText(item.text);
    const chars = charCount(text);
    const numericId = /^\d+$/.test(String(item.id)) ? Number(item.id) : NaN;
    return {
      order: index + 1,
      sourceDeck: SOURCE_DECK_ID,
      sourceId: Number.isFinite(numericId) && String(item.id) === String(numericId) ? numericId : String(item.id),
      title: TITLE_OVERRIDES.get(numericId) || String(item.title || `Анекдот ${index + 1}`).trim(),
      text,
      chars,
      durationSec: durationFor(chars),
      readModel: {
        charsPerSec: CHARS_PER_SEC,
        extraSec: EXTRA_READ_SEC,
        minSec: MIN_SCENE_SEC,
        maxSec: MAX_SCENE_SEC,
        factor: READ_TIME_FACTOR,
      },
    };
  });
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

function concatListLine(path) {
  return `file '${resolve(path).replace(/'/g, "'\\''")}'`;
}

function soulLandscapeHtml(scene, totalScenes) {
  const text = escHtml(scene.text).replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${VIDEO_WIDTH}px; height: ${VIDEO_HEIGHT}px; overflow: hidden; }
    body {
      font-family: Inter, Arial, Helvetica, sans-serif;
      color: #17231f;
      background:
        linear-gradient(90deg, #14231f 0 18%, #263c36 18% 19%, #eee9de 19% 100%);
    }
    .shell {
      position: absolute;
      inset: 0;
      display: grid;
      grid-template-columns: 350px 1fr;
    }
    .side {
      padding: 70px 44px 58px;
      background:
        linear-gradient(180deg, rgba(20,35,31,0.96), rgba(30,54,47,0.98)),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.055), rgba(255,255,255,0.055) 1px, transparent 1px, transparent 32px);
      color: #f8edda;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-right: 6px solid #c4934b;
    }
    .brand {
      font-size: 36px;
      line-height: 1.12;
      font-weight: 900;
      text-transform: uppercase;
    }
    .episode {
      margin-top: 34px;
      width: 190px;
      border-top: 4px solid #c4934b;
      padding-top: 22px;
      font-size: 23px;
      line-height: 1.35;
      color: rgba(248,237,218,0.76);
      font-weight: 700;
    }
    .count {
      color: #d9a656;
      font-size: 82px;
      line-height: 0.96;
      font-weight: 900;
    }
    .count small {
      display: block;
      margin-top: 14px;
      color: rgba(248,237,218,0.72);
      font-size: 24px;
      line-height: 1;
      font-weight: 800;
    }
    .stage {
      padding: 74px 82px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      width: 100%;
      min-height: 772px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 24px;
      padding: 54px 66px 42px;
      background: #fffaf0;
      border: 2px solid rgba(36,66,61,0.22);
      border-radius: 8px;
      box-shadow: 0 26px 68px rgba(23,35,31,0.18);
    }
    .ribbon {
      width: fit-content;
      padding: 9px 14px 8px;
      background: #b64d3c;
      color: #fffaf0;
      border-radius: 4px;
      font-size: 22px;
      font-weight: 900;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      color: #1d342f;
      font-size: 58px;
      line-height: 1.05;
      font-weight: 900;
      max-width: 1300px;
    }
    .body {
      min-height: 0;
      max-height: 520px;
      overflow: hidden;
      display: flex;
      align-items: center;
      padding-left: 32px;
      border-left: 8px solid #d9a656;
      color: #202825;
      font-size: 50px;
      line-height: 1.32;
      font-weight: 650;
      white-space: normal;
    }
    .body > div {
      width: 100%;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 30px;
      border-top: 2px solid #d8caae;
      padding-top: 20px;
      color: #657068;
      font-size: 23px;
      line-height: 1.2;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <main class="shell">
    <aside class="side">
      <div>
        <div class="brand">Анекдоты<br>для Души</div>
        <div class="episode">канальный длинный выпуск</div>
      </div>
      <div class="count">${String(scene.order).padStart(2, "0")}<small>из ${totalScenes}</small></div>
    </aside>
    <section class="stage">
      <article class="card">
        <div class="ribbon">История ${scene.order}</div>
        <h1 id="title">${escHtml(scene.title)}</h1>
        <section id="body" class="body"><div>${text}</div></section>
        <footer class="footer">
          <span>${escHtml(TITLE)}</span>
          <span>сборник для спокойного просмотра</span>
        </footer>
      </article>
    </section>
  </main>
  <script>
    const body = document.getElementById("body");
    const bodyInner = body.firstElementChild;
    let bodySize = 50;
    while (bodySize > 32 && (bodyInner.scrollHeight > body.clientHeight || bodyInner.scrollWidth > body.clientWidth)) {
      bodySize -= 1;
      body.style.fontSize = bodySize + "px";
    }
    const title = document.getElementById("title");
    let titleSize = 58;
    while (titleSize > 38 && title.scrollHeight > 128) {
      titleSize -= 1;
      title.style.fontSize = titleSize + "px";
    }
    window.__fitted = true;
  </script>
</body>
</html>`;
}

function landscapeHtml(scene, totalScenes) {
  if (ACTIVE_PROFILE.visualStyle === "soul") return soulLandscapeHtml(scene, totalScenes);

  const text = escHtml(scene.text).replace(/\n/g, "<br>");
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${VIDEO_WIDTH}px; height: ${VIDEO_HEIGHT}px; overflow: hidden; }
    body {
      font-family: Inter, Arial, Helvetica, sans-serif;
      color: #22160f;
      background:
        radial-gradient(circle at 14% 16%, rgba(255,255,255,0.88), rgba(255,255,255,0) 28%),
        radial-gradient(circle at 86% 20%, rgba(214,169,92,0.28), rgba(214,169,92,0) 30%),
        linear-gradient(135deg, #f6efe1 0%, #eadac1 48%, #f8f0df 100%);
    }
    .frame {
      position: absolute;
      inset: 54px 76px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 20px;
      border: 2px solid rgba(68, 42, 25, 0.18);
      border-radius: 34px;
      padding: 54px 72px 44px;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.74), rgba(255,255,255,0.53)),
        repeating-linear-gradient(0deg, rgba(80,55,32,0.035), rgba(80,55,32,0.035) 1px, transparent 1px, transparent 31px);
      box-shadow: 0 28px 80px rgba(47, 31, 18, 0.18);
    }
    .kicker {
      font-size: 28px;
      font-weight: 700;
      color: #7a4520;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 64px;
      line-height: 1.04;
      font-weight: 800;
      max-width: 1550px;
    }
    .body {
      min-height: 0;
      max-height: 620px;
      overflow: hidden;
      display: flex;
      align-items: center;
      font-size: 52px;
      line-height: 1.28;
      font-weight: 600;
      white-space: normal;
    }
    .body > div {
      width: 100%;
    }
    .footer {
      color: rgba(34, 22, 15, 0.58);
      font-size: 24px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <main class="frame">
    <div class="kicker">Анекдот ${scene.order} из ${totalScenes}</div>
    <h1 id="title">${escHtml(scene.title)}</h1>
    <section id="body" class="body"><div>${text}</div></section>
    <footer class="footer">${escHtml(TITLE)}</footer>
  </main>
  <script>
    const body = document.getElementById("body");
    const bodyInner = body.firstElementChild;
    let bodySize = 52;
    while (bodySize > 34 && (bodyInner.scrollHeight > body.clientHeight || bodyInner.scrollWidth > body.clientWidth)) {
      bodySize -= 1;
      body.style.fontSize = bodySize + "px";
    }
    const title = document.getElementById("title");
    let titleSize = 64;
    while (titleSize > 42 && title.scrollHeight > 142) {
      titleSize -= 1;
      title.style.fontSize = titleSize + "px";
    }
    window.__fitted = true;
  </script>
</body>
</html>`;
}

async function renderScene(browser, scene, pngPath, totalScenes) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(landscapeHtml(scene, totalScenes), { waitUntil: "load", timeout: 30_000 });
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
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=#111111`,
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
  const cols = 6;
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

function addMusic(silentVideo, finalVideo, totalSec) {
  if (!existsSync(MUSIC_FILE)) throw new Error(`Long-video music file is missing: ${MUSIC_FILE}`);
  const musicDuration = ffprobeDuration(MUSIC_FILE);
  if (!musicDuration || musicDuration < totalSec - 0.5) {
    throw new Error(`Long-video music must cover the whole video: music=${musicDuration ?? "unknown"}s video=${totalSec}s`);
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
    MUSIC_FILE,
    "-filter_complex",
    `[1:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS,volume=${MUSIC_VOLUME},afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart}:d=4[a]`,
    "-map",
    "0:v:0",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
      "--hide-scrollbars",
    ],
  });
  try {
    for (const scene of scenes) {
      const num = String(scene.order).padStart(3, "0");
      const png = resolve(workDir, `scene-${num}.png`);
      const clip = resolve(workDir, `clip-${num}.mp4`);
      console.log(`${videoId} scene ${num}/${String(scenes.length).padStart(3, "0")}: ${scene.title} (${scene.chars} chars, ${scene.durationSec}s)`);
      await renderScene(browser, scene, png, scenes.length);
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
  addMusic(silentVideo, finalVideo, plannedDurationSec);
  buildContactSheet(workDir, contactSheet, scenes.length);

  const actualDurationSec = ffprobeDuration(finalVideo);
  const builtAt = new Date().toISOString();
  await writeJson(resolve(DATA_DIR, `scenes-${String(episode).padStart(3, "0")}.json`), scenes);
  if (episode === 1) await writeJson(resolve(DATA_DIR, "scenes.json"), scenes);

  if (!KEEP_WORK) {
    await rm(workDir, { recursive: true, force: true });
  }

  return {
    file: finalRel,
    title: viewerTitle(episode),
    text: viewerDescription(episode),
    lang: "ru",
    mode: "longVideoCompilation",
    format: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    staticImage: true,
    transitionSec: FADE_SEC,
    durationSec: actualDurationSec ? Number(actualDurationSec.toFixed(2)) : plannedDurationSec,
    targetDurationSec: targetSec,
    plannedDurationSec,
    sceneCount: scenes.length,
    music: basename(MUSIC_FILE),
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

function sourceIdValue(value) {
  const s = String(value);
  const n = Number(s);
  return /^\d+$/.test(s) && Number.isFinite(n) ? n : s;
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
      const sourceId = sourceIdValue(scene.sourceId);
      const key = sourceIdKey(sourceId);
      const usageRef = {
        sourceDeck: scene.sourceDeck || SOURCE_DECK_ID,
        sourceId,
        videoFile: video.file,
        videoTitle: video.title,
        order: Number(scene.order),
      };
      if (used.has(key)) {
        duplicateUses.push({ sourceId, first: used.get(key), duplicate: usageRef });
      } else {
        used.set(key, usageRef);
      }
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
    throw new Error(`Duplicate source anecdotes in long videos: ${JSON.stringify(duplicateUses.slice(0, 10), null, 2)}`);
  }

  const usedSourceIds = Array.from(used.values())
    .map((ref) => ref.sourceId)
    .sort((a, b) => String(a).localeCompare(String(b), "ru", { numeric: true }));
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
      const sourceId = sourceIdValue(scene.sourceId);
      refs.set(sourceIdKey(sourceId), {
        sourceDeck: scene.sourceDeck || SOURCE_DECK_ID,
        sourceId,
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
    throw new Error(`Planned long-video scenes reuse already published anecdotes: ${JSON.stringify(conflicts.slice(0, 10), null, 2)}`);
  }
}

async function writeUsageLedger(videos) {
  await writeJson(usagePath(), buildUsageLedger(videos));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const writeUsageOnly = process.argv.includes("--write-usage");
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
        targetSec: TARGET_SEC,
        music: MUSIC_FILE,
        video: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
        staticScenes: true,
        fadeSec: FADE_SEC,
        readTimeFactor: READ_TIME_FACTOR,
        sourceKind: ACTIVE_PROFILE.sourceKind,
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    for (const ep of episodes) {
      console.log(`\n${ep.videoId} (${Math.round(ep.plannedDurationSec)}s)`);
      for (const scene of ep.scenes) {
        console.log(`${String(scene.order).padStart(2, "0")}. ${scene.title} | ${scene.chars} chars | ${scene.durationSec}s`);
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
    sourceSelection: ACTIVE_PROFILE.sourceSelection,
    music: {
      file: MUSIC_FILE,
      title: MUSIC_TITLE,
      author: MUSIC_AUTHOR,
      sourcePage: MUSIC_SOURCE_PAGE,
      sourceUrl: MUSIC_SOURCE_URL,
      mode: "single downloaded public-domain composition for the whole long video; no loop and no per-scene restarts",
      licenseNote: MUSIC_LICENSE_NOTE,
    },
    output: {
      videos: mergedVideos.map((video) => video.file),
      contactSheets: episodes.map((ep) => contactSheetRelFor(ep.videoId)),
      builtAt: new Date().toISOString(),
      format: `${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    },
    timing: {
      targetSec: TARGET_SEC,
      episodeTargets: mergedVideos.map((video) => ({
        file: video.file,
        targetSec: targetSecForEpisode(episodeFromVideo(video)),
      })),
      formula: `clamp(${MIN_SCENE_SEC}, ${MAX_SCENE_SEC}, ceil((chars / ${CHARS_PER_SEC} + ${EXTRA_READ_SEC}) * ${READ_TIME_FACTOR}))`,
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
