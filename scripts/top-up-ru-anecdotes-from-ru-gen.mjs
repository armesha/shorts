#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const DIR = resolve(ROOT, "local-assets/corpora/ru-gen");
const DECK_DIR = resolve(ROOT, "data/anecdotes");
const SEP = "\n\n— — —\n\n";
const TARGET_ADD = Number(process.env.COUNT || process.argv.find((a) => /^--count=/.test(a))?.split("=")[1] || 300);
const DRY_RUN = process.argv.includes("--dry-run");
const PACK_SIZE = 100;

const BLOCK =
  /(х[уy][ийёея]|пизд|[еёe]б[ауеёиlivn]|бля[дть]|\bбля\b|сук[аиоуе]|мраз|г[ао]ндон|муда[кч]|пид[оа]р|залуп|манд[аеоу]|дроч|шлюх|еблан|сперм|порн|\bсекс|член[аеуо]|трах|жоп|говн|сра[тл]|\bссы|очко|насри|пизж|@|\*\*+)/i;
const RISKY_CONTEXT =
  /(евре[йя]|жид|чукч|цыган|негр|хохол|москал|кавказц|узбек|таджик|армянск(?:ое|ому|ий|ая)\s+радио|гей|лесбиян|трансген|инвалид|даун|аутист|блондинк|проститут|любовниц|изнасил|суицид|самоубий|наркот|кокаин|героин|уби[йи]ц|убил|убили|труп|покойник|похорон)/i;

const TITLE = {
  "семья": "Про семью",
  "тёща": "Про тёщу",
  "дети": "Про детей",
  "школа": "Школьное",
  "студенты": "Студенческое",
  "работа": "Про работу",
  "врачи": "У врача",
  "армия": "Армейское",
  "полиция": "Гаишник и Ко",
  "застолье": "Про застолье",
  "деньги": "Про деньги",
  "животные": "Про зверьё",
  "технологии": "Цифровая жизнь",
  "спорт": "Про спорт",
  "старость": "Про возраст",
  "разное": "Анекдоты",
};

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  const indent = /\/pack-\d+\.json$/.test(path) ? 1 : 2;
  writeFileSync(path, JSON.stringify(value, null, indent) + "\n");
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

function loadCandidateMap() {
  const out = new Map();
  for (const file of readdirSync(DIR).filter((name) => /^cand-\d+\.json$/.test(name)).sort()) {
    for (const item of readJson(resolve(DIR, file), [])) {
      if (typeof item.id === "number" && item.text) out.set(item.id, normalize(item.text));
    }
  }
  return out;
}

function loadKeptPool() {
  const cand = loadCandidateMap();
  const byText = new Map();
  for (const file of readdirSync(DIR).filter((name) => /^keep-\d+\.json$/.test(name)).sort()) {
    for (const item of readJson(resolve(DIR, file), [])) {
      if (typeof item.id !== "number") continue;
      const text = cand.get(item.id);
      if (!text || text.length < 120 || text.length > 260) continue;
      if (BLOCK.test(text) || /[<>{}]/.test(text)) continue;
      if (RISKY_CONTEXT.test(text)) continue;
      const key = anecdoteKey(text);
      if (!byText.has(key)) byText.set(key, { id: item.id, text, theme: String(item.theme || "разное"), len: text.length });
    }
  }
  return [...byText.values()].sort((a, b) => hash(a.text) - hash(b.text));
}

function pairPool(pool, excludeComponents, minSum = 340, maxSum = 443) {
  const usable = pool.filter((item) => !excludeComponents.has(anecdoteKey(item.text)));
  const byTheme = new Map();
  for (const item of usable) {
    const theme = item.theme || "разное";
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme).push(item);
  }
  const pairs = [];
  const leftovers = [];
  const pairSorted = (items, theme, sink, drop) => {
    const arr = [...items].sort((a, b) => a.len - b.len || a.id - b.id);
    let lo = 0;
    let hi = arr.length - 1;
    while (lo < hi) {
      const sum = arr[lo].len + arr[hi].len;
      if (sum > maxSum) drop.push(arr[hi--]);
      else if (sum < minSum) drop.push(arr[lo++]);
      else sink.push({ theme, a: arr[lo++], b: arr[hi--], sum });
    }
    if (lo === hi) drop.push(arr[lo]);
  };
  for (const [theme, items] of byTheme) pairSorted(items, theme, pairs, leftovers);
  pairSorted(leftovers, "разное", pairs, []);
  return pairs.sort((x, y) => hash(`${x.a.text}\n${x.b.text}`) - hash(`${y.a.text}\n${y.b.text}`));
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

const pool = loadKeptPool();
const pairs = pairPool(pool, usedComponents);
const selected = [];
for (const pair of pairs) {
  if (selected.length >= TARGET_ADD) break;
  const text = `${pair.a.text}${SEP}${pair.b.text}`;
  const key = anecdoteKey(text);
  if (usedCards.has(key)) continue;
  usedCards.add(key);
  selected.push({
    text,
    chars: text.length,
    title: TITLE[pair.theme] || "Анекдоты",
    sourceIds: [pair.a.id, pair.b.id],
    theme: pair.theme,
  });
}

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
  };
  packItems.push(nextItem);
  return nextItem;
});
const next = [...existing, ...newItems];

const lens = next.map((item) => item.chars).sort((a, b) => a - b);
const packs = Math.max(1, ...packsByNo.keys());
const report = {
  pool: pool.length,
  existing: existing.length,
  candidatePairs: pairs.length,
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
  if (n > packs) writeFileSync(resolve(DECK_DIR, file), "[]\n");
}
writeFileSync(
  resolve(DECK_DIR, "index.json"),
  JSON.stringify({ total: next.length, packs, packSize: PACK_SIZE, range: report.range }, null, 2) + "\n",
);
writeFileSync(
  resolve(DECK_DIR, "sources.json"),
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      source: "local-assets/Русские анекдоты/anek_djvu.txt",
      derivedPool: "local-assets/corpora/ru-gen/cand-*.json + keep-*.json",
      note: "Top-up pairs are assembled from previously mined and reviewed local Russian joke candidates. No AI-written jokes are introduced by this script.",
      addedBy: "scripts/top-up-ru-anecdotes-from-ru-gen.mjs",
      addedCount: newItems.length,
      selected: selected.map((item) => ({ sourceIds: item.sourceIds, theme: item.theme, chars: item.chars, title: item.title })),
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(report, null, 2));
