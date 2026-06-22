// Standalone test renderer for the meme-board layout (caption band on top + template image below).
// Reads temp/meme-recheck/selection20.json (image paths) + captions.json (idx -> caption), renders
// each to a real 1080x1920 PNG via system Chrome (same engine/auto-fit as production), and writes a
// render report. No server / deck registration needed — this validates the look before wiring the deck.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";

const ROOT = process.cwd();
const TPL = resolve(ROOT, "templates/meme-board.html");
const SEL = resolve(ROOT, "temp/meme-recheck/selection20.json");
const CAPS = resolve(ROOT, "temp/meme-recheck/captions.json");
const OUTDIR = resolve(ROOT, "temp/meme-recheck/memes-test");

interface Sel { idx: number; filename: string; original: string; mood: string; desc: string }
interface Cap { idx: number; caption: string; charCount?: number; safe?: boolean }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textHtml = (s: string) => esc(s).replace(/\r?\n/g, "<br>");
const mime = (f: string) => (/\.png$/i.test(f) ? "image/png" : "image/jpeg");

function imgDataUri(file: string): string {
  const buf = readFileSync(file);
  return `url-not-used`; // placeholder (kept for clarity); real value built below
}

async function main() {
  const sel: Sel[] = JSON.parse(readFileSync(SEL, "utf8"));
  const caps: Cap[] = JSON.parse(readFileSync(CAPS, "utf8"));
  const capByIdx = new Map(caps.map((c) => [c.idx, c]));
  const tpl = readFileSync(TPL, "utf8");
  mkdirSync(OUTDIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  const report: Array<Record<string, unknown>> = [];
  try {
    for (const s of sel) {
      const cap = capByIdx.get(s.idx);
      if (!cap) { report.push({ idx: s.idx, error: "no caption" }); continue; }
      const scaled = resolve(ROOT, `temp/meme-recheck/src-scaled/meme_src_${String(s.idx).padStart(3, "0")}.jpg`);
      const imgFile = existsSync(scaled) ? scaled : s.original;
      if (!existsSync(imgFile)) { report.push({ idx: s.idx, error: "image missing", original: s.original }); continue; }
      const out = resolve(OUTDIR, `meme_${String(s.idx).padStart(3, "0")}.png`);
      const page = await browser.newPage();
      try {
        const buf = readFileSync(imgFile);
        const dataUri = `data:${mime(imgFile)};base64,${buf.toString("base64")}`;
        const html = tpl.replace("{{IMG}}", dataUri).replace("{{TEXT}}", textHtml(cap.caption));
        await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
        await page.waitForFunction("window.__fitted === true", { timeout: 6_000 }).catch(() => {});
        const fontPx = (await page.evaluate("window.__fitFontPx").catch(() => 0)) as number;
        await page.screenshot({ path: out as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
        report.push({ idx: s.idx, caption: cap.caption, chars: (cap.caption || "").replace(/\n/g, "").length, fontPx, mood: s.mood, out, filename: s.filename });
        console.log(`#${s.idx}  fontPx=${fontPx}  «${(cap.caption || "").replace(/\n/g, " / ")}»`);
      } catch (e) {
        report.push({ idx: s.idx, error: String((e as Error).message || e) });
        console.log(`#${s.idx}  ERROR ${String((e as Error).message || e).slice(0, 80)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close();
  }
  writeFileSync(resolve(OUTDIR, "render-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\nRendered ${report.filter((r) => !r.error).length}/${sel.length} → ${OUTDIR}`);
  const errs = report.filter((r) => r.error);
  if (errs.length) console.log("ERRORS:", JSON.stringify(errs));
}

void imgDataUri; // keep tsx from flagging unused helper kept for readability
main().catch((e) => { console.error(e); process.exit(1); });
