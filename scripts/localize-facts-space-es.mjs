#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const CACHE_FILE = resolve(ROOT, "temp/facts-space-es-translation-cache.json");
const JOBS = [
  {
    id: "fact-es",
    source: resolve(ROOT, "data/fact-videos/videos.json"),
    outDir: resolve(ROOT, "data/fact-videos-es"),
    sourceDeck: "fact-en",
    note: "Spanish title/text localization of Interesting Facts. Generation rebuilds the chosen source video with Spanish overlay and edge-tts voiceover.",
  },
  {
    id: "space-es",
    source: resolve(ROOT, "data/space/videos.json"),
    outDir: resolve(ROOT, "data/space-es"),
    sourceDeck: "space",
    note: "Spanish title/text localization of Space. Generation rebuilds the chosen source video with Spanish overlay and edge-tts voiceover.",
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

async function translate(text) {
  const input = String(text || "").trim();
  if (!input) return "";
  const key = `en:es:${input}`;
  if (cache[key]) return cache[key];
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "es");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", input);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "shareboard-facts-space-es-localizer/1.0" },
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
      await sleep(600 * attempt);
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
      if (index % 25 === 0) writeJson(CACHE_FILE, cache);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return out;
}

for (const job of JOBS) {
  const rows = readJson(job.source, []);
  const localized = await mapLimit(rows, 4, async (row, index) => {
    const [title, text] = await Promise.all([translate(row.title ?? ""), translate(row.text ?? "")]);
    return {
      ...row,
      title,
      text,
      sourceDeck: job.sourceDeck,
      sourceIndex: index,
      sourceTitle: row.title ?? "",
      sourceText: row.text ?? "",
      localization: "es",
    };
  });
  mkdirSync(job.outDir, { recursive: true });
  writeJson(resolve(job.outDir, "videos.json"), localized);
  writeJson(resolve(job.outDir, "index.json"), {
    total: localized.length,
    packs: 1,
    packSize: localized.length,
    sourceDeck: job.sourceDeck,
    localization: "es",
    mediaReuse: "source-footage",
  });
  writeJson(resolve(job.outDir, "sources.json"), {
    generatedAt: new Date().toISOString(),
    deck: job.id,
    sourceDeck: job.sourceDeck,
    sourceFile: job.source.replace(`${ROOT}/`, ""),
    note: job.note,
    rights:
      "Uses existing local pre-built videos as source footage. Live generation rebuilds the selected video with Spanish overlay text and edge-tts voiceover instead of publishing the English audio/caption track.",
  });
  console.log(`${job.id}: ${localized.length} rows -> ${job.outDir.replace(`${ROOT}/`, "")}`);
}

writeJson(CACHE_FILE, cache);
