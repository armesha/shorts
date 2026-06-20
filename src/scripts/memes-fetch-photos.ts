// Fetch a license-safe Pexels photo for every needsPhoto meme card.
// Resumable: reads /tmp/meme-content-photos.json (or /tmp/meme-content.json) and skips cards that
// already have photoFile. Throttled (~0.8s between API searches, cached per query) to avoid the
// Pexels burst limit; on HTTP 429 it backs off and retries. Downloads to data/memes/photos/<id>.jpg,
// records source. Cards that miss keep no photo → typographic fallback at render.
// Run: npx tsx src/scripts/memes-fetch-photos.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pexelsSearch, downloadPhoto, recordSource, type PexelsPhoto } from "../memes/photos.ts";

const BASE = "/tmp/meme-content.json";
const OUT = "/tmp/meme-content-photos.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 18_500; // Pexels free tier ≈ 200 req/hour → ~1 per 18s to stay under the cap
const BACKOFF_MS = 300_000; // on 429, wait 5 min for the hourly window to free up

interface Card {
  caption: string;
  imageQuery: string;
  needsPhoto: boolean;
  format: string;
  theme: string;
  src: string;
  lang?: string;
  photoFile?: string;
  photoSource?: { pexelsId: number; pageUrl: string; photographer: string };
}

const content = JSON.parse(readFileSync(existsSync(OUT) ? OUT : BASE, "utf8")) as Record<string, Card[]>;
const cache = new Map<string, PexelsPhoto[]>();
const useCount = new Map<string, number>();

async function searchRetry(q: string): Promise<PexelsPhoto[]> {
  const cached = cache.get(q.toLowerCase());
  if (cached) return cached;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const cands = await pexelsSearch(q, { perPage: 10, orientation: "portrait" });
      cache.set(q.toLowerCase(), cands);
      await sleep(THROTTLE_MS);
      return cands;
    } catch (e) {
      if ((e as { rateLimited?: boolean }).rateLimited) {
        console.log(`  429 backoff ${BACKOFF_MS / 1000}s (attempt ${attempt + 1})`);
        await sleep(BACKOFF_MS);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`giving up after retries: "${q.slice(0, 40)}"`);
}

const run = async () => {
  let assigned = 0,
    skipped = 0,
    missed = 0,
    failed = 0;
  const save = () => writeFileSync(OUT, JSON.stringify(content, null, 1));
  for (const [lang, cards] of Object.entries(content)) {
    for (const card of cards) {
      card.lang = lang;
      const q = (card.imageQuery || "").trim();
      if (!card.needsPhoto || !q) continue;
      if (card.photoFile) {
        skipped++;
        continue;
      }
      try {
        const cands = await searchRetry(q);
        if (!cands.length) {
          missed++;
          continue;
        }
        const i = useCount.get(q.toLowerCase()) || 0;
        useCount.set(q.toLowerCase(), i + 1);
        const photo = cands[Math.min(i, cands.length - 1)];
        const file = await downloadPhoto(photo);
        card.photoFile = file;
        card.photoSource = { pexelsId: photo.id, pageUrl: photo.pageUrl, photographer: photo.photographer };
        recordSource({ cardKey: `${lang}:${card.caption.slice(0, 24)}`, query: q, photo, file });
        assigned++;
        if (assigned % 20 === 0) {
          save();
          console.log(`  ...${assigned} new (${skipped} kept, ${missed} missed, ${failed} failed)`);
        }
      } catch (e) {
        failed++;
        if (failed <= 10) console.error(`  fail "${q.slice(0, 40)}": ${(e as Error).message}`);
      }
    }
  }
  save();
  const withPhoto = Object.values(content).flat().filter((c) => c.photoFile).length;
  console.log(`\nDONE: +${assigned} new, ${skipped} kept, ${missed} missed, ${failed} failed`);
  console.log(`total with photo: ${withPhoto} | unique queries this run: ${cache.size}`);
  console.log(`-> ${OUT}`);
};
run();
