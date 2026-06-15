// Майнинг коротких анекдотов под ПАРЫ (две шутки → карточка 350–450) для основной RU-деки.
// Источник упёрся в 367 символов, поэтому длинных нет — берём короткие (их тысячи) и потом парим.
// Чистка/дедуп/длина/BLOCK здесь; качество+безопасность+тему отдаём Sonnet-воркфлоу (слайсы → corpora/ru-gen).
//   node --import tsx src/scripts/ru-mine.ts
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadCleanAnecdotes } from "../anecdotes/build.ts";
import { anecdoteKey } from "../anecdotes/library.ts";

const OUT = resolve(process.cwd(), "corpora/ru-gen");
const MINL = Number(process.env.MINL ?? 160);
const MAXL = Number(process.env.MAXL ?? 240);
const MAXLINES = Number(process.env.MAXLINES ?? 5);
const WANT = Number(process.env.WANT ?? 2400);
const OFFSET = Number(process.env.OFFSET ?? 0); // для повторного прогона непересекающихся кандидатов
const SLICE = Number(process.env.SLICE ?? 40);

const clean = loadCleanAnecdotes();

// уже использованные в деке (длинные 300–369) — дедуп, хотя по длине почти не пересекаются
const titledFile = resolve(process.cwd(), "data/anecdotes/titled.json");
const used = new Set<string>(
  existsSync(titledFile)
    ? (JSON.parse(readFileSync(titledFile, "utf8")) as { text: string }[]).map((t) => anecdoteKey(t.text))
    : [],
);

const seen = new Set<string>();
const cand = clean.filter((a) => {
  if (a.length < MINL || a.length > MAXL) return false;
  if ((a.match(/\n/g) || []).length + 1 > MAXLINES) return false;
  if (!/[.!?»"]$/.test(a.trim())) return false; // законченная мысль
  const k = anecdoteKey(a);
  if (used.has(k) || seen.has(k)) return false;
  seen.add(k);
  return true;
});

// детерминированный порядок (по хэшу) → стабильные слайсы и непересекающиеся окна через OFFSET
function h(s: string): number { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x; }
cand.sort((a, b) => h(a) - h(b));
const picked = cand.slice(OFFSET, OFFSET + WANT);

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let slices = 0;
for (let i = 0; i < picked.length; i += SLICE) {
  slices++;
  const items = picked.slice(i, i + SLICE).map((text, j) => ({ id: OFFSET + i + j, text }));
  writeFileSync(resolve(OUT, `cand-${String(slices).padStart(3, "0")}.json`), JSON.stringify(items, null, 1));
}

const lens = picked.map((a) => a.length).sort((x, y) => x - y);
const at = (p: number) => lens[Math.floor(lens.length * p)];
console.log(`candidates in ${MINL}-${MAXL} (≤${MAXLINES} lines): ${cand.length}`);
console.log(`picked ${picked.length} (offset ${OFFSET}) → ${slices} slices of ${SLICE} in ${OUT}`);
console.log(`len p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)}`);
