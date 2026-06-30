import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import { deckLang, getDeck, isPlainAnecdoteDeck } from "./decks.ts";
import { buildPsychHtml } from "../psych/render.ts";
import { buildIslamicHtml, pickIslamicBg } from "../islamic/render.ts";
import { buildChristianHtml, pickChristianBg } from "../christian/render.ts";
import { buildRussianHtml, pickRussianBg } from "./russian-bg.ts";
import { buildMemeHtml, buildMemeBoardHtml, memeBackdropFor, type MemeCard } from "../memes/render.ts";
import { photoCss, photoDataUri } from "../memes/photos.ts";
import { buildChooseHtml, type ChooseCard } from "../choose/render.ts";
import type { PackItem } from "./library.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, "../../templates/anecdote.html");
const POP_JOKE_TEMPLATE = resolve(__dirname, "../../templates/anecdote-pop.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds");

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function dataUriFromRootRel(file?: string | null): string | null {
  if (!file) return null;
  const abs = resolve(process.cwd(), file);
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  const mime = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

const SOLID_FALLBACK = ["#fbf6ea", "#f4eee1", "#eef2f4", "#f6ece9"];

/** Names of the available texture backgrounds (the "proposed" pool). */
export function listBackgrounds(): string[] {
  if (!existsSync(BG_DIR)) return [];
  return readdirSync(BG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
}

export function randomBackgroundName(): string | null {
  const files = listBackgrounds();
  return files.length ? files[Math.floor(Math.random() * files.length)] : null;
}

function randomDifferent(files: string[], avoid?: string | null): string | null {
  if (files.length === 0) return null;
  const pool = avoid && files.length > 1 ? files.filter((f) => f !== avoid) : files;
  const finalPool = pool.length ? pool : files;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/** Resolve a texture name to a CSS background value (inlined data-URI), or a solid fallback. */
export function backgroundCss(name?: string | null): string {
  const files = listBackgrounds();
  if (files.length === 0) return SOLID_FALLBACK[Math.floor(Math.random() * SOLID_FALLBACK.length)];
  const file = name && files.includes(name) ? name : files[Math.floor(Math.random() * files.length)];
  const buf = readFileSync(resolve(BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

function stableIndex(seed: string, size: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % size;
}

export interface Anecdote {
  title: string;
  text: string;
  channel: string;
  /** Texture name (e.g. "kraft.jpg"); random if omitted. */
  bg?: string;
  /** Best-effort exclusion for random background selection. */
  avoidBg?: string;
  /** Deck id. */
  deck?: string;
  /** Legacy profession key retained for source stats/template seeding. */
  profession?: string;
  /** QA/testing hook: force one of the pop joke template variants. */
  visualVariant?: string;
}

/** Shared Chrome capture: load HTML, wait for the auto-fit, screenshot a 1080x1920 PNG. */
async function captureCard(html: string, outPath: string, opts: { transparent?: boolean } = {}): Promise<number> {
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
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    // networkidle0 waits for fonts/images; valid at runtime — puppeteer-core@25's setContent type omits it.
    await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    const fontPx = (await page.evaluate("window.__fitFontPx").catch(() => 0)) as number;
    await mkdir(dirname(outPath), { recursive: true });
    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 1080, height: 1920 },
      omitBackground: !!opts.transparent,
    });
    await writeFile(outPath, buf);
    return fontPx;
  } finally {
    await browser.close();
  }
}

/** Render one anecdote/card to a 1080x1920 image. */
export async function renderAnecdote(
  a: Anecdote,
  outPath: string,
  item?: PackItem,
): Promise<{ path: string; fontPx: number; bg: string }> {
  const deck = getDeck(a.deck);
  if (deck.quote || deck.quoteVideo) return renderQuote(a, outPath, item);
  if (deck.islamic) return renderIslamic(a, outPath);
  if (deck.christian) return renderChristian(a, outPath);
  if (deck.psych) return renderPsych(a, outPath);
  if (deck.russianBg) return renderRussian(a, outPath);
  if (deck.memeBoard) return renderMemeBoard(a, outPath);
  if (deck.meme) return renderMeme(a, outPath);
  if (deck.choose) return renderChoose(a, outPath);
  if (isPlainAnecdoteDeck(deck) && !a.bg) return renderJokePop(a, outPath);
  const bgName = a.bg ?? randomDifferent(listBackgrounds(), a.avoidBg) ?? "";
  const bgCss = backgroundCss(bgName);
  const lang = deckLang(a.deck ?? "") || "ru";
  const rtl = lang === "ar";
  let html = await readFile(TEMPLATE, "utf8");
  html = html
    .replaceAll("{{LANG}}", esc(lang))
    .replaceAll("{{DIR}}", rtl ? "rtl" : "ltr")
    .replaceAll("{{TEXT_ALIGN}}", rtl ? "right" : "left")
    .replaceAll("{{TITLE}}", esc(a.title))
    .replace("{{TEXT}}", esc(a.text))
    .replaceAll("{{CHANNEL}}", esc(a.channel))
    .replaceAll("{{BG}}", bgCss);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: bgName };
}

export const JOKE_POP_VARIANTS = [
  "v-orange-card",
  "v-lemon-blob",
  "v-yellow-doodle",
  "v-blue-note",
  "v-mint-chat",
  "v-rose-ticket",
  "v-purple-stage",
  "v-green-board",
  "v-kraft-sticky",
  "v-comic-red",
  "v-cyan-phone",
  "v-peach-sticky",
  "v-graphite",
  "v-notebook",
  "v-confetti",
  "v-ai-comedy-card",
  "v-paper-desk",
  "v-dark-punchline",
  "v-sticker-board",
  "v-speech-bubble",
] as const;

const JOKE_EMOJIS = ["😂", "🤣", "😆", "😹", "😁"];
const JOKE_DOODLES = ["HA!", "LOL", "WOW", ":-)", "!!", "HEH", "FUN"];
const JOKE_AI_BG = "assets/backgrounds/jokes/comedy-card-ai-01.jpg";

function stableHashString(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function jokeVariant(input: Anecdote): string {
  if (input.visualVariant && JOKE_POP_VARIANTS.includes(input.visualVariant as (typeof JOKE_POP_VARIANTS)[number]))
    return input.visualVariant;
  const h = stableHashString(`${input.deck}|${input.title}|${input.text}`);
  return JOKE_POP_VARIANTS[h % JOKE_POP_VARIANTS.length];
}

function buildJokePopHtml(input: {
  title: string;
  text: string;
  deckId?: string;
  visualVariant?: string;
  motionOverlay?: boolean;
}): { html: string; variant: string } {
  const deck = getDeck(input.deckId);
  const lang = deckLang(deck.id) || "ru";
  const rtl = lang === "ar";
  const seed = `${deck.id}|${input.title}|${input.text}`;
  const h = stableHashString(seed);
  const variant = jokeVariant({ title: input.title, text: input.text, channel: deck.name, deck: deck.id, visualVariant: input.visualVariant });
  const dense = input.text.length > 430 || /\n(?:.*\n){7,}/.test(input.text);
  const emoji = JOKE_EMOJIS[(h >>> 3) % JOKE_EMOJIS.length];
  const doodle = JOKE_DOODLES[(h >>> 7) % JOKE_DOODLES.length];
  const tpl = readFileSync(POP_JOKE_TEMPLATE, "utf8");
  return {
    variant,
    html: tpl
      .replaceAll("{{LANG}}", esc(lang))
      .replaceAll("{{DIR}}", rtl ? "rtl" : "ltr")
      .replaceAll("{{TEXT_ALIGN}}", rtl ? "right" : "center")
      .replaceAll("{{VARIANT}}", variant)
      .replaceAll("{{DENSE}}", dense ? "dense" : "")
      .replaceAll("{{MOTION_OVERLAY}}", input.motionOverlay ? "motion-overlay" : "")
      .replaceAll("{{EMOJI}}", emoji)
      .replaceAll("{{DOODLE}}", esc(doodle))
      .replaceAll("{{AI_BG}}", dataUriFromRootRel(JOKE_AI_BG) ?? "")
      .replaceAll("{{TITLE}}", esc(input.title || deck.name))
      .replace("{{TEXT}}", esc(input.text)),
  };
}

async function renderJokePop(a: Anecdote, outPath: string): Promise<{ path: string; fontPx: number; bg: string }> {
  const { html, variant } = buildJokePopHtml({ title: a.title, text: a.text, deckId: a.deck, visualVariant: a.visualVariant });
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: `pop:${variant}` };
}

export async function renderJokeMotionOverlay(a: Anecdote, outPath: string): Promise<{ path: string; fontPx: number; bg: string }> {
  const { html, variant } = buildJokePopHtml({
    title: a.title,
    text: a.text,
    deckId: a.deck,
    visualVariant: a.visualVariant,
    motionOverlay: true,
  });
  const fontPx = await captureCard(html, outPath, { transparent: true });
  return { path: outPath, fontPx, bg: `pop:${variant}:motion-overlay` };
}

const ISLAMIC_QUOTE_BACKGROUNDS = [
  "assets/backgrounds/islamic_templates/islamic_mosque_arch.jpg",
  "assets/backgrounds/islamic_templates/islamic_open_book.jpg",
  "assets/backgrounds/islamic_templates/islamic_lantern_beads.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_emerald_arch.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_sapphire_mihrab.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_turquoise_mosaic.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_burgundy_frame.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_courtyard.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_green_rosette.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_navy_dome.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_night_domes.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_open_book.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_palm_garden.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_prayer_rug.jpg",
  "assets/backgrounds/islamic_templates/islamic_ai_velvet_filigree.jpg",
  "assets/backgrounds/islamic_templates/islamic_crescent.jpg",
  "assets/backgrounds/islamic_templates/islamic_gold_rosette.jpg",
  "assets/backgrounds/islamic_templates/islamic_light_beam.jpg",
  "assets/backgrounds/islamic_templates/islamic_mosque_silhouette.jpg",
  "assets/backgrounds/islamic_templates/islamic_prayer_rug.jpg",
  "assets/backgrounds/islamic_templates/islamic_quran_corner.jpg",
  "assets/backgrounds/islamic_templates/islamic_quran_header.jpg",
];
const CHRISTIAN_QUOTE_BACKGROUNDS = [
  "assets/backgrounds/christian_protestant_templates/protestant_open_bible.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_stained_glass.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_wooden_cross.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_open_bible_glow.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_stained_glow.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_candle_cross.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_candle_arch.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_empty_pews_warm.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_forest_path.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_glass_border.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_hill_sunrise.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_lake_chapel.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_olive_branch.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_rainy_window.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_ruby_glass.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_stone_arch.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_ai_walnut_cross.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_bible_corner.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_chapel_silhouette.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_forest_sunrise.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_minimal_cross.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_photo_empty_pews.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_photo_hill_cross.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_photo_pulpit_bible.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_photo_rainy_bible.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_photo_wooden_church.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_pulpit_bible.jpg",
  "assets/backgrounds/christian_protestant_templates/protestant_worship_hall.jpg",
];
const GENERIC_QUOTE_BACKGROUNDS = [
  "assets/backgrounds/quotes/quote-bg-01.jpg",
  "assets/backgrounds/quotes/quote-bg-02.jpg",
  "assets/backgrounds/quotes/quote-bg-03.jpg",
  "assets/backgrounds/quotes/quote-bg-04.jpg",
  "assets/backgrounds/quotes/quote-bg-05.jpg",
  "assets/backgrounds/quotes/quote-bg-06.jpg",
  "assets/backgrounds/quotes/quote-bg-07.jpg",
  "assets/backgrounds/quotes/quote-bg-08.jpg",
];

function isIslamicQuoteDeck(deckId: string): boolean {
  return deckId === "islamic-quotes-ar" || deckId === "islamic-facts-ar";
}

function isChristianQuoteDeck(deckId: string): boolean {
  return deckId === "christian-quotes-en" || deckId === "christian-facts-en";
}

function quoteFallbackBg(deckId: string, seed: string): string | null {
  const files =
    isIslamicQuoteDeck(deckId)
      ? ISLAMIC_QUOTE_BACKGROUNDS
      : isChristianQuoteDeck(deckId)
        ? CHRISTIAN_QUOTE_BACKGROUNDS
        : GENERIC_QUOTE_BACKGROUNDS;
  const existing = files.filter((file) => existsSync(resolve(process.cwd(), file)));
  if (!existing.length) return null;
  return dataUriFromRootRel(existing[stableIndex(seed || deckId, existing.length)]);
}

function quoteHtml(input: { quote: string; author: string; lang: string; deckId?: string; portraitDataUri?: string | null }): string {
  const lang = input.lang || "en";
  const rtl = lang === "ar";
  const q = esc(input.quote);
  const author = esc(input.author);
  const portrait = input.portraitDataUri;
  const deckId = input.deckId || "";
  const funny = deckId.startsWith("funny-quotes-");
  const islamic = isIslamicQuoteDeck(deckId);
  const christian = isChristianQuoteDeck(deckId);
  const seed = `${deckId}|${input.quote}|${input.author}`;
  const themedBg = portrait ? null : quoteFallbackBg(deckId, seed);
  const themeClass = funny ? "funny" : islamic ? "islamic" : christian ? "christian" : themedBg ? "themed" : "classic";
  const layoutClass = portrait ? "layout-portrait" : `layout-${stableIndex(seed, 4)}`;
  const pageBg = themedBg
    ? `linear-gradient(180deg, rgba(10, 9, 7, 0.36), rgba(10, 9, 7, 0.50)), url("${themedBg}") center/cover no-repeat`
    : funny
      ? "radial-gradient(circle at 18% 12%, rgba(255,255,255,.55), transparent 18%), linear-gradient(135deg, #ffb703 0%, #fb8500 48%, #e63946 100%)"
      : "linear-gradient(135deg, rgba(177, 33, 33, 0.08), transparent 35%), linear-gradient(315deg, rgba(18, 87, 94, 0.10), transparent 38%), #f7f3e8";
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; margin: 0; overflow: hidden; }
  body {
    font-family: "Noto Serif Display", "Noto Serif", "Noto Naskh Arabic", "Noto Serif Devanagari", "Noto Sans", serif;
    color: #121212;
    background: ${pageBg};
  }
  .card {
    width: 100%;
    height: 100%;
    padding: ${portrait ? "0" : "108px 86px 92px"};
    display: flex;
    flex-direction: column;
  }
  .portrait {
    height: 760px;
    background: ${portrait ? `linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.36)), url("${portrait}") center 34%/cover no-repeat` : "transparent"};
    filter: grayscale(.12) contrast(1.05);
  }
  .quote-panel {
    flex: 1;
    min-height: 0;
    padding: ${portrait ? "72px 82px 84px" : "0"};
    display: flex;
    flex-direction: column;
  }
  body.funny .quote-panel,
  body.islamic .quote-panel,
  body.christian .quote-panel,
  body.themed .quote-panel {
    padding: 78px 78px 86px;
    border-radius: 34px;
    background: rgba(255, 250, 240, .91);
    border: 5px solid rgba(20, 16, 10, .78);
    box-shadow: 0 26px 70px rgba(0,0,0,.30);
  }
  body.funny .quote-panel {
    background: rgba(255, 255, 255, .93);
    border-color: #141414;
  }
  body.islamic .quote-panel {
    background: linear-gradient(180deg, rgba(5,4,3,.72), rgba(5,4,3,.42));
    border: 1px solid rgba(230,199,137,.24);
    box-shadow: 0 24px 70px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.06);
  }
  body.christian .quote-panel {
    background: rgba(250, 247, 239, .92);
    border-color: rgba(210, 180, 110, .86);
  }
  body.layout-1 .quote-panel {
    border-radius: 62px 24px 62px 24px;
    padding: 92px 74px 92px;
  }
  body.layout-1 .body {
    align-items: flex-start;
    padding-top: 132px;
  }
  body.layout-1 .author {
    text-align: ${rtl ? "left" : "right"};
  }
  body.layout-2 .quote-panel {
    margin: 96px 0;
    border-radius: 26px;
    padding: 74px 82px 78px;
    flex: 0 0 auto;
    min-height: 1420px;
  }
  body.layout-2 .body {
    align-items: center;
  }
  body.layout-2 .mark {
    text-align: center;
  }
  body.layout-3 .quote-panel {
    border-radius: 34px;
    padding: 86px 76px 92px;
    border-left-width: 16px;
  }
  body.layout-3 .body {
    align-items: flex-end;
    padding-bottom: 86px;
  }
  body.layout-3 .quote {
    text-align: ${rtl ? "right" : "left"};
  }
  body.layout-3 .author {
    margin-top: 32px;
  }
  .rule {
    width: 132px;
    height: 10px;
    background: #12616a;
  }
  body.funny .rule { background: #fb8500; width: 180px; }
  body.islamic .rule { background: #b99a46; width: 168px; }
  body.christian .rule { background: #8a6a2e; width: 168px; }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
  }
  .quote {
    width: 100%;
    direction: ${rtl ? "rtl" : "ltr"};
    unicode-bidi: plaintext;
    white-space: pre-wrap;
    font-weight: 800;
    line-height: 1.18;
    text-align: ${rtl ? "right" : "left"};
    overflow-wrap: anywhere;
  }
  .author {
    margin-top: 44px;
    direction: ${rtl ? "rtl" : "ltr"};
    unicode-bidi: plaintext;
    font: 800 46px/1.15 "Noto Sans", "Noto Naskh Arabic", sans-serif;
    color: #12616a;
    text-align: ${rtl ? "right" : "left"};
  }
  body.funny .author { color: #b45309; }
  body.islamic .author { color: #6b5a20; }
  body.christian .author { color: #6f5521; }
  .mark {
    font-size: 120px;
    line-height: .7;
    color: rgba(123,31,31,.22);
  }
  body.funny .mark { color: rgba(251, 133, 0, .34); }
  body.islamic .mark { color: rgba(148, 119, 42, .26); }
  body.islamic .quote {
    color: #f7ecd2;
    font-family: "Noto Naskh Arabic", "Noto Sans Arabic", serif;
    font-weight: 500;
    line-height: 1.55;
    text-align: center;
    text-shadow: 0 2px 16px rgba(0,0,0,.72), 0 0 3px rgba(0,0,0,.6);
  }
  body.islamic .author {
    color: #e6c789;
    text-align: center;
    text-shadow: 0 2px 10px rgba(0,0,0,.85);
    border-top: 1px solid rgba(230,199,137,.42);
    padding-top: 18px;
  }
  body.islamic .mark { display: none; }
  body.christian .mark { color: rgba(111, 85, 33, .24); }
  .badge {
    position: absolute;
    right: 78px;
    bottom: 72px;
    font: 900 54px/1 "Noto Sans", sans-serif;
    opacity: .92;
  }
</style>
</head>
<body class="${themeClass} ${layoutClass}">
  <main class="card">
    ${portrait ? '<div class="portrait"></div>' : ""}
    <div class="quote-panel">
      <div>
        <div class="rule"></div>
      </div>
      <section class="body">
        <div>
          <div class="mark">${rtl ? "”" : "“"}</div>
          <div class="quote">${q}</div>
          <div class="author">— ${author}</div>
        </div>
      </section>
    </div>
    ${!portrait && funny ? '<div class="badge">😂</div>' : ""}
  </main>
  <script>
    (function () {
      function fit() {
        var body = document.querySelector('.body');
        var text = document.querySelector('.quote');
        var min = 38, max = 78, best = min;
        while (min <= max) {
          var mid = (min + max) >> 1;
          text.style.fontSize = mid + 'px';
          var fits = text.scrollHeight <= body.clientHeight * 0.72 && text.scrollWidth <= text.clientWidth + 2;
          if (fits) { best = mid; min = mid + 1; }
          else max = mid - 1;
        }
        text.style.fontSize = best + 'px';
        window.__fitFontPx = best;
        window.__fitted = true;
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
      else fit();
      setTimeout(function () { if (!window.__fitted) fit(); }, 1200);
    })();
  </script>
</body>
</html>`;
}

async function renderQuote(
  a: Anecdote,
  outPath: string,
  item?: PackItem,
): Promise<{ path: string; fontPx: number; bg: string }> {
  const html = quoteHtml({
    quote: a.text,
    author: a.title || getDeck(a.deck).name,
    lang: deckLang(a.deck || "") || "en",
    deckId: a.deck || "",
    portraitDataUri: dataUriFromRootRel(item?.portraitFile),
  });
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: "quote" };
}

/** Render one psychology card (the whole card is stored as JSON in a.text) via templates/psych.html. */
async function renderPsych(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: unknown;
  try {
    card = JSON.parse(a.text);
  } catch {
    // a.text wasn't a serialized card — wrap as a minimal premium card so render never crashes.
    card = { pattern: "premium", title_lines: [a.title || "", ""], items: [{ text: a.text }], outro: "" };
  }
  const html = buildPsychHtml(card as Parameters<typeof buildPsychHtml>[0]);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: "psych" };
}

/** Render one Islamic card (Quran/hadith/dua; whole card stored as JSON in a.text) via templates/islamic.html. */
async function renderIslamic(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: { type?: string; arabic?: string; ref?: string };
  try {
    card = JSON.parse(a.text);
  } catch {
    card = { type: "ayah", arabic: a.text, ref: a.title || "" };
  }
  const bg = pickIslamicBg(a.bg, a.avoidBg);
  const html = buildIslamicHtml(card as Parameters<typeof buildIslamicHtml>[0], bg);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: bg.file };
}

/** Render one Christian card (English KJV passage; whole card stored as JSON in a.text) via templates/christian.html. */
async function renderChristian(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: { type?: string; text?: string; ref?: string };
  try {
    card = JSON.parse(a.text);
  } catch {
    card = { type: "verse", text: a.text, ref: a.title || "" };
  }
  const bg = pickChristianBg(a.bg, a.avoidBg);
  const html = buildChristianHtml(card as Parameters<typeof buildChristianHtml>[0], bg);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: bg.file };
}

/** Render one RU anecdote on a themed russian_jokes scene — text in the paper safe-zone of the bg. */
async function renderRussian(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  if (!a.bg) return renderJokePop(a, outPath);
  const bg = pickRussianBg(a.bg, (a.text || "").length, a.avoidBg);
  const html = buildRussianHtml({ title: a.title, text: a.text, channel: a.channel }, bg);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: bg.file };
}

/** Render one meme card (caption + optional CC0/stock photo backdrop; whole card stored as JSON in a.text). */
async function renderMeme(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: MemeCard;
  try {
    card = JSON.parse(a.text) as MemeCard;
  } catch {
    card = { caption: a.text };
  }
  const bg = memeBackdropFor(card.caption || a.title || ""); // deterministic backdrop (photo overrides via bgCss)
  const photo = photoCss(card.photoFile);
  const html = buildMemeHtml({ ...card, bgCss: photo ?? undefined }, bg);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: card.photoFile || bg.file };
}

/** Render one meme-board card: caption band on top + the template image below (whole card JSON in a.text). */
async function renderMemeBoard(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: MemeCard;
  try {
    card = JSON.parse(a.text) as MemeCard;
  } catch {
    card = { caption: a.text };
  }
  const img = photoDataUri(card.photoFile) ?? "";
  const html = buildMemeBoardHtml(card, img);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: card.photoFile || "board" };
}

/** Render one «Что выберешь?» card (two photo options + labels + descriptions; whole card JSON in a.text). */
async function renderChoose(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  let card: ChooseCard;
  try {
    card = JSON.parse(a.text) as ChooseCard;
  } catch {
    // a.text wasn't a serialized card — degrade to a minimal card so render never crashes.
    card = { q: a.title || "Что выберешь?", a: { label: "", desc: a.text }, b: { label: "", desc: "" } };
  }
  const html = buildChooseHtml(card);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: "choose" };
}
