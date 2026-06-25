// Build the "tips" (Народные лайфхаки) deck from source-backed batches in local-assets/corpora/tips-gen/.
// Active batch files are source-backed surprising-<n>.json arrays of {title, text, profession}.
// Legacy <profession>-<n>.json files are intentionally ignored.
// Output: data/tips/titled.json (ready items w/ profession) + index.json (stats).
// Run: node --import tsx src/anecdotes/build-tips.ts
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SRC_DIR = resolve(process.cwd(), "local-assets/corpora/tips-gen");
const OUT_DIR = resolve(process.cwd(), "data/tips");
const MIN = 310;
const MAX = 480;
const PACK_SIZE = 300;
const SOURCE_BATCH_RE = /^surprising-\d+\.json$/;

const PROFS = new Set([
  "chef", "mechanic", "firefighter", "lawyer", "accountant",
  "teacher", "programmer", "builder", "police", "hairdresser",
]);

function parseItems(raw: string): Array<{ title?: string; text?: string; profession?: string }> | null {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const i = s.indexOf("[");
  const j = s.lastIndexOf("]");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const cleanText = (t: unknown): string => String(t ?? "").replace(/\s+/g, " ").trim();

function cleanTitle(t: unknown): string {
  let s = String(t ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/^["«»“”'`]+/, "").replace(/["«»“”'`]+$/, "").replace(/[.!…]+$/, "").trim();
  if (s.length > 38) {
    const cut = s.slice(0, 38);
    const sp = cut.lastIndexOf(" ");
    s = (sp > 20 ? cut.slice(0, sp) : cut).trim();
  }
  return s;
}

// Normalized dedup key (matches the spirit of anecdoteKey: djb2 + length).
function key(text: string): string {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length}`;
}

if (!existsSync(SRC_DIR)) {
  console.error(`Нет папки ${SRC_DIR} — сначала запусти генерацию лайфхаков.`);
  process.exit(1);
}

const files = readdirSync(SRC_DIR).filter((f) => SOURCE_BATCH_RE.test(f)).sort();
const seen = new Set<string>();
const byProf = new Map<string, number>();
const lens: number[] = [];
const items: Array<{ text: string; title: string; profession: string }> = [];
let parsedFiles = 0;
let badFiles = 0;
let rawCount = 0;
let tooShort = 0;
let tooLong = 0;
let dup = 0;
let noTitle = 0;
let skipProf = 0;

for (const f of files) {
  const fileProf = f.replace(/-\d+\.json$/, "");
  const arr = parseItems(readFileSync(resolve(SRC_DIR, f), "utf8"));
  if (!arr) {
    badFiles++;
    console.warn(`  ! не разобрал ${f}`);
    continue;
  }
  parsedFiles++;
  for (const it of arr) {
    rawCount++;
    const itemProf = cleanText(it?.profession).toLowerCase();
    const prof = PROFS.has(itemProf) ? itemProf : fileProf;
    if (!PROFS.has(prof)) { skipProf++; continue; }
    const text = cleanText(it?.text);
    if (!text) continue;
    if (text.length < MIN) { tooShort++; continue; }
    if (text.length > MAX) { tooLong++; continue; }
    const k = key(text);
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    const title = cleanTitle(it?.title);
    if (!title) noTitle++;
    items.push({ text, title, profession: prof });
    lens.push(text.length);
    byProf.set(prof, (byProf.get(prof) ?? 0) + 1);
  }
}

const titled = items.map((it, idx) => ({
  id: idx + 1,
  pack: Math.floor(idx / PACK_SIZE) + 1,
  text: it.text,
  chars: it.text.length,
  title: it.title,
  profession: it.profession,
}));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "titled.json"), JSON.stringify(titled));
const packs = Math.max(1, Math.ceil(titled.length / PACK_SIZE));
const range = lens.length ? [Math.min(...lens), Math.max(...lens)] : [0, 0];
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  JSON.stringify(
    { total: titled.length, packs, packSize: PACK_SIZE, range, byProfession: Object.fromEntries([...byProf].sort()) },
    null,
    2,
  ),
);

const sorted = [...lens].sort((a, b) => a - b);
console.log(`Файлов: ${files.length} (разобрано ${parsedFiles}, битых ${badFiles}, чужих профессий ${skipProf})`);
console.log(`Сырых советов: ${rawCount}`);
console.log(`Отброшено → коротких(<${MIN}): ${tooShort}, длинных(>${MAX}): ${tooLong}, дублей: ${dup}`);
console.log(`Без заголовка (дефолтный на рантайме): ${noTitle}`);
console.log(`ИТОГО в деке: ${titled.length} советов, ${packs} пак(ов) по ${PACK_SIZE}`);
console.log(`Длина: min ${range[0]}, max ${range[1]}, медиана ${sorted[Math.floor(sorted.length / 2)] || 0}`);
console.log("По профессиям: " + [...byProf].sort().map(([p, c]) => `${p}=${c}`).join(", "));
console.log("Примеры:");
for (const s of [titled[0], titled[Math.floor(titled.length / 2)], titled[titled.length - 1]].filter(Boolean)) {
  console.log(`  [${s.profession}] «${s.title}» (${s.chars}) ${s.text.slice(0, 80)}…`);
}
