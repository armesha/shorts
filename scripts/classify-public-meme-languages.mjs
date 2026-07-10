import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const memesPath = resolve(process.cwd(), "server/public/memes/memes.js");
const source = readFileSync(memesPath, "utf8");
const items = JSON.parse(source.replace(/^window\.MEMES=/, "").replace(/;\s*$/, ""));

const explicitEnglishMarker =
  /английск|по-английски|англоязыч|english|на англ\.|англ\.\s*(?:текст|надпись)/i;

function isEnglishMeme(title) {
  const latinLetters = title.match(/[A-Za-z]/g)?.length ?? 0;
  const cyrillicLetters = title.match(/[А-Яа-яЁё]/g)?.length ?? 0;
  const latinWords = title.match(/\b[A-Za-z]{3,}\b/g)?.length ?? 0;
  const hasRussianTranslation = /[A-Za-z][^()\n]{3,}\(\s*[А-Яа-яЁё]/.test(title);
  const latinShare = latinLetters / Math.max(1, latinLetters + cyrillicLetters);

  return (
    explicitEnglishMarker.test(title) ||
    (latinWords >= 5 && (latinShare >= 0.1 || hasRussianTranslation))
  );
}

let englishCount = 0;
for (const item of items) {
  item.topicCat ??= item.cat;
  if (isEnglishMeme(item.title)) {
    item.cat = "Английские мемы";
    englishCount += 1;
  } else {
    item.cat = item.topicCat;
  }
}

writeFileSync(memesPath, `window.MEMES=${JSON.stringify(items)};`, "utf8");
console.log(`classified=${items.length} english=${englishCount} russian=${items.length - englishCount}`);
