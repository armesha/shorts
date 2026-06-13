import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import { getDeck } from "./decks.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, "../../templates/anecdote.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds");
const LIFEHACK_TEMPLATE = resolve(__dirname, "../../templates/lifehack.html");
const LIFEHACK_BG_DIR = resolve(process.cwd(), "assets/backgrounds/lifehacks");

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

/** Resolve a texture name to a CSS background value (inlined data-URI), or a solid fallback. */
export function backgroundCss(name?: string | null): string {
  const files = listBackgrounds();
  if (files.length === 0) return SOLID_FALLBACK[Math.floor(Math.random() * SOLID_FALLBACK.length)];
  const file = name && files.includes(name) ? name : files[Math.floor(Math.random() * files.length)];
  const buf = readFileSync(resolve(BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

/**
 * Pick a lifehack background by profession key. A deck variant (e.g. "chaplin") selects the
 * `profession_<key>_<variant>.jpg` set (men with a moustache); no variant → the plain
 * `profession_<key>.jpg`. Falls back to the plain bg, then a random one of the right style.
 */
function lifehackBgFile(profession?: string | null, variant?: string | null): string | null {
  if (!existsSync(LIFEHACK_BG_DIR)) return null;
  const all = readdirSync(LIFEHACK_BG_DIR).filter((f) => /^profession_.*\.(jpe?g|png)$/i.test(f));
  if (all.length === 0) return null;
  const v = (variant ?? "").toLowerCase();
  // Style pool: variant → profession_<key>_<variant>.* ; plain → bare profession_<key>.* (no suffix).
  const styled = v
    ? all.filter((f) => new RegExp(`^profession_[a-z0-9]+_${v}\\.(jpe?g|png)$`, "i").test(f))
    : all.filter((f) => /^profession_[a-z0-9]+\.(jpe?g|png)$/i.test(f));
  const pool = styled.length ? styled : all;
  if (profession) {
    const key = profession.toLowerCase();
    const prefix = v ? `profession_${key}_${v}.` : `profession_${key}.`;
    const want =
      pool.find((f) => f.toLowerCase().startsWith(prefix)) ??
      all.find((f) => f.toLowerCase().startsWith(`profession_${key}.`)); // missing variant → plain
    if (want) return want;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Resolve a profession (+ deck variant) to a CSS background (inlined data-URI) + the file name used. */
function lifehackBgCss(profession?: string | null, variant?: string | null): { css: string; name: string } {
  const file = lifehackBgFile(profession, variant);
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
  /** Deck id — for lifehack decks (tips, tips-de) the profession layout is used instead. */
  deck?: string;
  /** Profession key for the lifehack background (tips deck only); random if omitted. */
  profession?: string;
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
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
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
): Promise<{ path: string; fontPx: number; bg: string }> {
  if (getDeck(a.deck).lifehack) return renderLifehack(a, outPath);
  const bgName = a.bg ?? randomBackgroundName() ?? "";
  const bgCss = backgroundCss(bgName);
  let html = await readFile(TEMPLATE, "utf8");
  html = html
    .replaceAll("{{TITLE}}", esc(a.title))
    .replace("{{TEXT}}", esc(a.text))
    .replaceAll("{{CHANNEL}}", esc(a.channel))
    .replaceAll("{{BG}}", bgCss);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: bgName };
}

/** Render one lifehack/tip onto its profession template (title → red banner, text → the paper). */
async function renderLifehack(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  const { css, name } = lifehackBgCss(a.profession, getDeck(a.deck).lifehackVariant);
  let html = await readFile(LIFEHACK_TEMPLATE, "utf8");
  html = html
    .replaceAll("{{TITLE}}", esc(a.title))
    .replace("{{TEXT}}", esc(a.text))
    .replaceAll("{{BG}}", css);
  const fontPx = await captureCard(html, outPath);
  return { path: outPath, fontPx, bg: name || (a.profession ?? "") };
}
