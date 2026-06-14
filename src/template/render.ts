// ============== Серверный рендер шаблонов редактора → PNG 1080×1920 ==============
//
// Мост между визуальным редактором (web/public/template-editor/) и реальным рендером.
// Берёт JSON-шаблон (тот же формат, что экспортирует редактор) + контент (карта role → текст)
// и рисует готовую карточку через тот же puppeteer + system Chrome, что и основной пайплайн.
//
// ВАЖНО (без дрейфа): мы инлайним ТОТ ЖЕ renderer.js, который использует редактор в браузере,
// и зовём в headless-странице window.renderTemplate(...). Логика раскладки, авто-подгона шрифта
// и лимитов (fitMin/fitMax/maxChars, обрезка «…») — единственным источником правды.
//
// Изолировано: ничего из работающего пайплайна/сервера не импортит этот модуль (кроме chromePath).

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// тот же runtime-рендерер, что и в редакторе
const RENDERER_JS = resolve(__dirname, "../../web/public/template-editor/renderer.js");
// тот же набор Google Fonts, что подключён в редакторе (web/public/template-editor/index.html).
// css2: семейства строго по алфавиту. ВНИМАНИЕ: это сетевой источник — для офлайн/VPS нужен
// шаг «шрифты локально» (положить .woff2 и грузить с диска). Здесь — чтобы проверить мост целиком.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Bitter:wght@400;700&family=Caveat:wght@400;700&family=Comfortaa:wght@400;700&family=Cormorant+Garamond:wght@400;700&family=Dancing+Script:wght@400;700&family=EB+Garamond:wght@400;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&family=Kolker+Brush&family=Lato:wght@400;700&family=Libre+Baskerville:wght@400;700&family=Linden+Hill&family=Lobster&family=Lora:wght@400;700&family=Merriweather:wght@400;700&family=Montserrat:wght@400;500;600;700;800&family=Nunito:wght@400;500;600;700;800&family=Open+Sans:wght@400;700&family=Oswald:wght@400;700&family=Pacifico&family=Playfair+Display:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=PT+Serif:wght@400;700&family=Raleway:wght@400;500;600;700;800&family=Roboto:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;700&family=Source+Serif+4:wght@400;700&family=Work+Sans:wght@400;500;600;700;800&display=swap";

export interface TemplateElement {
  id: string;
  type: "killbox" | "text" | "image";
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  role?: string;
  font?: { family: string; size: number; weight: number; color: string; lineHeight: number };
  [k: string]: unknown;
}
export interface TemplateDoc {
  version?: number;
  name?: string;
  canvas: { w: number; h: number; bg?: string };
  elements: TemplateElement[];
}
/** Карта role → значение (строка = одно поле, массив строк = список-буллеты). */
export type TemplateContent = Record<string, string | string[]>;

/** Самодостаточная HTML-страница: инлайн renderer.js + вызов renderTemplate с предзагрузкой шрифтов. */
function buildHtml(rendererSrc: string, tpl: TemplateDoc, content: TemplateContent): string {
  const w = tpl.canvas?.w || 1080;
  const h = tpl.canvas?.h || 1920;
  // renderer.js содержит «</script>» в комментариях-примерах — при инлайне это закрыло бы <script>
  // раньше времени. Экранируем закрывающий тег; в JS «<\/script>» эквивалентно «</script>».
  const rdr = rendererSrc.replace(/<\/script/gi, "<\\/script");
  // Контент/шаблон могут содержать «<» (например «</script>») — экранируем при вставке в <script>.
  const tplJson = JSON.stringify(tpl).replace(/</g, "\\u003c");
  const contentJson = JSON.stringify(content).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>html,body{margin:0;padding:0}#card{width:${w}px;height:${h}px;overflow:hidden;background:${tpl.canvas?.bg || "#fff"}}</style>
</head><body>
<div id="card"></div>
<script>${rdr}</script>
<script>
// Запускаемся на 'load' — к этому моменту стили (а значит @font-face) уже загружены,
// поэтому document.fonts.load найдёт нужные начертания (если звать раньше — вернёт пусто).
window.addEventListener('load', function () {
  (async function () {
    var tpl = ${tplJson};
    var content = ${contentJson};
    var raf2 = function(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); };
    // предзагрузка всех семейств шрифтов шаблона — чтобы авто-подгон мерил реальные метрики, а не fallback
    try {
      var fams = Array.from(new Set((tpl.elements || []).filter(function(e){return e.font && e.font.family;}).map(function(e){return e.font.family;})));
      var jobs = [];
      fams.forEach(function(f){ [400,700].forEach(function(wt){ jobs.push(document.fonts.load(wt + 'px 64px "' + f + '"').catch(function(){})); }); });
      await Promise.all(jobs);
      await document.fonts.ready;
    } catch (e) {}
    renderTemplate(document.getElementById('card'), tpl, content, { fit: false });
    // renderer повторно подгоняет шрифт после fonts.ready — дождёмся и этого прохода, затем устаканимся
    try { await document.fonts.ready; } catch (e) {}
    await raf2();
    await new Promise(function(r){ setTimeout(r, 80); });
    window.__fitted = true;
  })();
});
</script>
</body></html>`;
}

/**
 * Рендер шаблона редактора → файл PNG (по умолчанию 1080×1920 из canvas шаблона).
 * Можно передать готовый browser (для пакетного рендера) — иначе поднимет и закроет свой.
 */
export async function renderTemplateCard(
  tpl: TemplateDoc,
  content: TemplateContent,
  outPath: string,
  browser?: Browser,
): Promise<string> {
  const w = tpl.canvas?.w || 1080;
  const h = tpl.canvas?.h || 1920;
  const own = !browser;
  const b =
    browser ??
    (await puppeteer.launch({
      executablePath: chromePath(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
        "--hide-scrollbars",
      ],
    }));
  try {
    const page = await b.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const rendererSrc = await readFile(RENDERER_JS, "utf8");
    await page.setContent(buildHtml(rendererSrc, tpl, content), {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    await page.waitForFunction("window.__fitted === true", { timeout: 8_000 }).catch(() => {});
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h } });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    await page.close();
    return outPath;
  } finally {
    if (own) await b.close();
  }
}
