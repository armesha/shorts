// Prep agent photo-review for the NEW RU cards only (src=gen2 with photoFile): thumbnail each unique
// raw photo + manifest. Run: npx tsx src/scripts/memes-review-prep-ru.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { downscaleImage } from "../video.ts";
import { PHOTOS_DIR } from "../memes/photos.ts";

const content = JSON.parse(readFileSync("/tmp/meme-content-photos.json", "utf8")) as Record<string, { caption?: string; imageQuery?: string; photoFile?: string; src?: string }[]>;
const OUT = "/tmp/meme-review-ru";
mkdirSync(`${OUT}/ph`, { recursive: true });

const byPhoto = new Map<string, { photoFile: string; caption: string; query: string }>();
for (const c of content.ru || []) {
  if (c.src === "gen2" && c.photoFile && !byPhoto.has(c.photoFile)) {
    byPhoto.set(c.photoFile, { photoFile: c.photoFile, caption: c.caption || "", query: c.imageQuery || "" });
  }
}

const run = async () => {
  const manifest: { photoFile: string; thumb: string; caption: string; query: string }[] = [];
  let i = 0;
  for (const e of byPhoto.values()) {
    const src = resolve(PHOTOS_DIR, e.photoFile);
    if (!existsSync(src)) continue;
    const thumb = `${OUT}/ph/${e.photoFile}`;
    try {
      if (!existsSync(thumb)) await downscaleImage(src, thumb, 260);
      manifest.push({ photoFile: e.photoFile, thumb, caption: e.caption, query: e.query });
      i++;
      if (i % 50 === 0) console.log(`  ...${i}`);
    } catch (err) {
      console.error(`  thumb fail ${e.photoFile}: ${(err as Error).message}`);
    }
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  console.log(`new RU photos thumbnailed: ${manifest.length} → ${OUT}/manifest.json`);
};
run();
