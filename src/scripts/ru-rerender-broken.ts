import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { loadBaseConfig } from "../../server/config.ts";
import { chromePath } from "../render.ts";
import { audioPathFor, assembleStillVideo } from "../video.ts";
import { buildRussianHtml, isRussianBgName, listRussianBgs, pickRussianBg } from "../anecdotes/russian-bg.ts";

interface VideoRow {
  id: number;
  title: string;
  text: string;
  bg: string;
  music: string;
  videoRel: string;
  imageRel: string | null;
}

const args = new Map<string, string | boolean>();
for (const raw of process.argv.slice(2)) {
  const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args.set(m[1], m[2] ?? true);
}

const apply = args.has("apply");
const imageOnly = args.has("image-only");
const limit = args.has("limit") ? Math.max(1, Number(args.get("limit"))) : 0;
const base = loadBaseConfig();
const outputDir = resolve(process.cwd(), base.outputDir);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = resolve(outputDir, "backup", `ru-rerender-${stamp}`);

function argString(name: string): string {
  const v = args.get(name);
  return typeof v === "string" ? v : "";
}

function loadFailedTemplatesFromReport(file: string): string[] {
  if (!file || !existsSync(file)) return [];
  const report = JSON.parse(readFileSync(file, "utf8")) as { failedTemplates?: unknown };
  return Array.isArray(report.failedTemplates) ? report.failedTemplates.map(String) : [];
}

function selectedBackgrounds(): Set<string> {
  const explicit = argString("bg");
  if (explicit) {
    return new Set(explicit.split(",").map((x) => x.trim()).filter(Boolean));
  }
  const report = argString("report");
  if (report && !args.has("all-russian-templates")) {
    return new Set(loadFailedTemplatesFromReport(resolve(process.cwd(), report)));
  }
  return new Set(listRussianBgs());
}

async function backupFile(abs: string, rel: string): Promise<void> {
  if (!existsSync(abs)) return;
  const dest = resolve(backupRoot, rel);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(abs, dest);
}

async function renderRuImage(page: Page, row: VideoRow, outPath: string): Promise<number> {
  const bg = pickRussianBg(row.bg, row.text.length);
  const html = buildRussianHtml({ title: row.title, text: row.text, channel: "Русские анекдоты" }, bg);
  await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction("window.__fitted === true", { timeout: 8_000 }).catch(() => {});
  const fontPx = (await page.evaluate("window.__fitFontPx").catch(() => 0)) as number;
  await mkdir(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp-${process.pid}.png`;
  await page.screenshot({ path: tmp, type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  await rename(tmp, outPath);
  return fontPx;
}

function audioPathForRow(row: VideoRow): string | null {
  if (!row.music || row.music === "none") return null;
  const p = audioPathFor(row.music);
  return existsSync(p) ? p : null;
}

async function main() {
  const bgs = selectedBackgrounds();
  const unknown = [...bgs].filter((bg) => !isRussianBgName(bg));
  if (unknown.length) throw new Error(`Unknown russian_jokes bg: ${unknown.join(", ")}`);
  if (!bgs.size) {
    console.log("No target backgrounds. If the audit passed and you still want to refresh all templates, use --all-russian-templates.");
    return;
  }

  const db = new DatabaseSync(base.dbPath);
  const rows = (db
    .prepare(
      `SELECT id, title, text, bg, music, video_rel AS videoRel, image_rel AS imageRel
       FROM videos
       WHERE deck = 'ru'
       ORDER BY id ASC`,
    )
    .all() as unknown as VideoRow[])
    .filter((row) => bgs.has(row.bg) && row.imageRel && row.videoRel);
  const picked = limit ? rows.slice(0, limit) : rows;
  console.log(`target backgrounds: ${[...bgs].join(", ")}`);
  console.log(`matched videos: ${rows.length}${limit ? `; limited to ${picked.length}` : ""}`);

  if (!apply) {
    for (const row of picked) {
      console.log(`DRY\t#${row.id}\t${row.bg}\t${row.imageRel}\t${row.videoRel}\t${row.title}`);
    }
    console.log("Dry run only. Add --apply to rewrite files with backups.");
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    for (const row of picked) {
      const imageAbs = resolve(outputDir, row.imageRel!);
      const videoAbs = resolve(outputDir, row.videoRel);
      await backupFile(imageAbs, row.imageRel!);
      if (!imageOnly) await backupFile(videoAbs, row.videoRel);
      const fontPx = await renderRuImage(page, row, imageAbs);
      if (!imageOnly) {
        const tmpVideo = `${videoAbs}.tmp-${process.pid}.mp4`;
        await assembleStillVideo(imageAbs, tmpVideo, { durationSec: 6, audioPath: audioPathForRow(row) });
        await rename(tmpVideo, videoAbs);
      }
      console.log(`OK\t#${row.id}\t${row.bg}\tfont=${fontPx}\t${row.title}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }
  console.log(`backup: ${backupRoot}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
