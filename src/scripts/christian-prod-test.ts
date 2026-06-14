// End-to-end check of the PRODUCTION render path: load real cards from data/christian/cards.json
// and render a few random ones via renderAnecdote (deck="christian") on random backgrounds —
// exactly how the pipeline builds them. Run: node --import tsx src/scripts/christian-prod-test.ts
import { readFileSync, mkdirSync } from "node:fs";
import { renderAnecdote } from "../anecdotes/render.ts";

const cards = JSON.parse(readFileSync("data/christian/cards.json", "utf8"));
const clen = (s: string) => [...s].length;

// pick a spread: shortest, longest, and a few from the middle
const sorted = [...cards].sort((a, b) => clen(a.text) - clen(b.text));
const picks = [
  sorted[0],
  sorted[Math.floor(sorted.length * 0.4)],
  sorted[Math.floor(sorted.length * 0.7)],
  sorted[sorted.length - 1],
  cards[123],
  cards[517],
];

mkdirSync("/tmp/christian-prod", { recursive: true });
let i = 0;
for (const card of picks) {
  const out = `/tmp/christian-prod/prod_${String(++i).padStart(2, "0")}.png`;
  const r = await renderAnecdote(
    { title: card.ref, text: JSON.stringify(card), channel: "", deck: "christian" },
    out,
  );
  console.log(`prod_${String(i).padStart(2, "0")}`, "font", String(r.fontPx).padStart(3), "len", String(clen(card.text)).padStart(3), (card.ref || "").padEnd(20), "bg:", r.bg);
}
console.log("done → /tmp/christian-prod/");
