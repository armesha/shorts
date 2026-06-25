// Pre-download the FULL King James Version (exact, public-domain English) into local files,
// so the passage-windowing + selection workflow reads from disk instead of hitting the net.
// Source: aruljohn/Bible-kjv via jsDelivr CDN — clean {book, chapters:[{chapter, verses:[{verse,text}]}]},
// no Strong's markup. Output (gitignored): local-assets/corpora/christian/verses.jsonl + pool.json (id -> verse).
import { writeFileSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/local-assets/corpora/christian`;
mkdirSync(OUT, { recursive: true });

const CDN = "https://cdn.jsdelivr.net/gh/aruljohn/Bible-kjv@master";
const clen = (s) => [...s].length;

async function getJson(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error("fetch failed: " + url);
}
async function mapLimit(items, limit, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        try { res[idx] = await fn(items[idx], idx); } catch (e) { res[idx] = null; console.error("book failed:", items[idx], e.message); }
      }
    }),
  );
  return res;
}

// KJV cleanup: collapse whitespace, drop pilcrows, normalize spacing around punctuation.
function clean(t) {
  return String(t || "")
    .replace(/¶/g, " ")        // ¶ paragraph marks
    .replace(/\s+/g, " ")
    .replace(/\s+([,;:.!?])/g, "$1") // no space before punctuation
    .trim();
}

const books = await getJson(`${CDN}/Books.json`); // 66 names in canonical order
const OT = 39; // first 39 books = Old Testament

const verses = [];
await mapLimit(books, 6, async (book, bi) => {
  const file = book.replace(/ /g, ""); // "1 Samuel" -> "1Samuel", "Song of Solomon" -> "SongofSolomon"
  const j = await getJson(`${CDN}/${file}.json`);
  const testament = bi < OT ? "OT" : "NT";
  for (const ch of j.chapters || []) {
    const cn = Number(ch.chapter);
    for (const v of ch.verses || []) {
      const text = clean(v.text);
      if (!text) continue;
      const vn = Number(v.verse);
      verses.push({ id: `${book}|${cn}|${vn}`, book, bi, testament, ch: cn, v: vn, text, len: clen(text) });
    }
  }
});

// canonical sort (book order, then chapter, then verse)
verses.sort((a, b) => a.bi - b.bi || a.ch - b.ch || a.v - b.v);

const pool = {};
for (const x of verses) pool[x.id] = x;

writeFileSync(`${OUT}/verses.jsonl`, verses.map((x) => JSON.stringify(x)).join("\n") + "\n");
writeFileSync(`${OUT}/pool.json`, JSON.stringify(pool));
writeFileSync(`${OUT}/books.json`, JSON.stringify(books));

const ot = verses.filter((x) => x.testament === "OT").length;
const nt = verses.length - ot;
const lens = verses.map((x) => x.len);
console.log(`books=${books.length} verses=${verses.length} (OT=${ot} NT=${nt})`);
console.log(`verse chars: min=${Math.min(...lens)} max=${Math.max(...lens)} avg=${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}`);
console.log(`wrote ${OUT}/verses.jsonl + pool.json + books.json`);
