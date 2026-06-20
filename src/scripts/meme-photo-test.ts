// Proof-of-concept: fetch a Pexels photo by keyword (Pexels License: free commercial, no attribution
// required, modification allowed), render a meme caption over it, record source/license metadata.
// Validates contextual photo backdrops without copyright-strike risk. Curation (drop recognizable
// faces/brands) happens in the real pipeline via agent visual-review.
// Run: npx tsx src/scripts/meme-photo-test.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderMemeCard, type MemeCard } from "../memes/render.ts";

try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* .env optional if already in env */
}

const KEY = process.env.PEXELS_API_KEY || "";
const OUT = "/tmp/meme-proto";
mkdirSync(OUT, { recursive: true });

interface Pick {
  imageUrl: string;
  pageUrl: string;
  photographer: string;
  alt: string;
  width: number;
  height: number;
  license: string;
  source: string;
}

async function pexelsSearch(query: string): Promise<Pick | null> {
  const u =
    "https://api.pexels.com/v1/search?" +
    new URLSearchParams({ query, per_page: "12", orientation: "portrait", size: "large" });
  const r = await fetch(u, { headers: { Authorization: KEY } });
  if (!r.ok) {
    console.error(`  pexels HTTP ${r.status} for "${query}"`);
    return null;
  }
  const j = (await r.json()) as { photos?: any[] };
  const ph = (j.photos || [])[0];
  if (!ph) return null;
  return {
    imageUrl: ph.src?.large2x || ph.src?.portrait || ph.src?.original,
    pageUrl: ph.url,
    photographer: ph.photographer || "",
    alt: ph.alt || "",
    width: ph.width,
    height: ph.height,
    license: "Pexels License",
    source: "pexels",
  };
}

async function toDataCss(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `url('data:${ct};base64,${b64}') center/cover no-repeat`;
  } catch {
    return null;
  }
}

const tests: { caption: string; query: string; lang: string }[] = [
  { lang: "ru", caption: "Когда поставил будильник на 7:00, чтобы начать новую жизнь — а проснулся в 14:00", query: "alarm clock bed morning" },
  { lang: "en", caption: "POV: you said 'you too' to the waiter who told you to enjoy your meal", query: "restaurant table dinner" },
  { lang: "it", caption: "Io: da domani sveglia alle 6, palestra, vita nuova", query: "tired man lying on couch" },
  { lang: "ru", caption: "Я в начале месяца / я в конце месяца", query: "empty wallet money problem" },
];

const run = async () => {
  if (!KEY) {
    console.error("NO PEXELS_API_KEY in env");
    return;
  }
  console.log(`Pexels key loaded (…${KEY.slice(-4)})`);
  const sources: any[] = [];
  let i = 0;
  for (const t of tests) {
    i++;
    console.log(`\n[${i}] query="${t.query}"`);
    const pick = await pexelsSearch(t.query);
    if (!pick) {
      console.log("  no result");
      continue;
    }
    console.log(`  found: ${pick.width}x${pick.height} by ${pick.photographer || "?"} | "${pick.alt.slice(0, 60)}"`);
    const css = await toDataCss(pick.imageUrl);
    if (!css) {
      console.log("  download failed");
      continue;
    }
    const card: MemeCard = { caption: t.caption, bgCss: css, lang: t.lang };
    const out = `${OUT}/photo_${i}_${t.lang}.png`;
    const { fontPx } = await renderMemeCard(card, out);
    console.log(`  rendered ${out} (font=${fontPx}px)`);
    sources.push({ query: t.query, caption: t.caption, ...pick, imageUrl: pick.imageUrl.slice(0, 80) + "…" });
  }
  writeFileSync(`${OUT}/photo-sources.json`, JSON.stringify(sources, null, 2));
  console.log(`\nsources -> ${OUT}/photo-sources.json (${sources.length})`);
};
run();
