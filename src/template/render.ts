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
//
// Валидация недоверенных шаблонов вынесена в ./validate.ts; её символы ре-экспортируются ниже,
// чтобы внешние импортёры (server/routes/packs-routes.ts и т.п.) не меняли свои import-пути.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import {
  TEMPLATE_LIMITS,
  TemplateValidationError,
  validateImageSource,
  validateTemplateDoc,
  type TemplateDoc,
  type TemplateContent,
} from "./validate.ts";

// Ре-экспорт валидатора (барель) — внешние вызовы импортят эти символы из ./render.ts без изменений.
export {
  TEMPLATE_LIMITS,
  TemplateValidationError,
  validateCssValue,
  validateDataImageUrl,
  validateFont,
  validateImageSource,
  validateTemplateDoc,
  validateTemplateList,
  safeLocalImageRel,
} from "./validate.ts";
export type { TemplateDoc, TemplateElement, TemplateContent } from "./validate.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// тот же runtime-рендерер, что и в редакторе
const RENDERER_JS = resolve(__dirname, "../../web/public/template-editor/renderer.js");
// Локальные шрифты (см. src/scripts/fetch-template-fonts.mjs) — рендер не зависит от Google Fonts CDN
// и работает офлайн/на VPS. Манифест family→woff2; в страницу встраиваем base64 ТОЛЬКО нужных семейств.
const FONTS_DIR = resolve(__dirname, "../../web/public/template-editor/fonts");
const MANIFEST_PATH = resolve(__dirname, "../../web/public/template-editor/fonts.json");

interface FontEntry {
  family: string;
  weight: number;
  style: string;
  subset: string;
  file: string;
  range: string;
}
let _manifest: FontEntry[] | null = null;
async function loadManifest(): Promise<FontEntry[]> {
  if (!_manifest) _manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as FontEntry[];
  return _manifest;
}

// @font-face с локальными woff2 (base64) только для семейств, используемых в шаблоне → страница
// самодостаточна, без сети. Неизвестные семейства (системные Arial и т.п.) просто пропускаются.
async function fontFaceCssFor(families: string[]): Promise<string> {
  const want = new Set(families.map((f) => f.toLowerCase()));
  const manifest = await loadManifest();
  const rules: string[] = [];
  for (const e of manifest) {
    if (!want.has(e.family.toLowerCase())) continue;
    const b64 = (await readFile(resolve(FONTS_DIR, e.file))).toString("base64");
    rules.push(
      `@font-face{font-family:'${e.family}';font-style:${e.style};font-weight:${e.weight};` +
        `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${e.range};}`,
    );
  }
  return rules.join("\n");
}

function imageMime(file: string): string {
  const ext = extname(file).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

async function inlineLocalImages(tpl: TemplateDoc): Promise<TemplateDoc> {
  const copy = JSON.parse(JSON.stringify(tpl)) as TemplateDoc;
  for (const el of copy.elements || []) {
    if (el.type !== "image" || typeof el.src !== "string") continue;
    const src = validateImageSource(el.src, `template image ${el.id || ""}`.trim());
    if (/^data:/i.test(src)) continue;
    const file = resolve(process.cwd(), src);
    const buf = await readFile(file).catch(() => {
      throw new TemplateValidationError(`template image ${el.id || ""}: файл не найден`);
    });
    if (buf.length > TEMPLATE_LIMITS.maxDataImageBytes) {
      throw new TemplateValidationError(
        `template image ${el.id || ""}: файл больше ${TEMPLATE_LIMITS.maxDataImageBytes} байт`,
      );
    }
    el.src = `data:${imageMime(file)};base64,${buf.toString("base64")}`;
  }
  return copy;
}

/** Самодостаточная HTML-страница: инлайн renderer.js + вызов renderTemplate с предзагрузкой шрифтов. */
function buildHtml(rendererSrc: string, tpl: TemplateDoc, content: TemplateContent, fontCss: string): string {
  const w = tpl.canvas?.w || 1080;
  const h = tpl.canvas?.h || 1920;
  const baseHref = pathToFileURL(`${process.cwd()}/`).href;
  // renderer.js содержит «</script>» в комментариях-примерах — при инлайне это закрыло бы <script>
  // раньше времени. Экранируем закрывающий тег; в JS «<\/script>» эквивалентно «</script>».
  const rdr = rendererSrc.replace(/<\/script/gi, "<\\/script");
  // Контент/шаблон могут содержать «<» (например «</script>») — экранируем при вставке в <script>.
  const tplJson = JSON.stringify(tpl).replace(/</g, "\\u003c");
  const contentJson = JSON.stringify(content).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<base href="${baseHref}">
<style>${fontCss}</style>
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
  validateTemplateDoc(tpl);
  const finalTpl = await inlineLocalImages(tpl);
  const w = finalTpl.canvas.w;
  const h = finalTpl.canvas.h;
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
  let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;
  try {
    page = await b.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const url = request.url();
      if (url === "about:blank" || url.startsWith("data:")) void request.continue();
      else void request.abort();
    });
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const rendererSrc = await readFile(RENDERER_JS, "utf8");
    const families = Array.from(
      new Set((finalTpl.elements || []).filter((e) => e.font?.family).map((e) => e.font!.family)),
    );
    const fontCss = await fontFaceCssFor(families);
    await page.setContent(buildHtml(rendererSrc, finalTpl, content, fontCss), {
      // networkidle0 waits for fonts/images; valid at runtime — puppeteer-core@25's setContent type omits it.
      waitUntil: "networkidle0" as "load",
      timeout: 30_000,
    });
    await page.waitForFunction("window.__fitted === true", { timeout: 8_000 }).catch(() => {});
    const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: w, height: h } });
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, buf);
    return outPath;
  } finally {
    if (page) await page.close().catch(() => {});
    if (own) await b.close();
  }
}
