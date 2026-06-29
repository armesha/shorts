#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDb } from "../../server/db.ts";
import { BLOCKS, blockDefaultSourcesForDb } from "../../server/routes/super-admin-channel-blocks.ts";
import { makeDeckAccess } from "../../server/services/deck-access.ts";
import { DECKS } from "../anecdotes/decks.ts";
import { cleanSuperAdminSourceDecks } from "../../server/services/super-admin-optical-decks.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const USERNAME = process.argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length) || "armen";
const TARGET_DAYS = Math.min(
  365,
  Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--days="))?.slice("--days=".length) || "1") || 1),
);
const STRICT_SLOTS = process.argv.includes("--strict-slots");

function readJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function packName(deckId) {
  if (!deckId.startsWith("pack:")) return null;
  const id = deckId.slice("pack:".length);
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "data/packs", `${id}.json`), "utf8")).name || id;
  } catch {
    return id;
  }
}

const BUILTIN_NAMES = new Map(DECKS.map((deck) => [deck.id, deck.name]));
function deckName(deckId) {
  return packName(deckId) || BUILTIN_NAMES.get(deckId) || deckId;
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
    const expected = blockDefaultSourcesForDb(db, block.id, account.channelLang);
    if (expected.length && sameSet(sourceDecks, expected)) return block;
  }
  return null;
}

function scheduledDeckOrder(account, sourceDecks) {
  const sources = sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean);
  if (!sources.length) return [];
  const slotDecks = account.slotDecks ?? readJson(account.slot_decks, {});
  const schedule = Array.isArray(account.schedule) ? account.schedule : readJson(account.schedule, []);
  return schedule
    .map((time, index) => {
      const explicit = slotDecks?.[time];
      return explicit && sources.includes(explicit) ? explicit : sources[index % sources.length];
    })
    .filter(Boolean);
}

function countBy(values) {
  const out = new Map();
  for (const value of values) out.set(value, (out.get(value) || 0) + 1);
  return out;
}

function fmtDays(days) {
  if (days == null) return "-";
  if (!Number.isFinite(days)) return "inf";
  if (days >= 10) return String(Math.floor(days));
  return days.toFixed(1);
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
const accounts = store.listAccountsByUser(user.id);

const readyRows = db
  .prepare(
    `SELECT v.account_id, v.deck, COUNT(*) AS count
       FROM videos v
       JOIN accounts a ON a.id = v.account_id
      WHERE a.user_id = ?
        AND v.post_count = 0
      GROUP BY v.account_id, v.deck`,
  )
  .all(user.id);

const readyByAccountDeck = new Map();
for (const row of readyRows) {
  const key = `${row.account_id}|${row.deck}`;
  readyByAccountDeck.set(key, Number(row.count) || 0);
}

const blocks = new Map();
const channelShortages = [];
const slotWarnings = [];
for (const account of accounts) {
  const sourceDecks = cleanSuperAdminSourceDecks(deckAccess.accountSourceDecks(account));
  const blockDef = blockForAccount(store, account, sourceDecks);
  const blockName = blockDef?.title ?? "Вне блоков";
  const order = scheduledDeckOrder(account, sourceDecks);
  const slotsByDeck = countBy(order);
  const sourceSet = new Set(sourceDecks);
  let readyTotal = 0;
  for (const [key, count] of readyByAccountDeck) {
    const [accountId, deckId] = String(key).split("|");
    if (Number(accountId) === account.id && sourceSet.has(deckId)) readyTotal += count;
  }
  const perDay = order.length;
  const runwayDays = perDay > 0 ? readyTotal / perDay : null;
  let limiting = null;
  for (const [deckId, daily] of slotsByDeck) {
    if (daily <= 0) continue;
    const ready = readyByAccountDeck.get(`${account.id}|${deckId}`) || 0;
    const days = ready / daily;
    if (!limiting || days < limiting.days) limiting = { deckId, ready, daily, days };
    const wanted = Math.ceil(TARGET_DAYS * daily);
    if (ready < wanted) {
      slotWarnings.push({
        block: blockName,
        channel: account.ytChannelTitle || account.channelName,
        deckId,
        deckName: deckName(deckId),
        missing: wanted - ready,
        ready,
        daily,
      });
    }
  }
  const block = blocks.get(blockName) || { channels: [], perDay: 0, ready: 0, minRunway: null, limiting: null };
  const channel = {
    id: account.id,
    name: account.ytChannelTitle || account.channelName,
    lang: account.channelLang || account.lang,
    ready: readyTotal,
    perDay,
    runwayDays,
    limiting,
    sourceCount: sourceDecks.length,
  };
  if (runwayDays != null && runwayDays < TARGET_DAYS) {
    channelShortages.push({
      block: blockName,
      channel: channel.name,
      ready: readyTotal,
      perDay,
      days: runwayDays,
      missing: Math.ceil(TARGET_DAYS * perDay) - readyTotal,
    });
  }
  block.channels.push(channel);
  block.perDay += perDay;
  block.ready += readyTotal;
  if (runwayDays != null && (block.minRunway == null || runwayDays < block.minRunway)) {
    block.minRunway = runwayDays;
    block.limiting = channel;
  }
  blocks.set(blockName, block);
}

console.log(`armen block runway: user=${USERNAME}; accounts=${accounts.length}; targetDays=${TARGET_DAYS}`);
for (const [name, block] of blocks) {
  const limiting = block.limiting;
  const limiter = limiting?.limiting
    ? `${limiting.name} -> ${deckName(limiting.limiting.deckId)}: ${limiting.limiting.ready} ready / ${limiting.limiting.daily} per day / ${fmtDays(limiting.limiting.days)} days`
    : limiting
      ? `${limiting.name}: ${limiting.ready} ready / ${limiting.perDay} per day / ${fmtDays(limiting.runwayDays)} days`
      : "none";
  console.log(
    `- ${name}: channels=${block.channels.length}; ready=${block.ready}; perDay=${block.perDay}; minRunway=${fmtDays(block.minRunway)} days; limiter=${limiter}`,
  );
}

if (channelShortages.length) {
  console.log(`\nChannel runway shortages for ${TARGET_DAYS} days:`);
  for (const item of channelShortages) {
    console.log(
      `- ${item.block} · ${item.channel}: ready=${item.ready}; perDay=${item.perDay}; days=${fmtDays(item.days)}; missing=${item.missing}`,
    );
  }
}

if (slotWarnings.length && STRICT_SLOTS) {
  console.log(`\nStrict per-slot source warnings for ${TARGET_DAYS} days:`);
  for (const item of slotWarnings) {
    console.log(
      `- ${item.block} · ${item.channel} -> ${item.deckName}: ready=${item.ready}; perDay=${item.daily}; missing=${item.missing}`,
    );
  }
} else if (slotWarnings.length) {
  console.log(
    `\nSoft source gaps: ${slotWarnings.length} slot-level gaps. Scheduler/top-up can shift those slots to other ready sources; use --strict-slots to list them.`,
  );
}

if (channelShortages.length || (STRICT_SLOTS && slotWarnings.length)) {
  store.db.close();
  process.exit(1);
}

console.log(`\nNo channel runway shortages for ${TARGET_DAYS} days.`);
store.db.close();
