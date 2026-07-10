import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const memesPath = resolve(process.cwd(), "server/public/memes/memes.js");
const source = readFileSync(memesPath, "utf8");
const memes = JSON.parse(source.replace(/^window\.MEMES=/, "").replace(/;\s*$/, ""));

const TOP = /(текст|надпись|заголовок).{0,100}(сверху|вверху|наверху)/i;
const BELOW = /(ниже|под (ним|ней|текстом)|на (фото|фотографии|картинке|изображении))/i;
const EXCLUDE =
  /(четыре|три|два|две|несколько|мем поделен|кадр|фрейм|фотографии|подпись сверху и снизу|тексты|надписи|сверху и снизу|текст.{0,30}снизу|под фото комментарий|под картинкой подпись|далее комментарий|мессенджер|диалог|скриншот|комментарий|сообщение)/i;
const LOWER_TEXT_IN_DESCRIPTION =
  /(?:ниже|под (?:ним|ней|фото|картин|изображ)|на (?:фото|фотографии|картинке|изображении)).{0,250}(?:текст|надпись|подпись|подписан|написан|слово|фраз|экран|скрин)/i;
const OCR_BOTTOM_Y = 154; // 30% от стандартных 512px изображений датасета
const MANUAL_EXCLUSIONS = new Set([
  "rumeme-0052", "rumeme-0145", "rumeme-0207", "rumeme-0244", "rumeme-0360",
  "rumeme-0408", "rumeme-0648", "rumeme-0745", "rumeme-0817", "rumeme-1954",
]);
const CURATED_TOP_TEXT = new Set([
  "nasa-ingenuity-03",
  "nasa-ingenuity-04",
  "nasa-ingenuity-06",
  "nasa-ingenuity-07",
  "nasa-ingenuity-15",
]);

function hasTextOutsideTop(meme) {
  const imagePath = resolve(process.cwd(), "server/public/memes", meme.url);
  const result = spawnSync("tesseract", [imagePath, "stdout", "-l", "rus+eng", "--psm", "6", "tsv"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) return true;

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .some((cell) => {
      const [level, , , , , , , top, , height, confidence, text] = cell;
      const readable = String(text ?? "").replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
      return level === "5" && Number(confidence) >= 50 && readable && Number(top) + Number(height) > OCR_BOTTOM_Y;
    });
}

let russian = 0;
let english = 0;
for (const meme of memes) {
  if (CURATED_TOP_TEXT.has(meme.id)) {
    meme.layout = "top-text-en";
    english += 1;
    continue;
  }
  const metadataMatch = TOP.test(meme.title) && BELOW.test(meme.title) && !EXCLUDE.test(meme.title);
  const singleTopText =
    metadataMatch &&
    !LOWER_TEXT_IN_DESCRIPTION.test(meme.title) &&
    !MANUAL_EXCLUSIONS.has(meme.id) &&
    !hasTextOutsideTop(meme);
  meme.layout = singleTopText ? (meme.cat === "Английские мемы" ? "top-text-en" : "top-text-ru") : null;
  if (meme.layout === "top-text-en") english += 1;
  if (meme.layout === "top-text-ru") russian += 1;
}

writeFileSync(memesPath, `window.MEMES=${JSON.stringify(memes)};`, "utf8");
console.log(`classified=${memes.length} top-text-ru=${russian} top-text-en=${english}`);
