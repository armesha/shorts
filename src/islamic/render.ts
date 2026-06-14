// Renderer for the Islamic deck (Quran ayahs + hadith + dua, exact Arabic).
// Dark gold-on-black backgrounds (assets/backgrounds/islamic_templates) → light RTL text,
// auto-fit to fill each background's "safe zone" (the empty area inside its golden frame).
import { resolve } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { launch } from "puppeteer-core";

const TEMPLATE = resolve(process.cwd(), "templates/islamic.html");
const CARDS_FILE = resolve(process.cwd(), "data/islamic/cards.json");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds/islamic_templates");
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"].find(
    (p) => existsSync(p),
  ) ||
  "google-chrome";

export interface IslamicCard {
  type: "ayah" | "hadith" | "dua" | string;
  arabic: string;
  ref: string; // Arabic reference (also the card title) — one line
  ref_en?: string;
  theme?: string;
}

// Per-background text safe-zone [top, right, bottom, left] in px on the 1080×1920 canvas.
// Keeps the verse off the golden frame / crescent / lantern / mosque / book of each bg.
const SAFE: Record<string, [number, number, number, number]> = {
  "islamic_crescent.jpg": [480, 100, 380, 100],
  "islamic_gold_rosette.jpg": [470, 110, 300, 110],
  "islamic_lantern_beads.jpg": [235, 300, 345, 195],
  "islamic_light_beam.jpg": [540, 110, 360, 110],
  "islamic_mosque_arch.jpg": [330, 140, 200, 150],
  "islamic_mosque_silhouette.jpg": [330, 110, 470, 110],
  "islamic_open_book.jpg": [640, 100, 230, 100],
  "islamic_prayer_rug.jpg": [305, 195, 305, 195],
  "islamic_quran_corner.jpg": [600, 100, 230, 100],
  "islamic_quran_header.jpg": [640, 110, 230, 110],
};
const DEFAULT_SAFE: [number, number, number, number] = [380, 120, 360, 120];

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function listIslamicBgs(): string[] {
  if (!existsSync(BG_DIR)) return [];
  return readdirSync(BG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
}

function bgCss(file: string): string {
  const buf = readFileSync(resolve(BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

export interface IslamicBg {
  file: string;
  css: string;
  safe: [number, number, number, number];
}

/** Choose a background (by name, else random) and resolve its CSS + safe-zone. */
export function pickIslamicBg(name?: string | null): IslamicBg {
  const files = listIslamicBgs();
  if (files.length === 0) return { file: "", css: "#0a0a0a", safe: DEFAULT_SAFE };
  const file = name && files.includes(name) ? name : files[Math.floor(Math.random() * files.length)];
  return { file, css: bgCss(file), safe: SAFE[file] ?? DEFAULT_SAFE };
}

export function listIslamicCards(): IslamicCard[] {
  try {
    return JSON.parse(readFileSync(CARDS_FILE, "utf8")) as IslamicCard[];
  } catch {
    return [];
  }
}

export function buildIslamicHtml(card: IslamicCard, bg: IslamicBg): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const [t, r, b, l] = bg.safe;
  return tpl
    .replaceAll("{{TITLE_PLAIN}}", card.ref || "")
    .replace("{{BG}}", bg.css)
    .replaceAll("{{SAFE_TOP}}", String(t))
    .replaceAll("{{SAFE_RIGHT}}", String(r))
    .replaceAll("{{SAFE_BOTTOM}}", String(b))
    .replaceAll("{{SAFE_LEFT}}", String(l))
    .replaceAll("{{TYPE}}", esc(card.type || "ayah"))
    .replace("{{ARABIC}}", esc(card.arabic))
    .replace("{{REF}}", esc(card.ref));
}

/** Standalone preview render (used by scripts). The pipeline uses src/anecdotes/render.ts. */
export async function renderIslamicCard(
  card: IslamicCard,
  outPath: string,
  bgName?: string,
): Promise<{ bg: string; fontPx: number }> {
  const bg = pickIslamicBg(bgName);
  const html = buildIslamicHtml(card, bg);
  const browser = await launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {
      /* fonts api missing — proceed */
    }
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    const fontPx = (await page.evaluate("window.__fitFontPx").catch(() => 0)) as number;
    await page.screenshot({ path: outPath as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    return { bg: bg.file, fontPx };
  } finally {
    await browser.close();
  }
}
