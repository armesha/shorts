import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = resolve(__dirname, "../templates/short.html");

export interface ShortTheme {
  bg?: string;
  ink?: string;
  markerFrom?: string;
  markerTo?: string;
}

export interface ShortContent {
  /** Highlighted heading, e.g. "6 PSYCHOLOGISCHE FAKTEN" */
  title: string;
  /** Exactly the body items; aim for ~6 so the frame fills evenly. Markdown **bold** is supported. */
  facts: string[];
  /** Handwritten signature bottom-right (channel name) */
  channel: string;
  lang?: string;
  theme?: ShortTheme;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Convert markdown-style **bold** to <b> AFTER escaping, so models can emphasize key words. */
const mdBold = (s: string): string => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

const fmt = (s: string): string => mdBold(esc(s));

/** Locate a usable Chrome/Chromium binary across Windows / macOS / Linux (no download). */
export function chromePath(): string {
  const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.CHROME_PATH,
    // Linux
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    // Windows
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local ? `${local}\\Google\\Chrome\\Application\\chrome.exe` : "",
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean) as string[];
  const found = candidates.find((p) => existsSync(p));
  if (!found)
    throw new Error("Chrome/Chromium не найден. Установи Google Chrome или задай CHROME_PATH в .env");
  return found;
}

/** Fill the .html template with content -> a complete HTML document string. */
export async function fillTemplate(content: ShortContent): Promise<string> {
  let html = await readFile(TEMPLATE_PATH, "utf8");

  const factsHtml = content.facts
    .map(
      (f, i) =>
        `<div class="fact"><span class="n">${i + 1}.</span> ${fmt(f)}</div>`,
    )
    .join("\n      ");

  html = html
    .replaceAll("{{LANG}}", esc(content.lang ?? "en"))
    .replaceAll("{{TITLE}}", fmt(content.title))
    .replace("{{FACTS}}", factsHtml)
    .replaceAll("{{CHANNEL}}", esc(content.channel));

  // Optional per-video theme override (variety across uploads).
  const t = content.theme;
  if (t) {
    const vars = [
      t.bg && `--bg:${t.bg};`,
      t.ink && `--ink:${t.ink};`,
      t.markerFrom && `--marker-from:${t.markerFrom};`,
      t.markerTo && `--marker-to:${t.markerTo};`,
    ]
      .filter(Boolean)
      .join("");
    if (vars) html = html.replace("</head>", `<style>:root{${vars}}</style></head>`);
  }
  return html;
}

/**
 * Render the filled template to a 1080x1920 image (PNG, or JPEG if outPath ends in .jpg).
 * Reuses a single browser if you pass one; otherwise launches & closes one.
 */
export async function renderToImage(
  content: ShortContent,
  outPath: string,
): Promise<string> {
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
    const html = await fillTemplate(content);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30_000 });
    // Wait for the shrink-to-fit pass (and fonts) to finish.
    await page
      .waitForFunction("window.__fitted === true", { timeout: 5_000 })
      .catch(() => {});

    const isJpg = /\.jpe?g$/i.test(outPath);
    const buf = await page.screenshot({
      type: isJpg ? "jpeg" : "png",
      ...(isJpg ? { quality: 92 } : {}),
      clip: { x: 0, y: 0, width: 1080, height: 1920 },
    });

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    return outPath;
  } finally {
    await browser.close();
  }
}
