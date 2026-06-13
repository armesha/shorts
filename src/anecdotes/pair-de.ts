import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Combines the German titled.json into PAIRS — two short Witze per card with a small divider —
// so each short joke (150–224 chars) together fills the vertical frame (no AI needed).
// Idempotent: skips if the deck already looks paired.
const F = resolve(process.cwd(), "data/anecdotes-de/titled.json");
const DIV = "\n\n•  •  •\n\n";

interface Item {
  id: number;
  pack: number;
  text: string;
  chars: number;
  title: string;
}

if (!existsSync(F)) {
  console.log("de titled.json missing — nothing to pair");
} else {
  const items = JSON.parse(readFileSync(F, "utf8")) as Item[];
  if (items[0]?.text?.includes(DIV)) {
    console.log(`de already paired (${items.length}) — skip`);
  } else {
    const pairs: Item[] = [];
    for (let i = 0; i + 1 < items.length; i += 2) {
      const a = items[i];
      const b = items[i + 1];
      const text = `${a.text}${DIV}${b.text}`;
      pairs.push({ id: a.id, pack: a.pack, text, chars: text.length, title: a.title });
    }
    writeFileSync(F, JSON.stringify(pairs, null, 1));
    console.log(`de paired: ${items.length} → ${pairs.length} (каждый = 2 Witze)`);
  }
}
