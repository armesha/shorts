// Smoke-test the anecdote render on Romanian diacritics (ă â î ș ț).
//   node --import tsx src/scripts/render-ro-test.ts
import { resolve } from "node:path";
import fs from "node:fs";
import { renderAnecdote } from "../anecdotes/render.ts";

const titled = JSON.parse(fs.readFileSync(resolve(process.cwd(), "data/anecdotes-ro/titled.json"), "utf8"));
const CH = "Bancuri Românești";
const ids = [859, 82, 22];
const SAMPLES = ids.map((id) => titled.find((c: any) => c.id === id));

async function main() {
  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const out = resolve(process.cwd(), `data/output/ro-test-${i + 1}.png`);
    const r = await renderAnecdote({ title: s.title, text: s.text, channel: CH, deck: "ro" }, out);
    console.log(`#${i + 1} id=${s.id} chars=${s.text.length} font=${r.fontPx}px bg=${r.bg} -> ${out}`);
  }
}

main();
