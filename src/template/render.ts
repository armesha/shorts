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
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";

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

export const TEMPLATE_LIMITS = {
  maxCanvasW: 1080,
  maxCanvasH: 1920,
  maxElements: 80,
  maxTemplatesPerPack: 40,
  maxElementDim: 2400,
  maxCoordAbs: 2400,
  maxFontPx: 240,
  maxDataImageBytes: 2 * 1024 * 1024,
  maxCssValueChars: 3_000_000,
};

const ALLOWED_LOCAL_IMAGE_PREFIXES = ["assets/template-packs/", "web/public/template-editor/"];
const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i;
const CSS_URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gis;

export class TemplateValidationError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "TemplateValidationError";
  }
}

function badTemplate(message: string): never {
  throw new TemplateValidationError(message);
}

function finiteNumber(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    badTemplate(`${label}: число должно быть в диапазоне ${min}..${max}`);
  }
  return value;
}

function optionalNumber(value: unknown, label: string, min: number, max: number): void {
  if (value == null) return;
  finiteNumber(value, label, min, max);
}

function validateDataImageUrl(value: string, label: string): void {
  const m = DATA_IMAGE_RE.exec(value.trim());
  if (!m) badTemplate(`${label}: разрешены только data:image PNG/JPEG/WEBP в base64`);
  const b64 = m[2].replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 === 1) {
    badTemplate(`${label}: некорректный base64`);
  }
  const bytes = Buffer.from(b64, "base64").length;
  if (bytes > TEMPLATE_LIMITS.maxDataImageBytes) {
    badTemplate(`${label}: картинка больше ${TEMPLATE_LIMITS.maxDataImageBytes} байт`);
  }
}

function validateCssValue(value: string, label: string): void {
  if (value.length > TEMPLATE_LIMITS.maxCssValueChars) badTemplate(`${label}: CSS-значение слишком большое`);
  const withoutSafeDataUrls = value.replace(CSS_URL_RE, (_full, _quote: string, rawUrl: string) => {
    const url = rawUrl.trim();
    if (!/^data:image\//i.test(url)) badTemplate(`${label}: внешние url(...) запрещены`);
    validateDataImageUrl(url, label);
    return "url(safe-image)";
  });
  if (/[<>{};]/.test(withoutSafeDataUrls)) badTemplate(`${label}: недопустимые символы в CSS-значении`);
  if (/@import|expression\s*\(|javascript\s*:|(?:https?|file|ftp)\s*:/i.test(withoutSafeDataUrls)) {
    badTemplate(`${label}: внешние ссылки и скрипты запрещены`);
  }
}

function validateFont(font: unknown, label: string): void {
  if (!font || typeof font !== "object" || Array.isArray(font)) badTemplate(`${label}: font обязателен`);
  const f = font as Record<string, unknown>;
  const family = String(f.family ?? "");
  if (!/^[A-Za-z0-9 ._-]{1,80}$/.test(family)) badTemplate(`${label}: недопустимое имя шрифта`);
  finiteNumber(f.size, `${label}.size`, 1, TEMPLATE_LIMITS.maxFontPx);
  optionalNumber(f.weight, `${label}.weight`, 100, 1000);
  finiteNumber(f.lineHeight, `${label}.lineHeight`, 0.7, 3);
  if (typeof f.color === "string") validateCssValue(f.color, `${label}.color`);
  else badTemplate(`${label}.color обязателен`);
}

function safeLocalImageRel(src: string, label: string): string {
  const value = src.trim();
  if (!value) badTemplate(`${label}: пустой src`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.startsWith("/")) {
    badTemplate(`${label}: внешние, абсолютные и file/http URL запрещены`);
  }
  if (value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    badTemplate(`${label}: путь к локальной картинке небезопасен`);
  }
  if (!ALLOWED_LOCAL_IMAGE_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    badTemplate(`${label}: локальные картинки разрешены только из assets/template-packs/ и web/public/template-editor/`);
  }
  if (!/\.(png|jpe?g|webp|svg)$/i.test(value)) badTemplate(`${label}: неподдерживаемый формат картинки`);
  return value;
}

function validateImageSource(src: unknown, label: string): string {
  if (typeof src !== "string") badTemplate(`${label}: src обязателен`);
  const value = src.trim();
  if (/^data:/i.test(value)) {
    validateDataImageUrl(value, label);
    return value;
  }
  return safeLocalImageRel(value, label);
}

export function validateTemplateDoc(tpl: unknown, label = "template"): asserts tpl is TemplateDoc {
  if (!tpl || typeof tpl !== "object" || Array.isArray(tpl)) badTemplate(`${label}: нужен объект шаблона`);
  const doc = tpl as Record<string, unknown>;
  const canvas = doc.canvas as Record<string, unknown> | undefined;
  if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)) badTemplate(`${label}.canvas обязателен`);
  finiteNumber(canvas.w, `${label}.canvas.w`, 1, TEMPLATE_LIMITS.maxCanvasW);
  finiteNumber(canvas.h, `${label}.canvas.h`, 1, TEMPLATE_LIMITS.maxCanvasH);
  if (typeof canvas.bg === "string") validateCssValue(canvas.bg, `${label}.canvas.bg`);
  if (!Array.isArray(doc.elements)) badTemplate(`${label}.elements должен быть массивом`);
  if (doc.elements.length > TEMPLATE_LIMITS.maxElements) {
    badTemplate(`${label}.elements: максимум ${TEMPLATE_LIMITS.maxElements} элементов`);
  }
  doc.elements.forEach((raw, i) => {
    const elLabel = `${label}.elements[${i}]`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) badTemplate(`${elLabel}: нужен объект`);
    const el = raw as Record<string, unknown>;
    if (!["killbox", "text", "image"].includes(String(el.type))) badTemplate(`${elLabel}.type: неизвестный тип`);
    if (typeof el.id !== "string" || el.id.length > 100) badTemplate(`${elLabel}.id обязателен`);
    finiteNumber(el.x, `${elLabel}.x`, -TEMPLATE_LIMITS.maxCoordAbs, TEMPLATE_LIMITS.maxCoordAbs);
    finiteNumber(el.y, `${elLabel}.y`, -TEMPLATE_LIMITS.maxCoordAbs, TEMPLATE_LIMITS.maxCoordAbs);
    finiteNumber(el.w, `${elLabel}.w`, 1, TEMPLATE_LIMITS.maxElementDim);
    finiteNumber(el.h, `${elLabel}.h`, 1, TEMPLATE_LIMITS.maxElementDim);
    optionalNumber(el.rot, `${elLabel}.rot`, -360, 360);
    optionalNumber(el.padX, `${elLabel}.padX`, 0, TEMPLATE_LIMITS.maxElementDim);
    optionalNumber(el.padY, `${elLabel}.padY`, 0, TEMPLATE_LIMITS.maxElementDim);
    optionalNumber(el.fitMin, `${elLabel}.fitMin`, 1, TEMPLATE_LIMITS.maxFontPx);
    optionalNumber(el.fitMax, `${elLabel}.fitMax`, 1, TEMPLATE_LIMITS.maxFontPx);
    optionalNumber(el.minChars, `${elLabel}.minChars`, 0, 20_000);
    optionalNumber(el.maxChars, `${elLabel}.maxChars`, 0, 20_000);
    optionalNumber(el.opacity, `${elLabel}.opacity`, 0, 1);
    for (const k of ["bg", "border", "shadow", "highlight", "radius"]) {
      if (typeof el[k] === "string") validateCssValue(el[k] as string, `${elLabel}.${k}`);
    }
    if (el.align != null && !["left", "center", "right"].includes(String(el.align))) {
      badTemplate(`${elLabel}.align: недопустимое значение`);
    }
    if (el.valign != null && !["top", "center", "bottom"].includes(String(el.valign))) {
      badTemplate(`${elLabel}.valign: недопустимое значение`);
    }
    if (el.role != null && !/^[A-Za-z0-9_-]{1,80}$/.test(String(el.role))) {
      badTemplate(`${elLabel}.role: недопустимое значение`);
    }
    if (el.placeholder != null && String(el.placeholder).length > 2_000) {
      badTemplate(`${elLabel}.placeholder: слишком длинный текст`);
    }
    if (el.text != null && String(el.text).length > 2_000) badTemplate(`${elLabel}.text: слишком длинный текст`);
    if (el.type === "image") {
      validateImageSource(el.src, `${elLabel}.src`);
      if (el.fit != null && !["contain", "cover", "fill", "none", "scale-down"].includes(String(el.fit))) {
        badTemplate(`${elLabel}.fit: недопустимое значение`);
      }
    } else {
      validateFont(el.font, `${elLabel}.font`);
    }
  });
}

export function validateTemplateList(templates: unknown, label = "templates"): asserts templates is TemplateDoc[] {
  if (!Array.isArray(templates)) badTemplate(`${label}: нужен массив шаблонов`);
  if (templates.length > TEMPLATE_LIMITS.maxTemplatesPerPack) {
    badTemplate(`${label}: максимум ${TEMPLATE_LIMITS.maxTemplatesPerPack} шаблонов в одном паке`);
  }
  templates.forEach((tpl, i) => validateTemplateDoc(tpl, `${label}[${i}]`));
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
    const buf = await readFile(file).catch(() => badTemplate(`template image ${el.id || ""}: файл не найден`));
    if (buf.length > TEMPLATE_LIMITS.maxDataImageBytes) {
      badTemplate(`template image ${el.id || ""}: файл больше ${TEMPLATE_LIMITS.maxDataImageBytes} байт`);
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
