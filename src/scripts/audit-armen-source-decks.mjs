#!/usr/bin/env node
import { resolve } from "node:path";
import { openDb } from "../../server/db.ts";
import { BLOCKS } from "../../server/routes/super-admin-channel-blocks.ts";
import { makeDeckAccess } from "../../server/services/deck-access.ts";
import {
  FORBIDDEN_SUPER_ADMIN_SOURCE_GROUPS,
  REMOVED_SUPER_ADMIN_OPTICAL_DECKS,
} from "../../server/services/super-admin-forbidden-source-decks.ts";
import { DECKS } from "../anecdotes/decks.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const USERNAME = process.argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length) || "armen";

const FORBIDDEN_GROUPS = FORBIDDEN_SUPER_ADMIN_SOURCE_GROUPS;

const FORBIDDEN = new Map(FORBIDDEN_GROUPS.flatMap((group) => group.decks.map((deck) => [deck, group.group])));

function readJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function stringValuesDeep(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringValuesDeep(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringValuesDeep(item, out);
  }
  return out;
}

function addHits(hits, account, place, deckIds) {
  for (const deckId of deckIds) {
    const group = FORBIDDEN.get(deckId);
    if (!group) continue;
    hits.push({
      accountId: account.id,
      channelName: account.channel_name,
      channelLang: account.channel_lang || account.lang,
      place,
      deckId,
      group,
    });
  }
}

const store = openDb(DB_PATH);
const db = store.db;
db.exec("PRAGMA query_only = ON");

const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(USERNAME);
if (!user) {
  console.error(`User not found: ${USERNAME}`);
  process.exit(1);
}

const accounts = db
  .prepare("SELECT id, channel_name, lang, channel_lang, source_decks, slot_decks FROM accounts WHERE user_id = ? ORDER BY id")
  .all(user.id);

const hits = [];
for (const block of BLOCKS) {
  for (const group of block.sourceGroups ?? []) {
    addHits(
      hits,
      { id: null, channel_name: block.title, lang: "", channel_lang: "" },
      `block:${block.id}/sourceGroup:${group.id}`,
      stringValuesDeep(group.sources),
    );
  }
}

for (const account of accounts) {
  addHits(hits, account, "source_decks", readJson(account.source_decks, []));
  addHits(hits, account, "slot_decks", stringValuesDeep(readJson(account.slot_decks, {})));
}

const deckAccess = makeDeckAccess(store, { isAdminReq: () => true, isSuperAdminReq: () => true });
for (const deckId of REMOVED_SUPER_ADMIN_OPTICAL_DECKS) {
  const deck = DECKS.find((candidate) => candidate.id === deckId);
  if (!deck) continue;
  if (deckAccess.builtinDeckVisibleForUser(user.id, deck)) {
    hits.push({
      accountId: null,
      channelName: USERNAME,
      channelLang: "",
      place: "builtin_visibility",
      deckId,
      group: FORBIDDEN.get(deckId),
    });
  }
  if (deckAccess.deckAllowedForUser(user.id, deckId)) {
    hits.push({
      accountId: null,
      channelName: USERNAME,
      channelLang: "",
      place: "deck_allowed",
      deckId,
      group: FORBIDDEN.get(deckId),
    });
  }
}

const forbiddenDecks = [...FORBIDDEN.keys()];
if (forbiddenDecks.length) {
  const placeholders = forbiddenDecks.map(() => "?").join(",");
  const videoRows = db
    .prepare(
      `SELECT a.id AS account_id, a.channel_name, a.lang, a.channel_lang, v.deck, COUNT(*) AS count
         FROM videos v
         JOIN accounts a ON a.id = v.account_id
        WHERE a.user_id = ?
          AND v.deck IN (${placeholders})
        GROUP BY a.id, v.deck
        ORDER BY a.id, v.deck`,
    )
    .all(user.id, ...forbiddenDecks);
  for (const row of videoRows) {
    hits.push({
      accountId: row.account_id,
      channelName: row.channel_name,
      channelLang: row.channel_lang || row.lang,
      place: "videos",
      deckId: row.deck,
      group: FORBIDDEN.get(row.deck),
      count: Number(row.count) || 0,
    });
  }

  const jobRows = db
    .prepare(
      `SELECT gj.id,
              gj.state,
              gj.account_id,
              gj.deck_ids,
              a.channel_name,
              a.lang,
              a.channel_lang
         FROM generation_jobs gj
         LEFT JOIN accounts a ON a.id = gj.account_id
        WHERE gj.state IN ('queued','running')
          AND (gj.user_id = ? OR gj.owner_user_id = ? OR a.user_id = ?)
        ORDER BY gj.created_at, gj.id`,
    )
    .all(user.id, user.id, user.id);
  for (const row of jobRows) {
    for (const deckId of stringValuesDeep(readJson(row.deck_ids, []))) {
      const group = FORBIDDEN.get(deckId);
      if (!group) continue;
      hits.push({
        accountId: row.account_id,
        channelName: row.channel_name || `generation job ${row.id}`,
        channelLang: row.channel_lang || row.lang || "",
        place: `generation_jobs:${row.state}`,
        deckId,
        group,
        jobId: row.id,
      });
    }
  }

  const activeHistoryRows = db
    .prepare(
      `SELECT h.id,
              h.status,
              h.deck,
              h.account_id,
              a.channel_name,
              a.lang,
              a.channel_lang
         FROM history h
         JOIN accounts a ON a.id = h.account_id
        WHERE a.user_id = ?
          AND h.status IN ('pending','scheduled')
          AND h.deck IN (${placeholders})
        ORDER BY h.created_at, h.id`,
    )
    .all(user.id, ...forbiddenDecks);
  for (const row of activeHistoryRows) {
    hits.push({
      accountId: row.account_id,
      channelName: row.channel_name,
      channelLang: row.channel_lang || row.lang,
      place: `history:${row.status}`,
      deckId: row.deck,
      group: FORBIDDEN.get(row.deck),
      historyId: row.id,
    });
  }
}

console.log(`armen source audit: user=${USERNAME}; accounts=${accounts.length}; forbiddenHits=${hits.length}`);
for (const group of FORBIDDEN_GROUPS) {
  console.log(`- ${group.group}: ${group.decks.join(", ")}`);
}

if (hits.length) {
  console.error("\nForbidden source hits:");
  for (const hit of hits) {
    const count = hit.count != null ? ` x${hit.count}` : "";
    console.error(
      `- account ${hit.accountId} ${hit.channelName} (${hit.channelLang}) ${hit.place}: ${hit.deckId}${count} [${hit.group}]`,
    );
  }
  db.close();
  process.exit(1);
}

db.close();
