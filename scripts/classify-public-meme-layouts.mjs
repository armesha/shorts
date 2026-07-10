import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const memesPath = resolve(process.cwd(), "server/public/memes/memes.js");
const source = readFileSync(memesPath, "utf8");
const memes = JSON.parse(source.replace(/^window\.MEMES=/, "").replace(/;\s*$/, ""));

const TOP = /(текст|надпись|заголовок).{0,100}(сверху|вверху|наверху)/i;
const BELOW = /(ниже|под (ним|ней|текстом)|на (фото|фотографии|картинке|изображении))/i;
const EXCLUDE =
  /(четыре|три|два|две|несколько|мем поделен|кадр|фрейм|фотографии|подпись сверху и снизу|тексты|надписи|сверху и снизу|текст.{0,30}снизу|под фото комментарий|под картинкой подпись|далее комментарий)/i;

let russian = 0;
let english = 0;
for (const meme of memes) {
  const singleTopText = TOP.test(meme.title) && BELOW.test(meme.title) && !EXCLUDE.test(meme.title);
  meme.layout = singleTopText ? (meme.cat === "Английские мемы" ? "top-text-en" : "top-text-ru") : null;
  if (meme.layout === "top-text-en") english += 1;
  if (meme.layout === "top-text-ru") russian += 1;
}

writeFileSync(memesPath, `window.MEMES=${JSON.stringify(memes)};`, "utf8");
console.log(`classified=${memes.length} top-text-ru=${russian} top-text-en=${english}`);
