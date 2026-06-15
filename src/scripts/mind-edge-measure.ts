// Диагностика: какой РЕАЛЬНО шрифт получает тело после авто-подгона и что его ограничивает
// (высота бокса vs ширина/длинное слово). Рендерит карточки разной длины на «grid» (самый высокий бокс)
// и «constellation» (самый низкий) и читает computed fontSize + scrollH/clientH + scrollW/clientW.
// Запуск: node --import tsx src/scripts/mind-edge-measure.ts
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDERER_JS = resolve(__dirname, "../../web/public/template-editor/renderer.js");
const FONTS_DIR = resolve(__dirname, "../../web/public/template-editor/fonts");
const MANIFEST = resolve(__dirname, "../../web/public/template-editor/fonts.json");

async function interFaceCss(): Promise<string> {
  const man = JSON.parse(await readFile(MANIFEST, "utf8")) as { family: string; weight: number; style: string; file: string; range: string }[];
  const rules: string[] = [];
  for (const e of man) {
    if (e.family.toLowerCase() !== "inter") continue;
    const b64 = (await readFile(resolve(FONTS_DIR, e.file))).toString("base64");
    rules.push(`@font-face{font-family:'Inter';font-style:${e.style};font-weight:${e.weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${e.range};}`);
  }
  return rules.join("\n");
}

const CORPUS =
  "Asking for time is not hedging; it signals seriousness, and the people who hold real power do it constantly without a flicker of apology. When you say you want to give a decision the consideration it deserves, you reframe the pause as respect for the proposal rather than a rejection of the person in front of you. It becomes hard to argue against someone who simply wants to think carefully.";
const clip = (n: number) => { let s = CORPUS.slice(0, n); const i = s.lastIndexOf(" "); if (i > n - 14) s = s.slice(0, i); return s.replace(/[\s,;:]+$/, "") + "."; };

const main = async () => {
  const tpls = buildTemplates();
  const pick = (s: string) => tpls.find((t) => t.name.includes(s))!;
  const fontCss = await interFaceCss();
  const rdr = (await readFile(RENDERER_JS, "utf8")).replace(/<\/script/gi, "<\\/script");
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"] });
  const cases: [string, number][] = [["03-grid", 376], ["03-grid", 455], ["02-constellation", 420], ["02-constellation", 455]];
  for (const [bg, len] of cases) {
    const tpl = pick(bg);
    const content = { title: "How to buy time without seeming weak", text: clip(len) };
    const tplJson = JSON.stringify(tpl).replace(/</g, "\\u003c");
    const contentJson = JSON.stringify(content).replace(/</g, "\\u003c");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}</style><style>html,body{margin:0;padding:0}#card{width:1080px;height:1920px;overflow:hidden;background:${tpl.canvas.bg}}</style></head><body><div id="card"></div><script>${rdr}</script><script>
window.addEventListener('load',function(){(async function(){var tpl=${tplJson},content=${contentJson};try{await Promise.all([400,700,800].map(function(w){return document.fonts.load(w+' 64px "Inter"').catch(function(){})}));await document.fonts.ready;}catch(e){}renderTemplate(document.getElementById('card'),tpl,content,{fit:false});try{await document.fonts.ready;}catch(e){}await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});await new Promise(function(r){setTimeout(r,120)});window.__fitted=true;})();});</script></body></html>`;
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 8000 }).catch(() => {});
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-id="body"]') as HTMLElement;
      const inner = el.firstElementChild as HTMLElement;
      return { font: getComputedStyle(inner).fontSize, scrollH: inner.scrollHeight, clientH: el.clientHeight, scrollW: inner.scrollWidth, clientW: el.clientWidth };
    });
    console.log(`${bg} len=${content.text.length}: font=${m.font}  H ${m.scrollH}/${m.clientH}  W ${m.scrollW}/${m.clientW}  fill=${Math.round(100 * m.scrollH / m.clientH)}%`);
    await page.close();
  }
  await browser.close();
};
main().catch((e) => { console.error(e); process.exit(1); });
