// Одноразовый фикс: растеризует SVG-картинки в шаблонах пака → PNG base64,
// чтобы пройти ужесточённый валидатор (только PNG/JPEG/WEBP). См. src/template/render.ts.
import { readFile, writeFile, copyFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { chromePath } from "../src/render.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: rasterize-pack-svg.mjs <pack.json>");

const pack = JSON.parse(await readFile(file, "utf8"));
const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars"],
});

async function svgToPng(svgB64, w, h) {
  const svg = Buffer.from(svgB64, "base64").toString("utf8");
  const page = await browser.newPage();
  await page.setViewport({ width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), deviceScaleFactor: 2 });
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}
svg{display:block;width:${w}px;height:${h}px}</style>${svg}`;
  await page.setContent(html, { waitUntil: "networkidle0" });
  const buf = await page.screenshot({ type: "png", omitBackground: true });
  await page.close();
  return "data:image/png;base64," + buf.toString("base64");
}

let count = 0;
for (const t of pack.templates ?? []) {
  for (const e of t.elements ?? []) {
    if (typeof e.src === "string" && e.src.startsWith("data:image/svg+xml")) {
      const b64 = e.src.split(",", 2)[1];
      e.src = await svgToPng(b64, e.w ?? 200, e.h ?? 200);
      count++;
      console.log("rasterized", e.id, "→", Math.round(e.src.length / 1024) + "KB");
    }
  }
}

await browser.close();
await copyFile(file, file + ".pre-raster.bak");
await writeFile(file, JSON.stringify(pack));
console.log(`done: ${count} svg → png, backup ${file}.pre-raster.bak`);
