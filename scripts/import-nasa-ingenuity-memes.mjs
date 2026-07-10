import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const memesPath = resolve(process.cwd(), "server/public/memes/memes.js");
const imagesDir = resolve(process.cwd(), "server/public/memes/images");

const sourcePage = "https://mars.nasa.gov/technology/helicopter/memes/";
const commonsBase = "https://commons.wikimedia.org/wiki/File:";
const assets = [
  {
    id: "nasa-ingenuity-03",
    filename: "2508.jpg",
    text: "EXCEEDING EXPECTATIONS SINCE 2021",
    commonsName: "Ingenuity_memes_03.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Ingenuity_memes_03.jpg/500px-Ingenuity_memes_03.jpg",
    sha256: "c5e99b812c88911a12fce1bbb5c4c697ec13484d8a822fbfade94a480441486e",
  },
  {
    id: "nasa-ingenuity-06",
    filename: "2509.jpg",
    text: "BYE BUDDY",
    commonsName: "Ingenuity_memes_06.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Ingenuity_memes_06.jpg/500px-Ingenuity_memes_06.jpg",
    sha256: "ab269cb5b1718801aed7588227d49cd6d9330ed863f91ff1ce23fbf17b9c45d3",
  },
  {
    id: "nasa-ingenuity-04",
    filename: "2510.jpg",
    text: "MISSION ACCOMPLISHED",
    commonsName: "Ingenuity_memes_04.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Ingenuity_memes_04.jpg/500px-Ingenuity_memes_04.jpg",
    sha256: "11596ad67fc46ec41df10651fd0f667aac88c2198a8958efbe77a5dd2566002f",
  },
  {
    id: "nasa-ingenuity-07",
    filename: "2511.jpg",
    text: "FRIENDSHIP GOALS",
    commonsName: "Ingenuity_memes_07.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Ingenuity_memes_07.jpg/500px-Ingenuity_memes_07.jpg",
    sha256: "df48720a2607ba71450b8874e68052a9586c9925bc6dae906eb3779bd0ecbd11",
  },
  {
    id: "nasa-ingenuity-15",
    filename: "2512.jpg",
    text: "WHEN YOUR BESTIE IS ALSO A ROBOT",
    commonsName: "Ingenuity_memes_15.jpg",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Ingenuity_memes_15.jpg/500px-Ingenuity_memes_15.jpg",
    sha256: "3916d0c7790ed3fbafa1bcf994079bc53fe9f3896ead7fbaa4fe0b6e8f6f4b35",
  },
];

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function loadImage(asset) {
  const target = resolve(imagesDir, asset.filename);
  if (existsSync(target)) {
    const bytes = readFileSync(target);
    if (digest(bytes) !== asset.sha256) throw new Error(`Unexpected bytes in ${asset.filename}`);
    return;
  }

  const response = await fetch(asset.url, {
    headers: { "User-Agent": "shareboard.live public archive importer/1.0" },
  });
  if (!response.ok) throw new Error(`Unable to download ${asset.id}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.id}`);
  writeFileSync(target, bytes);
}

for (const asset of assets) await loadImage(asset);

const source = readFileSync(memesPath, "utf8");
const memes = JSON.parse(source.replace(/^window\.MEMES=/, "").replace(/;\s*$/, ""));
const presentIds = new Set(memes.map((meme) => meme.id));
const additions = assets
  .filter((asset) => !presentIds.has(asset.id))
  .map((asset, index) => ({
    id: asset.id,
    title: `Единственный текст сверху: «${asset.text}». Ниже — изображение марсианского вертолёта Ingenuity.`,
    url: `images/${asset.filename}`,
    thumb: `images/${asset.filename}`,
    sub: "NASA Mars / JPL-Caltech · Public domain",
    cat: "Английские мемы",
    ups: 0 - index,
    link: `${commonsBase}${asset.commonsName}`,
    topicCat: "Наука и космос",
    layout: "top-text-en",
    source: "nasa-ingenuity",
  }));

writeFileSync(memesPath, `window.MEMES=${JSON.stringify([...memes, ...additions])};`, "utf8");
console.log(`added=${additions.length} total=${memes.length + additions.length}`);

console.log(`source=${sourcePage}`);
