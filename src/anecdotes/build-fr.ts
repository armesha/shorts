import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize } from "./build.ts";
import { getDeck } from "./decks.ts";

// Builds the French "Blagues françaises" deck from Blagues-API (MIT, ~2.7k jokes, Q&A format).
// Source: https://github.com/Blagues-API/blagues-api (blagues.json). Keep only safe categories.
const deck = getDeck("fr");
const SRC = resolve(process.cwd(), deck.source); // local-assets/corpora/blagues.json
const OUT_DIR = resolve(process.cwd(), deck.dir); // data/anecdotes-fr

// Monetization-safe categories only — drop dark / limit / beauf / blondes.
const SAFE = new Set(["global", "dev"]);

// Light French NSFW safety net (category filter already removes the unsafe bulk).
const BLOCK =
  /(\bcul\b|\bbite|couille|\bmerde|putain|salop|\bpute\b|niqu|\bbaise|baiser|\bsexe|p[ée]nis|vagin|porno|connard|encul|p[ée]d[ée]|n[èe]gre|youpin|\bviol(er|ée?)?\b|masturb|\bbranl|godemich|orgasm|préservatif|enfoir|nichon|\bchatte\b|@|\*\*+)/i;

interface Blague {
  id: number;
  type: string;
  joke: string;
  answer: string;
}

/** Parse JSON → keep safe categories → compose Q + A → normalize → dedupe → drop NSFW/artifacts. */
export function loadCleanBlagues(src = SRC): string[] {
  const arr = JSON.parse(readFileSync(src, "utf8")) as Blague[];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of arr) {
    if (!SAFE.has(b.type)) continue;
    const q = (b.joke || "").trim();
    const a = (b.answer || "").trim();
    const text = normalize(a ? `${q}\n\n${a}` : q); // setup + punchline (blank line between)
    if (!text) continue;
    if (BLOCK.test(text)) continue;
    if (/[<>{}]|https?:|www\./i.test(text)) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function main() {
  const MIN = Number(process.env.ANEK_MIN ?? 60);
  const MAX = Number(process.env.ANEK_MAX ?? 400);
  const BUILD = process.argv.includes("--build");
  const clean = loadCleanBlagues();
  const lens = clean.map((a) => a.length).sort((x, y) => x - y);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] ?? 0;
  const inRange = clean.filter((a) => a.length >= MIN && a.length <= MAX).length;
  console.log("=== FRENCH BLAGUES ANALYSIS ===");
  console.log(`clean (safe, deduped): ${clean.length}`);
  console.log(`len pct: p10=${at(0.1)} p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} max=${lens[lens.length - 1] ?? 0}`);
  console.log(`range [${MIN}..${MAX}]: ${inRange}`);
  if (BUILD) {
    const selected = clean.filter((a) => a.length >= MIN && a.length <= MAX);
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    const PACK = 100;
    let packs = 0;
    for (let i = 0; i < selected.length; i += PACK) {
      packs++;
      const items = selected.slice(i, i + PACK).map((text, j) => ({
        id: i + j + 1,
        pack: packs,
        text,
        chars: text.length,
        title: "",
      }));
      writeFileSync(
        resolve(OUT_DIR, `pack-${String(packs).padStart(3, "0")}.json`),
        JSON.stringify(items, null, 1),
      );
    }
    writeFileSync(
      resolve(OUT_DIR, "index.json"),
      JSON.stringify({ total: selected.length, packs, packSize: PACK, range: [MIN, MAX] }, null, 2),
    );
    console.log(`=== BUILT ${selected.length} into ${packs} pack(s) at ${OUT_DIR} ===`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
