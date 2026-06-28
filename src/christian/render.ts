// Renderer for the Christian deck (English KJV Bible passages, exact public-domain text).
// Dark gold-framed protestant backgrounds (assets/backgrounds/christian_protestant_templates) →
// light cream serif text, auto-fit to fill each background's "safe zone" (its empty area).
import { resolve } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { launch } from "puppeteer-core";

const TEMPLATE = resolve(process.cwd(), "templates/christian.html");
const CARDS_FILE = resolve(process.cwd(), "data/christian/cards.json");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds/christian_protestant_templates");
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"].find(
    (p) => existsSync(p),
  ) ||
  "google-chrome";

export interface ChristianCard {
  type: "verse" | string;
  text: string; // the exact KJV passage (LTR English)
  ref: string; // reference, e.g. "John 3:16-17" — also the card title (one line)
  theme?: string;
  book?: string;
  testament?: string;
}

// Per-background text safe-zone [top, right, bottom, left] in px on the 1080×1920 canvas.
// Keeps the verse off the focal object (bible / cross / candle / church / window) of each bg.
const SAFE: Record<string, [number, number, number, number]> = {
  "protestant_bible_corner.jpg": [600, 110, 180, 110],      // bible book top-right → text below
  "protestant_candle_cross.jpg": [150, 150, 690, 130],      // candle+cross bottom-right → text upper
  "protestant_chapel_silhouette.jpg": [170, 130, 520, 130], // church bottom-center → text upper
  "protestant_forest_sunrise.jpg": [170, 140, 720, 140],    // cross+trees+sunrise bottom → text upper
  "protestant_minimal_cross.jpg": [340, 150, 200, 150],     // small cross top-center → text below
  "protestant_open_bible.jpg": [700, 120, 180, 120],        // open book top → text below
  "protestant_pulpit_bible.jpg": [160, 185, 470, 185],      // pulpit+book bottom, sconces sides → upper, narrower
  "protestant_stained_glass.jpg": [600, 130, 200, 130],     // window top-left → text below
  "protestant_wooden_cross.jpg": [740, 130, 180, 130],      // window+cross top → text below (big empty)
  "protestant_worship_hall.jpg": [240, 410, 520, 140],      // cross upper-right, pews bottom → left-center (extra right pad clears cross)
  "protestant_photo_empty_pews.jpg": [220, 430, 560, 140],  // cross upper-right, pews bottom → left-center (extra right pad clears cross)
  "protestant_photo_hill_cross.jpg": [180, 140, 760, 200],  // cross lower-left, sunset bottom → top sky
  "protestant_photo_pulpit_bible.jpg": [180, 150, 640, 150],// pulpit+bible bottom → text upper
  "protestant_photo_rainy_bible.jpg": [210, 470, 560, 150], // rainy window right, bible bottom → left column
  "protestant_photo_wooden_church.jpg": [170, 150, 1040, 150], // church right, sky top → top band
  "protestant_ai_stained_glow.jpg": [300, 150, 310, 150],
  "protestant_ai_open_bible_glow.jpg": [260, 135, 520, 135],
  "protestant_ai_hill_sunrise.jpg": [230, 150, 560, 180],
  "protestant_ai_candle_arch.jpg": [260, 150, 420, 150],
  "protestant_ai_glass_border.jpg": [300, 170, 320, 170],
  "protestant_ai_empty_pews_warm.jpg": [230, 140, 560, 140],
  "protestant_ai_parchment_frame.jpg": [300, 145, 300, 145],
  "protestant_ai_walnut_cross.jpg": [300, 145, 430, 145],
  "protestant_ai_lake_chapel.jpg": [230, 145, 540, 145],
  "protestant_ai_ruby_glass.jpg": [300, 170, 320, 170],
  "protestant_ai_olive_branch.jpg": [290, 150, 420, 150],
  "protestant_ai_rainy_window.jpg": [260, 160, 360, 160],
  "protestant_ai_forest_path.jpg": [240, 150, 540, 150],
  "protestant_ai_stone_arch.jpg": [270, 150, 430, 150],
  "protestant_ai_emerald_cloth.jpg": [310, 145, 310, 145],
};
const DEFAULT_SAFE: [number, number, number, number] = [320, 130, 320, 130];

const VISUAL_BACKGROUND_FILES = [
  "protestant_ai_candle_arch.jpg",
  "protestant_ai_empty_pews_warm.jpg",
  "protestant_ai_forest_path.jpg",
  "protestant_ai_glass_border.jpg",
  "protestant_ai_hill_sunrise.jpg",
  "protestant_ai_lake_chapel.jpg",
  "protestant_ai_olive_branch.jpg",
  "protestant_ai_open_bible_glow.jpg",
  "protestant_ai_rainy_window.jpg",
  "protestant_ai_ruby_glass.jpg",
  "protestant_ai_stained_glow.jpg",
  "protestant_ai_stone_arch.jpg",
  "protestant_ai_walnut_cross.jpg",
  "protestant_bible_corner.jpg",
  "protestant_candle_cross.jpg",
  "protestant_chapel_silhouette.jpg",
  "protestant_forest_sunrise.jpg",
  "protestant_minimal_cross.jpg",
  "protestant_open_bible.jpg",
  "protestant_photo_empty_pews.jpg",
  "protestant_photo_hill_cross.jpg",
  "protestant_photo_pulpit_bible.jpg",
  "protestant_photo_rainy_bible.jpg",
  "protestant_photo_wooden_church.jpg",
  "protestant_pulpit_bible.jpg",
  "protestant_stained_glass.jpg",
  "protestant_wooden_cross.jpg",
  "protestant_worship_hall.jpg",
] as const;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function listChristianBgs(): string[] {
  if (!existsSync(BG_DIR)) return [];
  const files = new Set(readdirSync(BG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)));
  return VISUAL_BACKGROUND_FILES.filter((file) => files.has(file)).sort();
}

function bgCss(file: string): string {
  const buf = readFileSync(resolve(BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

export interface ChristianBg {
  file: string;
  css: string;
  safe: [number, number, number, number];
}

/** Choose a background (by name, else random) and resolve its CSS + safe-zone. */
export function pickChristianBg(name?: string | null, avoidName?: string | null): ChristianBg {
  const files = listChristianBgs();
  if (files.length === 0) return { file: "", css: "#0a0a0a", safe: DEFAULT_SAFE };
  let pool = files;
  if (!name && avoidName && files.length > 1) {
    const withoutPrevious = files.filter((f) => f !== avoidName);
    if (withoutPrevious.length) pool = withoutPrevious;
  }
  const file = name && files.includes(name) ? name : pool[Math.floor(Math.random() * pool.length)];
  return { file, css: bgCss(file), safe: SAFE[file] ?? DEFAULT_SAFE };
}

export function listChristianCards(): ChristianCard[] {
  try {
    return JSON.parse(readFileSync(CARDS_FILE, "utf8")) as ChristianCard[];
  } catch {
    return [];
  }
}

/** Reference + small translation tag for the gold line, e.g. "John 3:16-17 · KJV". */
function refLine(card: ChristianCard): string {
  const ref = (card.ref || "").trim();
  return ref ? `${ref} · KJV` : "King James Version";
}

export function buildChristianHtml(card: ChristianCard, bg: ChristianBg): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const [t, r, b, l] = bg.safe;
  return tpl
    .replace("{{BG}}", bg.css)
    .replaceAll("{{SAFE_TOP}}", String(t))
    .replaceAll("{{SAFE_RIGHT}}", String(r))
    .replaceAll("{{SAFE_BOTTOM}}", String(b))
    .replaceAll("{{SAFE_LEFT}}", String(l))
    .replace("{{TEXT}}", esc(card.text))
    .replace("{{REF}}", esc(refLine(card)));
}

/** Standalone preview render (used by scripts). The pipeline uses src/anecdotes/render.ts. */
export async function renderChristianCard(
  card: ChristianCard,
  outPath: string,
  bgName?: string,
): Promise<{ bg: string; fontPx: number }> {
  const bg = pickChristianBg(bgName);
  const html = buildChristianHtml(card, bg);
  const browser = await launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    // networkidle0 waits for fonts/images; valid at runtime — puppeteer-core@25's setContent type omits it.
    await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
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
