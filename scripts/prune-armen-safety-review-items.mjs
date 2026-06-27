#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const jokeDecks = [
  {
    dir: "data/anecdotes-en",
    packSize: 300,
    indent: 2,
    removeTitles: new Set([
      "Superintendent Sternly Can One Tell",
      "When Gentleman Arrived Heard Complaint",
      "Nobody Appeared Very Anxious Until",
      "There's Also Lady Who's Just",
    ]),
    removeTexts: ["Israel into Canaan", "Rumania", "terror of the cats", "Reds are at bay"],
  },
  {
    dir: "data/anecdotes-fr",
    packSize: 100,
    indent: 1,
    removeTitles: new Set(["Trump code 403 forbidden", "Mur Trump Norris", "Aspirateur mord poussière mort"]),
    removeTexts: ["ceux qui votent Trump", "protéger les migrants", "mordant la poussière"],
  },
  {
    dir: "data/anecdotes-it",
    packSize: 5000,
    indent: 1,
    removeTitles: new Set(["La ritirata di Russia", "Berlusconi e il Sole"]),
    removeTexts: ["ritirata di Russia", "Putin, Clinton e Berlusconi"],
  },
  {
    dir: "data/anecdotes-de",
    packSize: 100,
    indent: 1,
    removeTitles: new Set(["Kühe im Keller"]),
    removeTexts: ["stricken Heizöl", "Reykjavik Whale Watching Massacre"],
  },
  {
    dir: "data/anecdotes-pt",
    packSize: 300,
    indent: 2,
    removeTitles: new Set(["meu meio tostão"]),
    removeTexts: ["Acudam-me aqui os defuntos"],
  },
];

const memeEdits = [
  {
    dir: "data/memes-de",
    replacements: new Map([
      [
        "Sie zieht die Decke rüber,\ner zieht sie zurück — das ist jetzt der Krieg",
        "Sie zieht die Decke rüber,\ner zieht sie zurück — das ist jetzt Drama",
      ],
      [
        'Wenn die Familie "Mensch ärgere\ndich nicht" zum Krieg macht',
        'Wenn die Familie "Mensch ärgere\ndich nicht" zum Familiendrama macht',
      ],
    ]),
  },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value, indent = 2) {
  writeFileSync(path, `${JSON.stringify(value, null, indent)}\n`);
}

function shouldRemove(item, config) {
  if (config.removeTitles.has(item.title)) return true;
  const text = String(item.text ?? "");
  return (config.removeTexts ?? []).some((needle) => text.includes(needle));
}

function filterRemoved(items, config) {
  const removed = [];
  const kept = [];
  for (const item of items) {
    if (shouldRemove(item, config)) {
      removed.push({ id: item.id, pack: item.pack, title: item.title, chars: item.chars });
    } else {
      kept.push(item);
    }
  }
  return { kept, removed };
}

function getRange(items) {
  const lengths = items.map((item) => Number(item.chars ?? String(item.text ?? item.caption ?? "").length)).sort((a, b) => a - b);
  return lengths.length ? [lengths[0], lengths[lengths.length - 1]] : [0, 0];
}

function rebuildJokeDeck(config) {
  const abs = resolve(process.cwd(), config.dir);
  const titledPath = resolve(abs, "titled.json");
  const indexPath = resolve(abs, "index.json");
  const reportPath = resolve(abs, "safety-review-pruned.json");
  const items = readJson(titledPath);
  const previousIndex = existsSync(indexPath) ? readJson(indexPath) : {};
  const previousReport = existsSync(reportPath) ? readJson(reportPath) : null;
  const { kept, removed } = filterRemoved(items, config);
  const packFiles = readdirSync(abs).filter((name) => /^pack-\d+\.json$/.test(name)).sort();
  const packEdits = [];
  for (const file of packFiles) {
    const packPath = resolve(abs, file);
    const { kept: keptPack, removed: removedPack } = filterRemoved(readJson(packPath), config);
    if (removedPack.length) packEdits.push({ file, path: packPath, keptPack, removedPack });
  }

  const previouslyRemoved = new Set((previousReport?.removedItems || []).map((item) => item.title));
  const found = new Set(removed.map((item) => item.title));
  if (!removed.length && !packEdits.length) {
    const missing = [...config.removeTitles].filter((title) => !previouslyRemoved.has(title));
    if (missing.length) {
      throw new Error(`${config.dir}: missing expected titles: ${missing.join(", ")}`);
    }
    console.log(`${config.dir}: already clean`);
    return;
  }

  {
    const missing = [...config.removeTitles].filter((title) => !found.has(title) && !previouslyRemoved.has(title));
    if (missing.length) {
      throw new Error(`${config.dir}: missing expected titles: ${missing.join(", ")}`);
    }
  }

  const previousRemovedCount = previousIndex.safetyReviewPrunedRemoved || 0;

  for (const edit of packEdits) {
    writeJson(edit.path, edit.keptPack, config.indent);
  }

  if (removed.length) {
    writeJson(titledPath, kept, config.indent);
    writeJson(indexPath, {
      ...previousIndex,
      total: kept.length,
      packs: previousIndex.packs || packFiles.length || Math.max(1, Math.ceil(kept.length / config.packSize)),
      packSize: config.packSize,
      range: getRange(kept),
      safetyReviewPrunedAt: new Date().toISOString(),
      safetyReviewPrunedRemoved: previousRemovedCount + removed.length,
    });
    writeJson(reportPath, {
      generatedAt: new Date().toISOString(),
      sourceTotal: items.length,
      kept: kept.length,
      removed: removed.length,
      removedItems: removed,
      previousReports: previousReport ? [previousReport] : [],
    });
  }
  console.log(`${config.dir}: removed=${removed.length} packEdits=${packEdits.length} kept=${kept.length}`);
}

function patchMemeDeck(config) {
  const abs = resolve(process.cwd(), config.dir);
  const cardsPath = resolve(abs, "cards.json");
  const reportPath = resolve(abs, "safety-review-edits.json");
  const cards = readJson(cardsPath);
  const previousReport = existsSync(reportPath) ? readJson(reportPath) : null;
  const edits = [];

  for (const card of cards) {
    if (config.replacements.has(card.caption)) {
      const previousCaption = card.caption;
      card.caption = config.replacements.get(card.caption);
      edits.push({ previousCaption, nextCaption: card.caption, photoFile: card.photoFile });
    }
  }

  const previousEdits = new Set((previousReport?.edits || []).map((edit) => edit.previousCaption));
  if (!edits.length) {
    const missing = [...config.replacements.keys()].filter((caption) => !previousEdits.has(caption));
    if (missing.length) {
      throw new Error(`${config.dir}: missing expected captions: ${missing.join(" | ")}`);
    }
    console.log(`${config.dir}: already clean`);
    return;
  }

  if (edits.length !== config.replacements.size) {
    const found = new Set(edits.map((edit) => edit.previousCaption));
    const missing = [...config.replacements.keys()].filter((caption) => !found.has(caption) && !previousEdits.has(caption));
    if (missing.length) {
      throw new Error(`${config.dir}: missing expected captions: ${missing.join(" | ")}`);
    }
  }

  writeJson(cardsPath, cards);
  writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    edits,
    previousReports: previousReport ? [previousReport] : [],
  });
  console.log(`${config.dir}: edited=${edits.length}`);
}

for (const deck of jokeDecks) rebuildJokeDeck(deck);
for (const deck of memeEdits) patchMemeDeck(deck);
