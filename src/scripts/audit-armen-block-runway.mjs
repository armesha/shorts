#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

function blockForAccount(account, sourceDecks) {
  if (sourceDecks.some((deckId) => /^(islamic|christian|prayers-|christian-|islamic-)/.test(deckId))) return "Религия";
  if ((account.channel_lang || account.lang) === "ru") return "Русские";
  return "Иностранные";
}

function scheduledDeckOrder(account, sourceDecks) {
  const sources = sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean);
  if (!sources.length) return [];
  const slotDecks = readJson(account.slot_decks, {});
  return readJson(account.schedule, [])
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

const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA query_only = ON");

const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(USERNAME);
if (!user) {
  console.error(`User not found: ${USERNAME}`);
  process.exit(1);
}

const accounts = db
  .prepare(
    `SELECT id, channel_name, yt_channel_title, lang, channel_lang, schedule, slot_decks, source_decks
       FROM accounts
      WHERE user_id = ?
      ORDER BY id`,
  )
  .all(user.id);

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
  const sourceDecks = cleanSuperAdminSourceDecks(readJson(account.source_decks, []));
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
        block: blockForAccount(account, sourceDecks),
        channel: account.yt_channel_title || account.channel_name,
        deckId,
        deckName: deckName(deckId),
        missing: wanted - ready,
        ready,
        daily,
      });
    }
  }
  const blockName = blockForAccount(account, sourceDecks);
  const block = blocks.get(blockName) || { channels: [], perDay: 0, ready: 0, minRunway: null, limiting: null };
  const channel = {
    id: account.id,
    name: account.yt_channel_title || account.channel_name,
    lang: account.channel_lang || account.lang,
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

if (slotWarnings.length) {
  console.log(`\nPer-slot source warnings for ${TARGET_DAYS} days${STRICT_SLOTS ? "" : " (scheduler can fall back to other ready sources)"}:`);
  for (const item of slotWarnings) {
    console.log(
      `- ${item.block} · ${item.channel} -> ${item.deckName}: ready=${item.ready}; perDay=${item.daily}; missing=${item.missing}`,
    );
  }
}

if (channelShortages.length || (STRICT_SLOTS && slotWarnings.length)) {
  db.close();
  process.exit(1);
}

console.log(`\nNo channel runway shortages for ${TARGET_DAYS} days.`);
db.close();
