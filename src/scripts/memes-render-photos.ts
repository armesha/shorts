// Batch-render every photo-backed meme composite (one browser, fast) for VISUAL REVIEW.
// Reads a content snapshot (default /tmp/meme-review-src.json), renders cards that have photoFile to
// /tmp/meme-review/raw/NNNN.png + writes manifest.json (idx → lang/cardIdx/photoFile/caption).
// Run: npx tsx src/scripts/memes-render-photos.ts [src.json]
import { launch } from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromePath } from "../render.ts";
import { buildMemeHtml, pickMemeBg } from "../memes/render.ts";
import { photoCss } from "../memes/photos.ts";

const SRC = process.argv[2] || "/tmp/meme-review-src.json";
const OUT = "/tmp/meme-review";
mkdirSync(`${OUT}/raw`, { recursive: true });

const content = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, { caption?: string; photoFile?: string }[]>;
const cards: { lang: string; cardIdx: number; caption: string; photoFile: string }[] = [];
for (const [lang, arr] of Object.entries(content)) {
  arr.forEach((c, i) => {
    if (c.photoFile) cards.push({ lang, cardIdx: i, caption: c.caption || "", photoFile: c.photoFile });
  });
}

const run = async () => {
  const browser = await launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const manifest: { idx: number; lang: string; cardIdx: number; photoFile: string; caption: string }[] = [];
  let idx = 0;
  for (const c of cards) {
    const css = photoCss(c.photoFile);
    if (!css) continue; // file missing → would render typographic; skip from photo review
    const html = buildMemeHtml({ caption: c.caption, bgCss: css }, pickMemeBg());
    try {
      await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
      await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
      const name = `${String(idx).padStart(4, "0")}.png`;
      await page.screenshot({ path: `${OUT}/raw/${name}` as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
      manifest.push({ idx, lang: c.lang, cardIdx: c.cardIdx, photoFile: c.photoFile, caption: c.caption.slice(0, 80) });
      idx++;
      if (idx % 40 === 0) console.log(`  ...${idx}`);
    } catch (e) {
      console.error(`  render fail ${c.lang}#${c.cardIdx}: ${(e as Error).message}`);
    }
  }
  await browser.close();
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`rendered ${idx} composites → ${OUT}/raw/ (manifest: ${manifest.length})`);
};
run();
