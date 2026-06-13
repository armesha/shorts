import { readFile, mkdir, writeFile } from "node:fs/promises";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(__dirname, "../../templates/anecdote.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds");

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

export interface Anecdote {
  title: string;
  text: string;
  channel: string;
  /** Texture name (e.g. "kraft.jpg"); random if omitted. */
  bg?: string;
}

/** Render one anecdote to a 1080x1920 image. Returns the fitted font size and used bg name. */
export async function renderAnecdote(
  a: Anecdote,
  outPath: string,
): Promise<{ path: string; fontPx: number; bg: string }> {
  const bgName = a.bg ?? randomBackgroundName() ?? "";
  const bgCss = backgroundCss(bgName);
  let html = await readFile(TEMPLATE, "utf8");
  html = html
    .replaceAll("{{TITLE}}", esc(a.title))
    .replace("{{TEXT}}", esc(a.text))
    .replaceAll("{{CHANNEL}}", esc(a.channel))
    .replaceAll("{{BG}}", bgCss);

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
    return { path: outPath, fontPx, bg: bgName };
  } finally {
    await browser.close();
  }
}
