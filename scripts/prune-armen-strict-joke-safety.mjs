#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIGS = [
  {
    id: "de",
    dir: "data/anecdotes-de",
    indent: 1,
    patterns: [
      /oralsex|\bsex\b|sexprobleme|wiedergutmachungssex|cybersex|sexgestöhne|sexsüchtig|sexy|prostitut|\bpuff\b|bordell|nackt|nackte|nacktem|nackten|nacktschnecke|porno|orgasmus|masturb|oral|vögel|voegel|\bfick|bums|blasen|vagina|penis|schwanz|brust|busen|spanner|playboy/i,
      /kolumbi|columbi|jamaika|jamaica|kindersklav|sklaverei|schwarzer:|transvest|transsex|schwucht|zigeuner|kanake|\bjuden?\b|muslim|christen|atheisten|rassist|behindert|spasti|neger|yankees.*frei/i,
      /selbstmord|suizid|umbringen|erschieß|erschiess|erschossen|\btöte|\btoete|\bkill|messer|waffe|prügel|pruegel|verprügel|verpruegel|mord/i,
    ],
  },
  {
    id: "it",
    dir: "data/anecdotes-it",
    indent: 1,
    patterns: [
      /\bsesso\b|sessual|sexy|sexy shop|nuda|nudo|nudi|nudità|prostitut|porno|\bpene\b|vagina|orgasm|puttan|troia|\bcazz|chiavare|scopando|scopare|scopata|amante|\bseno\b|spogliarsi/i,
      /suicid|guerra|gestapo|osama|bombardieri|mussolini|maduro|salvini|forza italia|\bm5s\b|berlusconi/i,
      /\bnegro|zingar|\bebre|handicapp|omosess|trans/i,
    ],
  },
  {
    id: "fr",
    dir: "data/anecdotes-fr",
    indent: 1,
    patterns: [
      /transexuel|transsexuel|\bsexe\b|porno|orgasm|pénis|penis|vagin|salope|\bpute\b/i,
      /suicide|meurtre|commet un meurtre|condamnation à mort|raide morte|pompes funèbres|faucheuse|atroces souffrances|protocole RIP/i,
    ],
  },
  {
    id: "ru",
    dir: "data/anecdotes",
    indent: 1,
    patterns: [/грузин[\s\S]{0,300}переспать|переспать[\s\S]{0,300}грузин|проститут|шлюх|минет|дроч|\bсекс\b|траха|изнасил/i],
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value, indent = 2) {
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

function matches(item, patterns) {
  const text = `${item.title || ""}\n${item.text || ""}`;
  return patterns.some((pattern) => pattern.test(text));
}

function filterItems(items, patterns) {
  const kept = [];
  const removed = [];
  for (const item of items) {
    if (matches(item, patterns)) {
      removed.push({ id: item.id, pack: item.pack, title: item.title, chars: item.chars });
    } else {
      kept.push(item);
    }
  }
  return { kept, removed };
}

function getRange(items) {
  const lengths = items.map((item) => Number(item.chars ?? String(item.text ?? "").length)).sort((a, b) => a - b);
  return lengths.length ? [lengths[0], lengths[lengths.length - 1]] : [0, 0];
}

function prune(config) {
  const abs = resolve(process.cwd(), config.dir);
  const titledPath = resolve(abs, "titled.json");
  const indexPath = resolve(abs, "index.json");
  const reportPath = resolve(abs, "safety-review-strict.json");
  const titled = readJson(titledPath);
  const index = existsSync(indexPath) ? readJson(indexPath) : {};
  const previousReport = existsSync(reportPath) ? readJson(reportPath) : null;
  const { kept, removed } = filterItems(titled, config.patterns);

  const packFiles = readdirSync(abs).filter((name) => /^pack-\d+\.json$/.test(name)).sort();
  const packEdits = [];
  for (const file of packFiles) {
    const filePath = resolve(abs, file);
    const { kept: keptPack, removed: removedPack } = filterItems(readJson(filePath), config.patterns);
    if (removedPack.length) packEdits.push({ filePath, keptPack, removedPack });
  }

  if (!removed.length && !packEdits.length) {
    console.log(`${config.id}: already clean`);
    return;
  }

  for (const edit of packEdits) writeJson(edit.filePath, edit.keptPack, config.indent);

  if (removed.length) {
    writeJson(titledPath, kept, config.indent);
    writeJson(
      indexPath,
      {
        ...index,
        total: kept.length,
        range: getRange(kept),
        strictSafetyPrunedAt: new Date().toISOString(),
        strictSafetyPrunedRemoved: (index.strictSafetyPrunedRemoved || 0) + removed.length,
      },
      2,
    );
    writeJson(reportPath, {
      generatedAt: new Date().toISOString(),
      sourceTotal: titled.length,
      kept: kept.length,
      removed: removed.length,
      removedItems: removed,
      previousReports: previousReport ? [previousReport] : [],
    });
  }

  console.log(`${config.id}: removed=${removed.length}; packEdits=${packEdits.length}; kept=${kept.length}`);
}

for (const config of CONFIGS) prune(config);
