#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { get } from "node:https";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "data/anecdotes-en");
const PACK_SIZE = 300;
const TARGET = 2000;

const SOURCES = [
  {
    id: 21084,
    title: "Jokes For All Occasions",
    author: "Anonymous",
    url: "https://www.gutenberg.org/cache/epub/21084/pg21084.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 12444,
    title: "Toaster's Handbook: Jokes, Stories, and Quotations",
    author: "C. E. Fanning and H. W. Wilson",
    url: "https://www.gutenberg.org/cache/epub/12444/pg12444.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 49370,
    title: "English Jests and Anecdotes, Collected from Various Sources",
    author: "Various",
    url: "https://www.gutenberg.org/cache/epub/49370/pg49370.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 43101,
    title: "Witty Pieces by Witty People",
    author: "Various",
    url: "https://www.gutenberg.org/cache/epub/43101/pg43101.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 29419,
    title: "The Book of Anecdotes and Budget of Fun",
    author: "Various",
    url: "https://www.gutenberg.org/cache/epub/29419/pg29419.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 20352,
    title: "The Jest Book",
    author: "Mark Lemon",
    url: "https://www.gutenberg.org/cache/epub/20352/pg20352.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 69216,
    title: "Sheared cream o' wit",
    author: "Carl J. Mittler",
    url: "https://www.gutenberg.org/cache/epub/69216/pg69216.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 44643,
    title: "The Funny Bone",
    author: "Henry Martyn Kieffer",
    url: "https://www.gutenberg.org/cache/epub/44643/pg44643.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 15338,
    title: "More Toasts",
    author: "Marion Dix Mosher",
    url: "https://www.gutenberg.org/cache/epub/15338/pg15338.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 60973,
    title: "Vaudeville Wit and Humor",
    author: "Various",
    url: "https://www.gutenberg.org/cache/epub/60973/pg60973.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
  {
    id: 43996,
    title: "The American Joe Miller",
    author: "Robert Kempt",
    url: "https://www.gutenberg.org/cache/epub/43996/pg43996.txt",
    license: "Project Gutenberg; public domain in the USA",
  },
];

const BLOCKED = [
  // Protected-class or old corpus stereotypes.
  "nigger",
  "negro",
  "colored man",
  "colored woman",
  "chinaman",
  "chink",
  "jap",
  "gypsy",
  "gipsy",
  "hebrew",
  "jew",
  "jewish",
  "irishman",
  "scotchman",
  "scotsman",
  "dutchman",
  "yankee",
  "indian",
  "savage",
  "hottentot",
  "idiot",
  "lunatic",
  "insane asylum",
  "crazy",
  "cripple",
  "deaf",
  "blind man",
  "blind woman",
  // Religion, politics, violence, sex and alcohol are filtered out for mass publishing safety.
  "god",
  "lord",
  "jesus",
  "christ",
  "church",
  "priest",
  "minister",
  "rabbi",
  "devil",
  "president",
  "democrat",
  "republican",
  "king",
  "queen",
  "war",
  "battle",
  "murder",
  "kill",
  "shot",
  "gun",
  "pistol",
  "suicide",
  "hanged",
  "dead",
  "death",
  "corpse",
  "whiskey",
  "whisky",
  "beer",
  "wine",
  "brandy",
  "drunk",
  "liquor",
  "damn",
  "hell",
  "sex",
  "lover",
  "mistress",
  "naked",
  "kiss",
  "bedroom",
  "divorce",
];

const BLOCKED_PATTERNS = [
  /\bniggers?\b/i,
  /\bnegro\w*\b/i,
  /\bcolored\s+(?:man|men|woman|women|people)\b/i,
  /\bchina(?:man|men)\b/i,
  /\bchinks?\b/i,
  /\bjaps?\b/i,
  /\bg[yi]ps(?:y|ies)\b/i,
  /\bjews?\b/i,
  /\bjewish\b/i,
  /\bhebrews?\b/i,
  /\birish(?:man|men)?\b/i,
  /\bscotch(?:man|men)?\b/i,
  /\bscots(?:man|men)?\b/i,
  /\bdutch(?:man|men)?\b/i,
  /\byankees?\b/i,
  /\bindian\s+(?:chief|brave|squaw|tribe)\b/i,
  /\bsavages?\b/i,
  /\bhottentot\w*\b/i,
  /\blunatic\w*\b/i,
  /\binsane\s+asylum\b/i,
  /\bcrippl\w*\b/i,
  /\bdeaf\s+(?:man|men|woman|women|person)\b/i,
  /\bblind\s+(?:man|men|woman|women|person)\b/i,
  /\bchurch(?:man|men)?\b/i,
  /\bpriest\w*\b/i,
  /\bclergy\w*\b/i,
  /\bclerg(?:y|yman|ymen)\b/i,
  /\bminister\b/i,
  /\brabbis?\b/i,
  /\bdrunk\w*\b/i,
  /\bwhisk(?:ey|y)\b/i,
  /\bbrandy\b/i,
  /\bliquor\b/i,
  /\bbeer\b/i,
  /\bsuicid\w*\b/i,
  /\bmurder\w*\b/i,
  /\bkill\w*\b/i,
  /\bhanged\b/i,
  /\bcorpse\b/i,
  /\bnaked\b/i,
];

const NON_JOKE_PATTERNS = [
  /\btoast(?:s|ing)?\b/i,
  /\btoastmaster\b/i,
  /\bpublic speaker\b/i,
  /\bafter[- ]dinner\b/i,
  /\banecdote teller\b/i,
  /\btelling a story\b/i,
  /\bways of telling\b/i,
  /\birony and satire\b/i,
  /\bpolitical gatherings?\b/i,
  /\bpolitic\w*\b/i,
  /\bgovernments?\b/i,
  /\bat the expense of rivals\b/i,
  /\bprecise rules\b/i,
  /\bthe following prescription\b/i,
  /\bquotation\b/i,
  /\bSyrus\b/,
  /\bPope\b/,
  /\bCarlyle\b/,
  /\bEmerson\b/,
  /\bCharles Dudley Warner\b/,
];

const TITLE_STOP = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "he",
  "her",
  "his",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "she",
  "that",
  "the",
  "their",
  "there",
  "they",
  "this",
  "to",
  "was",
  "were",
  "with",
]);

function fetchText(url) {
  return new Promise((resolvePromise, reject) => {
    get(url, { headers: { "User-Agent": "shareboard-pack-builder/1.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchText(new URL(res.headers.location, url).toString()).then(resolvePromise, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GET ${url} -> ${res.statusCode}`));
        return;
      }
      res.setEncoding("utf8");
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolvePromise(body));
    }).on("error", reject);
  });
}

function normalizeText(raw) {
  return raw
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripGutenberg(raw) {
  const text = normalizeText(raw);
  const start = text.search(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const end = text.search(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  const body = start >= 0 ? text.slice(text.indexOf("\n", start) + 1, end > start ? end : undefined) : text;
  return body
    .replace(/Produced by[\s\S]{0,900}?(?=\n\n)/gi, "")
    .replace(/Transcriber's note[\s\S]{0,900}?(?=\n\n)/gi, "")
    .replace(/\[[^\]\n]{1,80}\]/g, " ");
}

function looksLikeHeading(block) {
  const plain = block.replace(/[^A-Za-z ]/g, "").trim();
  if (!plain) return true;
  if (plain.length < 34 && !/[.!?"]$/.test(block)) return true;
  const letters = plain.replace(/ /g, "");
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return letters.length > 8 && upper / letters.length > 0.78;
}

function blocked(text) {
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9']+/g, " ")} `;
  return BLOCKED.some((word) => lower.includes(` ${word} `)) || BLOCKED_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanupCandidate(block) {
  let text = block
    .replace(/\n+/g, " ")
    .replace(/[_*#|]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  text = text.replace(/^["' -]+/, "").replace(/["' -]+$/, "").trim();
  if (text && !/[.!?"]$/.test(text)) text += ".";
  return text;
}

function candidateOk(text) {
  if (text.length < 120 || text.length > 620) return false;
  if (!/[.!?] /.test(`${text} `)) return false;
  if (/[{}<>\\]/.test(text)) return false;
  if (/project gutenberg|copyright|ebook|www\.|http|contents|chapter|illustration/i.test(text)) return false;
  if (NON_JOKE_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (/\b(?:said|asked|answered|replied|read|wrote|remarked):\.$/i.test(text)) return false;
  if (/^[A-Z][A-Z ]{3,}\b/.test(text)) return false;
  if ((text.match(/[A-Z]{4,}/g) ?? []).length > 2) return false;
  if ((text.match(/\d/g) ?? []).length > 8) return false;
  if (((text.match(/"/g) ?? []).length % 2) !== 0) return false;
  if (!/[?"]|\b(?:said|asked|answered|replied|remarked|exclaimed)\b/i.test(text)) return false;
  if (blocked(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 18 || words.length > 115) return false;
  return true;
}

function splitCandidates(body) {
  const rawBlocks = body
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);
  const out = [];
  let carry = "";
  for (const raw of rawBlocks) {
    if (looksLikeHeading(raw)) {
      carry = "";
      continue;
    }
    const joined = carry ? `${carry} ${raw}` : raw;
    const candidate = cleanupCandidate(joined);
    if (candidateOk(candidate)) {
      out.push(candidate);
      carry = "";
      continue;
    }
    const compact = cleanupCandidate(raw);
    if (compact.length < 90 && compact.length > 20 && !looksLikeHeading(compact)) {
      carry = compact;
    } else {
      carry = "";
    }
  }
  return out;
}

function normalizeKey(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableScore(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function titleFor(text, fallbackNo) {
  const quoted = text.match(/"([^"]{10,64})"/)?.[1];
  const source = quoted || text;
  const words = source
    .replace(/[^A-Za-z' ]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 2 && !TITLE_STOP.has(word.toLowerCase()))
    .slice(0, 5);
  if (words.length >= 2) {
    return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(" ").slice(0, 54);
  }
  return ["Quick Joke", "Funny Moment", "Classic Joke", "A Little Laugh"][fallbackNo % 4];
}

function safetyStats(items) {
  let dialogue = 0;
  let question = 0;
  for (const item of items) {
    if (item.text.includes('"')) dialogue++;
    if (item.text.includes("?")) question++;
  }
  return { dialogue, question };
}

const sourceCounts = [];
const all = [];
for (const source of SOURCES) {
  const raw = await fetchText(source.url);
  const body = stripGutenberg(raw);
  const candidates = splitCandidates(body);
  sourceCounts.push({ id: source.id, title: source.title, selected: candidates.length });
  all.push(...candidates.map((text) => ({ text, sourceId: source.id })));
}

const seen = new Set();
const deduped = [];
for (const item of all) {
  const key = normalizeKey(item.text);
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(item);
}

deduped.sort((a, b) => stableScore(a.text) - stableScore(b.text));
const selected = deduped.slice(0, TARGET);
const titled = selected.map((item, index) => ({
  id: index + 1,
  pack: Math.floor(index / PACK_SIZE) + 1,
  text: item.text,
  chars: item.text.length,
  title: titleFor(item.text, index),
  sourceId: item.sourceId,
}));

mkdirSync(OUT_DIR, { recursive: true });
for (let i = 0; i < Math.ceil(titled.length / PACK_SIZE); i++) {
  const rows = titled.slice(i * PACK_SIZE, (i + 1) * PACK_SIZE);
  writeFileSync(resolve(OUT_DIR, `pack-${String(i + 1).padStart(3, "0")}.json`), JSON.stringify(rows, null, 2) + "\n");
}
writeFileSync(resolve(OUT_DIR, "titled.json"), JSON.stringify(titled, null, 2) + "\n");
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  JSON.stringify(
    {
      total: titled.length,
      packs: Math.ceil(titled.length / PACK_SIZE),
      packSize: PACK_SIZE,
      range: [
        titled.reduce((min, item) => Math.min(min, item.chars), Number.POSITIVE_INFINITY),
        titled.reduce((max, item) => Math.max(max, item.chars), 0),
      ],
      safety: {
        filters: "protected-class/religion/politics/violence/sexual/alcohol blocklist + length/readability checks",
        ...safetyStats(titled),
      },
    },
    null,
    2,
  ) + "\n",
);
writeFileSync(
  resolve(OUT_DIR, "sources.json"),
  JSON.stringify(
    {
      licenseNote: "All listed source books are Project Gutenberg texts marked public domain in the USA. The builder keeps only short, filtered joke/anecdote snippets for dynamic card rendering.",
      generatedAt: new Date().toISOString(),
      sourceCounts,
      sources: SOURCES,
    },
    null,
    2,
  ) + "\n",
);

console.log(`English joke deck ready: ${titled.length} cards in ${Math.ceil(titled.length / PACK_SIZE)} packs`);
console.log(JSON.stringify({ sourceCounts, safety: safetyStats(titled) }, null, 2));
