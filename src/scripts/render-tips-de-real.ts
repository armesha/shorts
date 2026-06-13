// Render real items from the built German lifehacks deck — one per profession to verify each
// profession background + the German text in the lifehack layout.
//   node --import tsx src/scripts/render-tips-de-real.ts
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { renderAnecdote } from "../anecdotes/render.ts";

const items = JSON.parse(
  readFileSync(resolve(process.cwd(), "data/tips-de/titled.json"), "utf8"),
) as { text: string; title: string; chars: number; profession: string }[];

// One sample per profession (first seen), so we eyeball every background + German wrap.
const seen = new Set<string>();
const picks: typeof items = [];
for (const it of items) {
  if (!seen.has(it.profession)) {
    seen.add(it.profession);
    picks.push(it);
  }
}

async function main() {
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const out = resolve(process.cwd(), `data/output/tips-de-${p.profession}.png`);
    const r = await renderAnecdote(
      { title: p.title, text: p.text, channel: "Deutsche Lifehacks", deck: "tips-de", profession: p.profession },
      out,
    );
    console.log(`[${p.profession}] ${p.chars}ch «${p.title}» bg=${r.bg} -> ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
