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
import { lifehackTemplateStyle, pickLifehackTemplate } from "./lifehack-templates.ts";
import type { PackItem } from "./library.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, "../../templates/anecdote.html");
const POP_JOKE_TEMPLATE = resolve(__dirname, "../../templates/anecdote-pop.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds");
const LIFEHACK_TEMPLATE = resolve(__dirname, "../../templates/lifehack.html");
const LIFEHACK_BG_DIR = resolve(process.cwd(), "assets/backgrounds/lifehacks");

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

/** Pick a deterministic lifehack background from generated/editorial/profession pools. */
function stableIndex(seed: string, size: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % size;
}

function lifehackBgFile(profession?: string | null, variant?: string | null, seed = ""): string | null {
  if (!existsSync(LIFEHACK_BG_DIR)) return null;
  const files = readdirSync(LIFEHACK_BG_DIR)
    .filter((f) => /^(editorial-clean-\d+|generated-[a-z0-9-]+|profession_.*)\.(png|jpe?g)$/i.test(f))
    .sort();
  if (files.length === 0) return null;
  const v = (variant ?? "").toLowerCase();
  const professionFiles = files.filter((f) => /^profession_.*\.(jpe?g|png)$/i.test(f));
  const generatedFiles = files.filter((f) => /^generated-[a-z0-9-]+\.(png|jpe?g)$/i.test(f));
  if (profession) {
    const key = profession.toLowerCase();
    const exact = [
      v ? `profession_${key}_${v}` : "",
      `profession_${key}`,
    ].filter(Boolean);
    const candidates = professionFiles.filter((f) => exact.some((prefix) => f.toLowerCase().startsWith(`${prefix}.`)));
    if (candidates.length) return candidates[stableIndex(seed || `${profession}|${variant}`, candidates.length)];
    if (generatedFiles.length) return generatedFiles[stableIndex(seed || `${profession}|${variant}`, generatedFiles.length)];
  }
  return files[stableIndex(seed || `${profession ?? ""}|${variant ?? ""}`, files.length)];
}

/** Resolve a profession (+ deck variant) to a CSS background (inlined data-URI) + the file name used. */
function lifehackBgCss(profession?: string | null, variant?: string | null, seed = ""): { css: string; name: string } {
  const file = lifehackBgFile(profession, variant, seed);
  if (!file) return { css: "#ffffff", name: "" };
  const buf = readFileSync(resolve(LIFEHACK_BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return {
    css: `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`,
    name: file,
  };
}

export interface Anecdote {
  title: string;
  text: string;
  channel: string;
  /** Texture name (e.g. "kraft.jpg"); random if omitted. */
  bg?: string;
  /** Best-effort exclusion for random background selection. */
  avoidBg?: string;
  /** Deck id — lifehack decks use the dedicated editorial template. */
  deck?: string;
  /** Legacy profession key retained for source stats/template seeding. */
  profession?: string;
  /** QA/testing hook: force one of the pop joke template variants. */
  visualVariant?: string;
}

/** Shared Chrome capture: load HTML, wait for the auto-fit, screenshot a 1080x1920 PNG. */
async function captureCard(html: string, outPath: string): Promise<number> {
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
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await writeFile(outPath, buf);
    return fontPx;
  } finally {
    await browser.close();
  }
}

/** Render one anecdote (or a lifehack, for lifehack decks) to a 1080x1920 image. */
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
  if (deck.lifehack) return renderLifehack(a, outPath);
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
] as const;

const JOKE_EMOJIS = ["😂", "🤣", "😆", "😹", "😁"];
const JOKE_LABELS: Record<string, string> = {
  ru: "СМЕХ",
  de: "LACHEN",
  it: "RISATE",
  fr: "RIRE",
  en: "LAUGH",
  pt: "RISOS",
  es: "RISAS",
  ar: "ضحك",
  hi: "हँसी",
  id: "TAWA",
};
const JOKE_DOODLES = ["HA!", "LOL", "WOW", ":-)", "!!", "HEH", "FUN"];

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

function buildJokePopHtml(input: { title: string; text: string; deckId?: string; visualVariant?: string }): { html: string; variant: string } {
  const deck = getDeck(input.deckId);
  const lang = deckLang(deck.id) || "ru";
  const rtl = lang === "ar";
  const seed = `${deck.id}|${input.title}|${input.text}`;
  const h = stableHashString(seed);
  const variant = jokeVariant({ title: input.title, text: input.text, channel: deck.name, deck: deck.id, visualVariant: input.visualVariant });
  const dense = input.text.length > 430 || /\n(?:.*\n){7,}/.test(input.text);
  const emoji = JOKE_EMOJIS[(h >>> 3) % JOKE_EMOJIS.length];
  const label = JOKE_LABELS[lang] ?? "FUN";
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
      .replaceAll("{{EMOJI}}", emoji)
      .replaceAll("{{DOODLE}}", esc(doodle))
      .replaceAll("{{LABEL}}", esc(label))
      .replaceAll("{{TITLE}}", esc(input.title || deck.name))
      .replace("{{TEXT}}", esc(input.text)),
  };
}

async function renderJokePop(a: Anecdote, outPath: string): Promise<{ path: string; fontPx: number; bg: string }> {
  const { html, variant } = buildJokePopHtml({ title: a.title, text: a.text, deckId: a.deck, visualVariant: a.visualVariant });
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: `pop:${variant}` };
}

function quoteHtml(input: { quote: string; author: string; lang: string; channel: string; portraitDataUri?: string | null }): string {
  const lang = input.lang || "en";
  const rtl = lang === "ar";
  const q = esc(input.quote);
  const author = esc(input.author);
  const channel = esc(input.channel);
  const portrait = input.portraitDataUri;
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
    background:
      linear-gradient(135deg, rgba(177, 33, 33, 0.08), transparent 35%),
      linear-gradient(315deg, rgba(18, 87, 94, 0.10), transparent 38%),
      #f7f3e8;
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
  .kicker {
    direction: ${rtl ? "rtl" : "ltr"};
    font: 800 32px/1 "Noto Sans", "Noto Naskh Arabic", sans-serif;
    letter-spacing: 0;
    text-transform: uppercase;
    color: #7b1f1f;
    text-align: ${rtl ? "right" : "left"};
  }
  .rule {
    width: 132px;
    height: 10px;
    margin-top: 28px;
    background: #12616a;
  }
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
  .footer {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: end;
    font: 700 28px/1.2 "Noto Sans", "Noto Naskh Arabic", sans-serif;
    color: rgba(18,18,18,.58);
  }
  .mark {
    font-size: 120px;
    line-height: .7;
    color: rgba(123,31,31,.22);
  }
</style>
</head>
<body>
  <main class="card">
    ${portrait ? '<div class="portrait"></div>' : ""}
    <div class="quote-panel">
      <div>
        <div class="kicker">${channel}</div>
        <div class="rule"></div>
      </div>
      <section class="body">
        <div>
          <div class="mark">${rtl ? "”" : "“"}</div>
          <div class="quote">${q}</div>
          <div class="author">— ${author}</div>
        </div>
      </section>
      <footer class="footer">
        <span>${lang.toUpperCase()}</span>
        <span>SHORTS</span>
      </footer>
    </div>
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
    channel: getDeck(a.deck).name,
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

/** Render one lifehack/tip onto the editorial top-safe template. */
async function renderLifehack(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  const { css, name } = lifehackBgCss(a.profession, getDeck(a.deck).lifehackVariant, `${a.deck}|${a.title}|${a.text}`);
  const template = pickLifehackTemplate({ deck: a.deck, profession: a.profession, title: a.title, text: a.text });
  const lang = deckLang(a.deck ?? "") || "en";
  let html = await readFile(LIFEHACK_TEMPLATE, "utf8");
  html = html
    .replaceAll("{{LANG}}", esc(lang))
    .replaceAll("{{DIR}}", lang === "ar" ? "rtl" : "ltr")
    .replaceAll("{{TITLE}}", esc(a.title))
    .replace("{{TEXT}}", esc(a.text))
    .replaceAll("{{BG}}", css)
    .replaceAll("{{TEMPLATE_CLASS}}", `layout-${template.layout}`)
    .replaceAll("{{TEMPLATE_ID}}", template.id)
    .replaceAll("{{STYLE}}", lifehackTemplateStyle(template));
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: name || (a.profession ?? "") };
}
