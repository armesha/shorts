// Pexels photo sourcing for the memes deck.
// Pexels License (https://www.pexels.com/license/): free commercial use, NO attribution required,
// modification allowed → low strike risk. The only caveats are no recognizable people shown in a bad
// light and no implied endorsement / brands — handled by agent VISUAL-REVIEW in the build pipeline
// (drop photos with recognizable faces/logos), not here. We still record source/photographer/license
// per image into data/memes/photos/sources.json for audit + reproducibility.
import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

export const PHOTOS_DIR = resolve(process.cwd(), "data/memes/photos");
const SOURCES = resolve(PHOTOS_DIR, "sources.jsonl");

function key(): string {
  if (!process.env.PEXELS_API_KEY) {
    try {
      process.loadEnvFile(resolve(process.cwd(), ".env"));
    } catch {
      /* env may already be set */
    }
  }
  const k = process.env.PEXELS_API_KEY || "";
  if (!k) throw new Error("PEXELS_API_KEY missing — set it in .env");
  return k;
}

export interface PexelsPhoto {
  id: number;
  imageUrl: string; // download URL (large2x — high-res, original aspect; cover-cropped at render)
  pageUrl: string; // Pexels page (the source/credit URL)
  photographer: string;
  photographerUrl: string;
  alt: string;
  width: number;
  height: number;
  avgColor: string;
}

/** Search Pexels for portrait photos matching a query. Returns ranked candidates (empty on miss). */
export async function pexelsSearch(
  query: string,
  opts?: { perPage?: number; orientation?: "portrait" | "landscape" | "square" },
): Promise<PexelsPhoto[]> {
  const u =
    "https://api.pexels.com/v1/search?" +
    new URLSearchParams({
      query,
      per_page: String(opts?.perPage ?? 12),
      orientation: opts?.orientation ?? "portrait",
      size: "large",
    });
  const r = await fetch(u, { headers: { Authorization: key() } });
  if (r.status === 429) {
    const e = new Error(`pexels 429 (burst rate limit)`) as Error & { rateLimited?: boolean };
    e.rateLimited = true;
    throw e;
  }
  if (!r.ok) throw new Error(`pexels HTTP ${r.status} for "${query}"`);
  const j = (await r.json()) as { photos?: any[] };
  return (j.photos || [])
    .filter((p) => p && p.src)
    .map((p) => ({
      id: p.id,
      imageUrl: p.src.large2x || p.src.portrait || p.src.original,
      pageUrl: p.url || "",
      photographer: p.photographer || "",
      photographerUrl: p.photographer_url || "",
      alt: p.alt || "",
      width: p.width || 0,
      height: p.height || 0,
      avgColor: p.avg_color || "",
    }));
}

/** Download a photo to data/memes/photos/<id>.jpg (skips if present). Returns the file name. */
export async function downloadPhoto(p: PexelsPhoto): Promise<string> {
  const file = `${p.id}.jpg`;
  const dest = resolve(PHOTOS_DIR, file);
  if (existsSync(dest)) return file;
  const r = await fetch(p.imageUrl);
  if (!r.ok) throw new Error(`download HTTP ${r.status} for ${p.id}`);
  const ab = await r.arrayBuffer();
  mkdirSync(PHOTOS_DIR, { recursive: true });
  writeFileSync(dest, Buffer.from(ab));
  return file;
}

/** Append a source record (audit + reproducibility) for a downloaded photo. */
export function recordSource(rec: { cardKey: string; query: string; photo: PexelsPhoto; file: string }): void {
  mkdirSync(PHOTOS_DIR, { recursive: true });
  const row = {
    cardKey: rec.cardKey,
    query: rec.query,
    file: rec.file,
    pexelsId: rec.photo.id,
    pageUrl: rec.photo.pageUrl,
    photographer: rec.photo.photographer,
    photographerUrl: rec.photo.photographerUrl,
    alt: rec.photo.alt,
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
  };
  appendFileSync(SOURCES, JSON.stringify(row) + "\n");
}

const MIME = (f: string) => (/\.png$/i.test(f) ? "image/png" : "image/jpeg");

/** Inline a downloaded photo file (by name) as a CSS cover background (data-URI), or null if missing. */
export function photoCss(file?: string | null): string | null {
  if (!file) return null;
  const abs = resolve(PHOTOS_DIR, file);
  if (!existsSync(abs)) return null;
  const buf = readFileSync(abs);
  return `url('data:${MIME(file)};base64,${buf.toString("base64")}') center/cover no-repeat`;
}
