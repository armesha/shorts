// Assemble the memes decks: read /tmp/meme-content-photos.json (captions + assigned Pexels photoFile)
// and write data/memes-<lang>/cards.json + index.json per language. Card = the minimal shape the
// pipeline needs ({caption, format, theme, imageQuery, photoFile?, photoSource?}); the whole object is
// stored as JSON in the runtime item's `text` (see library.ts meme branch). Re-run after re-fetching
// photos or editing content. Run: npx tsx src/scripts/memes-build.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const SRC = "/tmp/meme-content-photos.json";
const REPO = "/home/davtian/Documents/shorts";

interface Card {
  caption: string;
  imageQuery?: string;
  needsPhoto?: boolean;
  format?: string;
  theme?: string;
  photoFile?: string;
  photoSource?: { pexelsId: number; pageUrl: string; photographer: string };
}

const content = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, Card[]>;

let grand = 0;
for (const [lang, arr] of Object.entries(content)) {
  const dir = resolve(REPO, `data/memes-${lang}`);
  mkdirSync(dir, { recursive: true });
  const cards = arr
    .filter((c) => (c.caption || "").trim())
    .map((c) => {
      const out: Card = { caption: c.caption.trim() };
      if (c.format) out.format = c.format;
      if (c.theme) out.theme = c.theme;
      if (c.imageQuery) out.imageQuery = c.imageQuery;
      if (c.photoFile) out.photoFile = c.photoFile;
      if (c.photoSource) out.photoSource = c.photoSource;
      return out;
    });
  const lens = cards.map((c) => [...c.caption].length);
  const index = {
    total: cards.length,
    packs: 1,
    packSize: cards.length,
    range: [Math.min(...lens), Math.max(...lens)],
    withPhoto: cards.filter((c) => c.photoFile).length,
  };
  writeFileSync(resolve(dir, "cards.json"), JSON.stringify(cards, null, 1));
  writeFileSync(resolve(dir, "index.json"), JSON.stringify(index, null, 1));
  grand += cards.length;
  console.log(`memes-${lang}: ${cards.length} cards (${index.withPhoto} with photo) → data/memes-${lang}/`);
}
console.log(`DONE: ${grand} cards across ${Object.keys(content).length} languages`);
