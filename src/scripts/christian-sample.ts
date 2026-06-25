// Render 15 sample KJV passages — ONE per background — for the visual QA loop.
// Pulls exact text from local-assets/corpora/christian/pool.json (built by christian-fetch-corpus.mjs).
// Run: node --import tsx src/scripts/christian-sample.ts   → /tmp/christian-prev/*.png
import { readFileSync, mkdirSync } from "node:fs";
import { renderChristianCard, type ChristianCard } from "../christian/render.ts";

const pool: Record<string, { book: string; ch: number; v: number; text: string; len: number; testament: string }> =
  JSON.parse(readFileSync("local-assets/corpora/christian/pool.json", "utf8"));

// Build a passage starting at book/ch/v, accumulating consecutive verses (same chapter) to ~target chars.
function passage(book: string, ch: number, v: number, floor = 330, cap = 470): ChristianCard & { len: number } {
  const start = pool[`${book}|${ch}|${v}`];
  if (!start) throw new Error(`missing ${book} ${ch}:${v}`);
  const vs = [start];
  let len = start.len;
  let cur = v;
  while (len < floor) {
    const next = pool[`${book}|${ch}|${cur + 1}`];
    if (!next) break;
    if (len + 1 + next.len > cap) break;
    vs.push(next);
    len += 1 + next.len;
    cur = next.v;
  }
  const text = vs.map((x) => x.text).join(" ");
  const a = vs[0].v;
  const b = vs[vs.length - 1].v;
  const bookRef = book === "Psalms" ? "Psalm" : book;
  const ref = a === b ? `${bookRef} ${ch}:${a}` : `${bookRef} ${ch}:${a}-${b}`;
  return { type: "verse", text, ref, theme: "", book, testament: start.testament, len };
}

// One passage per background (varied mood/length to stress-test each safe zone).
const jobs: [string, number, number, string, string][] = [
  ["John", 3, 16, "protestant_bible_corner.jpg", "01_john316"],
  ["Psalms", 23, 1, "protestant_candle_cross.jpg", "02_ps23"],
  ["Psalms", 46, 1, "protestant_chapel_silhouette.jpg", "03_ps46"],
  ["Lamentations", 3, 22, "protestant_forest_sunrise.jpg", "04_lam3"],
  ["John", 14, 1, "protestant_minimal_cross.jpg", "05_john14"],
  ["Proverbs", 3, 5, "protestant_open_bible.jpg", "06_prov3"],
  ["Romans", 8, 38, "protestant_pulpit_bible.jpg", "07_rom8"],
  ["Philippians", 4, 6, "protestant_stained_glass.jpg", "08_phil4"],
  ["Isaiah", 40, 29, "protestant_wooden_cross.jpg", "09_isa40"],
  ["Matthew", 11, 28, "protestant_worship_hall.jpg", "10_matt11"],
  ["Psalms", 27, 1, "protestant_photo_empty_pews.jpg", "11_ps27"],
  ["Isaiah", 41, 10, "protestant_photo_hill_cross.jpg", "12_isa41"],
  ["1 Corinthians", 13, 4, "protestant_photo_pulpit_bible.jpg", "13_1cor13"],
  ["Psalms", 34, 17, "protestant_photo_rainy_bible.jpg", "14_ps34"],
  ["Psalms", 121, 1, "protestant_photo_wooden_church.jpg", "15_ps121"],
];

mkdirSync("/tmp/christian-prev", { recursive: true });
for (const [book, ch, v, bg, name] of jobs) {
  const card = passage(book, ch, v);
  const r = await renderChristianCard(card, `/tmp/christian-prev/${name}.png`, bg);
  console.log(
    name.padEnd(16),
    "font", String(r.fontPx).padStart(3),
    "len", String(card.len).padStart(3),
    (card.ref || "").padEnd(20),
    bg,
  );
}
console.log("done → /tmp/christian-prev/");
