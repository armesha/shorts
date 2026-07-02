// Final check: render every slot template with its REAL generated RU caption (first one) to confirm
// the assembled cards look good before the server restart. Writes PNGs to .../verify/.
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "puppeteer-core";
import { chromePath } from "../render.ts";
import { buildMemeBoardHtml, type MemeCard } from "../memes/render.ts";
import { photoDataUri } from "../memes/photos.ts";

const sel = JSON.parse(readFileSync("tmp/meme-recheck/newimg/slots-selection.json", "utf8")) as Array<{
  boardIdx: number; photoFile: string; slot: MemeCard["slot"];
}>;
const caps = new Map<number, string[]>();
for (const n of ["01", "02", "03"]) {
  const f = `tmp/meme-recheck/newimg/cap-out/slotcap-${n}.json`;
  if (!existsSync(f)) continue;
  for (const e of JSON.parse(readFileSync(f, "utf8")) as Array<{ boardIdx: number; ru: string[] }>) caps.set(e.boardIdx, e.ru);
}
const OUT = resolve("tmp/meme-recheck/newimg/verify");
mkdirSync(OUT, { recursive: true });

const browser = await launch({
  executablePath: chromePath(),
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  headless: true,
});
try {
  for (const s of sel) {
    const ru = caps.get(s.boardIdx) || ["(нет подписи)"];
    const card: MemeCard = { caption: ru[0], photoFile: s.photoFile, slot: s.slot };
    const html = buildMemeBoardHtml(card, photoDataUri(s.photoFile) ?? "");
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/v-${s.boardIdx}.png` as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await page.close();
  }
} finally {
  await browser.close();
}
console.error(`DONE ${sel.length} -> ${OUT}`);
