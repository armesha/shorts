import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const SRC = resolve(process.cwd(), "Русские анекдоты/anek_djvu.txt");
const OUT_DIR = resolve(process.cwd(), "data/anecdotes");

// Profanity / NSFW blocklist (roots). Anything with @ or **-censoring is dropped too.
export const BLOCK =
  /(х[уy][ийёея]|пизд|[еёe]б[ауеёиlivn]|бля[дть]|\bбля\b|сук[аиоуе]|мраз|г[ао]ндон|муда[кч]|пид[оа]р|залуп|манд[аеоу]|дроч|шлюх|еблан|сперм|порн|\bсекс|член[аеуо]|трах|жоп|говн|сра[тл]|\bссы|очко|насри|пизж|@|\*\*+)/i;

export function normalize(s: string): string {
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse → normalize → dedupe → drop profanity/artifacts. Returns clean anecdote strings. */
export function loadCleanAnecdotes(src = SRC): string[] {
  const raw = readFileSync(src, "utf8");
  const aneks = raw.split("<|startoftext|>").map(normalize).filter(Boolean);
  const seen = new Set<string>();
  const deduped = aneks.filter((a) => {
    const key = a.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.filter((a) => !BLOCK.test(a) && !/[<>{}]/.test(a));
}

function main() {
  const MIN = Number(process.env.ANEK_MIN ?? 300);
  const MAX = Number(process.env.ANEK_MAX ?? 400);
  const BUILD = process.argv.includes("--build");

  const raw = readFileSync(SRC, "utf8");
  const totalRaw = raw.split("<|startoftext|>").length - 1;
  const clean = loadCleanAnecdotes();

  const lens = clean.map((a) => a.length).sort((x, y) => x - y);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))];
  const inRange = (min: number, max: number) =>
    clean.filter((a) => a.length >= min && a.length <= max).length;

  console.log("=== ANECDOTES ANALYSIS ===");
  console.log(`raw blocks:   ${totalRaw}`);
  console.log(`clean:        ${clean.length}`);
  console.log(`len pct:      p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} max=${lens[lens.length - 1]}`);
  console.log(`range [${MIN}..${MAX}]: ${inRange(MIN, MAX)} anecdotes`);

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
    console.log(`=== BUILT ${selected.length} anecdotes into ${packs} pack(s) ===`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
