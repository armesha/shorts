#!/usr/bin/env node
import { resolve } from "node:path";
import { openDb } from "../../server/db.ts";
import { BLOCKS, blockDefaultSourcesForDb } from "../../server/routes/super-admin-channel-blocks.ts";
import { makeDeckAccess } from "../../server/services/deck-access.ts";
import { cleanSuperAdminSourceDecks, isForbiddenSuperAdminSourceDeck } from "../../server/services/super-admin-optical-decks.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const USERNAME = process.argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length) || "armen";

function readJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const aa = [...a].sort();
  const bb = [...b].sort();
  return aa.every((value, index) => value === bb[index]);
}

function blockForAccount(db, account, sourceDecks) {
  for (const block of BLOCKS) {
    if (block.accountIds.includes(account.id)) return block;
  }
  for (const block of BLOCKS) {
    const expected = blockDefaultSourcesForDb(db, block.id, account.channel_lang || account.lang);
    if (expected.length && sameSet(cleanSuperAdminSourceDecks(sourceDecks), expected)) return block;
  }
  return null;
}

const store = openDb(DB_PATH);
const db = store.db;
db.exec("PRAGMA query_only = ON");

const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(USERNAME);
if (!user) {
  console.error(`User not found: ${USERNAME}`);
  process.exit(1);
}

const deckAccess = makeDeckAccess(store, { isAdminReq: () => true, isSuperAdminReq: () => true });
const accounts = db
  .prepare("SELECT id, channel_name, yt_channel_title, lang, channel_lang, source_decks, slot_decks FROM accounts WHERE user_id = ? ORDER BY id")
  .all(user.id);

const issues = [];
for (const account of accounts) {
  const rawSourceDecks = readJson(account.source_decks, []).map(String);
  const forbiddenSourceDecks = rawSourceDecks.filter((deckId) => isForbiddenSuperAdminSourceDeck(deckId));
  const sourceDecks = cleanSuperAdminSourceDecks(rawSourceDecks);
  const slotDecks = readJson(account.slot_decks, {});
  const block = blockForAccount(store, account, sourceDecks);
  const channelName = account.yt_channel_title || account.channel_name;
  const lang = account.channel_lang || account.lang;

  if (forbiddenSourceDecks.length) {
    issues.push({
      accountId: account.id,
      channelName,
      issue: "forbidden_superadmin_source_deck",
      lang,
      deckIds: forbiddenSourceDecks,
    });
  }

  if (!block) {
    issues.push({ accountId: account.id, channelName, issue: "unassigned_account", lang, sourceDecks });
    continue;
  }

  const expected = blockDefaultSourcesForDb(store, block.id, lang);
  if (!expected.length) {
    issues.push({ accountId: account.id, channelName, block: block.id, issue: "missing_block_defaults", lang, sourceDecks });
  } else if (!sameSet(sourceDecks, expected)) {
    issues.push({
      accountId: account.id,
      channelName,
      block: block.id,
      issue: "source_decks_mismatch",
      lang,
      expected,
      actual: sourceDecks,
      missing: expected.filter((deckId) => !sourceDecks.includes(deckId)),
      extra: sourceDecks.filter((deckId) => !expected.includes(deckId)),
    });
  }

  for (const deckId of sourceDecks) {
    const err = deckAccess.validateAccountSourceDeck({ userId: user.id }, deckId, lang);
    if (!err) continue;
    issues.push({
      accountId: account.id,
      channelName,
      block: block.id,
      issue: "invalid_source_deck",
      lang,
      deckId,
      error: err,
    });
  }

  if (!sourceDecks.includes(String(account.lang || ""))) {
    issues.push({
      accountId: account.id,
      channelName,
      block: block.id,
      issue: "primary_lang_not_in_sources",
      lang: account.lang,
      sourceDecks,
    });
  }

  for (const [time, deckIdRaw] of Object.entries(slotDecks)) {
    const deckId = String(deckIdRaw || "");
    if (!deckId || sourceDecks.includes(deckId)) continue;
    issues.push({
      accountId: account.id,
      channelName,
      block: block.id,
      issue: "slot_deck_not_in_sources",
      time,
      deckId,
      sourceDecks,
    });
  }
}

const staleSettings = db
  .prepare(
    `SELECT key, value
       FROM settings
      WHERE key LIKE 'superAdmin.channelBlock.%sourceWeights'
        AND (
          key LIKE '%jokes_memes%'
          OR key LIKE '%riddles_illusions%'
          OR key LIKE '%facts_space%'
          OR key LIKE '%religion.sourceWeights%'
          OR key LIKE '%islam.sourceWeights%'
          OR key LIKE '%christianity.sourceWeights%'
          OR value LIKE '%fact_video%'
          OR value LIKE '%psychology%'
          OR value LIKE '%visual_riddles%'
          OR value LIKE '%mind_flip%'
        )
      ORDER BY key`,
  )
  .all();
for (const row of staleSettings) {
  issues.push({ issue: "stale_source_weight_setting", key: row.key, value: row.value });
}

const summary = {
  user: USERNAME,
  accounts: accounts.length,
  blocks: BLOCKS.length,
  issues: issues.length,
};

console.log(`armen block consistency: user=${USERNAME}; accounts=${accounts.length}; issues=${issues.length}`);
if (issues.length) {
  console.error(JSON.stringify({ summary, issues }, null, 2));
  db.close();
  process.exit(1);
}

db.close();
