// Проверка интеграции деки choose через РЕАЛЬНЫЙ путь движка (deck-реестр + library + renderAnecdote + ytMeta).
import { resolve } from "node:path";
import { getDeck } from "../anecdotes/decks.ts";
import { ytMeta } from "../anecdotes/yt-meta.ts";
import { deckCards, randomAnecdote } from "../anecdotes/library.ts";
import { renderAnecdote } from "../anecdotes/render.ts";

async function main() {
  const deck = getDeck("choose");
  console.log("deck:", deck.id, "| name:", deck.name, "| choose:", deck.choose, "| gallery:", deck.gallery, "| adminOnly:", deck.adminOnly);
  const cards = deckCards("choose");
  console.log("cards loaded:", cards.length);
  const rnd = randomAnecdote("choose");
  console.log("randomAnecdote ok:", !!rnd, "| title:", rnd?.title);
  const meta = ytMeta(deck, cards[0].title, cards[0].text);
  console.log("\n--- ytMeta[0] ---\ntitle:", meta.title, "\ndescription:\n" + meta.description, "\n");

  const OUT = resolve(process.cwd(), "data/output/choose-deck");
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const out = resolve(OUT, `${String(i + 1).padStart(2, "0")}.jpg`);
    const r = await renderAnecdote({ title: c.title, text: c.text, channel: deck.name, deck: "choose" }, out);
    console.log(`rendered ${i + 1}/${cards.length} -> ${out} (bg=${r.bg}, fontPx=${r.fontPx})`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
