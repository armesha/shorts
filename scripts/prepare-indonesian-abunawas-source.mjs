#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "tmp/id-abunawas");
const PDF_PATH = resolve(OUT_DIR, "tjerita-aboe-nawas.pdf");
const RAW_PATH = resolve(OUT_DIR, "tjerita-aboe-nawas-raw.txt");
const CHAPTERS_PATH = resolve(OUT_DIR, "chapters.json");
const EXCERPTS_PATH = resolve(OUT_DIR, "candidate-excerpts.json");
const SOURCES_PATH = resolve(OUT_DIR, "sources.json");
const REPORT_PATH = resolve(OUT_DIR, "report.md");

const SOURCE = {
  id: "tjerita-aboe-nawas-1894",
  title: "Tjerita Aboe Nawas dengan Radja Haroenarrasid di Negri Bagdad",
  normalizedTitle: "Cerita Abu Nawas dengan Raja Harun ar-Rasyid di Negeri Bagdad",
  year: 1894,
  publisher: "Albrecht & Rusche, Batavia-Solo",
  commonsFile:
    "https://commons.wikimedia.org/wiki/File:Tjerita_Aboe_Nawas_dengan_Radja_Haroenarrasid_di_Negri_Bagdad.pdf",
  pdfUrl:
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tjerita_Aboe_Nawas_dengan_Radja_Haroenarrasid_di_Negri_Bagdad.pdf",
  googleBooks:
    "https://books.google.com/books/about/Tjerita_Aboe_Nawas_dengan_Radja_Haroenar.html?hl=id&id=LtWpHDQB6fsC",
  rights:
    "Public-domain candidate by age (1894). Keep this source ledger and do not publish raw OCR without cleanup and safety review.",
};

const args = new Set(process.argv.slice(2));

const FLAG_RULES = [
  {
    id: "violence",
    note: "violence/death/punishment terms",
    re: /\b(bunuh|membunuh|dibunuh|boenoeh|memboenoeh|diboenoeh|mati|darah|pedang|sendjata|senjata|hukuman|hukum|kepala|potong|perang|luka)\b/i,
  },
  {
    id: "religion",
    note: "religious terms",
    re: /\b(allah|toehan|tuhan|sjara|syara|akhirat|achirat|dosa|salah kepada allah|bismi|alham|wali|imam|masjid|mukmin|moe'?min)\b/i,
  },
  {
    id: "gross",
    note: "body waste/gross-out terms",
    re: /\b(tahi|kencing|kentjing|berak|najis|boesoek|busuk|hadas|bau|baoenja)\b/i,
  },
  {
    id: "adult",
    note: "adult/sexual/family-bedroom terms",
    re: /\b(birahi|cinta|tidur|tidoer|kawin|bini|perempuan|prempoean|telanjang|amante|hamil|nikah)\b/i,
  },
  {
    id: "protected_class",
    note: "disability/ethnicity descriptors",
    re: /\b(bongkok|buta|toeli|tuli|gila|orang tjina|bangsa tjina|cina|arab|jawa|djawa)\b/i,
  },
  {
    id: "ocr_noise",
    note: "high OCR noise marker",
    re: /[{}~^]{2,}|[a-z][0-9][a-z]|[0-9][a-z][0-9]/i,
  },
];

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function runChecked(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function downloadPdf() {
  ensureDir(PDF_PATH);
  if (existsSync(PDF_PATH) && !args.has("--download")) return;
  runChecked("curl", ["-L", "-f", "-o", PDF_PATH, SOURCE.pdfUrl]);
}

function extractRawText() {
  if (existsSync(RAW_PATH) && !args.has("--extract")) return;
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
  } catch {
    throw new Error("pdftotext is required. Install poppler-utils before running this source prep.");
  }
  runChecked("pdftotext", ["-raw", PDF_PATH, RAW_PATH]);
}

function cleanRawBlock(text) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]*-\n[ \t]*/g, "")
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseLines(text) {
  return text
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function oldMalayToModern(text) {
  return text
    .replace(/Aboe/g, "Abu")
    .replace(/Haroenarrasid/g, "Harun ar-Rasyid")
    .replace(/Haroenarresid/g, "Harun ar-Rasyid")
    .replace(/Haroenarrusid/g, "Harun ar-Rasyid")
    .replace(/Radja/g, "Raja")
    .replace(/Baginda/g, "Baginda")
    .replace(/Sjah/g, "Syah")
    .replace(/Toewan/g, "Tuan")
    .replace(/Toehan/g, "Tuhan")
    .replace(/oe/g, "u")
    .replace(/Oe/g, "U")
    .replace(/tj/g, "c")
    .replace(/Tj/g, "C")
    .replace(/dj/g, "j")
    .replace(/Dj/g, "J")
    .replace(/nj/g, "ny")
    .replace(/Nj/g, "Ny")
    .replace(/sj/g, "sy")
    .replace(/Sj/g, "Sy")
    .replace(/ch/g, "kh")
    .replace(/Ch/g, "Kh")
    .replace(/\b[jJ]ang\b/g, (m) => (m[0] === "J" ? "Yang" : "yang"))
    .replace(/\b[jJ]a\b/g, (m) => (m[0] === "J" ? "Ya" : "ya"))
    .replace(/\b[kK]a\b/g, (m) => (m[0] === "K" ? "Ke" : "ke"))
    .replace(/\b[dD]alem\b/g, (m) => (m[0] === "D" ? "Dalam" : "dalam"))
    .replace(/\b[sS]oedah\b/g, (m) => (m[0] === "S" ? "Sudah" : "sudah"))
    .replace(/\b[pP]oen\b/g, (m) => (m[0] === "P" ? "Pun" : "pun"))
    .replace(/\b[tT]iada\b/g, (m) => (m[0] === "T" ? "Tidak" : "tidak"))
    .replace(/\b[dD]engan\b/g, (m) => (m[0] === "D" ? "Dengan" : "dengan"))
    .replace(/\b[lL]aloe\b/g, (m) => (m[0] === "L" ? "Lalu" : "lalu"))
    .replace(/\s{2,}/g, " ")
    .trim();
}

function findContent(raw) {
  const starts = [...raw.matchAll(/Bismi['’]?allah|Bismi'allah|Bismi/gim)].map((m) => m.index ?? 0);
  const start = starts.at(-1) ?? raw.search(/TJERITA\s+ABOE\s+NAWAS/i);
  if (start < 0) throw new Error("Could not find the story body start.");
  const body = raw.slice(start);
  const endMatch = body.match(/\bT\s*A\s*M\s*A\s*T\b|\bTAMAT\b/i);
  const end = endMatch?.index != null ? endMatch.index + endMatch[0].length : body.length;
  return cleanRawBlock(body.slice(0, end));
}

function splitChapters(content) {
  const lines = content.split(/\n/);
  const chapters = [];
  let current = [];
  let marker = "Pembuka";

  for (const line of lines) {
    const isMarker = /\bAlka\S{0,12}\s*(?:fats|futs|fat|j|ka|ke)/i.test(line);
    if (isMarker && current.join(" ").trim().length > 500) {
      chapters.push({ marker, raw: current.join("\n").trim() });
      marker = collapseLines(line).slice(0, 140);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.join(" ").trim().length > 500) chapters.push({ marker, raw: current.join("\n").trim() });

  return chapters.map((chapter, index) => {
    const original = collapseLines(chapter.raw);
    const modernized = oldMalayToModern(original);
    const flagIds = flagsFor(`${original} ${modernized}`);
    return {
      id: `abunawas-id-${String(index + 1).padStart(2, "0")}`,
      sourceId: SOURCE.id,
      order: index + 1,
      marker: chapter.marker,
      title: index === 0 ? "Cerita pembuka Abu Nawas" : `Cerita Abu Nawas ${index + 1}`,
      charCountOriginal: original.length,
      charCountModernized: modernized.length,
      flagIds,
      original,
      modernized,
    };
  });
}

function flagsFor(text) {
  return FLAG_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.id);
}

function noiseScore(text) {
  if (!text) return 0;
  const weird = (text.match(/[{}~^•<>=_|\\]/g) ?? []).length;
  const digits = (text.match(/\d/g) ?? []).length;
  return Number(((weird + digits) / text.length).toFixed(4));
}

function excerptCandidates(chapters) {
  const candidates = [];
  for (const chapter of chapters) {
    const pieces = chapter.modernized
      .split(/\bMaka\b/g)
      .map((piece, index) => (index === 0 ? piece : `Maka ${piece}`))
      .flatMap(splitOversizePiece)
      .map((piece) => piece.trim())
      .filter(Boolean);

    let acc = "";
    let local = 0;
    for (const piece of pieces) {
      if ((acc + " " + piece).trim().length > 1100 && acc.length >= 450) {
        candidates.push(candidateFromText(chapter, acc, ++local));
        acc = piece;
      } else {
        acc = `${acc} ${piece}`.trim();
      }
    }
    if (acc.length >= 300) candidates.push(candidateFromText(chapter, acc, ++local));
  }
  return candidates;
}

function candidateFromText(chapter, text, localIndex) {
  return {
    id: `${chapter.id}-excerpt-${String(localIndex).padStart(2, "0")}`,
    sourceId: chapter.sourceId,
    chapterId: chapter.id,
    title: `${chapter.title} / bagian ${localIndex}`,
    charCount: text.length,
    noiseScore: noiseScore(text),
    chapterFlagIds: chapter.flagIds,
    flagIds: flagsFor(text),
    text,
  };
}

function splitOversizePiece(piece) {
  if (piece.length <= 1100) return [piece];
  const out = [];
  let rest = piece;
  while (rest.length > 1100) {
    const window = rest.slice(0, 1100);
    const splitAt = Math.max(window.lastIndexOf("."), window.lastIndexOf("?"), window.lastIndexOf("!"), window.lastIndexOf(", "));
    const cut = splitAt >= 500 ? splitAt + 1 : 1000;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function writeOutputs() {
  downloadPdf();
  extractRawText();

  const raw = readFileSync(RAW_PATH, "utf8");
  const content = findContent(raw);
  const chapters = splitChapters(content);
  const candidates = excerptCandidates(chapters);
  const flagCounts = Object.fromEntries(FLAG_RULES.map((rule) => [rule.id, 0]));
  for (const item of candidates) for (const flag of item.flagIds) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;

  const sourceLedger = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    workflow:
      "This script only prepares OCR candidates. Before making a live deck, run LLM/manual cleanup, remove unsafe excerpts, produce cards.json/sources.json in data/anecdotes-id, then wire the deck.",
    outputs: {
      rawText: RAW_PATH,
      chapters: CHAPTERS_PATH,
      candidateExcerpts: EXCERPTS_PATH,
      report: REPORT_PATH,
    },
  };

  writeFileSync(SOURCES_PATH, `${JSON.stringify(sourceLedger, null, 2)}\n`);
  writeFileSync(CHAPTERS_PATH, `${JSON.stringify(chapters, null, 2)}\n`);
  writeFileSync(EXCERPTS_PATH, `${JSON.stringify(candidates, null, 2)}\n`);
  writeFileSync(
    REPORT_PATH,
    [
      "# Indonesian Abu Nawas source prep",
      "",
      `Source: ${SOURCE.title} (${SOURCE.year})`,
      `Chapters: ${chapters.length}`,
      `Candidate excerpts: ${candidates.length}`,
      "",
      "Flag counts:",
      ...Object.entries(flagCounts).map(([id, count]) => `- ${id}: ${count}`),
      "",
      "Do not publish these excerpts directly. Use them as source-backed raw material for a cleanup/localization workflow.",
      "",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        source: SOURCE.id,
        chapters: chapters.length,
        candidates: candidates.length,
        flagCounts,
        outputs: { sources: SOURCES_PATH, chapters: CHAPTERS_PATH, candidates: EXCERPTS_PATH, report: REPORT_PATH },
      },
      null,
      2,
    ),
  );
}

writeOutputs();
