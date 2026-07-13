#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DB_PATH = resolve(ROOT, "data/app.db");
const OUTPUT_DIR = resolve(ROOT, "data/output");
const OUTPUT_PREFIX = `${OUTPUT_DIR}/`;
const PACK_ID = "new-memes-ru-superadmin";
const OLD_DECK = `pack:${PACK_ID}`;
const NEW_DECK = "voiced-memes-ru";
const USERNAME = "armen";
const ACCOUNT_ID = 7;
const ACCOUNT_NAME = "Прикольные мемы";
const NEW_SCHEDULE = ["08:14", "17:09", "18:03", "19:26", "20:35", "21:24"];
const PACK_PATH = resolve(ROOT, `data/packs/${PACK_ID}.json`);
const VOICED_PATH = resolve(ROOT, "data/voiced-memes-ru/videos.json");
const MEMOTEKA_DIR = resolve(ROOT, "server/public/memes");
const MEMES_PATH = resolve(MEMOTEKA_DIR, "memes.js");
const SOURCES_PATH = resolve(MEMOTEKA_DIR, "sources.json");
const LEDGER_PATH = resolve(MEMOTEKA_DIR, "ingestion-ledger.json");
const IMAGES_DIR = resolve(MEMOTEKA_DIR, "images");
const SOURCE_LEDGER_ID = "armen-unpublished-new-memes-ru";
const apply = process.argv.includes("--apply");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function atomicWrite(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, path);
}

function parseMemes(path) {
  const raw = readFileSync(path, "utf8").trim();
  const match = /^window\.MEMES=(\[[\s\S]*\]);?$/.exec(raw);
  if (!match) throw new Error(`unexpected memes.js format: ${path}`);
  return JSON.parse(match[1]);
}

function anecdoteKey(text) {
  const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(index)) >>> 0;
  }
  return `a${hash.toString(36)}-${normalized.length}`;
}

function packCardKey(values) {
  const parts = [];
  for (const key of Object.keys(values).sort()) {
    const value = values[key];
    parts.push(Array.isArray(value) ? value.join(" ") : String(value ?? ""));
  }
  return `p${anecdoteKey(parts.join(" \u0001 "))}`;
}

function readableCard(values) {
  const text = String(values.title || "");
  return { title: (text || "Карточка").slice(0, 100), text };
}

function imageSource(template) {
  const image = template?.elements?.find(
    (element) => element?.type === "image" && typeof element.src === "string",
  );
  return image?.src ? resolve(ROOT, image.src) : null;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function safeId(cardKey) {
  return `armen-ru-${cardKey}`.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 120);
}

function sourceLink(source) {
  const videoId = String(source || "")
    .split("_")
    .find((part) => /^[a-zA-Z0-9_-]{11}$/.test(part));
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "https://shareboard.live/channels";
}

function numericImageNames(values) {
  const result = [];
  for (const value of values) {
    const match = /(?:^|images\/)(\d{4})\.(?:avif|jpe?g|png|webp)$/i.exec(String(value || ""));
    if (match) result.push(Number(match[1]));
  }
  return result;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

for (const path of [DB_PATH, PACK_PATH, VOICED_PATH, MEMES_PATH, SOURCES_PATH, LEDGER_PATH]) {
  if (!existsSync(path)) throw new Error(`missing required file: ${path}`);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout = 5000");

const user = db.prepare("SELECT id, username FROM users WHERE username = ?").get(USERNAME);
if (!user) throw new Error(`user not found: ${USERNAME}`);
const account = db
  .prepare(
    `SELECT id, user_id, channel_name, yt_channel_title, source_decks, slot_decks, schedule
       FROM accounts
      WHERE id = ? AND user_id = ?`,
  )
  .get(ACCOUNT_ID, user.id);
if (!account || ![account.channel_name, account.yt_channel_title].includes(ACCOUNT_NAME)) {
  throw new Error(`expected ${USERNAME}/${ACCOUNT_NAME} at account ${ACCOUNT_ID}`);
}

const pack = readJson(PACK_PATH);
if (pack.id !== PACK_ID || pack.cards?.length !== pack.templates?.length) {
  throw new Error(`invalid pack ${PACK_ID}: cards/templates mismatch`);
}

const cards = pack.cards.map((card, index) => {
  const key = packCardKey(card.values);
  const sourcePath = imageSource(pack.templates[index]);
  if (!sourcePath || !existsSync(sourcePath)) {
    throw new Error(`missing template image for card ${index}: ${sourcePath || "none"}`);
  }
  const readable = readableCard(card.values);
  return {
    index,
    key,
    values: card.values,
    sourcePath,
    hash: sha256(sourcePath),
    title: readable.title,
    text: readable.text,
  };
});

const cardsByReadable = new Map(cards.map((card) => [`${card.title}\u0001${card.text}`, card]));
if (cardsByReadable.size !== cards.length) throw new Error("current pack has duplicate readable cards");

const queueRows = db
  .prepare(
    `SELECT id, title, text, video_rel, image_rel
       FROM videos
      WHERE account_id = ? AND deck = ? AND post_count = 0
      ORDER BY id`,
  )
  .all(ACCOUNT_ID, OLD_DECK);
const queuedCurrentKeys = new Set();
const queueRowsOutsideCurrentPack = [];
for (const row of queueRows) {
  const card = cardsByReadable.get(`${row.title}\u0001${row.text}`);
  if (card) queuedCurrentKeys.add(card.key);
  else queueRowsOutsideCurrentPack.push(row);
}

const claimPrefix = `${OLD_DECK}:account:${ACCOUNT_ID}:`;
const claims = new Set(
  db
    .prepare("SELECT key FROM user_used_anecdotes WHERE user_id = ? AND key LIKE ?")
    .all(user.id, `${claimPrefix}%`)
    .map((row) => String(row.key).slice(claimPrefix.length)),
);
const currentKeys = new Set(cards.map((card) => card.key));
const currentClaims = new Set([...claims].filter((key) => currentKeys.has(key)));
const publishedCurrentKeys = new Set(
  [...currentClaims].filter((key) => !queuedCurrentKeys.has(key)),
);
const importCards = cards.filter((card) => !publishedCurrentKeys.has(card.key));

const activeJobs = db
  .prepare(
    `SELECT id, state, total, done, deck_ids
       FROM generation_jobs
      WHERE account_id = ? AND state IN ('queued', 'running')
      ORDER BY created_at`,
  )
  .all(ACCOUNT_ID);
if (activeJobs.length) {
  throw new Error(`account ${ACCOUNT_ID} has active generation jobs: ${activeJobs.map((job) => job.id).join(", ")}`);
}

const memes = parseMemes(MEMES_PATH);
const sources = readJson(SOURCES_PATH);
const ledger = readJson(LEDGER_PATH);
if (!Array.isArray(memes) || !Array.isArray(sources.sources) || !Array.isArray(ledger.items)) {
  throw new Error("unexpected Memoteka catalogue structure");
}

const activeById = new Map(memes.map((meme) => [String(meme.id), meme]));
const ledgerById = new Map(ledger.items.map((item) => [String(item.id), item]));
const activeHashToId = new Map(
  ledger.items
    .filter((item) => item.status === "active" && item.sha256)
    .map((item) => [String(item.sha256), String(item.id)]),
);
const historicalNumbers = numericImageNames([
  ...memes.flatMap((meme) => [meme.url, meme.thumb]),
  ...ledger.items.flatMap((item) => [item.image, item.url, item.thumb]),
]);
let nextImageNumber = Math.max(2999, ...historicalNumbers) + 1;
const plannedFiles = new Set();
const additions = [];
const duplicateLedgerItems = [];
const alreadyActive = [];
const preventedReimports = [];
const now = new Date().toISOString();
const runId = `armen-meme-channel-${now.slice(0, 10).replaceAll("-", "")}`;

for (const card of importCards) {
  const id = safeId(card.key);
  const existingActive = activeById.get(id);
  if (existingActive) {
    alreadyActive.push({ id, duplicateOf: id });
    continue;
  }
  const oldLedgerItem = ledgerById.get(id);
  if (oldLedgerItem && oldLedgerItem.status !== "active") {
    preventedReimports.push({ id, status: oldLedgerItem.status });
    continue;
  }
  const duplicateOf = activeHashToId.get(card.hash);
  if (duplicateOf) {
    if (!oldLedgerItem) {
      duplicateLedgerItems.push({
        id,
        status: "duplicate",
        reason: "exact_sha256_duplicate",
        duplicateOf,
        sourceUrl: OLD_DECK,
        sourceImageUrl: card.sourcePath.slice(ROOT.length + 1),
        sha256: card.hash,
        firstSeenAt: now,
        reviewedAt: now,
        runId,
        ownerUsername: USERNAME,
        accountId: ACCOUNT_ID,
      });
    }
    alreadyActive.push({ id, duplicateOf });
    continue;
  }

  const extension = extname(card.sourcePath).toLowerCase();
  if (!/^\.(?:avif|jpe?g|png|webp)$/.test(extension)) {
    throw new Error(`unsupported image extension: ${card.sourcePath}`);
  }
  let filename;
  do {
    if (nextImageNumber > 9999) throw new Error("Memoteka four-digit image namespace is exhausted");
    filename = `${String(nextImageNumber++).padStart(4, "0")}${extension}`;
  } while (existsSync(resolve(IMAGES_DIR, filename)) || plannedFiles.has(filename));
  plannedFiles.add(filename);
  const publicationState = queuedCurrentKeys.has(card.key) ? "queued" : "unused";
  additions.push({
    card,
    filename,
    publicationState,
    meme: {
      id,
      title: String(card.values.title || "Мем armen"),
      url: `images/${filename}`,
      thumb: `images/${filename}`,
      sub: publicationState === "queued" ? "armen · RU · был в очереди" : "armen · RU · не публиковался",
      cat: "Мемы armen",
      ups: 0,
      link: sourceLink(card.values.source),
      lang: "ru",
      layout: "mixed",
    },
    ledger: {
      id,
      status: "active",
      sourceUrl: OLD_DECK,
      pageUrl: sourceLink(card.values.source),
      sourceImageUrl: card.sourcePath.slice(ROOT.length + 1),
      image: `images/${filename}`,
      sha256: card.hash,
      firstSeenAt: now,
      importedAt: now,
      reviewedAt: now,
      runId,
      ownerUsername: USERNAME,
      accountId: ACCOUNT_ID,
      deck: OLD_DECK,
      packSource: String(card.values.source || ""),
      publicationState,
    },
  });
}

const usedKeys = new Set(
  db.prepare("SELECT key FROM user_used_anecdotes WHERE user_id = ?").all(user.id).map((row) => String(row.key)),
);
const voiced = readJson(VOICED_PATH);
const voicedTextCounts = new Map();
for (const item of voiced) {
  const textKey = anecdoteKey(item.text);
  voicedTextCounts.set(textKey, (voicedTextCounts.get(textKey) ?? 0) + 1);
}
const voicedKeys = voiced.map((item) => {
  const textKey = anecdoteKey(item.text);
  return (voicedTextCounts.get(textKey) ?? 0) <= 1 ? textKey : anecdoteKey(`video:${item.file}`);
});
const voicedAvailable = new Set(voicedKeys.filter((key) => !usedKeys.has(key))).size;

const summary = {
  apply,
  user: { id: user.id, username: user.username },
  account: {
    id: account.id,
    channelName: account.yt_channel_title || account.channel_name,
    currentSourceDecks: JSON.parse(account.source_decks || "[]"),
    nextSourceDecks: [NEW_DECK],
    currentSchedule: JSON.parse(account.schedule || "[]"),
    nextSchedule: NEW_SCHEDULE,
  },
  oldPack: {
    cards: cards.length,
    currentClaims: currentClaims.size,
    publishedCurrent: publishedCurrentKeys.size,
    queuedCurrent: queuedCurrentKeys.size,
    unusedCurrent: cards.length - currentClaims.size,
    importCandidates: importCards.length,
    oldQueueRows: queueRows.length,
    queueRowsOutsideCurrentCuratedPack: queueRowsOutsideCurrentPack.length,
  },
  memoteka: {
    before: memes.length,
    additions: additions.length,
    exactDuplicatesAlreadyActive: alreadyActive.length,
    preventedReimports: preventedReimports.length,
    after: memes.length + additions.length,
  },
  voicedPack: {
    manifestItems: voiced.length,
    availableForArmen: voicedAvailable,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (!apply) {
  console.log("dry-run only; pass --apply to publish Memoteka additions and update the live channel");
  db.close();
  process.exit(0);
}

const stamp = now.replace(/[-:]/g, "").replace(/\..+$/, "Z");
const backupDir = resolve(ROOT, `tmp/armen-meme-channel-migration/${stamp}`);
mkdirSync(backupDir, { recursive: true });
for (const path of [MEMES_PATH, SOURCES_PATH, LEDGER_PATH]) {
  copyFileSync(path, resolve(backupDir, basename(path)));
}
writeFileSync(
  resolve(backupDir, "plan.json"),
  `${JSON.stringify({ summary, queueRows, queueRowsOutsideCurrentPack, additions: additions.map(({ card, ...rest }) => ({ ...rest, sourcePath: card.sourcePath })) }, null, 2)}\n`,
);

const databaseBackup = resolve(ROOT, `data/app.db.bak-${stamp}-before-armen-meme-channel`);
if (existsSync(databaseBackup)) throw new Error(`database backup already exists: ${databaseBackup}`);
db.exec(`VACUUM INTO ${sqlString(databaseBackup)}`);

mkdirSync(IMAGES_DIR, { recursive: true });
const copiedTargets = [];
try {
  for (const addition of additions) {
    const target = resolve(IMAGES_DIR, addition.filename);
    const temporary = `${target}.tmp-${process.pid}`;
    copyFileSync(addition.card.sourcePath, temporary);
    if (sha256(temporary) !== addition.card.hash) throw new Error(`copy verification failed: ${addition.filename}`);
    renameSync(temporary, target);
    copiedTargets.push(target);
  }

  const nextMemes = [...memes, ...additions.map((addition) => addition.meme)];
  const nextLedger = {
    ...ledger,
    updatedAt: now,
    items: [...ledger.items, ...additions.map((addition) => addition.ledger), ...duplicateLedgerItems],
  };
  const sourceEntry = sources.sources.find((entry) => entry.id === SOURCE_LEDGER_ID);
  if (sourceEntry) {
    sourceEntry.items = Number(sourceEntry.items || 0) + additions.length;
    sourceEntry.updatedAt = now;
  } else {
    sources.sources.push({
      id: SOURCE_LEDGER_ID,
      title: "Unpublished RU memes from armen channel",
      source_url: OLD_DECK,
      license: "inherits internal pack rights caveat; not claimed as public domain",
      retrieved_at: now.slice(0, 10),
      retrieval_method: "Copied from the current curated channel pack after excluding cards already published on YouTube",
      items: additions.length,
      selection_rule: "Current pack cards not present in the published set. Previously removed pack cards are not restored.",
    });
  }
  sources.activeCatalogueItems = nextMemes.length;
  sources.historicalLedgerItems = nextLedger.items.length;
  sources.updatedAt = now;

  atomicWrite(MEMES_PATH, `window.MEMES=${JSON.stringify(nextMemes)};\n`);
  atomicWrite(LEDGER_PATH, `${JSON.stringify(nextLedger, null, 2)}\n`);
  atomicWrite(SOURCES_PATH, `${JSON.stringify(sources, null, 2)}\n`);
} catch (error) {
  for (const target of copiedTargets) {
    try {
      unlinkSync(target);
    } catch {
      // best effort; catalogue backups remain available
    }
  }
  throw error;
}

const jobId = voicedAvailable > 0 ? `armen-voiced-${Date.now().toString(36)}` : null;
db.exec("BEGIN IMMEDIATE");
try {
  db.prepare(
    `UPDATE accounts
        SET source_decks = ?, schedule = ?, slot_decks = ?, slot_videos = ?
      WHERE id = ? AND user_id = ?`,
  ).run(
    JSON.stringify([NEW_DECK]),
    JSON.stringify(NEW_SCHEDULE),
    JSON.stringify(Object.fromEntries(NEW_SCHEDULE.map((time) => [time, NEW_DECK]))),
    "{}",
    ACCOUNT_ID,
    user.id,
  );
  db.prepare("DELETE FROM videos WHERE account_id = ? AND deck = ? AND post_count = 0").run(ACCOUNT_ID, OLD_DECK);
  if (jobId) {
    db.prepare(
      `INSERT INTO generation_jobs
        (id, user_id, owner_user_id, account_id, deck_ids, total, done, state, error, created_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'queued', NULL, ?, NULL)`,
    ).run(jobId, user.id, user.id, ACCOUNT_ID, JSON.stringify([NEW_DECK]), voicedAvailable, Date.now());
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

let deletedFiles = 0;
let missingFiles = 0;
for (const row of queueRows) {
  for (const relative of [row.video_rel, row.image_rel]) {
    if (!relative) continue;
    const path = resolve(OUTPUT_DIR, relative);
    if (path === OUTPUT_DIR || !path.startsWith(OUTPUT_PREFIX)) {
      console.warn(`skip unsafe output path: ${path}`);
      continue;
    }
    if (!existsSync(path)) {
      missingFiles += 1;
      continue;
    }
    unlinkSync(path);
    deletedFiles += 1;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      backupDir,
      databaseBackup,
      importedMemes: additions.length,
      removedQueueRows: queueRows.length,
      deletedRenderedFiles: deletedFiles,
      missingRenderedFiles: missingFiles,
      accountId: ACCOUNT_ID,
      sourceDeck: NEW_DECK,
      schedule: NEW_SCHEDULE,
      generationJobId: jobId,
      generationRequested: voicedAvailable,
    },
    null,
    2,
  ),
);
db.close();
