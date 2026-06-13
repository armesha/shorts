import { loadCleanAnecdotes } from "../anecdotes/build.ts";
import { renderAnecdote } from "../anecdotes/render.ts";

const all = loadCleanAnecdotes();
const targets = [60, 100, 160, 240, 300, 360];

for (const t of targets) {
  const s = all
    .filter((a) => Math.abs(a.length - t) < 6 && !a.includes("\n"))
    .sort((a, b) => a.length - b.length)[0];
  if (!s) {
    console.log(`~${t}: no sample`);
    continue;
  }
  const out = `data/output/anek/len-${String(t).padStart(3, "0")}.png`;
  const r = await renderAnecdote(
    { title: "Про жизнь", text: s, channel: "Русские анекдоты" },
    out,
  );
  console.log(`~${t} (${s.length} chars) -> body font ${r.fontPx}px -> ${out}`);
}
