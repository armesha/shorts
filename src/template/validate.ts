// ============== Валидация недоверенных шаблонов редактора (security ruleset) ==============
//
// Шаблоны приходят от пользователей (JSON из редактора / пака), поэтому перед рендером их надо
// строго провалидировать: ограничить размеры, запретить внешние url/скрипты в CSS, разрешить
// локальные картинки только из белого списка каталогов, проверить data:image base64 и т.п.
//
// Импортируется рендером (./render.ts) и роутами паков (через ре-экспорт из ./render.ts).

import { Buffer } from "node:buffer";

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

export function validateDataImageUrl(value: string, label: string): void {
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

export function validateCssValue(value: string, label: string): void {
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

export function validateFont(font: unknown, label: string): void {
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

export function safeLocalImageRel(src: string, label: string): string {
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

export function validateImageSource(src: unknown, label: string): string {
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
