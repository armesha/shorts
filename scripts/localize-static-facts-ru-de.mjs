#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE = resolve(ROOT, "data/fact-videos/videos.json");
const CACHE_FILE = resolve(ROOT, "temp/static-facts-translation-cache.json");
const LIMIT = Number(process.env.STATIC_FACTS_LIMIT || 160);
const LANGS = [
  {
    code: "ru",
    outDir: resolve(ROOT, "data/fact-videos-ru"),
    note: "Russian title/text localization of the existing Interesting Facts corpus for static card packs.",
  },
  {
    code: "de",
    outDir: resolve(ROOT, "data/fact-videos-de"),
    note: "German title/text localization of the existing Interesting Facts corpus for static card packs.",
  },
];

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const cache = readJson(CACHE_FILE, {});
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function translate(text, target) {
  const input = String(text || "").trim();
  if (!input) return "";
  const key = `en:${target}:${input}`;
  if (cache[key]) return cache[key];
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", target);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", input);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "shareboard-static-facts-localizer/1.0" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`translate ${res.status}`);
      const data = await res.json();
      const translated = (data?.[0] ?? []).map((part) => part?.[0] ?? "").join("").trim();
      if (!translated) throw new Error("empty translation");
      cache[key] = translated;
      return translated;
    } catch (err) {
      if (attempt === 6) throw err;
      await sleep(500 * attempt);
    }
  }
  throw new Error("unreachable");
}

async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await mapper(items[index], index);
      if (index % 20 === 0) writeJson(CACHE_FILE, cache);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

const sourceRows = readJson(SOURCE, []).slice(0, LIMIT);
for (const lang of LANGS) {
  const localized = await mapLimit(sourceRows, 4, async (row, index) => {
    const [title, text] = await Promise.all([
      translate(row.title ?? "", lang.code),
      translate(row.text ?? "", lang.code),
    ]);
    return {
      ...row,
      title,
      text,
      sourceDeck: "fact-en",
      sourceIndex: index,
      sourceTitle: row.title ?? "",
      sourceText: row.text ?? "",
      localization: lang.code,
    };
  });
  mkdirSync(lang.outDir, { recursive: true });
  writeJson(resolve(lang.outDir, "videos.json"), localized);
  writeJson(resolve(lang.outDir, "index.json"), {
    total: localized.length,
    packs: 1,
    packSize: localized.length,
    sourceDeck: "fact-en",
    localization: lang.code,
    mediaReuse: "none-static-card-only",
  });
  writeJson(resolve(lang.outDir, "sources.json"), {
    generatedAt: new Date().toISOString(),
    sourceDeck: "fact-en",
    sourceFile: "data/fact-videos/videos.json",
    localization: lang.code,
    note: lang.note,
    rights:
      "Static card localization of existing local fact text. No external web images or AP/news imagery are imported; factual claims require spot-checking before broad expansion.",
  });
  console.log(`static-facts-${lang.code}: ${localized.length} rows -> ${lang.outDir.replace(`${ROOT}/`, "")}`);
}

writeJson(CACHE_FILE, cache);
