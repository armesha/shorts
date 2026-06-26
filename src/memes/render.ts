// Renderer for the memes deck. ORIGINAL meme cards only — never reposts copyrighted meme images.
// Backdrop is one of: a generated solid/gradient (license-free), a generated texture, or a CC0/PD
// photo fetched per-card (passed via card.bgCss). White heavy-sans caption with dark stroke + scrim
// for readability over any backdrop; binary-search auto-fit on both axes (long words never clip).
import { resolve } from "node:path";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { launch } from "puppeteer-core";
import { chromePath } from "../render.ts";

const TEMPLATE = resolve(process.cwd(), "templates/meme.html");
const BOARD_TEMPLATE = resolve(process.cwd(), "templates/meme-board.html");
const SLOT_TEMPLATE = resolve(process.cwd(), "templates/meme-slot.html");
const TEXTURE_DIR = resolve(process.cwd(), "assets/backgrounds");

export interface MemeCard {
  /** Layout id: caption | top-bottom | two-panel | list | demotivator. v1 renders all as a caption block. */
  format?: string;
  /** Single-line/relatable caption (паблик-style, POV:, "Nobody:/Me:", etc.). */
  caption?: string;
  /** Impact top text (uppercased on render). */
  topText?: string;
  /** Impact bottom text (uppercased on render). */
  bottomText?: string;
  /** Generic fallback text field. */
  text?: string;
  /** Optional small uppercase label above the caption. */
  kicker?: string;
  /** Resolved CSS background value for a per-card CC0/PD photo backdrop (data-URI or url). */
  bgCss?: string;
  /** Per-card CC0/stock photo backdrop file name (in data/memes/photos/); resolved to bgCss by the pipeline. */
  photoFile?: string;
  /** Background texture/solid name or key (when no per-card photo). */
  bg?: string;
  lang?: string;
  theme?: string;
  /** Insert-slot region (fractions 0..1 of the image): caption is auto-fit INTO this blank area. */
  slot?: { x: number; y: number; w: number; h: number };
  /** Caption ink colour for slot mode (default dark). */
  ink?: string;
}

// Dark, license-free generated backdrops (solids + gradients) → white caption always pops.
const BACKDROPS: { key: string; css: string }[] = [
  { key: "ink", css: "#0e0f13" },
  { key: "slate", css: "#15171f" },
  { key: "navy", css: "#0d1b2a" },
  { key: "plum", css: "#1b1226" },
  { key: "umber", css: "#241a14" },
  { key: "teal", css: "linear-gradient(160deg,#10242f,#06141c)" },
  { key: "violet", css: "linear-gradient(160deg,#241640,#0d0a1c)" },
  { key: "ember", css: "linear-gradient(160deg,#2e1714,#120909)" },
  { key: "forest", css: "linear-gradient(160deg,#13241a,#07120c)" },
  { key: "steel", css: "linear-gradient(160deg,#1f2937,#0b1220)" },
];

// Caption is centered; extra bottom padding keeps text clear of the Shorts mobile UI (buttons/caption).
const DEFAULT_SAFE: [number, number, number, number] = [210, 120, 360, 120];

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textHtml = (s: unknown) => esc(s).replace(/\r?\n/g, "<br>");

export interface MemeBg {
  file: string;
  css: string;
  safe: [number, number, number, number];
}

function textureCss(file: string): string | null {
  const p = resolve(TEXTURE_DIR, file);
  if (!existsSync(p)) return null;
  const buf = readFileSync(p);
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

export function listMemeTextures(): string[] {
  if (!existsSync(TEXTURE_DIR)) return [];
  return readdirSync(TEXTURE_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
}

/** Pick a backdrop: a named texture file, else a random generated solid/gradient. */
export function pickMemeBg(name?: string | null, avoidName?: string | null): MemeBg {
  if (name && /\.(jpe?g|png)$/i.test(name)) {
    const css = textureCss(name);
    if (css) return { file: name, css, safe: DEFAULT_SAFE };
  }
  let pool = BACKDROPS;
  if (avoidName && BACKDROPS.length > 1) {
    const without = BACKDROPS.filter((b) => b.key !== avoidName);
    if (without.length) pool = without;
  }
  const b = name
    ? BACKDROPS.find((x) => x.key === name) ?? pool[Math.floor(Math.random() * pool.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  return { file: b.key, css: b.css, safe: DEFAULT_SAFE };
}

/** Deterministic backdrop for a typographic card: same caption → same generated solid/gradient, so a
 *  Gallery thumbnail always matches what actually gets rendered (no per-render randomness). */
export function memeBackdropFor(seed: string): MemeBg {
  const s = seed || "";
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  const b = BACKDROPS[h % BACKDROPS.length];
  return { file: b.key, css: b.css, safe: DEFAULT_SAFE };
}

/** The caption text for a card: explicit caption, else top/bottom joined, else generic text. */
function captionOf(card: MemeCard): string {
  if (card.caption && card.caption.trim()) return card.caption.trim();
  const tb = [card.topText, card.bottomText].filter((s) => s && s.trim()).map((s) => String(s).toUpperCase());
  if (tb.length) return tb.join("\n");
  return (card.text || "").trim();
}

export function buildMemeHtml(card: MemeCard, bg: MemeBg): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const [t, r, b, l] = bg.safe;
  const css = card.bgCss && card.bgCss.trim() ? card.bgCss : bg.css;
  return tpl
    .replace("{{BG}}", css)
    .replaceAll("{{SAFE_TOP}}", String(t))
    .replaceAll("{{SAFE_RIGHT}}", String(r))
    .replaceAll("{{SAFE_BOTTOM}}", String(b))
    .replaceAll("{{SAFE_LEFT}}", String(l))
    .replace("{{KICKER}}", esc(card.kicker || ""))
    .replace("{{TEXT}}", textHtml(captionOf(card)));
}

/** Board layout (templates/meme-board.html): caption band on top + the template image below (raw
 *  data-URI <img>, object-fit:contain so reaction images / comic panels are never cropped). The
 *  caption auto-fits a height-capped band; the image keeps the rest of the 1080x1920 frame. */
export function buildMemeBoardHtml(card: MemeCard, imgDataUri: string): string {
  if (card.slot) return buildMemeSlotHtml(card, imgDataUri);
  const tpl = readFileSync(BOARD_TEMPLATE, "utf8");
  return tpl
    .replace("{{IMG}}", imgDataUri || "")
    .replace("{{TEXT}}", textHtml(captionOf(card)));
}

/** Insert-slot layout (templates/meme-slot.html): caption auto-fit INTO a blank region of the image
 *  (card.slot = {x,y,w,h} as fractions of the image). For "fill the sign/screen/billboard" templates. */
export function buildMemeSlotHtml(card: MemeCard, imgDataUri: string): string {
  const tpl = readFileSync(SLOT_TEMPLATE, "utf8");
  const slot = card.slot ?? { x: 0.1, y: 0.6, w: 0.8, h: 0.32 };
  return tpl
    .replace("{{IMG}}", imgDataUri || "")
    .replace("{{TEXT}}", textHtml(captionOf(card)))
    .replace("{{SLOT}}", JSON.stringify(slot))
    .replace("{{INK}}", esc(card.ink || "#141414"));
}

/** Standalone preview render (used by scripts). The pipeline uses src/anecdotes/render.ts dispatch. */
export async function renderMemeCard(
  card: MemeCard,
  outPath: string,
  bgName?: string,
): Promise<{ bg: string; fontPx: number }> {
  const bg = pickMemeBg(bgName);
  const html = buildMemeHtml(card, bg);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  const browser = await launch({
    executablePath: chromePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    const fontPx = (await page.evaluate("window.__fitFontPx").catch(() => 0)) as number;
    await page.screenshot({ path: outPath as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    return { bg: bg.file, fontPx };
  } finally {
    await browser.close();
  }
}
