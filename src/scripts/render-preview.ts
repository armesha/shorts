import { resolve } from "node:path";
import { renderToImage, type ShortContent } from "../render.ts";

// Sample mirrors the user's reference Shorts (German "Psychologische Fakten"),
// 6 evenly-distributed facts with a bold key word in each.
const sample: ShortContent = {
  lang: "de",
  title: "6 PSYCHOLOGISCHE FAKTEN",
  channel: "Liebe mein Leben",
  facts: [
    "**Wenn du nicht träumst,** könntest du unter starkem Schlafmangel leiden.",
    "**Babys, die dich anstarren,** empfinden dich oft als vertrauenswürdig.",
    "**Gefühle zu unterdrücken** kann dich seelisch und körperlich erschöpfen.",
    "**Eine geballte Faust** zeigt ungefähr die Größe deines Herzens.",
    "**Menschen, die Selbstgespräche führen,** sind im Schnitt besser im Lösen von Problemen.",
    "**Wer leicht vergibt,** trägt häufig den größten Schmerz in sich.",
  ],
};

const out = resolve(process.cwd(), "data/output/preview.png");
const path = await renderToImage(sample, out);
console.log("Rendered preview ->", path);
