#!/usr/bin/env node
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { isSuperAdminUser } from "../server/auth.ts";
import { loadBaseConfig } from "../server/config.ts";
import { openDb } from "../server/db.ts";
import { cardReadable } from "../server/infra/media.ts";
import { makeBuildLibraryVideo } from "../server/services/library-build.ts";
import {
  buildPackLibraryVideo,
  packCardKey,
  packTemplateForCard,
  packTemplateIndexForCard,
} from "../server/services/pack-gen.ts";
import {
  BLOCKED_RUSSIAN_JOKE_BACKGROUNDS,
  isAllowedCustomJokePackTemplate,
  parseCustomPackTemplateMarker,
} from "../src/anecdotes/joke-template-pool.ts";
import { listRussianBgs } from "../src/anecdotes/russian-bg.ts";
import { deriveRules, getPack } from "../src/packs/store.ts";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
process.chdir(ROOT);

const APPLY = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(0, Math.floor(Number(limitArg.slice("--limit=".length)) || 0)) : 0;
const usernameArg = process.argv.find((arg) => arg.startsWith("--username="));
const USERNAME = usernameArg ? usernameArg.slice("--username=".length).trim() : "";
const accountArg = process.argv.find((arg) => arg.startsWith("--account-id="));
const ACCOUNT_ID = accountArg ? Math.max(0, Math.floor(Number(accountArg.slice("--account-id=".length)) || 0)) : 0;

const base = loadBaseConfig();
const OUTPUT_DIR = resolve(ROOT, base.outputDir);
const OUTPUT_PREFIX = `${OUTPUT_DIR}/`;
const BACKUP_DIR = resolve(ROOT, "tmp/cleanup-backups");
const CHISTES_PACK_ID = "chistes-es-public-domain";
const CHISTES_DECK_ID = `pack:${CHISTES_PACK_ID}`;

const db = openDb(base.dbPath);
db.db.prepare("PRAGMA busy_timeout = 15000").run();

const buildLibraryVideo = makeBuildLibraryVideo({
  db,
  outputDir: base.outputDir,
  builtinDeckVisibleForUser: () => true,
});

function stableHash(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function outputPath(rel) {
  if (!rel) return null;
  const path = resolve(OUTPUT_DIR, rel);
  if (path !== OUTPUT_DIR && path.startsWith(OUTPUT_PREFIX)) return path;
  throw new Error(`Unsafe output path: ${rel}`);
}

function deleteOutputFiles(row) {
  let deleted = 0;
  let missing = 0;
  for (const rel of [row.videoRel, row.imageRel]) {
    if (!rel) continue;
    const path = outputPath(rel);
    if (!path) continue;
    if (!existsSync(path)) {
      missing += 1;
      continue;
    }
    unlinkSync(path);
    deleted += 1;
  }
  return { deleted, missing };
}

function replacementRussianBg(row) {
  const bgs = listRussianBgs();
  if (!bgs.length) return "";
  return bgs[stableHash(`${row.id}|${row.accountId}|${row.title}|${row.text}`) % bgs.length];
}

function packLookup(packId, ownerId) {
  const owner = db.getUserById(ownerId);
  const pack = getPack(packId, ownerId, isSuperAdminUser(owner));
  if (!pack) return null;
  const rules = deriveRules(pack.templates[0]);
  const cardByNeedle = new Map();
  for (let index = 0; index < pack.cards.length; index += 1) {
    const readable = cardReadable(pack.cards[index].values, rules);
    cardByNeedle.set(`${readable.title}\n${readable.text}`, index);
  }
  return { pack, cardByNeedle };
}

const packCache = new Map();
function cachedPackLookup(packId, ownerId) {
  const key = `${ownerId}:${packId}`;
  if (!packCache.has(key)) packCache.set(key, packLookup(packId, ownerId));
  return packCache.get(key);
}

function rowToCandidate(row) {
  if (row.deck === "ru" && BLOCKED_RUSSIAN_JOKE_BACKGROUNDS.has(String(row.bg || ""))) {
    return {
      kind: "ru",
      row,
      reason: `ru-bg:${row.bg}`,
      replacementBg: replacementRussianBg(row),
    };
  }

  if (row.deck !== CHISTES_DECK_ID) return null;
  const lookup = cachedPackLookup(CHISTES_PACK_ID, row.userId);
  if (!lookup) return { kind: "unmatched", row, reason: "pack-not-found" };
  const marker = parseCustomPackTemplateMarker(row.bg);
  if (marker?.packId === CHISTES_PACK_ID) {
    if (isAllowedCustomJokePackTemplate(CHISTES_PACK_ID, marker.templateIndex)) return null;
    const cardIndex = lookup.cardByNeedle.get(`${row.title}\n${row.text}`);
    return Number.isInteger(cardIndex)
      ? {
          kind: "pack",
          row,
          reason: `pack-marker-template:${marker.templateIndex}`,
          pack: lookup.pack,
          cardIndex,
        }
      : { kind: "unmatched", row, reason: `pack-marker-template:${marker.templateIndex}:card-not-found` };
  }

  const cardIndex = lookup.cardByNeedle.get(`${row.title}\n${row.text}`);
  if (!Number.isInteger(cardIndex)) return { kind: "unmatched", row, reason: "card-not-found" };
  const oldTemplateIndex = cardIndex % Math.max(1, lookup.pack.templates.length);
  if (isAllowedCustomJokePackTemplate(CHISTES_PACK_ID, oldTemplateIndex)) return null;
  return {
    kind: "pack",
    row,
    reason: `pack-old-template:${oldTemplateIndex}`,
    pack: lookup.pack,
    cardIndex,
  };
}

function loadRows() {
  const where = [];
  const params = [];
  if (USERNAME) {
    where.push("u.username = ?");
    params.push(USERNAME);
  }
  if (ACCOUNT_ID > 0) {
    where.push("v.account_id = ?");
    params.push(ACCOUNT_ID);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.db
    .prepare(
      `SELECT v.id,
              v.account_id AS accountId,
              a.channel_name AS channelName,
              a.user_id AS userId,
              u.username AS username,
              v.title,
              v.text,
              v.bg,
              v.music,
              v.deck,
              v.video_rel AS videoRel,
              v.image_rel AS imageRel,
              v.post_count AS postCount,
              v.last_posted_at AS lastPostedAt,
              v.created_at AS createdAt
         FROM videos v
         JOIN accounts a ON a.id = v.account_id
         LEFT JOIN users u ON u.id = a.user_id
         ${whereSql}
        ORDER BY v.account_id, v.id`,
    )
    .all(...params);
}

function printSummary(candidates, unmatched) {
  const byAccount = new Map();
  const byReason = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.row.accountId}|${candidate.row.channelName}|${candidate.row.deck}`;
    byAccount.set(key, (byAccount.get(key) || 0) + 1);
    byReason.set(candidate.reason, (byReason.get(candidate.reason) || 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        selected: candidates.length,
        totalMatchedBeforeLimit: LIMIT ? candidates.length : undefined,
        username: USERNAME || "*",
        accountId: ACCOUNT_ID || "*",
        byAccount: [...byAccount.entries()].map(([key, count]) => ({ key, count })),
        byReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
        unmatched: unmatched.map((item) => ({
          id: item.row.id,
          accountId: item.row.accountId,
          channelName: item.row.channelName,
          deck: item.row.deck,
          reason: item.reason,
        })),
        first: candidates.slice(0, 20).map((item) => ({
          id: item.row.id,
          accountId: item.row.accountId,
          channelName: item.row.channelName,
          deck: item.row.deck,
          reason: item.reason,
          replacement: item.kind === "ru" ? item.replacementBg : `template:${packTemplateIndexForCard(item.pack, item.cardIndex)}`,
        })),
      },
      null,
      2,
    ),
  );
}

function isAudioTrackError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Audio track|Bad audio|Unsupported audio|not available for this pack/i.test(message);
}

async function withMusicFallback(originalMusic, build) {
  const attempts = [];
  if (originalMusic) attempts.push(originalMusic);
  attempts.push(undefined, "none");
  let lastError = null;
  for (const music of attempts) {
    try {
      return await build(music);
    } catch (error) {
      lastError = error;
      if (!isAudioTrackError(error)) throw error;
    }
  }
  throw lastError;
}

async function repairCandidate(candidate) {
  if (candidate.kind === "ru") {
    return withMusicFallback(candidate.row.music || undefined, (music) =>
      buildLibraryVideo({
        userId: candidate.row.userId,
        accountId: candidate.row.accountId,
        title: candidate.row.title,
        text: candidate.row.text,
        bg: candidate.replacementBg,
        music,
        deck: "ru",
      }),
    );
  }

  const card = candidate.pack.cards[candidate.cardIndex];
  const picked = {
    idx: candidate.cardIndex,
    values: card.values,
    tpl: packTemplateForCard(candidate.pack, candidate.cardIndex),
    key: packCardKey(card.values),
  };
  return withMusicFallback(candidate.row.music || undefined, (music) =>
    buildPackLibraryVideo({
      db,
      userId: candidate.row.userId,
      accountId: candidate.row.accountId,
      pack: candidate.pack,
      picked,
      music,
    }),
  );
}

const rows = loadRows();
const rawCandidates = [];
const unmatched = [];
for (const row of rows) {
  const candidate = rowToCandidate(row);
  if (!candidate) continue;
  if (candidate.kind === "unmatched") unmatched.push(candidate);
  else rawCandidates.push(candidate);
}
const candidates = LIMIT > 0 ? rawCandidates.slice(0, LIMIT) : rawCandidates;
printSummary(candidates, unmatched);

if (!APPLY) {
  console.log("dry-run only; pass --apply to render replacements, delete old DB rows, and remove old files");
  process.exit(0);
}

if (!candidates.length) process.exit(0);

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const backupPath = resolve(BACKUP_DIR, `joke-template-library-repair-${stamp}.json`);
mkdirSync(dirname(backupPath), { recursive: true });
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      candidates: candidates.map((candidate) => ({
        kind: candidate.kind,
        reason: candidate.reason,
        row: candidate.row,
        replacement: candidate.kind === "ru" ? candidate.replacementBg : `template:${packTemplateIndexForCard(candidate.pack, candidate.cardIndex)}`,
      })),
      unmatched,
    },
    null,
    2,
  ),
);

let repaired = 0;
let filesDeleted = 0;
let filesMissing = 0;
const failures = [];
for (const candidate of candidates) {
  try {
    const created = await repairCandidate(candidate);
    db.deleteVideo(candidate.row.id);
    const cleanup = deleteOutputFiles(candidate.row);
    filesDeleted += cleanup.deleted;
    filesMissing += cleanup.missing;
    repaired += 1;
    if (repaired % 10 === 0 || repaired === candidates.length) {
      console.log(`repaired ${repaired}/${candidates.length}; last old=${candidate.row.id} new=${created.id}`);
    }
  } catch (error) {
    failures.push({
      id: candidate.row.id,
      accountId: candidate.row.accountId,
      channelName: candidate.row.channelName,
      deck: candidate.row.deck,
      reason: candidate.reason,
      error: error instanceof Error ? error.message : String(error),
    });
    console.warn(`failed old=${candidate.row.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(
  JSON.stringify(
    {
      backupPath,
      requested: candidates.length,
      repaired,
      failed: failures.length,
      filesDeleted,
      filesMissing,
      failures,
    },
    null,
    2,
  ),
);

if (failures.length) process.exitCode = 1;
