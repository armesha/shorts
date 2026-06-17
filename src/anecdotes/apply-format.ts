import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Applies LLM workflow reformat/title results (_fmt-*.json) into the packs, rebuilds titled.json.
const DIR = resolve(process.cwd(), "data/anecdotes");

const fmtFiles = readdirSync(DIR).filter((f) => f.startsWith("_fmt-") && f.endsWith(".json"));
const map = new Map<number, { title: string; text: string }>();
for (const f of fmtFiles) {
  try {
    const arr = JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as {
      id: number;
      title?: string;
      text?: string;
    }[];
    for (const it of arr) {
      map.set(it.id, { title: (it.title || "").trim().slice(0, 22), text: (it.text || "").trim() });
    }
  } catch {
    console.warn("skip bad file", f);
  }
}

const packs = readdirSync(DIR).filter((f) => f.startsWith("pack-") && f.endsWith(".json")).sort();
const titled: unknown[] = [];
let applied = 0;
for (const pf of packs) {
  const items = JSON.parse(readFileSync(resolve(DIR, pf), "utf8")) as {
    id: number;
    title: string;
    text: string;
    chars: number;
  }[];
  let changed = false;
  for (const it of items) {
    const f = map.get(it.id);
    if (f) {
      it.title = f.title;
      if (f.text) it.text = f.text;
      it.chars = it.text.length;
      changed = true;
      applied++;
    }
    if (it.title) titled.push(it);
  }
  if (changed) writeFileSync(resolve(DIR, pf), JSON.stringify(items, null, 1));
}
writeFileSync(resolve(DIR, "titled.json"), JSON.stringify(titled, null, 1));
for (const f of fmtFiles) rmSync(resolve(DIR, f), { force: true });
console.log(`Applied ${applied} reformatted+titled anecdotes. Titled pool: ${titled.length}.`);
