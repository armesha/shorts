// Mines LONG, dense Italian jokes from the Usenet source for an LLM cleaning pass.
// build-it.ts caps length at 400 and keeps short one-liners that render loose (huge line gaps).
// Here we reuse the same junk-stripping cleaner but keep only the longer, self-contained
// story/dialogue jokes (which naturally fill the 1080×1920 frame), then emit them in batches
// for the workflow to fix accents (e' → è), repair mojibake, drop non-jokes, and add a title.
//
//   report:  node --import tsx src/anecdotes/it-mine.ts
//   emit:    node --import tsx src/anecdotes/it-mine.ts --emit [maxFiles] [chunk]
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadCleanBarzellette } from "./build-it.ts";

const GEN_DIR = resolve(process.cwd(), "local-assets/corpora/it-gen");

// Candidate band (RAW cleaned length, before accent-fix which slightly shortens text).
// Floor high enough that the joke fills the frame; ceiling so it still fits at a readable font.
const MIN = Number(process.env.IT_MIN ?? 280);
const MAX = Number(process.env.IT_MAX ?? 680);

function main() {
  const all = loadCleanBarzellette();
  const lens = all.map((t) => t.length).sort((a, b) => a - b);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] ?? 0;
  console.log("=== IT MINE: cleaned pool ===");
  console.log(`total cleaned (deduped): ${all.length}`);
  console.log(`len pct: p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} p95=${at(0.95)} max=${lens[lens.length - 1]}`);
  const bands: [number, number][] = [
    [200, 260], [260, 320], [320, 400], [400, 500], [500, 680], [680, 99999],
  ];
  for (const [a, b] of bands) {
    console.log(`  [${a}-${b}): ${all.filter((t) => t.length >= a && t.length < b).length}`);
  }
  const pool = all.filter((t) => t.length >= MIN && t.length <= MAX);
  console.log(`candidate band [${MIN}..${MAX}]: ${pool.length}`);

  if (!process.argv.includes("--emit")) return;

  // Even sample down to maxFiles*chunk so we cover the whole length range, not just the front.
  const rest = process.argv.filter((a) => /^\d+$/.test(a)).map(Number);
  const maxFiles = rest[0] ?? 70;
  const chunk = rest[1] ?? 50;
  const cap = maxFiles * chunk;
  // step>=2 so two runs with IT_OFFSET 0 and 1 pick DISJOINT slices (top-up without re-cleaning).
  const offset = Number(process.env.IT_OFFSET ?? 0);
  const start = Number(process.env.IT_START ?? 1); // first cand file number (append, don't clobber)
  const append = process.argv.includes("--append");
  const step = Math.max(2, Math.floor(pool.length / cap));
  const picked = pool.filter((_, i) => i % step === offset % step).slice(0, cap);

  if (!append && existsSync(GEN_DIR)) rmSync(GEN_DIR, { recursive: true, force: true });
  mkdirSync(GEN_DIR, { recursive: true });
  let files = 0;
  for (let i = 0; i < picked.length; i += chunk) {
    writeFileSync(
      resolve(GEN_DIR, `cand-${String(start + files).padStart(3, "0")}.json`),
      JSON.stringify(picked.slice(i, i + chunk), null, 1),
    );
    files++;
  }
  const from = String(start).padStart(3, "0");
  console.log(`=== EMITTED ${picked.length} candidates (offset ${offset}, step ${step}) into ${files} file(s) [cand-${from}..] ===`);
}

main();
