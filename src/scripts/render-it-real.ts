// Render real items from the freshly built dense Italian deck to eyeball quality + density.
//   node --import tsx src/scripts/render-it-real.ts
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { renderAnecdote } from "../anecdotes/render.ts";

const items = JSON.parse(
  readFileSync(resolve(process.cwd(), "data/anecdotes-it/titled.json"), "utf8"),
) as { text: string; title: string; chars: number }[];

const byLen = [...items].sort((a, b) => a.chars - b.chars);
const picks = [
  byLen[Math.floor(byLen.length * 0.15)], // shorter
  byLen[Math.floor(byLen.length * 0.5)], // median
  byLen[Math.floor(byLen.length * 0.85)], // longer
];

async function main() {
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const out = resolve(process.cwd(), `data/output/it-real-${i + 1}.png`);
    const r = await renderAnecdote(
      { title: p.title, text: p.text, channel: "Barzellette Italiane", deck: "it" },
      out,
    );
    console.log(`#${i + 1} [${p.chars}ch] font=${r.fontPx}px «${p.title}» -> ${out}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
