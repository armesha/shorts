// Рендер деки «Что выберешь?» (id: choose). Карточка = два варианта (реальные фото Pexels) +
// подписи + описания, на 1080x1920. Вся карточка хранится как JSON в `text` (как мемы/психология):
//   { q, a:{label,desc,photoFile}, b:{label,desc,photoFile} }
// Фото лежат в data/choose/photos/ и встраиваются data-URI. Безопасная зона шортса соблюдена
// в самом шаблоне (templates/choose.html): контент в верхней части, правый край ≤950px, низ пустой.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const TEMPLATE = resolve(process.cwd(), "templates/choose.html");
const PHOTOS_DIR = resolve(process.cwd(), "data/choose/photos");

export interface ChooseSide {
  label: string;
  desc: string;
  /** Имя файла фото в data/choose/photos/ (jpg/png). */
  photoFile?: string;
  /** Pexels-запрос (используется только сборщиком; в рендере не нужен). */
  query?: string;
}
export interface ChooseCard {
  q: string;
  a: ChooseSide;
  b: ChooseSide;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MIME = (f: string): string => (/\.png$/i.test(f) ? "image/png" : "image/jpeg");

/** Inline a choose photo (by file name in data/choose/photos/) as a data-URI, or "" if missing. */
export function choosePhotoDataUri(file?: string | null): string {
  if (!file) return "";
  const abs = resolve(PHOTOS_DIR, file);
  if (!existsSync(abs)) return "";
  const buf = readFileSync(abs);
  return `data:${MIME(file)};base64,${buf.toString("base64")}`;
}

/** Fill templates/choose.html for one card → a complete HTML document string. */
export function buildChooseHtml(card: ChooseCard): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const a = card.a ?? ({} as ChooseSide);
  const b = card.b ?? ({} as ChooseSide);
  return tpl
    .replaceAll("{{Q}}", esc(card.q))
    .replaceAll("{{A_LABEL}}", esc(a.label))
    .replaceAll("{{A_DESC}}", esc(a.desc))
    .replaceAll("{{B_LABEL}}", esc(b.label))
    .replaceAll("{{B_DESC}}", esc(b.desc))
    .replace("{{A_IMG}}", choosePhotoDataUri(a.photoFile))
    .replace("{{B_IMG}}", choosePhotoDataUri(b.photoFile));
}
