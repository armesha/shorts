// Фоны RU-деки: сцены russian_jokes/* со встроенным светлым «листом». Текст ложится в safe-зону
// «листа» (своя у каждого фона) тёмными чернилами — рендер через templates/anecdote-russian.html.
// Модель — как у christian/islamic (карта SAFE + pickBg). de/it/fr этого НЕ используют.
import { resolve } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const TEMPLATE = resolve(process.cwd(), "templates/anecdote-russian.html");
const BG_DIR = resolve(process.cwd(), "assets/backgrounds/russian_jokes");

// Safe-зона текста [top, right, bottom, left] в px на 1080×1920 — прямоугольник «листа» сцены,
// с запасом от краёв листа и от посторонних предметов (чайник/веник/таз/лампа и т.п.).
// Выверено по калибровочной сетке (src/scripts/ru-bg-calibrate.ts).
const SAFE: Record<string, [number, number, number, number]> = {
  "russian_kitchen_table.jpg": [280, 380, 320, 145],  // лист по центру; чайник справа, стакан снизу-слева
  "russian_banya.jpg": [120, 385, 510, 152],          // лист вверху; веник справа, таз/ведро снизу-слева
  "russian_train_compartment.jpg": [620, 410, 500, 110], // наклонный лист внизу; шарф сверху-справа (тесный)
  "russian_dacha_porch.jpg": [150, 420, 480, 115],    // доска по центру; укроп справа, горшок снизу
  "russian_apartment_hallway.jpg": [145, 390, 520, 120], // лист на скотче; одежда справа, телефон снизу-слева
  "russian_festive_table.jpg": [140, 410, 530, 125],  // меню-карточка; еда/мандарины снизу, боке сверху
  "russian_garage_workshop.jpg": [130, 400, 510, 165], // плакат у верстака правее центра; банки снизу
  "russian_market_stall.jpg": [120, 410, 500, 160],   // плакат на ящиках правее центра; зелень/мешок
  "russian_rainy_window.jpg": [170, 405, 500, 155],   // лист на подоконнике; герань слева, лампа справа
  "russian_winter_bus_stop.jpg": [150, 420, 490, 110], // лист на снежном карнизе; термос справа, варежки
};
const DEFAULT_SAFE: [number, number, number, number] = [200, 200, 380, 120];

// Фоны с маленьким по высоте «листом» — длинные карточки на них зажимаются (мелкий шрифт),
// поэтому для длинного текста их исключаем из выбора.
const TIGHT = new Set(["russian_train_compartment.jpg"]);

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function listRussianBgs(): string[] {
  if (!existsSync(BG_DIR)) return [];
  return readdirSync(BG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
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

/** Выбрать фон (по имени, иначе случайно). Для длинного текста (>360) исключаем «тесные» листы. */
export function pickRussianBg(name?: string | null, textLen = 0): RussianBg {
  const all = listRussianBgs();
  if (all.length === 0) return { file: "", css: "#f4ecdd", safe: DEFAULT_SAFE };
  let pool = all;
  if (textLen > 360) {
    const wide = all.filter((f) => !TIGHT.has(f));
    if (wide.length) pool = wide;
  }
  const file = name && all.includes(name) ? name : pool[Math.floor(Math.random() * pool.length)];
  return { file, css: bgCss(file), safe: SAFE[file] ?? DEFAULT_SAFE };
}

/** HTML карточки RU-деки на фоне russian_jokes: заголовок + текст в safe-зоне + подпись канала. */
export function buildRussianHtml(
  card: { title: string; text: string; channel: string },
  bg: RussianBg,
): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const [t, r, b, l] = bg.safe;
  return tpl
    .replaceAll("{{BG}}", bg.css)
    .replaceAll("{{SAFE_TOP}}", String(t))
    .replaceAll("{{SAFE_RIGHT}}", String(r))
    .replaceAll("{{SAFE_BOTTOM}}", String(b))
    .replaceAll("{{SAFE_LEFT}}", String(l))
    .replaceAll("{{TITLE}}", esc(card.title))
    .replace("{{TEXT}}", esc(card.text))
    .replaceAll("{{CHANNEL}}", esc(card.channel));
}
