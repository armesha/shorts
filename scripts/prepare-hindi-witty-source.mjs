#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "temp/hi-witty-sources");
const PAGES_PATH = resolve(OUT_DIR, "pages.json");
const EXCERPTS_PATH = resolve(OUT_DIR, "candidate-excerpts.json");
const SOURCES_PATH = resolve(OUT_DIR, "sources.json");
const REPORT_PATH = resolve(OUT_DIR, "report.md");

const SOURCES = [
  {
    id: "hi-wikisource-panchtantra-1952",
    title: "पंचतन्त्र",
    url: "https://hi.wikisource.org/wiki/पंचतन्त्र",
    pages: [
      "पंचतन्त्र/प्रथम तन्त्र",
      "पंचतन्त्र/द्वितीय तन्त्र",
      "पंचतन्त्र/तृतीय तन्त्र",
      "पंचतन्त्र/चतुर्थ तन्त्र",
      "पंचतन्त्र/पंचम तन्त्र",
    ],
    positioning:
      "Classic witty/नीति stories, not modern चुटकुले. Use only if the pack is labelled honestly as classic witty stories.",
    rights:
      "Hindi Wikisource page marks the work PD India and public domain in the USA; verify source page before live pack rebuild.",
  },
  {
    id: "hi-wikisource-premchand-bade-bhai-sahab",
    title: "बड़े भाई साहब",
    url: "https://hi.wikisource.org/wiki/प्रेमचंद_की_सर्वश्रेष्ठ_कहानियां/_बड़े_भाई_साहब",
    pages: ["प्रेमचंद की सर्वश्रेष्ठ कहानियां/ बड़े भाई साहब"],
    positioning:
      "Classic humorous story candidate, not a short joke corpus. Needs manual abridgement into standalone cards.",
    rights:
      "Hindi Wikisource page carries public-domain notices for Premchand works; verify source page before live pack rebuild.",
  },
];

const FLAG_RULES = [
  ["violence", /हत्या|मार|मृत्यु|खून|युद्ध|लड़ाई|शिकार|दण्ड|दंड|हिंसा|पशु/i],
  ["religion", /भगवान|ईश्वर|मन्दिर|मंदिर|धर्म|पाप|पुण्य|ब्राह्मण|मुसलमान|हिन्दू|हिंदू/i],
  ["protected_class", /जाति|अंध|लंगड़|पागल|मूर्ख|बहरा|गूंगा|गँवार|गंवार/i],
  ["adult", /स्त्री|पत्नी|प्रेम|विवाह|शराब|नशा|कामवासना|चुम्बन|चुंबन/i],
  ["politics", /राजनीति|राजा|मन्त्री|मंत्री|सरकार|जमींदार|स्वाधीनता/i],
];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function textFromHtml(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
      .replace(/<table[\s\S]*?<\/table>/gi, " ")
      .replace(/<h[1-6][^>]*>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

async function fetchPage(title) {
  const url = new URL("https://hi.wikisource.org/w/api.php");
  for (const [key, value] of Object.entries({ action: "parse", format: "json", origin: "*", page: title, prop: "text" })) {
    url.searchParams.set(key, value);
  }
  const res = await fetch(url, { headers: { "user-agent": "shareboard-hi-source-prep/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${title}`);
  const json = await res.json();
  if (json.error) throw new Error(`${title}: ${json.error.info || json.error.code}`);
  return textFromHtml(json.parse?.text?.["*"] ?? "");
}

function flagsFor(text) {
  return FLAG_RULES.filter(([, re]) => re.test(text)).map(([id]) => id);
}

function splitCandidates(page) {
  const paragraphs = page.text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 140);
  const out = [];
  let acc = "";
  let local = 0;
  for (const paragraph of paragraphs) {
    if ((acc + " " + paragraph).trim().length > 1150 && acc.length >= 320) {
      out.push(candidateFromText(page, acc, ++local));
      acc = paragraph;
    } else {
      acc = `${acc} ${paragraph}`.trim();
    }
  }
  if (acc.length >= 260) out.push(candidateFromText(page, acc, ++local));
  return out;
}

function candidateFromText(page, text, index) {
  return {
    id: `${page.sourceId}-${page.pageIndex + 1}-${String(index).padStart(2, "0")}`,
    sourceId: page.sourceId,
    pageTitle: page.title,
    title: `${page.sourceTitle} / भाग ${page.pageIndex + 1}.${index}`,
    charCount: text.length,
    flagIds: flagsFor(text),
    text,
  };
}

async function main() {
  ensureDir(PAGES_PATH);
  const pages = [];
  for (const source of SOURCES) {
    for (const [pageIndex, title] of source.pages.entries()) {
      const text = await fetchPage(title);
      pages.push({
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: source.url,
        title,
        pageIndex,
        charCount: text.length,
        text,
      });
    }
  }
  const candidates = pages.flatMap(splitCandidates);
  const flagCounts = Object.fromEntries(FLAG_RULES.map(([id]) => [id, 0]));
  for (const item of candidates) for (const flag of item.flagIds) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;

  writeFileSync(
    SOURCES_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sources: SOURCES,
        workflow:
          "This is source-backed raw material only. It is not a modern joke corpus and must not be connected as a live jokes deck before abridgement, labeling, and safety review.",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(PAGES_PATH, `${JSON.stringify(pages, null, 2)}\n`);
  writeFileSync(EXCERPTS_PATH, `${JSON.stringify(candidates, null, 2)}\n`);
  writeFileSync(
    REPORT_PATH,
    [
      "# Hindi witty-source prep",
      "",
      `Pages: ${pages.length}`,
      `Candidate excerpts: ${candidates.length}`,
      "",
      "Flag counts:",
      ...Object.entries(flagCounts).map(([id, count]) => `- ${id}: ${count}`),
      "",
      "Do not publish these excerpts directly. Use them as source-backed raw material for a classic witty-stories pack, not as generic modern jokes.",
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify({ pages: pages.length, candidates: candidates.length, flagCounts }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
