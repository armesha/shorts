import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromePath } from "../render.ts";

// Procedural textures matching the 8 Pencil background looks (Pencil export is broken,
// so these are controllable look-alikes). Each carries a `dark` flag for adaptive text color.
const OUT = resolve(process.cwd(), "assets/backgrounds");
await mkdir(OUT, { recursive: true });

interface Tex {
  name: string;
  dark: boolean;
  bg: string;
  freq: string;
  noiseOpacity: number;
  blend?: string;
  oct?: number;
  extra?: string;
  veins?: string;
}

const tpl = (c: Tex) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1080px;height:1920px}
  .t{width:1080px;height:1920px;position:relative;background:${c.bg};overflow:hidden}
  .noise{position:absolute;inset:0;opacity:${c.noiseOpacity};mix-blend-mode:${c.blend ?? "multiply"}}
  ${c.extra ?? ""}
</style></head><body><div class="t">
  <svg class="noise" xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${c.freq}" numOctaves="${c.oct ?? 3}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <rect width="100%" height="100%" filter="url(#n)"/>
  </svg>
  ${c.veins ?? ""}
</div></body></html>`;

const TEXTURES: Tex[] = [
  { name: "kraft", dark: false, bg: "linear-gradient(135deg,#cdb185,#c1a06f)", freq: "0.8", noiseOpacity: 0.13 },
  { name: "parchment", dark: false, bg: "linear-gradient(160deg,#efe3c4,#e2d0a4)", freq: "0.7", noiseOpacity: 0.11 },
  { name: "marble", dark: false, bg: "#f3f2ef", freq: "1.3", noiseOpacity: 0.05, veins: `<svg width="1080" height="1920" style="position:absolute;inset:0;opacity:.22" xmlns="http://www.w3.org/2000/svg"><path d="M-50 280 Q 420 480 1130 240" stroke="#b7b7bd" stroke-width="3" fill="none"/><path d="M-50 760 Q 520 640 1130 980" stroke="#c6c6cb" stroke-width="2" fill="none"/><path d="M-50 1280 Q 300 1180 1130 1420" stroke="#bcbcc1" stroke-width="4" fill="none"/><path d="M-50 1640 Q 600 1560 1130 1760" stroke="#cacace" stroke-width="2" fill="none"/></svg>` },
  { name: "linen", dark: false, bg: "#e9e1cf", freq: "0.6", noiseOpacity: 0.08, extra: ".t::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(90,70,40,.05) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(90,70,40,.05) 0 1px,transparent 1px 3px)}" },
  { name: "concrete", dark: false, bg: "#dedcd6", freq: "1.1", noiseOpacity: 0.15 },
  { name: "newsprint", dark: false, bg: "linear-gradient(160deg,#efe7d2,#e7dcc0)", freq: "0.9", noiseOpacity: 0.12 },
];

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
for (const t of TEXTURES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(tpl(t), { waitUntil: "load", timeout: 20_000 });
  await new Promise((r) => setTimeout(r, 200));
  const buf = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  await writeFile(resolve(OUT, `${t.name}.jpg`), buf);
  await page.close();
  console.log("texture ->", `${t.name}.jpg`, t.dark ? "(dark)" : "");
}
await browser.close();

await writeFile(
  resolve(OUT, "backgrounds.json"),
  JSON.stringify(TEXTURES.map((t) => ({ file: `${t.name}.jpg`, dark: t.dark })), null, 2),
);
console.log("wrote backgrounds.json");
