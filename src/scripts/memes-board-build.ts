// Build ALL FIVE board meme decks (memes-ru/en/de/fr/it) from per-language caption files:
//   temp/meme-recheck/captions-<lang>.json = [{idx, caption}]   (idx = catalog template idx)
// Images are language-neutral and SHARED: each template idx -> data/memes/photos/board-<idx>.jpg
// (copied from temp/meme-recheck/src-scaled/meme_src_<idx>.jpg). Cards reference that shared file.
// Writes data/memes-<lang>/{cards.json,index.json}; card = {caption, photoFile, format:"board", theme, srcFile}.
// Also folds the obsolete data/memes-board-ru away and clears stale gallery caches.
// Re-run after regenerating captions. See docs/pack-generation.md.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const REC = resolve(ROOT, "temp/meme-recheck");
const SCALED = resolve(REC, "src-scaled");
const PHOTOS = resolve(ROOT, "data/memes/photos");
const GALLERY = resolve(ROOT, "data/output/gallery");
const LANGS = ["ru", "en", "de", "fr", "it"] as const;

const pad3 = (n: number) => String(n).padStart(3, "0");

const catalog: Array<{ idx: number; mood: string; filename: string }> = JSON.parse(
  readFileSync(resolve(REC, "catalog.json"), "utf8"),
);
const meta = new Map(catalog.map((c) => [c.idx, c]));

mkdirSync(PHOTOS, { recursive: true });
const copiedImg = new Set<string>();

function ensureImage(idx: number): string | null {
  const photoFile = `board-${pad3(idx)}.jpg`;
  if (copiedImg.has(photoFile)) return photoFile;
  const src = resolve(SCALED, `meme_src_${pad3(idx)}.jpg`);
  if (!existsSync(src)) return null;
  copyFileSync(src, resolve(PHOTOS, photoFile));
  copiedImg.add(photoFile);
  return photoFile;
}

const summary: Record<string, number> = {};
for (const lang of LANGS) {
  const capFile = resolve(REC, `captions-${lang}.json`);
  if (!existsSync(capFile)) { console.warn(`captions-${lang}.json missing — skipping ${lang}`); continue; }
  const caps: Array<{ idx: number; caption: string }> = JSON.parse(readFileSync(capFile, "utf8"));
  const cards: Array<Record<string, unknown>> = [];
  const idxsUsed: number[] = [];
  for (const c of caps) {
    const cap = (c.caption || "").trim();
    if (!cap) continue;
    const photoFile = ensureImage(c.idx);
    if (!photoFile) { console.warn(`${lang} #${c.idx}: no scaled image — skipped`); continue; }
    const m = meta.get(c.idx);
    cards.push({ caption: cap, photoFile, format: "board", theme: m?.mood || "", srcFile: m?.filename || "" });
    idxsUsed.push(c.idx);
  }
  const deckDir = resolve(ROOT, `data/memes-${lang}`);
  mkdirSync(deckDir, { recursive: true });
  writeFileSync(resolve(deckDir, "cards.json"), JSON.stringify(cards, null, 2), "utf8");
  writeFileSync(
    resolve(deckDir, "index.json"),
    JSON.stringify(
      { total: cards.length, packs: 1, packSize: cards.length, withPhoto: cards.length,
        range: idxsUsed.length ? [Math.min(...idxsUsed), Math.max(...idxsUsed)] : [0, 0] },
      null, 2,
    ),
    "utf8",
  );
  summary[lang] = cards.length;
  // clear stale gallery thumbs (old Pexels renders) so the board layout re-renders fresh
  const gdir = resolve(GALLERY, `memes-${lang}`);
  if (existsSync(gdir)) rmSync(gdir, { recursive: true, force: true });
}

// retire the temporary single-language board deck dir (folded into memes-ru)
const oldBoard = resolve(ROOT, "data/memes-board-ru");
if (existsSync(oldBoard)) rmSync(oldBoard, { recursive: true, force: true });
const oldBoardGallery = resolve(GALLERY, "memes-board-ru");
if (existsSync(oldBoardGallery)) rmSync(oldBoardGallery, { recursive: true, force: true });

console.log("board decks built:", JSON.stringify(summary));
console.log(`shared images: ${copiedImg.size} board-*.jpg in data/memes/photos`);
