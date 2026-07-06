import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const CORPUS_DIR = resolve(ROOT, "local-assets/corpora/polish-jokes-dataset");
const SOURCE_FILE = resolve(CORPUS_DIR, "dowcipy-polish-jokes.json");
const DONOR_PACK_FILE = resolve(ROOT, "data/packs/chistes-es-public-domain.json");
const PACK_FILE = resolve(ROOT, "data/packs/dowcipy-pl-mit.json");
const NOW = "2026-07-05T14:45:00.000Z";

const MIN_CHARS = Number(process.env.PL_JOKES_MIN ?? 60);
const MAX_CHARS = Number(process.env.PL_JOKES_MAX ?? 650);
const CAP = Number(process.env.PL_JOKES_CAP ?? 1000);

const unsafeRules = [
  ["adult_or_sexual", /\b(seks\w*|sexual|porno\w*|erotyk\w*|nago\w*|rozbiera\w*|penis\w*|pochw\w*|cip[ayę]\w*|pizd\w*|prezerwatyw\w*|kondom\w*|prostytut\w*|burdel\w*|orgazm\w*|masturb\w*|gwa[lł]t\w*|zgwa[lł]c\w*)\b/iu],
  ["coarse_profanity", /\b(kurw\w*|kurna|chuj\w*|huj\w*|jeb\w*|pierdol\w*|spierdal\w*|skurw\w*|dupa\w*|srak\w*|sra[ćcłl]\w*|zesra\w*|g[oó]wn\w*|obsra\w*|rozj\w*)\b|ch\*j|j\*b|k\*\*\*|k\*rw|sk\*rw|spie\*dal/iu],
  ["body_or_gross_joke", /\b(jajach|jajami|krocze|krocza)\b/iu],
  ["hate_or_extremism", /\b(hitler\w*|nazi\w*|nazist\w*|faszy\w*|heil|swastyk\w*|rasist\w*|rasizm\w*|bin\s+laden|talib\w*|terror\w*|world\s+trade\s+center|wtc)\b/iu],
  ["protected_class_or_slur", /\b([żz]yd\w*|cygan\w*|murzyn\w*|czarnuch\w*|arab\w*|muzu[lł]man\w*|peda[lł]\w*|gej\w*|lesb\w*|trans\w*|inwalid\w*|niepe[lł]nospraw\w*|kalek\w*|[śs]lep\w*|g[lł]uch\w*|rusek|rusk\w*|ukrain\w*|niemiec|niemcy|chin\w*|blondynk\w*|menel\w*)\b/iu],
  ["religion_or_supernatural", /\b(ksi[aą]dz\w*|ko[śs]ci[oó][lł]\w*|b[oó]g|bo[żz]\w*|jezus\w*|chrystus\w*|papie[żz]\w*|zakonnic\w*|diabe[lł]\w*|piek[lł]\w*|anio[lł]\w*|modlitw\w*)\b/iu],
  ["politics_authority_or_crime", /\b(polityk\w*|prezydent\w*|minister\w*|premier\w*|sejm\w*|senat\w*|parti[ae]\w*|policj\w*|s[aą]d\w*|s[ęe]dzi\w*|wi[ęe]zien\w*|areszt\w*|z[lł]odziej\w*|krad\w*|mafij\w*|gang\w*)\b/iu],
  ["violence_or_death", /\b(zabij\w*|zabi[lł]\w*|morder\w*|krew|krwi|n[oó][żz]\w*|pistolet\w*|bro[nń]\w*|bomba\w*|wojn\w*|samob[oó]j\w*|samobuj\w*|umiera\w*|umar[lł]\w*|trup\w*|zw[lł]ok\w*|wypych\w*|(?:u|pod|za)topi\w*|zaciuk\w*)\b|pod wod[ęe]/iu],
  ["alcohol_or_drugs", /\b(w[oó]dk\w*|piw\w*|alkohol\w*|pijan\w*|narkotyk\w*|kokain\w*|marihuan\w*|papieros\w*)\b/iu],
  ["link_or_markup", /https?:|www\.|@|[<>{}]/iu],
];

const qualityRules = [
  ["too_short", (text) => text.length < MIN_CHARS],
  ["too_long", (text) => text.length > MAX_CHARS],
  ["bad_score", (_text, row) => score(row) < 5],
  ["bad_vote_ratio", (_text, row) => Number(row.upvotes || 0) < Number(row.downvotes || 0) * 1.5],
  ["broken_encoding", (text) => /�|Ã|Â/.test(text)],
  ["too_many_newlines", (text) => (text.match(/\n/g) || []).length > 14],
  ["not_polish_enough", (text) => !/[ąćęłńóśźż]/iu.test(text)],
];

const labelMap = new Map([
  ["CHISTE LARGO", "DOWCIP"],
  ["HUMOR LARGO", "HUMOR"],
  ["RISA LARGA", "DO ŚMIECHU"],
  ["CHISTE CLASICO", "KLASYCZNY DOWCIP"],
  ["HUMOR LIMPIO", "LEKKI HUMOR"],
]);

function score(row) {
  return Number(row.upvotes || 0) - Number(row.downvotes || 0);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstReason(text, row) {
  for (const [name, test] of qualityRules) {
    if (test(text, row)) return name;
  }
  for (const [name, re] of unsafeRules) {
    if (re.test(text)) return name;
  }
  return "";
}

function dedupeKey(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleFor(text, index) {
  const first = text
    .split(/\n+/)
    .map((line) => line.replace(/^[—–-]\s*/, "").trim())
    .find(Boolean) || `Dowcip ${index}`;
  const clean = first.replace(/\s+/g, " ").replace(/[.!?:;,]+$/g, "");
  if (clean.length >= 8 && clean.length <= 46) return clean;
  const clipped = clean.slice(0, 43).replace(/\s+\S*$/, "").trim();
  return clipped.length >= 8 ? `${clipped}...` : `Dowcip ${String(index).padStart(4, "0")}`;
}

function polishTemplates() {
  const donor = JSON.parse(readFileSync(DONOR_PACK_FILE, "utf8"));
  return donor.templates.map((template, index) => {
    const next = JSON.parse(JSON.stringify(template));
    next.name = String(next.name || `template-${index + 1}`).replace(/^chistes-es-long/, "dowcipy-pl");
    for (const el of next.elements || []) {
      if (el.id === "label" && typeof el.text === "string") {
        el.text = labelMap.get(el.text) || "DOWCIP";
      }
    }
    return next;
  });
}

function packCards(rows) {
  return rows.map((row, index) => ({
    values: {
      title: titleFor(row.text, index + 1),
      text: row.text,
      source: "HF MIT / Jeja, 2024",
    },
    addedAt: NOW,
  }));
}

function buildSources() {
  return {
    updatedAt: NOW,
    sources: [
      {
        id: "jonaszpotoniec-dowcipy-polish-jokes-dataset",
        title: "Dowcipy jaja",
        url: "https://huggingface.co/datasets/JonaszPotoniec/dowcipy-polish-jokes-dataset",
        dataFile: "dowcipy-polish-jokes.json",
        originalDatasetFile: "data/train-00000-of-00001.parquet",
        licenseLabel: "MIT in Hugging Face dataset metadata",
        sourceCaveat:
          "Dataset card says the jokes were dumped from jeja.pl community submissions on 2024-02-14. Treat as MIT-labelled third-party corpus, not public-domain-clean text.",
      },
    ],
  };
}

function main() {
  if (!existsSync(SOURCE_FILE)) throw new Error(`missing source file: ${SOURCE_FILE}`);
  if (!existsSync(DONOR_PACK_FILE)) throw new Error(`missing template donor pack: ${DONOR_PACK_FILE}`);
  mkdirSync(resolve(ROOT, "data/packs"), { recursive: true });
  mkdirSync(CORPUS_DIR, { recursive: true });

  const rawRows = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
  const rejected = new Map();
  const seen = new Set();
  const accepted = [];

  for (const row of rawRows) {
    const text = normalizeText(row.joke);
    const reason = firstReason(text, row);
    if (reason) {
      rejected.set(reason, (rejected.get(reason) || 0) + 1);
      continue;
    }
    const key = dedupeKey(text);
    if (seen.has(key)) {
      rejected.set("duplicate", (rejected.get("duplicate") || 0) + 1);
      continue;
    }
    seen.add(key);
    accepted.push({
      text,
      upvotes: Number(row.upvotes || 0),
      downvotes: Number(row.downvotes || 0),
      score: score(row),
    });
  }

  accepted.sort((a, b) => b.score - a.score || a.downvotes - b.downvotes || a.text.length - b.text.length);
  const selected = accepted.slice(0, CAP);
  const pack = {
    id: "dowcipy-pl-mit",
    owners: [1, 2],
    name: `Dowcipy PL ${selected.length}`,
    lang: "pl",
    templateType: "jokes",
    templates: polishTemplates(),
    cards: packCards(selected),
    createdAt: NOW,
    grants: [3, 4],
  };

  const report = {
    updatedAt: NOW,
    sourceFile: "local-assets/corpora/polish-jokes-dataset/dowcipy-polish-jokes.json",
    packFile: "data/packs/dowcipy-pl-mit.json",
    rawRows: rawRows.length,
    acceptedBeforeCap: accepted.length,
    selected: selected.length,
    filters: {
      minChars: MIN_CHARS,
      maxChars: MAX_CHARS,
      cap: CAP,
      minScore: 5,
      minUpvoteDownvoteRatio: 1.5,
      blocklists: unsafeRules.map(([name]) => name),
    },
    rejected: Object.fromEntries([...rejected.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    selectedLength: {
      min: Math.min(...selected.map((row) => row.text.length)),
      max: Math.max(...selected.map((row) => row.text.length)),
      avg: selected.reduce((sum, row) => sum + row.text.length, 0) / Math.max(1, selected.length),
    },
    sourceCaveat:
      "Text was not rewritten or translated. Filtering is deterministic length/vote/duplicate/advertiser-safety cleanup only.",
  };

  writeFileSync(resolve(CORPUS_DIR, "sources.json"), JSON.stringify(buildSources(), null, 2));
  writeFileSync(resolve(CORPUS_DIR, "safety-report.json"), JSON.stringify(report, null, 2));
  writeFileSync(PACK_FILE, JSON.stringify(pack, null, 2));
  console.log(JSON.stringify({ pack: pack.id, cards: selected.length, acceptedBeforeCap: accepted.length, rejected: report.rejected }, null, 2));
}

main();
