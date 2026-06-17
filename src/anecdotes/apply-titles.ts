import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Applies the LLM workflow _titles-*.json (written per pack by the title workflow) into each
// deck's titled.json: sets the title and, for Italian, drops items flagged keep=false (chatter).
// Russian (data/anecdotes) is intentionally NOT touched here.
const DIRS: Record<string, string> = {
  de: "data/anecdotes-de",
  fr: "data/anecdotes-fr",
  it: "data/anecdotes-it",
};

interface PackItem {
  id: number;
  pack: number;
  text: string;
  chars: number;
  title: string;
}
interface TitleRow {
  id: number;
  title?: string;
  keep?: boolean;
}

for (const [deckId, dir] of Object.entries(DIRS)) {
  const full = resolve(process.cwd(), dir);
  if (!existsSync(full)) {
    console.log(`${deckId}: dir missing — skip`);
    continue;
  }
  const packs = readdirSync(full).filter((f) => /^pack-\d+\.json$/.test(f)).sort();
  const titled: PackItem[] = [];
  let dropped = 0;
  let untitledPacks = 0;
  for (const pf of packs) {
    const items = JSON.parse(readFileSync(resolve(full, pf), "utf8")) as PackItem[];
    const tpath = resolve(full, pf.replace(/^pack-/, "_titles-"));
    if (!existsSync(tpath)) {
      untitledPacks++;
      continue; // pack not titled yet → stays out of titled.json (unused)
    }
    let titles: TitleRow[];
    try {
      titles = JSON.parse(readFileSync(tpath, "utf8")) as TitleRow[];
    } catch {
      untitledPacks++;
      continue;
    }
    const byId = new Map(titles.map((t) => [t.id, t]));
    for (const it of items) {
      const t = byId.get(it.id);
      if (!t) continue;
      if (t.keep === false) {
        dropped++;
        continue;
      }
      const title = (t.title || "").trim().slice(0, 40);
      if (!title) continue;
      titled.push({ ...it, title });
    }
  }
  if (titled.length) {
    writeFileSync(resolve(full, "titled.json"), JSON.stringify(titled, null, 1));
    console.log(
      `${deckId}: titled.json = ${titled.length} (dropped ${dropped}, packs without titles: ${untitledPacks})`,
    );
  } else {
    console.log(`${deckId}: no titles to apply (untitled packs: ${untitledPacks})`);
  }
}
