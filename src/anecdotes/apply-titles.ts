import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Applies generated titles (_titles-*.json) into the packs, then rebuilds titled.json
// (the pool of READY anecdotes the generator may use). Titles are capped to 22 chars.
const DIR = resolve(process.cwd(), "data/anecdotes");

const titleMap = new Map<number, string>();
for (const tf of readdirSync(DIR).filter((f) => f.startsWith("_titles-") && f.endsWith(".json"))) {
  const arr = JSON.parse(readFileSync(resolve(DIR, tf), "utf8")) as { id: number; title: string }[];
  for (const t of arr) titleMap.set(t.id, (t.title || "").trim().slice(0, 22));
}

const packs = readdirSync(DIR).filter((f) => f.startsWith("pack-") && f.endsWith(".json")).sort();
const titled: unknown[] = [];
let applied = 0;
for (const pf of packs) {
  const items = JSON.parse(readFileSync(resolve(DIR, pf), "utf8")) as { id: number; title: string }[];
  let changed = false;
  for (const it of items) {
    if (titleMap.has(it.id)) {
      it.title = titleMap.get(it.id)!;
      changed = true;
      applied++;
    }
    if (it.title) titled.push(it);
  }
  if (changed) writeFileSync(resolve(DIR, pf), JSON.stringify(items, null, 1));
}
writeFileSync(resolve(DIR, "titled.json"), JSON.stringify(titled, null, 1));
console.log(`Applied ${applied} titles. Ready (titled) pool: ${titled.length} anecdotes.`);
