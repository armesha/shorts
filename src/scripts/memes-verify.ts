// End-to-end verify of the memes decks through the REAL pipeline: getDeck → titledItems(meme branch)
// → randomAnecdote → renderAnecdote(dispatch→renderMeme: photoCss+buildMemeHtml+captureCard) →
// resolveAudio(meme bed) → assembleStillVideo. Renders one card per deck to /tmp/meme-verify/.
// Run: npx tsx src/scripts/memes-verify.ts
import { getDeck } from "../anecdotes/decks.ts";
import { randomAnecdote, resetDeckCache } from "../anecdotes/library.ts";
import { renderAnecdote } from "../anecdotes/render.ts";
import { resolveAudio, assembleStillVideo } from "../video.ts";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/meme-verify";
mkdirSync(OUT, { recursive: true });

const DECKS = ["memes-ru", "memes-en", "memes-de", "memes-fr", "memes-it", "memes-pt", "memes-es", "memes-hi", "memes-id", "memes-ar"];

const run = async () => {
  for (const id of DECKS) {
    resetDeckCache(id);
    const deck = getDeck(id);
    const item = randomAnecdote(id);
    if (!item) {
      console.log(`${id}: NO CARDS`);
      continue;
    }
    const card = JSON.parse(item.text) as { caption?: string; photoFile?: string };
    const png = `${OUT}/${id}.png`;
    const mp4 = `${OUT}/${id}.mp4`;
    const r = await renderAnecdote({ deck: id, title: item.title, text: item.text, channel: deck.name }, png);
    const { music, audioPath } = resolveAudio(undefined, deck);
    await assembleStillVideo(png, mp4, { audioPath, durationSec: 6 });
    console.log(`${id}: ok | photo=${card.photoFile || "—(typographic)"} | font=${r.fontPx}px | music=${music}`);
    console.log(`   "${(card.caption || "").slice(0, 60).replace(/\n/g, " / ")}"`);
  }
  console.log(`\n→ ${OUT}/*.png + *.mp4`);
};
run();
