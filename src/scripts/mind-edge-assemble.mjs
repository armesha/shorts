// Сборка карточек пака «The Mind Edge» из батчей Sonnet-воркфлоу.
// Читает corpora/mind-edge-gen/*.json → нормализует → фильтрует по длине (тело 350–450, заголовок 16–80)
// → дедуп (по нормализованному телу + заголовку) → балансный round-robin по дорожкам → ровно 1000
// → assets/template-packs/the-mind-edge/cards.json. Печатает статистику и сколько ещё не хватает.
// Запуск: node src/scripts/mind-edge-assemble.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const GEN_DIR = resolve(process.cwd(), "corpora/mind-edge-gen");
const OUT_DIR = resolve(process.cwd(), "assets/template-packs/the-mind-edge");
const OUT_FILE = resolve(OUT_DIR, "cards.json");
const TARGET = 1000;

const BODY_MIN = 350, BODY_MAX = 450; // выверено рендером
const TITLE_MIN = 16, TITLE_MAX = 80;

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const sig = (s) =>
  collapse(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 90);

function parseFile(file) {
  let raw = readFileSync(file, "utf8").trim();
  // снять возможные markdown-ограждения ```json ... ```
  raw = raw.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  // иногда агент оборачивает в {"cards":[...]}
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (data && !Array.isArray(data) && Array.isArray(data.cards)) data = data.cards;
  return Array.isArray(data) ? data : [];
}

const files = existsSync(GEN_DIR)
  ? readdirSync(GEN_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  : [];

let parsed = 0, badField = 0, outLen = 0, dupes = 0;
const seenBody = new Set(), seenTitle = new Set();
const byLane = new Map(); // lane → [card]
const lenHist = {};

for (const f of files.sort()) {
  const lane = f.replace(/\.json$/, "");
  const arr = parseFile(resolve(GEN_DIR, f));
  for (const c of arr) {
    parsed++;
    if (!c || typeof c.title !== "string" || typeof c.text !== "string") { badField++; continue; }
    const title = collapse(c.title).replace(/^["'“”]+|["'“”]+$/g, "").replace(/\.$/, "");
    const text = collapse(c.text);
    if (title.length < TITLE_MIN || title.length > TITLE_MAX) { outLen++; continue; }
    if (text.length < BODY_MIN || text.length > BODY_MAX) { outLen++; continue; }
    const bs = sig(text), ts = sig(title);
    if (seenBody.has(bs) || seenTitle.has(ts)) { dupes++; continue; }
    seenBody.add(bs); seenTitle.add(ts);
    const bucket = Math.floor(text.length / 10) * 10;
    lenHist[bucket] = (lenHist[bucket] || 0) + 1;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push({ title, text });
  }
}

// балансный round-robin: тянем по одной с каждой дорожки по кругу (чтобы покрытие тем было ровным)
const lanes = [...byLane.values()];
for (const l of lanes) l.sort(() => Math.random() - 0.5); // перемешать внутри дорожки
const picked = [];
let added = true;
while (picked.length < TARGET && added) {
  added = false;
  for (const l of lanes) {
    if (!l.length) continue;
    picked.push(l.pop());
    added = true;
    if (picked.length >= TARGET) break;
  }
}
const totalUnique = seenBody.size;

console.log(`файлов: ${files.length}`);
console.log(`карточек распарсено: ${parsed}`);
console.log(`  отброшено (нет полей): ${badField}`);
console.log(`  отброшено (длина вне диапазона): ${outLen}`);
console.log(`  отброшено (дубликаты): ${dupes}`);
console.log(`уникальных в диапазоне: ${totalUnique}`);
console.log(`выбрано в пак: ${picked.length}${picked.length < TARGET ? `  ⚠️ НЕ ХВАТАЕТ ${TARGET - picked.length}` : ""}`);
console.log(`гистограмма длины тела:`, Object.fromEntries(Object.entries(lenHist).sort((a, b) => +a[0] - +b[0])));

if (picked.length >= TARGET || process.argv.includes("--force")) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(picked.slice(0, TARGET), null, 2));
  console.log(`\n→ записано ${Math.min(picked.length, TARGET)} карточек: ${OUT_FILE}`);
} else {
  console.log(`\nНе записываю (мало карточек). Догенерируй ещё одну волну или запусти с --force для частичного файла.`);
}
