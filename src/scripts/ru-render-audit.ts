import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { chromePath } from "../render.ts";
import {
  buildRussianHtml,
  listRussianBgs,
  pickRussianBg,
  russianSafeArea,
  RUSSIAN_BG_SAFE,
  RUSSIAN_MIN_READABLE_FONT_PX,
} from "../anecdotes/russian-bg.ts";

interface RuItem {
  id?: number;
  title: string;
  text: string;
  chars?: number;
}

interface AuditCase {
  kind: "template-worst" | "reported";
  bg: string;
  title: string;
  text: string;
  source: string;
}

interface Metrics {
  fontPx: number;
  overflow: boolean;
  overflowV: boolean;
  overflowH: boolean;
  titleOverflow: boolean;
  titleBacked: boolean;
  textInsideBody: boolean;
  fillPct: number;
  body: Rect;
  textRect: Rect;
  safeArea: { width: number; height: number; area: number };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  right: number;
  bottom: number;
}

interface AuditRow extends Metrics {
  kind: AuditCase["kind"];
  bg: string;
  title: string;
  len: number;
  source: string;
  image: string;
  ok: boolean;
  reasons: string[];
}

const args = new Map<string, string | boolean>();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? true);
}

const outDir = resolve(process.cwd(), String(args.get("out") || "data/output/ru-render-audit"));
const minFont = Number(args.get("min-font") || RUSSIAN_MIN_READABLE_FONT_PX);
const includeReported = args.get("reported") !== "false";

function itemLen(item: Pick<RuItem, "text">): number {
  return item.text.length;
}

function estimateLines(text: string, width: number): number {
  const charsPerLine = Math.max(8, Math.floor(width / (0.5 * minFont)));
  return text.split("\n").reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
}

function loadItems(): RuItem[] {
  const file = resolve(process.cwd(), "data/anecdotes/titled.json");
  return JSON.parse(existsSync(file) ? readFileSync(file, "utf8") : "[]") as RuItem[];
}

function pickWorstForBg(bg: string, items: RuItem[]): RuItem {
  const safe = RUSSIAN_BG_SAFE[bg];
  const area = russianSafeArea(safe);
  let best = items[0];
  let bestScore = -Infinity;
  for (const item of items) {
    const lines = estimateLines(item.text, area.width);
    const newlinePenalty = (item.text.match(/\n/g) || []).length * 1.4;
    const score = lines * 1000 + newlinePenalty * 100 + item.text.length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

function reportedCases(items: RuItem[]): AuditCase[] {
  const find = (title: string, needle?: string): RuItem | undefined =>
    items.find((x) => x.title === title && (!needle || x.text.includes(needle))) ??
    items.find((x) => x.title === title);
  const cases: Array<[string, string, string?]> = [
    ["russian_kitchen_table.jpg", "Про стирку"],
    ["russian_garage_workshop.jpg", "Совет соседки"],
    ["russian_banya.jpg", "Баба и принцесса"],
    ["russian_banya.jpg", "Про семью"],
    ["russian_festive_table.jpg", "Про невест"],
    ["russian_rainy_window.jpg", "Пластический хирург"],
    ["russian_winter_bus_stop.jpg", "Про деньги", "Обвиняемый"],
  ];
  return cases.flatMap(([bg, title, needle]) => {
    const item = find(title, needle);
    return item ? [{ kind: "reported" as const, bg, title: item.title, text: item.text, source: `reported:${title}` }] : [];
  });
}

async function measure(page: Page, c: AuditCase, imagePath: string): Promise<AuditRow> {
  const bg = pickRussianBg(c.bg, c.text.length);
  const html = buildRussianHtml({ title: c.title, text: c.text, channel: "Русские анекдоты" }, bg);
  await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction("window.__fitted === true", { timeout: 8_000 }).catch(() => {});
  await page.screenshot({ path: imagePath, type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  const metrics = (await page.evaluate(`(() => {
    const body = document.querySelector(".body");
    const text = document.querySelector(".text");
    const title = document.querySelector(".title");
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      };
    };
    const bodyRect = rect(body);
    const textRect = rect(text);
    const bodyStyle = getComputedStyle(body);
    const bodyContentHeight =
      body.clientHeight -
      parseFloat(bodyStyle.paddingTop || "0") -
      parseFloat(bodyStyle.paddingBottom || "0");
    const overflowV = text.scrollHeight > bodyContentHeight + 1;
    const overflowH = text.scrollWidth > text.clientWidth + 2;
    const titleOverflow = title.scrollWidth > title.clientWidth + 1;
    const titleBg = getComputedStyle(title).backgroundColor;
    const titleAlphaMatch = titleBg.match(/rgba?\\(([^)]+)\\)/);
    const titleParts = titleAlphaMatch ? titleAlphaMatch[1].split(",").map((x) => Number(x.trim())) : [];
    const titleAlpha = titleBg.startsWith("rgb(") ? 1 : (titleParts.length >= 4 ? titleParts[3] : 0);
    return {
      fontPx: Number(window.__fitFontPx || 0),
      overflow: Boolean(window.__fitOverflow),
      overflowV,
      overflowH,
      titleOverflow,
      titleBacked: titleAlpha >= 0.85,
      textInsideBody:
        textRect.x >= bodyRect.x - 2 &&
        textRect.y >= bodyRect.y - 2 &&
        textRect.right <= bodyRect.right + 2 &&
        textRect.bottom <= bodyRect.bottom + 2,
      fillPct: Math.round((1000 * text.scrollHeight) / Math.max(1, bodyContentHeight)) / 10,
      body: bodyRect,
      textRect,
    };
  })()`)) as Omit<Metrics, "safeArea">;
  const reasons: string[] = [];
  if (metrics.overflow || metrics.overflowV || metrics.overflowH) reasons.push("overflow");
  if (metrics.titleOverflow) reasons.push("title-overflow");
  if (!metrics.titleBacked) reasons.push("title-low-contrast-risk");
  if (!metrics.textInsideBody) reasons.push("text-outside-body");
  if (metrics.fontPx < minFont) reasons.push(`font<${minFont}`);
  return {
    ...metrics,
    kind: c.kind,
    bg: c.bg,
    title: c.title,
    len: c.text.length,
    source: c.source,
    image: imagePath,
    safeArea: russianSafeArea(RUSSIAN_BG_SAFE[c.bg]),
    ok: reasons.length === 0,
    reasons,
  };
}

async function makeContactSheet(browser: Browser, rows: AuditRow[], outPath: string): Promise<void> {
  const cards = await Promise.all(
    rows.map(async (r) => {
      const data = (await readFile(r.image)).toString("base64");
      const status = r.ok ? "OK" : `FAIL ${r.reasons.join(", ")}`;
      return `<article>
        <img src="data:image/png;base64,${data}">
        <div class="${r.ok ? "ok" : "bad"}">${status}</div>
        <strong>${escapeHtml(r.bg)}</strong>
        <span>${escapeHtml(r.kind)} · ${r.len} chars · ${r.fontPx}px · fill ${r.fillPct}%</span>
        <em>${escapeHtml(r.title)}</em>
      </article>`;
    }),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#eee;font-family:Arial,sans-serif;color:#111}
    h1{font-size:28px;margin:0 0 18px}
    section{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}
    article{background:#fff;border:1px solid #ccc;padding:10px}
    img{display:block;width:100%;height:auto;background:#ddd}
    div{font-size:14px;font-weight:700;margin-top:8px}.ok{color:#087a2a}.bad{color:#b00020}
    strong,span,em{display:block;font-size:12px;line-height:1.35;margin-top:4px}
  </style></head><body><h1>RU Render Audit · ${new Date().toISOString()}</h1><section>${cards.join("")}</section></body></html>`;
  const page = await browser.newPage();
  await page.setViewport({ width: 1800, height: 1400, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await mkdir(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, type: "png", fullPage: true });
  await page.close();
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  const items = loadItems();
  if (!items.length) throw new Error("data/anecdotes/titled.json is empty or missing");
  const bgs = listRussianBgs();
  const cases: AuditCase[] = bgs.map((bg) => {
    const item = pickWorstForBg(bg, items);
    return { kind: "template-worst", bg, title: item.title, text: item.text, source: `worst:${item.id ?? item.title}` };
  });
  if (includeReported) cases.push(...reportedCases(items));
  await mkdir(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  const rows: AuditRow[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    for (const c of cases) {
      const name = `${c.kind}-${basename(c.bg, ".jpg")}.png`;
      const image = resolve(outDir, c.kind, name);
      await mkdir(dirname(image), { recursive: true });
      rows.push(await measure(page, c, image));
    }
    await page.close();
    await makeContactSheet(browser, rows, resolve(outDir, "contact-sheet.png"));
  } finally {
    await browser.close();
  }
  const report = {
    generatedAt: new Date().toISOString(),
    minFont,
    totalCases: rows.length,
    failedCases: rows.filter((r) => !r.ok).length,
    failedTemplates: [...new Set(rows.filter((r) => r.kind === "template-worst" && !r.ok).map((r) => r.bg))],
    rows,
  };
  await writeFile(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
  for (const r of rows) {
    const mark = r.ok ? "OK" : `FAIL ${r.reasons.join(",")}`;
    console.log(`${mark}\t${r.kind}\t${r.bg}\tfont=${r.fontPx}\tfill=${r.fillPct}%\tlen=${r.len}\t${r.title}`);
  }
  console.log(`report: ${resolve(outDir, "report.json")}`);
  console.log(`sheet:  ${resolve(outDir, "contact-sheet.png")}`);
  if (report.failedCases) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
