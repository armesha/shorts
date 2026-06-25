#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DECKS, getDeck } from "../src/anecdotes/decks.ts";
import { packItemKey, withStableItemKeys } from "../src/anecdotes/library.ts";

const dbPath = resolve(process.cwd(), process.argv[2] || "data/app.db");
const factDir = resolve(process.cwd(), "assets/fact-videos");
const outputDir = resolve(process.cwd(), "data/output");

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadPrefactItems(deckId) {
  const deck = getDeck(deckId);
  const file = resolve(process.cwd(), deck.dir, "videos.json");
  if (!existsSync(file)) return [];
  const rows = JSON.parse(readFileSync(file, "utf8"));
  return withStableItemKeys(rows.map((c, i) => ({
    id: i,
    pack: 1,
    text: c.text ?? "",
    chars: (c.text ?? "").length,
    title: c.title ?? "",
    videoFile: c.file,
  })));
}

const deckHashIndex = new Map();
for (const deck of DECKS.filter((d) => d.preFact)) {
  const items = loadPrefactItems(deck.id).filter((item) => item.itemKey && item.videoFile);
  if (!items.length) continue;
  const byHash = new Map();
  for (const item of items) {
    const src = resolve(factDir, item.videoFile);
    if (!existsSync(src)) continue;
    byHash.set(fileHash(src), packItemKey(item));
  }
  if (byHash.size) deckHashIndex.set(deck.id, byHash);
}

const deckIds = [...deckHashIndex.keys()];
if (!deckIds.length) {
  console.log(JSON.stringify({ duplicateTextDecks: 0, scanned: 0, inserted: 0, missingFiles: 0 }, null, 2));
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
const placeholders = deckIds.map(() => "?").join(",");
const libraryRows = db.prepare(
  `SELECT v.id, v.deck, v.video_rel, a.user_id
     FROM videos v
     JOIN accounts a ON a.id = v.account_id
    WHERE v.deck IN (${placeholders})`,
).all(...deckIds);
const historyRows = db.prepare(
  `SELECT h.id, h.deck, h.video_path AS video_rel, a.user_id
     FROM history h
     JOIN accounts a ON a.id = h.account_id
    WHERE h.deck IN (${placeholders})`,
).all(...deckIds);

const insert = db.prepare("INSERT OR IGNORE INTO user_used_anecdotes (user_id, key) VALUES (?, ?)");
let scanned = 0;
let matched = 0;
let inserted = 0;
let missingFiles = 0;
let unmatched = 0;

db.exec("BEGIN");
try {
  for (const row of [...libraryRows, ...historyRows]) {
    if (!row.user_id || !row.deck || !row.video_rel) continue;
    const videoPath = resolve(outputDir, String(row.video_rel).replace(/^data\/output\//, ""));
    if (!existsSync(videoPath)) {
      missingFiles++;
      continue;
    }
    scanned++;
    const key = deckHashIndex.get(row.deck)?.get(fileHash(videoPath));
    if (!key) {
      unmatched++;
      continue;
    }
    matched++;
    insert.run(Number(row.user_id), key);
    if (Number(db.prepare("SELECT changes() AS n").get().n) > 0) inserted++;
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
} finally {
  db.close();
}

console.log(JSON.stringify({
  duplicateTextDecks: deckIds.length,
  scanned,
  matched,
  inserted,
  missingFiles,
  unmatched,
}, null, 2));
