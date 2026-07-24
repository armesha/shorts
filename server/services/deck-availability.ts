import type { Db } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { isPackDeckId } from "../../src/anecdotes/decks.ts";
import { libraryStats } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import { packCardKey } from "./pack-gen.ts";
import { INFINITE_PACKS_FEATURE } from "./infinite-packs.ts";
import { isForbiddenSuperAdminSourceDeck } from "./super-admin-optical-decks.ts";
import { isCircleDeckId } from "./circle-templates.ts";
import { circleSourceStatsForUser } from "./circle-source-library.ts";

export type DeckAvailabilityContext = {
  ownerSuperAdmin: Map<number, boolean>;
  ownerInfinite: Map<number, boolean>;
  usedKeys: Map<number, ReadonlySet<string>>;
  packAvailable: Map<string, number>;
  builtinAvailable: Map<string, Map<string, number>>;
  builtinGroupAvailable: Map<string, number>;
};

export function createDeckAvailabilityContext(): DeckAvailabilityContext {
  return {
    ownerSuperAdmin: new Map(),
    ownerInfinite: new Map(),
    usedKeys: new Map(),
    packAvailable: new Map(),
    builtinAvailable: new Map(),
    builtinGroupAvailable: new Map(),
  };
}

export function ownerIsSuperAdminCached(db: Db, ownerId: number, ctx = createDeckAvailabilityContext()): boolean {
  const cached = ctx.ownerSuperAdmin.get(ownerId);
  if (cached != null) return cached;
  const value = isSuperAdminUser(db.getUserById(ownerId));
  ctx.ownerSuperAdmin.set(ownerId, value);
  return value;
}

export function ownerHasInfinitePacks(db: Db, ownerId: number, ctx = createDeckAvailabilityContext()): boolean {
  const cached = ctx.ownerInfinite.get(ownerId);
  if (cached != null) return cached;
  const value = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
  ctx.ownerInfinite.set(ownerId, value);
  return value;
}

export function usedKeysForOwner(db: Db, ownerId: number, ctx = createDeckAvailabilityContext()): ReadonlySet<string> {
  const cached = ctx.usedKeys.get(ownerId);
  if (cached) return cached;
  const usedAnecdoteKeys = (db as { usedAnecdoteKeys?: (id: number) => Set<string> }).usedAnecdoteKeys;
  const keys = typeof usedAnecdoteKeys === "function" ? usedAnecdoteKeys.call(db, ownerId) : new Set<string>();
  ctx.usedKeys.set(ownerId, keys);
  return keys;
}

function cleanDeckIds(db: Db, ownerId: number, deckIds: string[], ctx: DeckAvailabilityContext): string[] {
  const ownerIsSuperAdmin = ownerIsSuperAdminCached(db, ownerId, ctx);
  return [...new Set(deckIds.map((deckId) => String(deckId || "").trim()).filter(Boolean))].filter(
    (deckId) => !ownerIsSuperAdmin || !isForbiddenSuperAdminSourceDeck(deckId),
  );
}

function builtinAvailableByDeck(db: Db, ownerId: number, deckIds: string[], ctx: DeckAvailabilityContext): Map<string, number> {
  const infinite = ownerHasInfinitePacks(db, ownerId, ctx);
  const clean = [...new Set(deckIds.filter(Boolean))];
  const out = new Map<string, number>();
  const missing = clean.filter((deckId) => {
    const key = `${ownerId}|${infinite ? "inf" : "used"}|${deckId}`;
    const bucket = ctx.builtinAvailable.get(key);
    if (bucket?.has(deckId)) {
      out.set(deckId, bucket.get(deckId) ?? 0);
      return false;
    }
    return true;
  });
  if (!missing.length) return out;

  const loaded = new Map<string, number>();
  try {
    const ph = missing.map(() => "?").join(",");
    const sql = infinite
      ? `SELECT deck_id, COUNT(DISTINCT item_key) AS n
           FROM content_items
          WHERE deck_id IN (${ph})
          GROUP BY deck_id`
      : `SELECT ci.deck_id, COUNT(DISTINCT ci.item_key) AS n
           FROM content_items ci
           LEFT JOIN user_used_anecdotes used ON used.user_id = ? AND used.key = ci.item_key
          WHERE ci.deck_id IN (${ph}) AND used.key IS NULL
          GROUP BY ci.deck_id`;
    const args = infinite ? missing : [ownerId, ...missing];
    const rows = db.db.prepare(sql).all(...args) as { deck_id: string; n: number }[];
    for (const row of rows) loaded.set(String(row.deck_id), Number(row.n) || 0);
  } catch {
    const used = infinite ? new Set<string>() : usedKeysForOwner(db, ownerId, ctx);
    for (const deckId of missing) {
      const stats = libraryStats(deckId, used);
      loaded.set(deckId, infinite ? stats.total : stats.available);
    }
  }

  for (const deckId of missing) {
    const value = loaded.get(deckId) ?? 0;
    const key = `${ownerId}|${infinite ? "inf" : "used"}|${deckId}`;
    ctx.builtinAvailable.set(key, new Map([[deckId, value]]));
    out.set(deckId, value);
  }
  return out;
}

function builtinAvailableForDecks(db: Db, ownerId: number, deckIds: string[], ctx: DeckAvailabilityContext): number {
  const infinite = ownerHasInfinitePacks(db, ownerId, ctx);
  const clean = [...new Set(deckIds.filter(Boolean))].sort();
  if (!clean.length) return 0;
  const cacheKey = `${ownerId}|${infinite ? "inf" : "used"}|${clean.join("\u001f")}`;
  const cached = ctx.builtinGroupAvailable.get(cacheKey);
  if (cached != null) return cached;

  let total = 0;
  try {
    const ph = clean.map(() => "?").join(",");
    const sql = infinite
      ? `SELECT COUNT(DISTINCT item_key) AS n
           FROM content_items
          WHERE deck_id IN (${ph})`
      : `SELECT COUNT(DISTINCT ci.item_key) AS n
           FROM content_items ci
           LEFT JOIN user_used_anecdotes used ON used.user_id = ? AND used.key = ci.item_key
          WHERE ci.deck_id IN (${ph}) AND used.key IS NULL`;
    const args = infinite ? clean : [ownerId, ...clean];
    const row = db.db.prepare(sql).get(...args) as { n?: number } | undefined;
    total = Number(row?.n) || 0;
  } catch {
    const used = infinite ? new Set<string>() : usedKeysForOwner(db, ownerId, ctx);
    for (const deckId of clean) {
      const stats = libraryStats(deckId, used);
      total += infinite ? stats.total : stats.available;
    }
  }

  ctx.builtinGroupAvailable.set(cacheKey, total);
  return total;
}

function packAvailableForDeck(db: Db, ownerId: number, deckId: string, ctx: DeckAvailabilityContext): number {
  const infinite = ownerHasInfinitePacks(db, ownerId, ctx);
  const cacheKey = `${ownerId}|${infinite ? "inf" : "used"}|${deckId}`;
  const cached = ctx.packAvailable.get(cacheKey);
  if (cached != null) return cached;
  const ownerIsSuperAdmin = ownerIsSuperAdminCached(db, ownerId, ctx);
  const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
  if (!pack) {
    ctx.packAvailable.set(cacheKey, 0);
    return 0;
  }
  if (infinite) {
    ctx.packAvailable.set(cacheKey, pack.cards.length);
    return pack.cards.length;
  }
  const used = usedKeysForOwner(db, ownerId, ctx);
  let usedCount = 0;
  for (const card of pack.cards) if (used.has(packCardKey(card.values))) usedCount++;
  const available = Math.max(0, pack.cards.length - usedCount);
  ctx.packAvailable.set(cacheKey, available);
  return available;
}

export function availableUnusedByDeck(
  db: Db,
  ownerId: number,
  deckIds: string[],
  ctx = createDeckAvailabilityContext(),
): Map<string, number> {
  const clean = cleanDeckIds(db, ownerId, deckIds, ctx);
  const out = new Map<string, number>();
  if (!clean.length) return out;

  const circleIds = clean.filter(isCircleDeckId);
  const builtinIds = clean.filter((deckId) => !isPackDeckId(deckId) && !isCircleDeckId(deckId));
  const packIds = clean.filter((deckId) => isPackDeckId(deckId));
  for (const [deckId, available] of builtinAvailableByDeck(db, ownerId, builtinIds, ctx)) out.set(deckId, available);
  if (circleIds.length) {
    const available = circleSourceStatsForUser(ownerId).available;
    for (const deckId of circleIds) out.set(deckId, available);
  }
  for (const deckId of packIds) out.set(deckId, packAvailableForDeck(db, ownerId, deckId, ctx));
  return out;
}

export function availableUnusedForDecks(
  db: Db,
  ownerId: number,
  deckIds: string[],
  ctx = createDeckAvailabilityContext(),
): number {
  const clean = cleanDeckIds(db, ownerId, deckIds, ctx);
  if (!clean.length) return 0;
  const circleIds = clean.filter(isCircleDeckId);
  const builtinIds = clean.filter((deckId) => !isPackDeckId(deckId) && !isCircleDeckId(deckId));
  const packIds = clean.filter((deckId) => isPackDeckId(deckId));
  let total = builtinAvailableForDecks(db, ownerId, builtinIds, ctx);
  if (circleIds.length) total += circleSourceStatsForUser(ownerId).available;
  for (const deckId of packIds) total += packAvailableForDeck(db, ownerId, deckId, ctx);
  return total;
}
