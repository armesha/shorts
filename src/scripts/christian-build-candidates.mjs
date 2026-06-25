// Build passage CANDIDATES (~350-400 chars) from the KJV corpus for the selection workflow.
// Tiles within-chapter verse windows over the verse-rich books, plus famous passages from the rest.
// Drops genealogy/census/list noise. Output (gitignored): local-assets/corpora/christian/cand-pool.json (id->passage),
// candidates.jsonl, slices/*.jsonl (one per agent), manifest.json (printed as JSON line for Workflow args).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/local-assets/corpora/christian`;
const SL = `${OUT}/slices`;
mkdirSync(SL, { recursive: true });

const FLOOR = 350;      // grow a window until it reaches this many chars …
const HARD_CAP = 470;   // … but never let a window exceed this while adding a verse
const MIN_EMIT = 320;   // drop windows shorter than this (short chapter tails)
const MAX_EMIT = 450;   // drop windows longer than this (single over-long verses)
const SLICE_SIZE = 110;

const clen = (s) => [...s].length;

// Verse-rich books: tile ALL windows (heuristic-filtered). The rest contribute FAMOUS passages only.
const TILE = new Set([
  "Psalms", "Proverbs", "Ecclesiastes", "Isaiah", "Lamentations", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon",
  "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
]);

// Beloved standalone passages from the non-tiled books (narrative / law / wisdom). Window starts here.
const FAMOUS = [
  "Genesis 1:1", "Genesis 1:3", "Genesis 1:27", "Genesis 2:24", "Genesis 8:22", "Genesis 9:13",
  "Genesis 12:2", "Genesis 15:6", "Genesis 22:8", "Genesis 28:15", "Genesis 50:20",
  "Exodus 3:14", "Exodus 14:13", "Exodus 15:2", "Exodus 20:3", "Exodus 20:12", "Exodus 33:14", "Exodus 34:6",
  "Leviticus 19:18", "Leviticus 26:12",
  "Numbers 6:24", "Numbers 23:19",
  "Deuteronomy 6:4", "Deuteronomy 6:5", "Deuteronomy 7:9", "Deuteronomy 8:3", "Deuteronomy 10:12",
  "Deuteronomy 30:19", "Deuteronomy 31:6", "Deuteronomy 31:8", "Deuteronomy 33:27",
  "Joshua 1:8", "Joshua 1:9", "Joshua 24:15",
  "Judges 6:12",
  "Ruth 1:16",
  "1 Samuel 2:2", "1 Samuel 12:24", "1 Samuel 16:7", "1 Samuel 17:47",
  "2 Samuel 22:2", "2 Samuel 22:31",
  "1 Kings 8:23", "1 Kings 19:11",
  "2 Kings 6:16",
  "1 Chronicles 16:11", "1 Chronicles 16:34", "1 Chronicles 29:11",
  "2 Chronicles 7:14", "2 Chronicles 16:9", "2 Chronicles 20:15",
  "Nehemiah 8:10", "Nehemiah 9:17",
  "Esther 4:14",
  "Job 1:21", "Job 19:25", "Job 23:10", "Job 42:2",
  "Jeremiah 1:5", "Jeremiah 17:7", "Jeremiah 29:11", "Jeremiah 29:13", "Jeremiah 31:3", "Jeremiah 32:17", "Jeremiah 33:3",
  "Ezekiel 36:26", "Ezekiel 37:5",
];

// Drop windows that are mostly genealogy / census / proper-noun lists (poor devotional cards).
function junk(text) {
  if (/\bbegat\b/i.test(text)) return true;
  if (/(?:son of [A-Z][a-z]+[ ,;]+){2,}/.test(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  const cap = words.filter((w) => /^[A-Z][a-z]/.test(w)).length;
  if (words.length > 6 && cap / words.length > 0.5) return true; // name list
  const nums = (text.match(/\b\d+\b/g) || []).length;
  if (nums >= 5) return true; // census / measurements
  return false;
}

const refOf = (book, ch, a, b) => {
  const name = book === "Psalms" ? "Psalm" : book;
  return a === b ? `${name} ${ch}:${a}` : `${name} ${ch}:${a}-${b}`;
};

const verses = readFileSync(`${OUT}/verses.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// index: book -> chapter -> ordered verse array
const byBook = new Map();
for (const v of verses) {
  if (!byBook.has(v.book)) byBook.set(v.book, new Map());
  const chMap = byBook.get(v.book);
  if (!chMap.has(v.ch)) chMap.set(v.ch, []);
  chMap.get(v.ch).push(v);
}
for (const chMap of byBook.values()) for (const arr of chMap.values()) arr.sort((a, b) => a.v - b.v);

const candidates = [];
const seenIds = new Set();
function emit(book, ch, vs, sec) {
  const text = vs.map((x) => x.text).join(" ");
  const len = clen(text);
  if (len < MIN_EMIT || len > MAX_EMIT) return;
  if (junk(text)) return;
  const a = vs[0].v, b = vs[vs.length - 1].v;
  const id = `${book}|${ch}|${a}-${b}`;
  if (seenIds.has(id)) return;
  seenIds.add(id);
  candidates.push({ id, book, ch, vStart: a, vEnd: b, ref: refOf(book, ch, a, b), text, len, testament: vs[0].testament, sec });
}

// Tile a chapter into consecutive non-overlapping windows ~FLOOR..HARD_CAP chars.
function tileChapter(book, ch, arr, sec) {
  let i = 0;
  while (i < arr.length) {
    const win = [arr[i]];
    let len = arr[i].len;
    let j = i;
    while (len < FLOOR && j + 1 < arr.length) {
      const nx = arr[j + 1];
      if (len + 1 + nx.len > HARD_CAP) break;
      win.push(nx);
      len += 1 + nx.len;
      j++;
    }
    emit(book, ch, win, sec);
    i = j + 1;
  }
}

// 1) tile the verse-rich books
for (const [book, chMap] of byBook) {
  if (!TILE.has(book)) continue;
  const sec = book; // section = book name
  for (const [ch, arr] of chMap) tileChapter(book, ch, arr, sec);
}

// 2) famous single passages from the rest — window forward from each ref
for (const ref of FAMOUS) {
  const m = ref.match(/^(.+) (\d+):(\d+)$/);
  if (!m) continue;
  const [, book, chS, vS] = m;
  const ch = Number(chS), v0 = Number(vS);
  const arr = byBook.get(book)?.get(ch);
  if (!arr) { console.error("famous missing:", ref); continue; }
  const start = arr.findIndex((x) => x.v === v0);
  if (start < 0) { console.error("famous verse missing:", ref); continue; }
  const win = [arr[start]];
  let len = arr[start].len, j = start;
  while (len < FLOOR && j + 1 < arr.length) {
    const nx = arr[j + 1];
    if (len + 1 + nx.len > HARD_CAP) break;
    win.push(nx); len += 1 + nx.len; j++;
  }
  emit(book, ch, win, "Famous");
}

// write the full candidate pool
const candPool = {};
for (const c of candidates) candPool[c.id] = c;
writeFileSync(`${OUT}/cand-pool.json`, JSON.stringify(candPool));
writeFileSync(`${OUT}/candidates.jsonl`, candidates.map((c) => JSON.stringify(c)).join("\n") + "\n");

// slice by section (book), chunked to SLICE_SIZE, for one workflow agent each
const bySec = new Map();
for (const c of candidates) {
  if (!bySec.has(c.sec)) bySec.set(c.sec, []);
  bySec.get(c.sec).push(c);
}
const manifest = [];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
for (const [sec, arr] of bySec) {
  for (let k = 0; k < arr.length; k += SLICE_SIZE) {
    const chunk = arr.slice(k, k + SLICE_SIZE);
    const label = `${slug(sec)}_${Math.floor(k / SLICE_SIZE) + 1}`;
    // slim payload the agent reads: id, ref, len, text
    const slim = chunk.map((c) => ({ id: c.id, ref: c.ref, len: c.len, text: c.text }));
    writeFileSync(`${SL}/${label}.jsonl`, slim.map((x) => JSON.stringify(x)).join("\n") + "\n");
    manifest.push({ label, section: sec, file: `local-assets/corpora/christian/slices/${label}.jsonl`, count: chunk.length });
  }
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));

// stats
const lens = candidates.map((c) => c.len);
const inBand = lens.filter((l) => l >= 350 && l <= 410).length;
const bySecCount = {};
for (const c of candidates) bySecCount[c.sec] = (bySecCount[c.sec] || 0) + 1;
console.log(`candidates=${candidates.length}  slices=${manifest.length}`);
console.log(`len: min=${Math.min(...lens)} max=${Math.max(...lens)} avg=${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}  in 350-410: ${inBand} (${Math.round((inBand / lens.length) * 100)}%)`);
console.log(`sections=${Object.keys(bySecCount).length}`);
console.log("top sections:", Object.entries(bySecCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}:${n}`).join(" "));
console.log(JSON.stringify(manifest));
