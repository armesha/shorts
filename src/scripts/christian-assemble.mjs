// Assemble the final Christian deck from the Sonnet agents' selection.
// Reads corpora/christian/selection.json (ids + theme) + cand-pool.json (exact passages),
// dedups (by id + verse-overlap), tops up to CAP from remaining high-yield books, sorts canonically
// → data/christian/cards.json (+ index.json). Card = {type, text, ref, theme, book, testament}.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/corpora/christian`;
const CAP = 1000;

const pool = JSON.parse(readFileSync(`${OUT}/cand-pool.json`, "utf8")); // id -> passage
const picks = JSON.parse(readFileSync(`${OUT}/selection.json`, "utf8")); // [{id, theme}]
const books = JSON.parse(readFileSync(`${OUT}/books.json`, "utf8"));
const bookIdx = new Map(books.map((b, i) => [b, i]));

const overlaps = (a, b) => a.book === b.book && a.ch === b.ch && a.vStart <= b.vEnd && b.vStart <= a.vEnd;

// 1) map the agents' picks to exact passages (skip unknown ids / dupes)
const byId = new Map();
let unknown = 0;
for (const p of picks) {
  const c = pool[p.id];
  if (!c) { unknown++; continue; }
  if (byId.has(p.id)) continue;
  byId.set(p.id, { ...c, theme: String(p.theme || "").toLowerCase().slice(0, 20) });
}

// 2) drop any verse-overlapping passages (keep the first seen)
const placed = [];
const cards = [];
for (const c of byId.values()) {
  if (placed.some((x) => overlaps(x, c))) continue;
  placed.push(c);
  cards.push(c);
}
const curated = cards.length;

// 3) top up to CAP from remaining candidates in high-yield books (round-robin = balanced)
const PRIORITY = [
  "Psalms", "Proverbs", "John", "Matthew", "Luke", "Romans", "Isaiah", "Acts", "Mark",
  "1 Corinthians", "Ephesians", "Hebrews", "Philippians", "2 Corinthians", "Revelation",
  "James", "1 Peter", "Galatians", "Ecclesiastes", "Colossians", "1 John", "Lamentations", "Daniel",
];
if (cards.length < CAP) {
  const usedIds = new Set(cards.map((c) => c.id));
  const rem = {};
  for (const c of Object.values(pool)) {
    if (usedIds.has(c.id)) continue;
    if (!PRIORITY.includes(c.sec)) continue;
    if (placed.some((x) => overlaps(x, c))) continue;
    (rem[c.sec] ??= []).push(c);
  }
  let added = true;
  while (cards.length < CAP && added) {
    added = false;
    for (const sec of PRIORITY) {
      const arr = rem[sec];
      if (!arr || !arr.length) continue;
      const c = arr.shift();
      if (placed.some((x) => overlaps(x, c))) continue;
      placed.push(c);
      cards.push({ ...c, theme: "" }); // top-ups have no agent theme
      added = true;
      if (cards.length >= CAP) break;
    }
  }
}
const toppedUp = cards.length - curated;

// 4) canonical order (book, chapter, verse)
cards.sort((a, b) => (bookIdx.get(a.book) - bookIdx.get(b.book)) || a.ch - b.ch || a.vStart - b.vStart);

// 5) final card objects
const final = cards.map((c) => ({ type: "verse", text: c.text, ref: c.ref, theme: c.theme || "", book: c.book, testament: c.testament }));
mkdirSync(`${REPO}/data/christian`, { recursive: true });
writeFileSync(`${REPO}/data/christian/cards.json`, JSON.stringify(final, null, 1));
const lens = final.map((c) => [...c.text].length);
writeFileSync(
  `${REPO}/data/christian/index.json`,
  JSON.stringify({ total: final.length, packs: 1, packSize: final.length, range: [Math.min(...lens), Math.max(...lens)] }),
);

// stats
const ot = final.filter((c) => c.testament === "OT").length;
const byBook = {};
for (const c of final) byBook[c.book] = (byBook[c.book] || 0) + 1;
const inBand = lens.filter((l) => l >= 350 && l <= 410).length;
console.log(`cards=${final.length}  curated=${curated} toppedUp=${toppedUp} unknownIds=${unknown}`);
console.log(`testament: OT=${ot} NT=${final.length - ot}`);
console.log(`len: min=${Math.min(...lens)} max=${Math.max(...lens)} avg=${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}  in 350-410: ${inBand} (${Math.round((inBand / lens.length) * 100)}%)`);
console.log(`books=${Object.keys(byBook).length}  top:`, Object.entries(byBook).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k}:${n}`).join(" "));
