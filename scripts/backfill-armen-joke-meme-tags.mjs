import { DatabaseSync } from "node:sqlite";
import { getDeck } from "../src/anecdotes/decks.ts";
import { videoTags } from "../src/anecdotes/video-tags.ts";

const DB_PATH = "data/app.db";
const OWNER = "armen";
const APPLY = process.argv.includes("--apply");
const TARGET_BUILTIN_JOKES = new Set(["ar", "de", "en", "fr", "it", "ja", "pt", "ru"]);
const TARGET_PACK_RE = /^pack:(?:new-memes-(?:ar|de|en|es|fr|it|ja|pl|pt|ru)-superadmin|chistes-es-|dowcipy-pl-)/;

function isTargetDeck(deckId) {
  return TARGET_BUILTIN_JOKES.has(deckId) || TARGET_PACK_RE.test(deckId);
}

const db = new DatabaseSync(DB_PATH);

const activeDeckRows = db
  .prepare(
    `WITH active(deck) AS (
       SELECT DISTINCT json_each.value
         FROM accounts a
         JOIN users u ON u.id = a.user_id,
              json_each(a.source_decks)
        WHERE lower(u.username) = ?
       UNION
       SELECT DISTINCT json_each.value
         FROM accounts a
         JOIN users u ON u.id = a.user_id,
              json_each(a.slot_decks)
        WHERE lower(u.username) = ?
     )
     SELECT deck FROM active ORDER BY deck`,
  )
  .all(OWNER, OWNER);

const activeTargetDecks = activeDeckRows.map((row) => String(row.deck || "")).filter(isTargetDeck);
const placeholders = activeTargetDecks.map(() => "?").join(",");
const videos = placeholders
  ? db
      .prepare(
        `SELECT v.id, v.deck, v.title, v.text, v.tags
           FROM videos v
           JOIN accounts a ON a.id = v.account_id
           JOIN users u ON u.id = a.user_id
          WHERE lower(u.username) = ?
            AND v.deck IN (${placeholders})
          ORDER BY v.deck, v.id`,
      )
      .all(OWNER, ...activeTargetDecks)
  : [];

const byDeck = new Map();
const examples = [];
const update = db.prepare("UPDATE videos SET tags = ? WHERE id = ?");
let changed = 0;
let unchanged = 0;

if (APPLY) db.exec("BEGIN IMMEDIATE");
try {
  for (const row of videos) {
    const deckId = String(row.deck || "");
    const tags = videoTags(getDeck(deckId), String(row.title || ""), String(row.text || ""));
    const tagText = tags.join(",");
    const oldText = String(row.tags || "");
    if (tagText === oldText) {
      unchanged += 1;
      continue;
    }
    changed += 1;
    byDeck.set(deckId, (byDeck.get(deckId) || 0) + 1);
    if (examples.length < 12) {
      examples.push({
        id: Number(row.id),
        deck: deckId,
        title: String(row.title || "").slice(0, 80),
        tags,
      });
    }
    if (APPLY) update.run(tagText, Number(row.id));
  }
  if (APPLY) db.exec("COMMIT");
} catch (error) {
  if (APPLY) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
  }
  throw error;
}

console.log(`mode=${APPLY ? "apply" : "dry-run"}`);
console.log(`owner=${OWNER}`);
console.log(`active_target_decks=${activeTargetDecks.length}`);
console.log(`selected_videos=${videos.length}`);
console.log(`changed=${changed}`);
console.log(`unchanged=${unchanged}`);
console.log("by_deck=");
for (const [deck, count] of [...byDeck.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${deck}: ${count}`);
}
console.log("examples=");
for (const example of examples) {
  console.log(`  #${example.id} ${example.deck} "${example.title}" -> ${example.tags.join(", ")}`);
}

