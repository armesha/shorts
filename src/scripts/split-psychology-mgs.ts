// ONE-OFF migration: split the «психология armen» pack into pushpin / non-pushpin halves.
//
// «психология armen» (id психология-mgs-mqe2kfjv) bundles 40 editor templates. The first 10
// (psychology-mgs lime/yellow/pink/cyan/orange/violet/mint/sky/coral/dark) draw a 📌 pushpin at
// the top of the card; the other 30 (note/question/myth/micro/dark-grid+calm/ai) do not.
// Cards render round-robin — card i → templates[i % 40] (buildPackLibraryVideo / packs-routes) —
// so card i shows the pushpin iff i % 40 < 10. Verified visually against two library renders.
//
// What this does:
//   1. backs up the source pack file + the video rows it will delete,
//   2. creates a NEW pack «психология mgs» = the 10 📌 templates + the 500 📌 cards,
//   3. rewrites «психология armen» = the 30 plain templates + the 1500 remaining cards,
//   4. purges the already-queued 📌 videos (deck pack:психология-mgs-mqe2kfjv) from the library —
//      DB rows + png/mp4 files — so they never post on any channel.
//
// Order-preserving filtering keeps EVERY card's visual template identical after the split:
//   - mgs keeps templates[0..9];  kept cards (i%40<10),  in order ⇒ j%10 == i%40.
//   - armen keeps templates[10..39]; kept cards (i%40>=10), in order ⇒ j%30 == i%40-10.
//
// Run: node --import tsx --experimental-sqlite src/scripts/split-psychology-mgs.ts
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC_ID = "психология-mgs-mqe2kfjv";
const NEW_NAME = "психология mgs";
const PIN = 10; // first PIN templates carry the 📌
const PUSHPIN = "\u{1F4CC}";

const ROOT = process.cwd();
const PACKS_DIR = resolve(ROOT, "data/packs");
const OUTPUT_DIR = resolve(ROOT, "data/output");
const DB_PATH = resolve(ROOT, "data/app.db");
const srcFile = resolve(PACKS_DIR, `${SRC_ID}.json`);

type CardValues = Record<string, string | string[]>;
interface StoredCard {
  values: CardValues;
  addedAt: string;
}
interface Pack {
  id: string;
  owners: number[];
  userId?: number;
  name: string;
  lang: string;
  templates: Array<Record<string, unknown>>;
  cards: StoredCard[];
  createdAt: string;
  grants?: number[];
}

// slug() copied from src/packs/store.ts so the new id matches how the store would name it.
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-|-$/g, "").slice(0, 40) || "pack";

const readJson = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;
function writeAtomic(file: string, data: unknown): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}
const die = (msg: string): never => {
  console.error("ПРЕРВАНО: " + msg);
  process.exit(1);
};

// readable card text — mirrors server/infra/media.ts cardReadable for rules [title (str), text (list)],
// exactly what db.createVideo stored in videos.text. Used to match queued videos to 📌 cards.
function readableText(values: CardValues): string {
  const title = typeof values.title === "string" ? values.title : "";
  const text = Array.isArray(values.text)
    ? values.text.map((x) => `• ${x}`).join("\n")
    : String(values.text ?? "");
  return `${title}\n\n${text}`;
}

// ---------- load + sanity ----------
if (!existsSync(srcFile)) die(`нет файла пака ${srcFile}`);
const src = readJson<Pack>(srcFile);
const N = src.templates.length;
if (N !== 40) die(`ожидал 40 шаблонов в «${src.name}», нашёл ${N} (уже разделён?)`);

const firstHavePin = src.templates.slice(0, PIN).every((t) => JSON.stringify(t).includes(PUSHPIN));
const restNoPin = src.templates.slice(PIN).every((t) => !JSON.stringify(t).includes(PUSHPIN));
if (!firstHavePin || !restNoPin)
  die(`структура не та: ждал первые ${PIN} шаблонов с 📌, остальные без (pin=${firstHavePin}, rest-clean=${restNoPin})`);

// ---------- split templates + cards (order-preserving) ----------
const pinTemplates = src.templates.slice(0, PIN);
const nonPinTemplates = src.templates.slice(PIN);
const pinCards: StoredCard[] = [];
const nonPinCards: StoredCard[] = [];
src.cards.forEach((c, i) => ((i % N < PIN ? pinCards : nonPinCards).push(c)));

if (pinTemplates.length !== 10 || nonPinTemplates.length !== 30) die("неожиданное число шаблонов после сплита");
if (pinCards.length + nonPinCards.length !== src.cards.length) die("карточки потерялись при сплите");
console.log(
  `Сплит: шаблоны ${pinTemplates.length}+${nonPinTemplates.length}=${N}, ` +
    `карточки ${pinCards.length}(📌)+${nonPinCards.length}=${src.cards.length}`,
);

const pinTexts = new Set(pinCards.map((c) => readableText(c.values)));

// ---------- backups ----------
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const packBak = `${srcFile}.pre-split.bak`;
copyFileSync(srcFile, packBak);
console.log(`Бэкап пака: ${packBak}`);

// ---------- new «психология mgs» pack ----------
const newId = `${slug(NEW_NAME)}-${Date.now().toString(36)}`;
const newFile = resolve(PACKS_DIR, `${newId}.json`);
if (existsSync(newFile)) die(`файл нового пака уже существует: ${newFile}`);
const newPack: Pack = {
  id: newId,
  owners: [...src.owners], // тот же доступ, что у armen (без владельца → только админ видит)
  name: NEW_NAME,
  lang: src.lang,
  templates: pinTemplates,
  cards: pinCards,
  createdAt: new Date().toISOString(),
  grants: [...(src.grants ?? [])],
};
writeAtomic(newFile, newPack);
console.log(`Новый пак «${NEW_NAME}» → ${newFile} (id ${newId})`);

// ---------- rewrite «психология armen» (drop the 📌 half) ----------
src.templates = nonPinTemplates;
src.cards = nonPinCards;
writeAtomic(srcFile, src);
console.log(`Переписан «${src.name}» → ${nonPinTemplates.length} шаблонов, ${nonPinCards.length} карточек`);

// ---------- purge queued 📌 videos (rows + files) ----------
const db = new DatabaseSync(DB_PATH);
db.prepare("PRAGMA busy_timeout = 5000").run();
const deck = `pack:${SRC_ID}`;
const vids = db
  .prepare("SELECT id, account_id, title, text, video_rel, image_rel FROM videos WHERE deck = ?")
  .all(deck) as Array<{ id: number; account_id: number; title: string; text: string; video_rel: string; image_rel: string | null }>;
const toDelete = vids.filter((v) => pinTexts.has(v.text));
const remaining = vids.length - toDelete.length;

// backup the rows we delete (outside data/packs so the pack scanner won't read it as a pack)
const vidBak = resolve(ROOT, "data", `psychology-mgs-split-deleted-videos-${stamp}.json`);
writeFileSync(vidBak, JSON.stringify(toDelete, null, 2));
console.log(`Бэкап удаляемых видео-строк: ${vidBak} (${toDelete.length} шт.)`);

const delStmt = db.prepare("DELETE FROM videos WHERE id = ?");
db.exec("BEGIN");
try {
  for (const v of toDelete) delStmt.run(v.id);
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  db.close();
  die("откат удаления видео: " + (e as Error).message);
}

let filesDeleted = 0;
let filesMissing = 0;
for (const v of toDelete) {
  for (const rel of [v.video_rel, v.image_rel]) {
    if (!rel) continue;
    const p = resolve(OUTPUT_DIR, rel);
    try {
      if (existsSync(p)) {
        unlinkSync(p);
        filesDeleted++;
      } else filesMissing++;
    } catch {
      /* best effort */
    }
  }
}
db.close();

console.log(
  `Очередь канала(ов) ${[...new Set(toDelete.map((v) => v.account_id))].join(",") || "—"}: ` +
    `удалено ${toDelete.length} 📌-видео (файлов снято ${filesDeleted}, не найдено ${filesMissing}), ` +
    `осталось не-📌 видео в этой деке: ${remaining}`,
);
console.log("Готово.");
