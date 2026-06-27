import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const DECK_DIR = resolve(process.cwd(), "data/christian-quotes-en");
const ART_DIR = resolve(DECK_DIR, "artworks");
const MAX_TEXT_WITH_ARTWORK = 360;

const ARTWORKS = [
  {
    id: "christ-pantocrator-sinai",
    fileTitle: "File:Spas vsederzhitel sinay.jpg",
    role: "Christ Pantocrator icon",
    books: ["Matthew", "Mark", "Luke", "John"],
  },
  {
    id: "sermon-on-the-mount-bloch",
    fileTitle: "File:Bloch-SermonOnTheMount.jpg",
    role: "Sermon on the Mount artwork",
    books: ["Matthew", "Luke"],
  },
  {
    id: "apostle-paul-rembrandt",
    fileTitle: "File:Rembrandt - Apostle Paul - WGA19120.jpg",
    role: "Saint Paul artwork",
    books: [
      "Romans",
      "1 Corinthians",
      "2 Corinthians",
      "Galatians",
      "Ephesians",
      "Philippians",
      "Colossians",
      "1 Thessalonians",
      "2 Thessalonians",
      "1 Timothy",
      "2 Timothy",
      "Titus",
      "Philemon",
    ],
  },
  {
    id: "good-shepherd-catacomb",
    fileTitle: "File:Good Shepherd 04.jpg",
    role: "Good Shepherd early Christian artwork",
    books: ["John", "Psalms"],
  },
];

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function commonsPage(fileTitle) {
  return `https://commons.wikimedia.org/wiki/${fileTitle.replace(/^File:/, "File:").replace(/ /g, "_")}`;
}

async function commonsInfo(fileTitle) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "960");
  url.searchParams.set("titles", fileTitle);
  const data = await (await fetch(url)).json();
  const page = Object.values(data?.query?.pages ?? {})[0];
  if (!page || "missing" in page || !page.imageinfo?.[0]) throw new Error(`Commons file not found: ${fileTitle}`);
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value || meta.UsageTerms?.value || "");
  if (!/public domain|cc0/i.test(license)) {
    throw new Error(`Commons file is not public-domain/CC0: ${fileTitle} (${license || "unknown license"})`);
  }
  return {
    imageUrl: info.thumburl || info.url,
    sourceUrl: commonsPage(fileTitle),
    license,
    artist: stripHtml(meta.Artist?.value || meta.Credit?.value || "Unknown artist"),
    objectName: stripHtml(meta.ObjectName?.value || fileTitle.replace(/^File:/, "")),
  };
}

async function download(url, outPath) {
  if (existsSync(outPath)) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buffer);
}

function bookFromItem(item) {
  const ref = String(item.qid || item.title || "");
  const match = ref.match(/^((?:[1-3]\s+)?[A-Za-z]+)/);
  return match ? match[1].trim() : "";
}

function artworkFor(item, index, downloaded) {
  const book = bookFromItem(item);
  const byBook = downloaded.filter((art) => art.books.includes(book));
  if (byBook.length) return byBook[index % byBook.length];
  if (book === "Proverbs" || book === "Ecclesiastes") return downloaded.find((art) => art.id === "good-shepherd-catacomb") ?? downloaded[0];
  if (["Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel"].includes(book)) {
    return downloaded.find((art) => art.id === "christ-pantocrator-sinai") ?? downloaded[0];
  }
  return downloaded[index % downloaded.length];
}

mkdirSync(ART_DIR, { recursive: true });

const downloaded = [];
for (const artwork of ARTWORKS) {
  const info = await commonsInfo(artwork.fileTitle);
  const ext = extname(new URL(info.imageUrl).pathname).split(".").pop() || "jpg";
  const file = `data/christian-quotes-en/artworks/${artwork.id}.${ext.toLowerCase().replace(/jpeg$/, "jpg")}`;
  await download(info.imageUrl, resolve(process.cwd(), file));
  downloaded.push({ ...artwork, ...info, file });
}

const titledPath = resolve(DECK_DIR, "titled.json");
const items = JSON.parse(readFileSync(titledPath, "utf8"));
let applied = 0;
const nextItems = items.map((item, index) => {
  const next = { ...item };
  delete next.portraitFile;
  delete next.portraitUrl;
  delete next.portraitCredit;
  delete next.portraitLicense;
  if (Number(item.chars ?? String(item.text || "").length) > MAX_TEXT_WITH_ARTWORK) return next;
  const artwork = artworkFor(item, index, downloaded);
  next.portraitFile = artwork.file;
  next.portraitUrl = artwork.sourceUrl;
  next.portraitCredit = `${artwork.objectName}; ${artwork.artist}; used as historical religious artwork, not as a real portrait`;
  next.portraitLicense = artwork.license;
  applied += 1;
  return next;
});
writeJson(titledPath, nextItems);

const sourcesPath = resolve(DECK_DIR, "sources.json");
const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));
sources.license = {
  ...(sources.license ?? {}),
  portraitSource: "Wikimedia Commons public-domain/CC0 religious artworks",
  note: "Christian quote cards may use old public-domain/CC0 religious artwork as contextual artwork only; not modern photos and not real portrait claims.",
};
sources.artworks = downloaded.map((artwork) => ({
  id: artwork.id,
  role: artwork.role,
  file: artwork.file,
  commonsFile: artwork.fileTitle,
  sourceUrl: artwork.sourceUrl,
  license: artwork.license,
  artist: artwork.artist,
  objectName: artwork.objectName,
}));
sources.artworkAppliedToCards = applied;
sources.safety = [
  ...(sources.safety ?? []).filter((line) => !/portrait/i.test(String(line))),
  "Use Christian artworks only as public-domain/CC0 historical religious artwork, not as real portraits of biblical figures.",
  "Do not use modern actors/people as Jesus, apostles, saints, or prophets.",
];
writeJson(sourcesPath, sources);

console.log({ deckId: "christian-quotes-en", artworks: downloaded.length, applied });
