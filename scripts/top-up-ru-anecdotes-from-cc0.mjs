#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE_FILE = resolve(ROOT, "data/open_jokes_cc0/dataset.json");
const README_FILE = resolve(ROOT, "data/open_jokes_cc0/README.md");
const DECK_DIR = resolve(ROOT, "data/anecdotes");
const SEP = "\n\n— — —\n\n";
const TARGET_ADD = Number(process.env.COUNT || process.argv.find((arg) => /^--count=/.test(arg))?.split("=")[1] || 300);
const DRY_RUN = process.argv.includes("--dry-run");
const PACK_SIZE = 100;
const MIN_CARD = 300;
const MAX_CARD = 430;
const MAX_PARTS = 3;

const BLOCK =
  /(х[уy][ийёея]|пизд|[еёe]б[ауеёиlivn]|бля[дть]|\bбля\b|сук[аиоуе]|мраз|г[ао]ндон|муда[кч]|пид[оа]р|залуп|манд[аеоу]|дроч|шлюх|еблан|сперм|порн|\bсекс|член[аеуо]|трах|жоп|говн|сра[тл]|\bссы|очко|насри|пизж|бордел|@|\*\*+)/i;
const RISKY_CONTEXT =
  /(евре[йя]|жид|чукч|цыган|негр|хохол|москал|кавказц|узбек|таджик|армянск(?:ое|ому|ий|ая)\s+радио|гей|лесбиян|трансген|инвалид|даун|аутист|блондинк|проститут|бордел|любовниц|изнасил|суицид|самоубий|наркот|кокаин|героин|уби[йи]ц|убил|убили|убить|убивал|убью|убий|съесть|сожрать|труп|покойник|похорон|кровь|нож|пистолет|оруж|террор|гитлер|наци|дебил|кретин|урод|ислам|мусульман|христиан|иисус|бог|церк|поп|священ|библи|коран|аллах|ад|дьявол|украин|росси|путин|зеленск|политик|президент|министр|полици|судья|суд\b)/i;
const NON_CARD = /(http|www\.|@\w|<|>|{|}|\*\*|^\s*[-–—]{3,}\s*$)/i;

const TITLE_PATTERNS = [
  [/работ|началь|офис|директор|коллег|зарплат/i, "Про работу"],
  [/семь|жен[ауы]|муж|сын|дочь|мам|пап|тёщ|тещ/i, "Про семью"],
  [/деньг|банк|рубл|купил|продал|цена|магазин/i, "Про деньги"],
  [/доктор|врач|больниц|пациент/i, "У врача"],
  [/школ|учител|студент|экзамен/i, "Школьное"],
  [/компьютер|телефон|интернет|сайт|программ/i, "Цифровая жизнь"],
];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  const indent = /\/pack-\d+\.json$/.test(path) ? 1 : 2;
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

function anecdoteKey(text) {
  const s = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `a${h.toString(36)}-${s.length}`;
}

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}

function normalize(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitExistingText(text) {
  return String(text || "")
    .split(/\n\n(?:[-—]\s*){2,3}[-—]?\n\n/)
    .map(normalize)
    .filter(Boolean);
}

function cyrillicRatio(text) {
  const letters = text.match(/[A-Za-zА-Яа-яЁё]/g) || [];
  if (!letters.length) return 0;
  const cyr = text.match(/[А-Яа-яЁё]/g) || [];
  return cyr.length / letters.length;
}

function cleanTurn(turn) {
  return normalize(turn)
    .replace(/^[-–—]\s*/, "")
    .replace(/\s+([?.!,;:])/g, "$1")
    .trim();
}

function titleFor(text) {
  for (const [pattern, title] of TITLE_PATTERNS) {
    if (pattern.test(text)) return title;
  }
  return "Анекдоты";
}

function readCc0Candidates() {
  const byKey = new Map();
  const lines = readFileSync(SOURCE_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  for (let sourceLine = 0; sourceLine < lines.length; sourceLine++) {
    let doc;
    try {
      doc = JSON.parse(lines[sourceLine]);
    } catch {
      continue;
    }
    if (!Array.isArray(doc.turns) || doc.turns.length < 2 || doc.turns.length > 5) continue;
    const turns = doc.turns.map(cleanTurn).filter(Boolean);
    if (turns.length < 2 || turns.some((line) => line.length < 3 || line.length > 170)) continue;
    const text = turns.map((line) => `— ${line}`).join("\n");
    if (text.length < 80 || text.length > 260) continue;
    if (cyrillicRatio(text) < 0.9) continue;
    if (BLOCK.test(text) || RISKY_CONTEXT.test(text) || NON_CARD.test(text)) continue;
    const uniqueTurns = new Set(turns.map((line) => line.toLowerCase()));
    if (uniqueTurns.size !== turns.length) continue;
    const key = anecdoteKey(text);
    if (!byKey.has(key)) byKey.set(key, { text, chars: text.length, sourceLine: sourceLine + 1 });
  }
  return [...byKey.values()].sort((a, b) => hash(a.text) - hash(b.text));
}

function buildCards(candidates, usedComponents, usedCards) {
  const selected = [];
  const takenComponents = new Set();
  const usable = candidates.filter((item) => !usedComponents.has(anecdoteKey(item.text)));
  for (let index = 0; index < usable.length && selected.length < TARGET_ADD; index++) {
    const first = usable[index];
    const firstKey = anecdoteKey(first.text);
    if (takenComponents.has(firstKey)) continue;
    const parts = [first];
    takenComponents.add(firstKey);

    for (let look = index + 1; look < usable.length && parts.length < MAX_PARTS; look++) {
      const currentText = parts.map((part) => part.text).join(SEP);
      if (currentText.length >= MIN_CARD) break;
      const next = usable[look];
      const nextKey = anecdoteKey(next.text);
      if (takenComponents.has(nextKey)) continue;
      const candidateText = `${currentText}${SEP}${next.text}`;
      if (candidateText.length > MAX_CARD) continue;
      parts.push(next);
      takenComponents.add(nextKey);
    }

    const text = parts.map((part) => part.text).join(SEP);
    if (text.length < MIN_CARD || text.length > MAX_CARD) {
      for (const part of parts.slice(1)) takenComponents.delete(anecdoteKey(part.text));
      continue;
    }
    const cardKey = anecdoteKey(text);
    if (usedCards.has(cardKey)) continue;
    usedCards.add(cardKey);
    selected.push({
      text,
      chars: text.length,
      title: titleFor(text),
      sourceLines: parts.map((part) => part.sourceLine),
      parts: parts.length,
    });
  }
  return selected;
}

const titledPath = resolve(DECK_DIR, "titled.json");
const existing = readJson(titledPath, []);
const packFiles = readdirSync(DECK_DIR).filter((name) => /^pack-\d+\.json$/.test(name)).sort();
const packsByNo = new Map();
for (const file of packFiles) {
  const packNo = Number(file.match(/^pack-(\d+)\.json$/)?.[1] || 0);
  packsByNo.set(packNo, readJson(resolve(DECK_DIR, file), []));
}

const usedComponents = new Set();
const usedCards = new Set();
for (const item of existing) {
  usedCards.add(anecdoteKey(item.text));
  for (const part of splitExistingText(item.text)) usedComponents.add(anecdoteKey(part));
}

const candidates = readCc0Candidates();
const selected = buildCards(candidates, usedComponents, usedCards);

let nextId = Math.max(0, ...existing.map((item) => Number(item.id) || 0));
let packNo = Math.max(1, ...packsByNo.keys());
let packItems = packsByNo.get(packNo) || [];
const newItems = selected.map((item) => {
  if (packItems.length >= PACK_SIZE) {
    packNo++;
    packItems = packsByNo.get(packNo) || [];
    packsByNo.set(packNo, packItems);
  }
  const nextItem = {
    id: ++nextId,
    pack: packNo,
    text: item.text,
    chars: item.chars,
    title: item.title,
    source: "data/open_jokes_cc0/dataset.json",
    sourceLicense: "cc0-1.0",
    sourceLines: item.sourceLines,
  };
  packItems.push(nextItem);
  return nextItem;
});
const next = [...existing, ...newItems];

const lens = next.map((item) => item.chars).sort((a, b) => a - b);
const packs = Math.max(1, ...packsByNo.keys());
const report = {
  source: "data/open_jokes_cc0/dataset.json",
  license: "cc0-1.0",
  candidates: candidates.length,
  existing: existing.length,
  requested: TARGET_ADD,
  selected: newItems.length,
  nextTotal: next.length,
  nextPacks: packs,
  range: [lens[0] ?? 0, lens[lens.length - 1] ?? 0],
};

if (DRY_RUN) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

writeJson(titledPath, next);
for (let pack = 1; pack <= packs; pack++) {
  writeJson(resolve(DECK_DIR, `pack-${String(pack).padStart(3, "0")}.json`), packsByNo.get(pack) || []);
}
for (const file of readdirSync(DECK_DIR).filter((name) => /^pack-\d+\.json$/.test(name))) {
  const n = Number(file.match(/^pack-(\d+)\.json$/)?.[1] || 0);
  if (n > packs) writeJson(resolve(DECK_DIR, file), []);
}
writeJson(resolve(DECK_DIR, "index.json"), { total: next.length, packs, packSize: PACK_SIZE, range: report.range });
writeJson(resolve(DECK_DIR, "sources.json"), {
  updatedAt: new Date().toISOString(),
  deck: "ru",
  source: "data/open_jokes_cc0/dataset.json",
  sourceReadme: existsSync(README_FILE) ? "data/open_jokes_cc0/README.md" : undefined,
  license: "cc0-1.0",
  note:
    "Top-up cards are assembled from the local CC0 Dialogs from Jokes corpus. No AI-written jokes are introduced by this script.",
  addedBy: "scripts/top-up-ru-anecdotes-from-cc0.mjs",
  addedCount: newItems.length,
  filters: [
    "dialogue turns only",
    "dedupe against existing deck components",
    "profanity/adult/coarse blocklist",
    "politics/religion/violence/protected-class blocklist",
    "card length/readability bounds",
  ],
  selected: selected.map((item) => ({
    sourceLines: item.sourceLines,
    parts: item.parts,
    chars: item.chars,
    title: item.title,
  })),
});
console.log(JSON.stringify(report, null, 2));
