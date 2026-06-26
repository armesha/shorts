#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "temp/qnl-arabic-jokes");
const METADATA_PATH = resolve(OUT_DIR, "metadata.csv");
const CANDIDATES_PATH = resolve(OUT_DIR, "metadata-candidates.json");
const SOURCES_PATH = resolve(OUT_DIR, "sources.json");
const REPORT_PATH = resolve(OUT_DIR, "report.md");

const ARTICLE_API = "https://api.figshare.com/v2/articles/26984785";
const ARTICLE_URL = "https://manara.qnl.qa/articles/dataset/Arabic_OCR_Corpus_2_894_items_from_QNL_Collection_/26984785";

const TARGET_TERMS = [
  "البخلاء",
  "المستطرف",
  "نوادر",
  "لطائف",
  "ملح",
  "حكايات",
  "أخبار",
  "الحمقى",
  "المغفلين",
  "التطفيل",
];

const REJECT_TERMS = [
  "سماع الآلات",
  "المواعظ",
  "تاريخ",
  "حاشية",
  "شرح",
  "فقه",
  "حديث",
  "العقيدة",
  "الفرائض",
  "النحو",
  "البلاغة",
  "ديوان",
];

const args = new Set(process.argv.slice(2));

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function downloadMetadata() {
  ensureDir(METADATA_PATH);
  if (existsSync(METADATA_PATH) && !args.has("--download")) return;
  const article = await fetchJson(ARTICLE_API);
  const file = article.files?.find((entry) => entry.name === "QNL-ArabicContentDataset-Metadata.csv");
  if (!file?.download_url) throw new Error("Could not find QNL metadata CSV download URL in Figshare API.");
  const res = await fetch(file.download_url, { headers: { "user-agent": "shareboard-qnl-source-prep/1.0" } });
  if (!res.ok) throw new Error(`metadata download failed: ${res.status} ${res.statusText}`);
  writeFileSync(METADATA_PATH, await res.text(), "utf8");
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "shareboard-qnl-source-prep/1.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

function score(row) {
  const haystack = `${row.TITLE || ""}\n${row.DESCRIPTION || ""}\n${row.AUTHOR || ""}`.normalize("NFC");
  const hits = TARGET_TERMS.filter((term) => haystack.includes(term));
  const rejects = REJECT_TERMS.filter((term) => haystack.includes(term));
  let value = hits.length * 10 - rejects.length * 5;
  if (/البخلاء|المستطرف/.test(haystack)) value += 20;
  if (/نوادر|لطائف|ملح|حكايات/.test(haystack)) value += 5;
  const year = publicationYear(row);
  if (year && year >= 1929) value -= 18;
  if (year && year < 1900) value += 4;
  return { value, hits, rejects, year };
}

function publicationYear(row) {
  const text = `${row["PUB INFO"] || ""} ${row.TITLE || ""}`;
  const years = [...text.matchAll(/\b(18\d{2}|19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  return years.length ? Math.min(...years) : null;
}

async function main() {
  await downloadMetadata();
  const rows = parseCsv(readFileSync(METADATA_PATH, "utf8"));
  const candidates = rows
    .map((row) => {
      const s = score(row);
      return {
        recordId: row["RECORD #(ITEM)"] || "",
        callNumber: row["CALL #(ITEM)"] || "",
        title: row.TITLE || "",
        author: row.AUTHOR || "",
        pubInfo: row["PUB INFO"] || "",
        description: row.DESCRIPTION || "",
        repositoryUrl: row["Repository URL"] || "",
        catalogUrl: row["Catalog URL"] || "",
        score: s.value,
        publicationYear: s.year,
        rightsRisk: s.year && s.year >= 1929 ? "post-1928 edition; keep as lower-priority until rights are reviewed" : null,
        matchedTerms: s.hits,
        rejectedTerms: s.rejects,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ar"))
    .slice(0, 60);

  const article = {
    id: "qnl-arabic-ocr-corpus-v2",
    url: ARTICLE_URL,
    api: ARTICLE_API,
    rights:
      "QNL states the OCR corpus is extracted from out-of-copyright works; QNL does not assert copyright claims to scans/reproductions; metadata is CC0 1.0.",
    note:
      "This script only ranks metadata candidates. Do not publish raw Arabic OCR without extracting the relevant corpus text, correcting OCR, and running safety review.",
  };
  writeFileSync(SOURCES_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: article }, null, 2)}\n`);
  writeFileSync(CANDIDATES_PATH, `${JSON.stringify(candidates, null, 2)}\n`);
  writeFileSync(
    REPORT_PATH,
    [
      "# Arabic QNL joke-source prep",
      "",
      `Metadata rows: ${rows.length}`,
      `Candidates: ${candidates.length}`,
      "",
      "Top candidates:",
      ...candidates.slice(0, 12).map((c, index) => `${index + 1}. ${c.recordId} · ${c.title} · hits: ${c.matchedTerms.join(", ")}`),
      "",
      "Next step: download only the needed text files from QNL_ArabicOCR_Corpus-v2.zip temporarily, then clean OCR and safety-filter before creating any live deck.",
      "",
    ].join("\n"),
  );
  console.log(JSON.stringify({ rows: rows.length, candidates: candidates.length, top: candidates.slice(0, 5) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
