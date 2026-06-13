// Aggregates the Haiku-cleaned Italian jokes (corpora/it-gen/clean-*.json) into a dense, ready-to-use
// deck: titled.json (the only pool the runtime uses) + index.json + pack-*.json. Replaces the old
// short-skewed data/anecdotes-it. Run AFTER the it-clean workflow finishes:
//   node --import tsx src/anecdotes/build-it-dense.ts
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { getDeck } from "./decks.ts";

const GEN_DIR = resolve(process.cwd(), "corpora/it-gen");
const OUT_DIR = resolve(process.cwd(), getDeck("it").dir); // data/anecdotes-it

const MIN = Number(process.env.IT_FINAL_MIN ?? 240);
const MAX = Number(process.env.IT_FINAL_MAX ?? 640);
const PACK = Number(process.env.IT_PACK ?? 1000);
const TITLE_MAX = 34;

// Deterministic advertiser-safety net on TOP of Haiku's judgment (same philosophy as build-it.ts
// BLOCK): Haiku keeps clean innuendo, but explicit roots are dropped here for monetization safety.
const UNSAFE =
  /(\bcazz|cul[oi]\b|\bmerd|puttan|\btroi[ae]|\bfiga\b|scopa(re|ta|to)|chiavar|porno|sessual|preservativ|eiacul|erezion|masturb|orgasm|amplesso|sborr|coglion|minchia|frocio|stronz|vaffa|incul|zoccol|pompin|\bpene\b|vagina|\btett[ei]\b|prostitut|verginit|\bsesso\b|\bsega\b)/i;

interface Clean { text?: string; title?: string }

// Haiku sometimes wraps JSON in ```fences``` or adds prose — slice to the outer [ ... ].
function parseLoose(raw: string): Clean[] {
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Safety net for the rare ASCII-accent (~1%) Haiku leaves behind. Only UNAMBIGUOUS words — multi-letter
// forms with no innocent homograph, plus standalone "e'" (after start/space/quote, before space).
function fixAsciiAccents(s: string): string {
  const W: [RegExp, string][] = [
    [/perche'/gi, "perché"], [/poiche'/gi, "poiché"], [/affinche'/gi, "affinché"],
    [/finche'/gi, "finché"], [/benche'/gi, "benché"], [/anziche'/gi, "anziché"],
    [/giacche'/gi, "giacché"], [/sicche'/gi, "sicché"], [/nonche'/gi, "nonché"],
    [/piu'/gi, "più"], [/puo'/gi, "può"], [/cosi'/gi, "così"], [/pero'/gi, "però"],
    [/gia'/gi, "già"], [/cioe'/gi, "cioè"], [/caffe'/gi, "caffè"],
    [/citta'/gi, "città"], [/verita'/gi, "verità"], [/qualita'/gi, "qualità"],
    [/quantita'/gi, "quantità"], [/universita'/gi, "università"], [/liberta'/gi, "libertà"],
    [/novita'/gi, "novità"], [/attivita'/gi, "attività"], [/realta'/gi, "realtà"],
    [/eta'/gi, "età"], [/meta'/gi, "metà"], [/pieta'/gi, "pietà"], [/volonta'/gi, "volontà"],
    [/societa'/gi, "società"], [/felicita'/gi, "felicità"], [/possibilita'/gi, "possibilità"],
    [/velocita'/gi, "velocità"], [/identita'/gi, "identità"], [/serieta'/gi, "serietà"],
  ];
  let out = s;
  for (const [re, rep] of W) out = out.replace(re, rep);
  out = out.replace(/(^|[\s"«(—-])e'(?=\s)/g, "$1è").replace(/(^|[\s"«(—-])E'(?=\s)/g, "$1È");
  return out;
}

function tidyText(t: string): string {
  return fixAsciiAccents(
    String(t || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[!]{2,}/g, "!")
      .replace(/[?]{2,}/g, "?")
      .trim(),
  );
}

function tidyTitle(t: string): string {
  let s = String(t || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^["'«»„“”\s]+|["'«»„“”\s.,;:!?-]+$/g, "").trim();
  if (s.length > TITLE_MAX) s = s.slice(0, TITLE_MAX).replace(/\s+\S*$/, "").trim();
  return s;
}

// djb2 over normalized text — stable dedup key (also matches the runtime's anecdoteKey shape).
function key(text: string): string {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length}`;
}

function main() {
  if (!existsSync(GEN_DIR)) {
    console.error(`No ${GEN_DIR} — run the it-clean workflow first.`);
    process.exit(1);
  }
  const files = readdirSync(GEN_DIR).filter((f) => /^clean-\d+\.json$/.test(f)).sort();
  console.log(`clean files: ${files.length}`);

  const seen = new Set<string>();
  const items: { id: number; pack: number; text: string; chars: number; title: string }[] = [];
  let raw = 0, dropLen = 0, dropDup = 0, dropTitle = 0, dropUnsafe = 0;

  for (const f of files) {
    const arr = parseLoose(readFileSync(resolve(GEN_DIR, f), "utf8"));
    for (const it of arr) {
      raw++;
      const text = tidyText(it.text ?? "");
      const title = tidyTitle(it.title ?? "");
      if (text.length < MIN || text.length > MAX) { dropLen++; continue; }
      if (!title || title.length < 3) { dropTitle++; continue; }
      if (UNSAFE.test(text) || UNSAFE.test(title)) { dropUnsafe++; continue; }
      const k = key(text);
      if (seen.has(k)) { dropDup++; continue; }
      seen.add(k);
      items.push({ id: 0, pack: 0, text, chars: text.length, title });
    }
  }

  // Renumber + pack.
  items.forEach((it, i) => {
    it.id = i + 1;
    it.pack = Math.floor(i / PACK) + 1;
  });
  const packs = Math.max(1, Math.ceil(items.length / PACK));

  const lens = items.map((i) => i.chars).sort((a, b) => a - b);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] ?? 0;
  console.log(`raw parsed: ${raw} · kept: ${items.length} · dropped len:${dropLen} dup:${dropDup} title:${dropTitle} unsafe:${dropUnsafe}`);
  console.log(`len p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} min=${lens[0]} max=${lens[lens.length - 1]}`);

  mkdirSync(OUT_DIR, { recursive: true });
  // Write the new deck, then remove any stale pack files beyond the new count.
  writeFileSync(resolve(OUT_DIR, "titled.json"), JSON.stringify(items, null, 1));
  for (let p = 1; p <= packs; p++) {
    const slice = items.filter((it) => it.pack === p);
    writeFileSync(resolve(OUT_DIR, `pack-${String(p).padStart(3, "0")}.json`), JSON.stringify(slice, null, 1));
  }
  for (const f of readdirSync(OUT_DIR).filter((x) => /^pack-(\d+)\.json$/.test(x))) {
    const n = Number(f.match(/^pack-(\d+)\.json$/)![1]);
    if (n > packs) unlinkSync(resolve(OUT_DIR, f));
  }
  writeFileSync(
    resolve(OUT_DIR, "index.json"),
    JSON.stringify({ total: items.length, packs, packSize: PACK, range: [MIN, MAX] }, null, 2),
  );
  console.log(`=== BUILT ${items.length} dense IT jokes into ${packs} pack(s) at ${OUT_DIR} ===`);
}

main();
