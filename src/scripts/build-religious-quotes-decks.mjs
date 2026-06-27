import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = 700;

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function itemKey(deckId, sourceId) {
  return `religious-quote:${deckId}:${sourceId}`;
}

function packNo(id) {
  return Math.ceil(id / 100);
}

function takeBalancedByBook(cards, count) {
  const byBook = new Map();
  for (const card of cards) {
    const book = String(card.book || "KJV");
    const bucket = byBook.get(book) ?? [];
    bucket.push(card);
    byBook.set(book, bucket);
  }
  for (const bucket of byBook.values()) bucket.sort((a, b) => a.text.length - b.text.length || a.ref.localeCompare(b.ref));
  const books = [...byBook.keys()].sort((a, b) => (byBook.get(b)?.length ?? 0) - (byBook.get(a)?.length ?? 0) || a.localeCompare(b));
  const out = [];
  let cursor = 0;
  while (out.length < count && books.length) {
    const book = books[cursor % books.length];
    const bucket = byBook.get(book) ?? [];
    const next = bucket.shift();
    if (next) out.push(next);
    if (!bucket.length) books.splice(books.indexOf(book), 1);
    else cursor++;
  }
  return out;
}

function christianAttribution(card) {
  const book = String(card.book || "").trim();
  const ref = String(card.ref || "").trim();
  if (["Matthew", "Mark", "Luke", "John"].includes(book)) return `Gospel of ${book} · ${ref}`;
  if (book === "Psalms") return `Psalms · ${ref}`;
  if (book === "Proverbs") return `Proverbs · ${ref}`;
  if (book === "Isaiah") return `Isaiah · ${ref}`;
  if (["Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon"].includes(book)) {
    return `Epistle · ${ref}`;
  }
  return `KJV · ${ref}`;
}

function buildChristian() {
  const deckId = "christian-quotes-en";
  const cards = JSON.parse(readFileSync("data/christian/cards.json", "utf8"))
    .map((card, index) => ({ ...card, sourceIndex: index }))
    .filter((card) => cleanText(card.text).length >= 120 && cleanText(card.text).length <= 390);
  const selected = takeBalancedByBook(cards, TARGET);
  if (selected.length < TARGET) throw new Error(`christian selected ${selected.length}/${TARGET}`);
  const items = selected.map((card, index) => {
    const text = cleanText(card.text);
    const id = index + 1;
    return {
      id,
      pack: packNo(id),
      itemKey: itemKey(deckId, `${card.ref}:${card.sourceIndex}`),
      title: christianAttribution(card),
      text,
      chars: text.length,
      source: "KJV public domain; derived from data/christian/cards.json",
      qid: card.ref,
    };
  });
  const dir = resolve(process.cwd(), `data/${deckId}`);
  mkdirSync(dir, { recursive: true });
  writeJson(resolve(dir, "titled.json"), items);
  writeJson(resolve(dir, "index.json"), {
    deckId,
    language: "en",
    total: items.length,
    packs: packNo(items.length),
    packSize: 100,
    range: [Math.min(...items.map((x) => x.chars)), Math.max(...items.map((x) => x.chars))],
    sourceDeck: "christian",
    sourceFile: "data/christian/cards.json",
    generator: "src/scripts/build-religious-quotes-decks.mjs",
    attributionMode: "KJV reference/source label, not modern author portraits",
    books: [...new Set(selected.map((x) => x.book || "KJV"))].sort(),
  });
  writeJson(resolve(dir, "sources.json"), {
    deckId,
    language: "en",
    generator: "src/scripts/build-religious-quotes-decks.mjs",
    license: {
      quoteSource: "King James Version text already curated in data/christian/cards.json",
      quoteSpdx: "Public Domain",
      portraitSource: "none",
      note: "No portraits or modern Bible translations are used. The quote card title is a reference/source label.",
    },
    safety: [
      "No claims of guaranteed healing or legal/medical advice.",
      "No attacks on protected classes, politics, or other religions.",
      "Keep as a separate Christianity block source, not a general literature/quote source.",
    ],
    count: items.length,
  });
  return { deckId, count: items.length };
}

function islamicAttribution(card) {
  const ref = cleanText(card.ref);
  if (card.type === "hadith") return `النبي محمد ﷺ · ${ref}`;
  if (card.type === "dua") return `دعاء مأثور · ${ref}`;
  return `القرآن الكريم · ${ref}`;
}

function takeIslamic(cards) {
  const byType = (type, maxChars) =>
    cards
      .filter((card) => card.type === type && cleanText(card.arabic).length >= 40 && cleanText(card.arabic).length <= maxChars)
      .sort((a, b) => cleanText(a.arabic).length - cleanText(b.arabic).length || cleanText(a.ref).localeCompare(cleanText(b.ref)));
  const pools = {
    hadith: byType("hadith", 420),
    dua: byType("dua", 320),
    ayah: byType("ayah", 300),
  };
  const selected = [];
  const seen = new Set();
  const add = (card) => {
    const key = `${card.type}:${card.ref}:${card.arabic}`;
    if (seen.has(key)) return false;
    seen.add(key);
    selected.push(card);
    return true;
  };
  for (const [type, target] of [
    ["hadith", 40],
    ["dua", 200],
    ["ayah", 460],
  ]) {
    for (const card of pools[type]) {
      if (selected.filter((x) => x.type === type).length >= target) break;
      add(card);
    }
  }
  const fallback = [...pools.ayah, ...pools.dua, ...pools.hadith].sort(
    (a, b) => cleanText(a.arabic).length - cleanText(b.arabic).length || cleanText(a.ref).localeCompare(cleanText(b.ref)),
  );
  for (const card of fallback) {
    if (selected.length >= TARGET) break;
    add(card);
  }
  return selected.slice(0, TARGET);
}

function buildIslamic() {
  const deckId = "islamic-quotes-ar";
  const cards = JSON.parse(readFileSync("data/islamic/cards.json", "utf8")).map((card, index) => ({ ...card, sourceIndex: index }));
  const selected = takeIslamic(cards);
  if (selected.length < TARGET) throw new Error(`islamic selected ${selected.length}/${TARGET}`);
  const items = selected.map((card, index) => {
    const text = cleanText(card.arabic);
    const id = index + 1;
    return {
      id,
      pack: packNo(id),
      itemKey: itemKey(deckId, `${card.type}:${card.ref}:${card.sourceIndex}`),
      title: islamicAttribution(card),
      text,
      chars: text.length,
      source: card.type === "hadith" ? "Hadith corpus curated in data/islamic/cards.json" : card.type === "dua" ? "Hisn al-Muslim corpus curated in data/islamic/cards.json" : "Quran corpus curated in data/islamic/cards.json",
      qid: card.ref_en || card.ref,
    };
  });
  const dir = resolve(process.cwd(), `data/${deckId}`);
  mkdirSync(dir, { recursive: true });
  writeJson(resolve(dir, "titled.json"), items);
  const byType = items.reduce((acc, item) => {
    const type = item.source.includes("Hadith") ? "hadith" : item.source.includes("Hisn") ? "dua" : "ayah";
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  writeJson(resolve(dir, "index.json"), {
    deckId,
    language: "ar",
    total: items.length,
    packs: packNo(items.length),
    packSize: 100,
    range: [Math.min(...items.map((x) => x.chars)), Math.max(...items.map((x) => x.chars))],
    byType,
    sourceDeck: "islamic",
    sourceFile: "data/islamic/cards.json",
    generator: "src/scripts/build-religious-quotes-decks.mjs",
    attributionMode: "Quran / Prophet Muhammad ﷺ / transmitted dua source labels; no portraits",
  });
  writeJson(resolve(dir, "sources.json"), {
    deckId,
    language: "ar",
    generator: "src/scripts/build-religious-quotes-decks.mjs",
    license: {
      quoteSource: "Arabic Quran, hadith and dua texts already curated in data/islamic/cards.json from local source ledger",
      portraitSource: "none",
      note: "No portraits of prophets, companions, scholars, or modern people are used.",
    },
    safety: [
      "Use only within Islamic religious channels and source groups.",
      "Do not use for attacks on other religions or protected classes.",
      "No extremist, political, medical, or guaranteed-miracle framing.",
    ],
    count: items.length,
  });
  return { deckId, count: items.length, byType };
}

console.log(buildIslamic());
console.log(buildChristian());
