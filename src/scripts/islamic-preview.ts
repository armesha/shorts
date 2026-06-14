// Render a spread of Islamic cards on different backgrounds for visual review.
import { readFileSync, mkdirSync } from "node:fs";
import { renderIslamicCard, type IslamicCard } from "../islamic/render.ts";

const cards = JSON.parse(readFileSync("data/islamic/cards.json", "utf8")) as IslamicCard[];
const clen = (s: string) => [...s].length;
const ayahs = cards.filter((c) => c.type === "ayah");
const hadiths = cards.filter((c) => c.type === "hadith");
const duas = cards.filter((c) => c.type === "dua");
const byLen = [...ayahs].sort((a, b) => clen(a.arabic) - clen(b.arabic));
const mid = <T>(a: T[]) => a[Math.floor(a.length / 2)];

const jobs: [IslamicCard, string, string][] = [
  [byLen[0], "islamic_crescent.jpg", "01_short_crescent"],
  [byLen[byLen.length - 1], "islamic_prayer_rug.jpg", "02_long_rug"],
  [mid(byLen), "islamic_light_beam.jpg", "03_mid_beam"],
  [mid(hadiths), "islamic_mosque_arch.jpg", "04_hadith_arch"],
  [mid(duas), "islamic_open_book.jpg", "05_dua_book"],
  [ayahs[3], "islamic_mosque_silhouette.jpg", "06_ayah_mosque"],
  [ayahs[12], "islamic_quran_header.jpg", "07_ayah_quranhdr"],
  [ayahs[25], "islamic_gold_rosette.jpg", "08_ayah_rosette"],
];

mkdirSync("/tmp/islamic-prev", { recursive: true });
for (const [card, bg, name] of jobs) {
  const r = await renderIslamicCard(card, `/tmp/islamic-prev/${name}.png`, bg);
  console.log(name.padEnd(20), "font", String(r.fontPx).padStart(3), "len", String(clen(card.arabic)).padStart(3), card.type.padEnd(6), card.ref);
}
console.log("done");
