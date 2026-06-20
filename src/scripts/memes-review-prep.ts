// Prep for agent photo-review: for each UNIQUE assigned Pexels photo, make a small thumbnail of the
// raw jpg (no card render needed) + a manifest (photoFile → representative caption + cards using it).
// Agents then Read the thumbnails and flag unsafe/irrelevant photos. Run: npx tsx src/scripts/memes-review-prep.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { downscaleImage } from "../video.ts";
import { PHOTOS_DIR } from "../memes/photos.ts";

const SRC = "/tmp/meme-content-photos.json";
const OUT = "/tmp/meme-review";
mkdirSync(`${OUT}/ph`, { recursive: true });

const content = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, { caption?: string; imageQuery?: string; photoFile?: string }[]>;

interface Entry {
  photoFile: string;
  caption: string;
  query: string;
  usedBy: { lang: string; idx: number }[];
}
const byPhoto = new Map<string, Entry>();
for (const [lang, arr] of Object.entries(content)) {
  arr.forEach((c, idx) => {
    if (!c.photoFile) return;
    const e = byPhoto.get(c.photoFile) || { photoFile: c.photoFile, caption: c.caption || "", query: c.imageQuery || "", usedBy: [] };
    e.usedBy.push({ lang, idx });
    byPhoto.set(c.photoFile, e);
  });
}

const run = async () => {
  const manifest: { photoFile: string; thumb: string; caption: string; query: string; usedBy: { lang: string; idx: number }[] }[] = [];
  let i = 0;
  for (const e of byPhoto.values()) {
    const src = resolve(PHOTOS_DIR, e.photoFile);
    if (!existsSync(src)) continue;
    const thumb = `${OUT}/ph/${e.photoFile}`;
    try {
      if (!existsSync(thumb)) await downscaleImage(src, thumb, 260);
      manifest.push({ photoFile: e.photoFile, thumb, caption: e.caption, query: e.query, usedBy: e.usedBy });
      i++;
      if (i % 50 === 0) console.log(`  ...${i}`);
    } catch (err) {
      console.error(`  thumb fail ${e.photoFile}: ${(err as Error).message}`);
    }
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`unique photos thumbnailed: ${manifest.length} → ${OUT}/manifest.json`);
};
run();
