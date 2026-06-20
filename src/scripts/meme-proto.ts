// Prototype/visual-QA render for the memes deck. Renders real verified seed memes + stress tests
// to /tmp/meme-proto/*.png so the layout (fit, no clipping, readability) can be eyeballed.
// Run: npx tsx src/scripts/meme-proto.ts
import { readFileSync } from "node:fs";
import { renderMemeCard, type MemeCard } from "../memes/render.ts";

const OUT = "/tmp/meme-proto";

let seeds: Record<string, MemeCard[]> = {};
try {
  seeds = JSON.parse(readFileSync("/tmp/meme-seeds.json", "utf8"));
} catch {
  console.error("no /tmp/meme-seeds.json — using only stress cards");
}

const pick = (lang: string, n = 2): MemeCard[] => (seeds[lang] || []).slice(0, n).map((c) => ({ ...c, lang }));

const stress: MemeCard[] = [
  { lang: "de", kicker: "stress", caption: "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz war gestern" },
  { lang: "ru", kicker: "stress", caption: "Превентивная безоговорочная самоидентификация по понедельникам" },
  { lang: "en", kicker: "short", caption: "it is what it is" },
  { lang: "ru", kicker: "two-line", topText: "ожидание: продуктивный день", bottomText: "реальность: 6 часов в телефоне" },
];

const cards: MemeCard[] = [
  ...pick("ru", 3),
  ...pick("en", 2),
  ...pick("de", 2),
  ...pick("it", 1),
  ...pick("fr", 1),
  ...stress,
];

const run = async () => {
  console.log(`rendering ${cards.length} cards -> ${OUT}`);
  let i = 0;
  for (const c of cards) {
    i++;
    const name = `${String(i).padStart(2, "0")}_${c.lang || "x"}.png`;
    const out = `${OUT}/${name}`;
    try {
      const { bg, fontPx } = await renderMemeCard(c, out);
      const cap = (c.caption || [c.topText, c.bottomText].filter(Boolean).join(" / ") || c.text || "").slice(0, 60);
      console.log(`  ${name}  font=${fontPx}px bg=${bg}  "${cap}"`);
    } catch (e) {
      console.error(`  ${name}  FAILED:`, (e as Error).message);
    }
  }
  console.log("done");
};
run();
