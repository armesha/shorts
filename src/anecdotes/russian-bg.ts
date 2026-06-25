// Фоны RU-деки: сцены russian_jokes/* со встроенным светлым «листом». Текст ложится в safe-зону
// «листа» (своя у каждого фона) тёмными чернилами — рендер через templates/anecdote-russian.html.
// Модель — как у christian/islamic (карта SAFE + pickBg). de/it/fr этого НЕ используют.
import { resolve } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const TEMPLATE = resolve(process.cwd(), "templates/anecdote-russian.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds/russian_jokes");
const FONT_DIR = resolve(process.cwd(), "web/public/template-editor/fonts");
export const RUSSIAN_LONG_TEXT_THRESHOLD = 360;
export const RUSSIAN_MIN_READABLE_FONT_PX = 26;

// Safe-зона текста [top, right, bottom, left] в px на 1080×1920.
// Важно: зона должна начинаться внутри реального бумажного листа, а не просто "примерно там,
// где свободно". Иначе заголовок оказывается на тёмной сцене, как на russian_festive_table.
// Координаты ниже намеренно индивидуальны для каждого фона и включают запас от предметов/краёв.
export const RUSSIAN_BG_SAFE: Record<string, [number, number, number, number]> = {
  "russian_apartment_hallway.jpg": [205, 245, 520, 135], // лист слева; телефон/тумба снизу, одежда справа
  "russian_banya.jpg": [75, 380, 510, 135],              // высокий лист; веник справа, таз/ведро снизу
  "russian_dacha_porch.jpg": [350, 190, 500, 225],       // белая доска ниже окна; зелень справа и снизу
  "russian_festive_table.jpg": [230, 270, 530, 250],     // узкий лист за столом; нельзя заходить в боке слева
  "russian_garage_workshop.jpg": [205, 185, 510, 225],   // серый лист справа от стола; инструменты сверху
  "russian_kitchen_table.jpg": [270, 355, 320, 135],     // центральный лист; чайник справа, стакан снизу-слева
  "russian_market_stall.jpg": [230, 300, 470, 235],      // лист правее зелени; мешок/семечки снизу
  "russian_rainy_window.jpg": [315, 165, 500, 265],      // лист на подоконнике; герань слева, лампа справа
  "russian_train_compartment.jpg": [715, 310, 430, 175], // наклонный лист внизу; шарф сверху-справа (тесный)
  "russian_winter_bus_stop.jpg": [175, 205, 430, 195],   // лист в снегу; ветка слева, термос/варежки снизу
};
const DEFAULT_SAFE: [number, number, number, number] = [200, 200, 380, 120];

// Фоны с маленьким по высоте «листом» — длинные карточки на них зажимаются (мелкий шрифт),
// поэтому для длинного текста их исключаем из выбора.
const TIGHT = new Set([
  "russian_dacha_porch.jpg",
  "russian_festive_table.jpg",
  "russian_rainy_window.jpg",
  "russian_train_compartment.jpg",
]);
const LOCAL_FONTS = [
  ["RU PT Serif", 400, "pt-serif-400-normal-cyrillic.woff2", "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["RU PT Serif", 400, "pt-serif-400-normal-cyrillic-ext.woff2", "U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"],
  ["RU PT Serif", 400, "pt-serif-400-normal-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["RU PT Serif", 400, "pt-serif-400-normal-latin-ext.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
  ["RU PT Serif", 700, "pt-serif-700-normal-cyrillic.woff2", "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["RU PT Serif", 700, "pt-serif-700-normal-cyrillic-ext.woff2", "U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"],
  ["RU PT Serif", 700, "pt-serif-700-normal-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
  ["RU PT Serif", 700, "pt-serif-700-normal-latin-ext.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
  ["RU Caveat", 400, "caveat-400-normal-cyrillic.woff2", "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"],
  ["RU Caveat", 400, "caveat-400-normal-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
] as const;
let fontCssCache: string | null = null;

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function listRussianBgs(): string[] {
  if (!existsSync(BG_DIR)) return [];
  return readdirSync(BG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
}

export function isRussianBgName(name?: string | null): boolean {
  return !!name && listRussianBgs().includes(name);
}

export function isTightRussianBg(name: string): boolean {
  return TIGHT.has(name);
}

export function russianSafeArea(safe: [number, number, number, number]): { width: number; height: number; area: number } {
  const [top, right, bottom, left] = safe;
  const width = Math.max(0, 1080 - left - right);
  const height = Math.max(0, 1920 - top - bottom);
  return { width, height, area: width * height };
}

function localFontCss(): string {
  if (fontCssCache) return fontCssCache;
  fontCssCache = LOCAL_FONTS.map(([family, weight, file, range]) => {
    const b64 = readFileSync(resolve(FONT_DIR, file)).toString("base64");
    return [
      "@font-face{",
      `font-family:'${family}';`,
      "font-style:normal;",
      `font-weight:${weight};`,
      "font-display:block;",
      `src:url(data:font/woff2;base64,${b64}) format('woff2');`,
      `unicode-range:${range};`,
      "}",
    ].join("");
  }).join("\n");
  return fontCssCache;
}

function bgCss(file: string): string {
  const buf = readFileSync(resolve(BG_DIR, file));
  const mime = /\.png$/i.test(file) ? "image/png" : "image/jpeg";
  return `url('data:${mime};base64,${buf.toString("base64")}') center/cover no-repeat`;
}

export interface RussianBg {
  file: string;
  css: string;
  safe: [number, number, number, number];
}

/** Выбрать фон (по имени, иначе случайно). Для длинного текста исключаем «тесные» листы. */
export function pickRussianBg(name?: string | null, textLen = 0, avoidName?: string | null): RussianBg {
  const all = listRussianBgs();
  if (all.length === 0) return { file: "", css: "#f4ecdd", safe: DEFAULT_SAFE };
  let pool = all;
  if (textLen > RUSSIAN_LONG_TEXT_THRESHOLD) {
    const wide = all.filter((f) => !TIGHT.has(f));
    if (wide.length) pool = wide;
  }
  if (!name && avoidName && pool.length > 1) {
    const withoutPrevious = pool.filter((f) => f !== avoidName);
    if (withoutPrevious.length) pool = withoutPrevious;
  }
  const file = name && all.includes(name) ? name : pool[Math.floor(Math.random() * pool.length)];
  return { file, css: bgCss(file), safe: RUSSIAN_BG_SAFE[file] ?? DEFAULT_SAFE };
}

/** HTML карточки RU-деки на фоне russian_jokes: заголовок + текст в safe-зоне, без подписи канала. */
export function buildRussianHtml(
  card: { title: string; text: string; channel: string },
  bg: RussianBg,
): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const [t, r, b, l] = bg.safe;
  return tpl
    .replace("{{FONT_CSS}}", localFontCss())
    .replaceAll("{{BG}}", bg.css)
    .replaceAll("{{SAFE_TOP}}", String(t))
    .replaceAll("{{SAFE_RIGHT}}", String(r))
    .replaceAll("{{SAFE_BOTTOM}}", String(b))
    .replaceAll("{{SAFE_LEFT}}", String(l))
    .replaceAll("{{TITLE}}", esc(card.title))
    .replace("{{TEXT}}", esc(card.text))
    .replaceAll("{{CHANNEL}}", esc(card.channel));
}
