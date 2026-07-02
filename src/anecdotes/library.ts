import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDeck } from "./decks.ts";

export interface PackItem {
  id: number;
  pack: number;
  /** Stable per-card identity. Used when visible text is shared by several prebuilt videos. */
  itemKey?: string;
  text: string;
  chars: number;
  title: string;
  /** Optional source/category marker retained for legacy imported items. */
  profession?: string;
  /** preFact deck only: relative filename of the pre-built mp4 in assets/fact-videos/. */
  videoFile?: string;
  /** Quote decks: portrait image relative to repo root plus optional source metadata. */
  portraitFile?: string;
  portraitUrl?: string;
  portraitCredit?: string;
  portraitLicense?: string;
  source?: string;
  qid?: string;
}

const deckDir = (deckId: string): string => resolve(process.cwd(), getDeck(deckId).dir);

type ContentRow = {
  id?: number;
  item_index?: number;
  pack_no?: number;
  title?: string;
  text?: string;
  chars?: number;
  video_file?: string | null;
  payload_json?: string;
};

type SafetyPrunedFile = {
  blockedItemKeys?: unknown;
  blockedItems?: unknown;
  blockedItemIndexes?: unknown;
};

let _contentDb: DatabaseSync | null | undefined;
function contentDb(): DatabaseSync | null {
  if (process.env.CONTENT_LIBRARY_SQLITE !== "1") return null;
  if (_contentDb !== undefined) return _contentDb;
  const dbPath = process.env.CONTENT_LIBRARY_DB || process.env.DATABASE_PATH || resolve(process.cwd(), "data/app.db");
  if (!existsSync(dbPath)) {
    _contentDb = null;
    return null;
  }
  try {
    _contentDb = new DatabaseSync(dbPath, { readOnly: true });
    _contentDb.exec("PRAGMA query_only = ON");
  } catch {
    _contentDb = null;
  }
  return _contentDb;
}

function sqliteItems(deckId: string): PackItem[] | null {
  const db = contentDb();
  if (!db) return null;
  try {
    const rows = db
      .prepare(
        "SELECT item_index, pack_no, title, text, chars, video_file, payload_json FROM content_items WHERE deck_id = ? ORDER BY item_index",
      )
      .all(deckId) as ContentRow[];
    if (!rows.length) return null;
    const items = rows.map((row) => {
      if (row.payload_json) {
        try {
          return JSON.parse(row.payload_json) as PackItem;
        } catch {
          /* fall through to column values */
        }
      }
      const text = String(row.text ?? "");
      return {
        id: Number(row.item_index ?? 0),
        pack: Number(row.pack_no ?? 1),
        text,
        chars: Number(row.chars ?? text.length) || 0,
        title: String(row.title ?? ""),
        videoFile: row.video_file ?? undefined,
      };
    });
    return filterSafetyPrunedItems(deckId, items);
  } catch {
    return null;
  }
}

const _safetyPrunedCache = new Map<string, { keys: Set<string>; indexes: Set<number> }>();
function readSafetyPruned(deckId: string): { keys: Set<string>; indexes: Set<number> } {
  const hit = _safetyPrunedCache.get(deckId);
  if (hit) return hit;
  const file = resolve(deckDir(deckId), "safety-pruned.json");
  const out = { keys: new Set<string>(), indexes: new Set<number>() };
  if (existsSync(file)) {
    try {
      const doc = JSON.parse(readFileSync(file, "utf8")) as SafetyPrunedFile;
      if (Array.isArray(doc.blockedItemKeys)) {
        for (const key of doc.blockedItemKeys) if (typeof key === "string" && key.trim()) out.keys.add(key.trim());
      }
      if (Array.isArray(doc.blockedItems)) {
        for (const item of doc.blockedItems) {
          if (!item || typeof item !== "object") continue;
          const key = (item as { key?: unknown; itemKey?: unknown }).key ?? (item as { itemKey?: unknown }).itemKey;
          if (typeof key === "string" && key.trim()) out.keys.add(key.trim());
          const index = Number((item as { index?: unknown; id?: unknown }).index ?? (item as { id?: unknown }).id);
          if (Number.isInteger(index) && index >= 0) out.indexes.add(index);
        }
      }
      if (Array.isArray(doc.blockedItemIndexes)) {
        for (const raw of doc.blockedItemIndexes) {
          const index = Number(raw);
          if (Number.isInteger(index) && index >= 0) out.indexes.add(index);
        }
      }
    } catch {
      /* ignore malformed optional safety metadata */
    }
  }
  _safetyPrunedCache.set(deckId, out);
  return out;
}

export function filterSafetyPrunedItems(deckId: string, items: PackItem[]): PackItem[] {
  const pruned = readSafetyPruned(deckId);
  if (!pruned.keys.size && !pruned.indexes.size) return items;
  return items.filter((item, index) => {
    if (pruned.keys.has(packItemKey(item))) return false;
    const itemId = Number(item.id);
    if (pruned.indexes.has(index) || (Number.isInteger(itemId) && pruned.indexes.has(itemId))) return false;
    return true;
  });
}

// titled.json per deck = the pool of READY (titled) anecdotes — the only ones generation may use.
const _titledCache = new Map<string, PackItem[]>();
function titledItems(deckId: string): PackItem[] {
  const indexed = sqliteItems(deckId);
  if (indexed) return indexed;
  // preFact decks read videos.json FRESH every time (no cache) so the mp4 pool can keep
  // accumulating (re-run populate) and appear immediately WITHOUT a server restart.
  if (getDeck(deckId).preFact) {
    const file = resolve(deckDir(deckId), "videos.json");
    const arr = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { file: string; title?: string; text?: string }[])
      : [];
    return filterSafetyPrunedItems(
      deckId,
      withStableItemKeys(arr.map((c, i) => ({
        id: i,
        pack: 1,
        text: c.text ?? "",
        chars: (c.text ?? "").length,
        title: c.title ?? "",
        videoFile: c.file,
      }))),
    );
  }
  const hit = _titledCache.get(deckId);
  if (hit) return hit;
  let items: PackItem[];
  if (getDeck(deckId).psych) {
    // Psychology deck: data/psych/cards.json holds structured cards; each whole card → JSON in `text`.
    const file = resolve(deckDir(deckId), "cards.json");
    const cards = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { title_lines?: string[] }[])
      : [];
    items = cards.map((c, i) => {
      const title = (c.title_lines ?? []).join(" ").trim();
      return { id: i, pack: 1, text: JSON.stringify(c), chars: title.length, title };
    });
  } else if (getDeck(deckId).islamic) {
    // Islamic deck: data/islamic/cards.json holds structured cards (arabic + ref); whole card → JSON in `text`.
    const file = resolve(deckDir(deckId), "cards.json");
    const cards = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { arabic?: string; ref?: string }[])
      : [];
    items = cards.map((c, i) => ({
      id: i,
      pack: 1,
      text: JSON.stringify(c),
      chars: (c.arabic ?? "").length,
      title: c.ref ?? "",
    }));
  } else if (getDeck(deckId).christian) {
    // Christian deck: data/christian/cards.json holds structured cards (text + ref); whole card → JSON in `text`.
    const file = resolve(deckDir(deckId), "cards.json");
    const cards = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { text?: string; ref?: string }[])
      : [];
    items = cards.map((c, i) => ({
      id: i,
      pack: 1,
      text: JSON.stringify(c),
      chars: (c.text ?? "").length,
      title: c.ref ?? "",
    }));
  } else if (getDeck(deckId).meme) {
    // Memes deck: data/memes-<lang>/cards.json holds {caption, imageQuery, photoFile?, ...}; whole card → JSON in `text`.
    const file = resolve(deckDir(deckId), "cards.json");
    const cards = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as { caption?: string }[])
      : [];
    items = cards.map((c, i) => {
      const cap = (c.caption ?? "").trim();
      return { id: i, pack: 1, text: JSON.stringify(c), chars: cap.length, title: (cap.split(/\r?\n/)[0] || "").slice(0, 40) };
    });
  } else {
    const titled = resolve(deckDir(deckId), "titled.json");
    items = existsSync(titled) ? (JSON.parse(readFileSync(titled, "utf8")) as PackItem[]) : [];
  }
  items = filterSafetyPrunedItems(deckId, items);
  _titledCache.set(deckId, items);
  return items;
}

/**
 * Stable identity for an anecdote, used to mark it "used" so it never repeats.
 * Based on the normalized TEXT (not the title) — independent of deck/background/music/title.
 * djb2 + length. Cross-language safe (RU/DE/IT texts don't collide).
 */
export function anecdoteKey(text: string): string {
  const s = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `a${h.toString(36)}-${s.length}`;
}

export function packItemKey(item: Pick<PackItem, "text" | "itemKey">): string {
  return item.itemKey || anecdoteKey(item.text);
}

export function withStableItemKeys(items: PackItem[]): PackItem[] {
  const textKeyCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.videoFile) continue;
    const key = anecdoteKey(item.text);
    textKeyCounts.set(key, (textKeyCounts.get(key) ?? 0) + 1);
  }
  return items.map((item) => {
    if (!item.videoFile) return item;
    const textKey = anecdoteKey(item.text);
    if ((textKeyCounts.get(textKey) ?? 0) <= 1) return item;
    return { ...item, itemKey: anecdoteKey(`video:${item.videoFile}`) };
  });
}

export function deckAnecdoteKeys(deckId: string): string[] {
  return [...new Set(poolItems(deckId).map((it) => packItemKey(it)))];
}

/**
 * Pick a READY anecdote (titled) from a deck, skipping any whose key is in `used`.
 * Most decks are random. Sequential decks always return the first unused item in file order.
 * Falls back to a raw pack before titling exists. Returns null when nothing is left.
 */
function stableHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function seededPick<T>(items: T[], seed: string, keyOf: (item: T, index: number) => string): T | null {
  if (!items.length) return null;
  let best = items[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const score = stableHash(`${seed}|${keyOf(item, index)}`);
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

export function randomAnecdote(deckId: string, used?: ReadonlySet<string>, seed?: string): PackItem | null {
  const skip = used && used.size ? used : null;
  const deck = getDeck(deckId);
  const t = titledItems(deckId);
  if (t.length > 0) {
    const pool = skip ? t.filter((it) => !skip.has(packItemKey(it))) : t;
    if (pool.length === 0) return null; // every titled anecdote already used
    if (deck.sequential) return pool[0];
    if (seed) return seededPick(pool, `${deckId}|${seed}`, (it) => packItemKey(it));
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Fallback so generation still works before any pack is titled.
  const dir = deckDir(deckId);
  if (!existsSync(dir)) return null;
  const packs = readdirSync(dir).filter((f) => f.startsWith("pack-") && f.endsWith(".json")).sort();
  if (packs.length === 0) return null;
  const file = deck.sequential ? packs[0] : packs[Math.floor(Math.random() * packs.length)];
  let items = filterSafetyPrunedItems(deckId, JSON.parse(readFileSync(resolve(dir, file), "utf8")) as PackItem[]);
  if (skip) items = items.filter((it) => !skip.has(packItemKey(it)));
  if (deck.sequential) return items[0] ?? null;
  if (seed) return seededPick(items, `${deckId}|${file}|${seed}`, (it) => packItemKey(it));
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/** Deterministic first READY card for "infinite pack" mode: ignores used-history by design. */
export function firstAnecdote(deckId: string): PackItem | null {
  const t = titledItems(deckId);
  if (t.length > 0) return t[0] ?? null;
  const dir = deckDir(deckId);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).filter((f) => f.startsWith("pack-") && f.endsWith(".json")).sort()[0];
  if (!file) return null;
  const items = filterSafetyPrunedItems(deckId, JSON.parse(readFileSync(resolve(dir, file), "utf8")) as PackItem[]);
  return items[0] ?? null;
}

/** All cards of a deck in stable index order (the titled pool) — for the Gallery (browse + pick a specific card). */
export function deckCards(deckId: string): PackItem[] {
  return titledItems(deckId);
}

// The usable pool for a deck: titled items if any, otherwise all raw-pack items (cached).
const _poolCache = new Map<string, PackItem[]>();
function poolItems(deckId: string): PackItem[] {
  const t = titledItems(deckId);
  if (t.length) return t;
  const hit = _poolCache.get(deckId);
  if (hit) return hit;
  const dir = deckDir(deckId);
  const all: PackItem[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.startsWith("pack-") && x.endsWith(".json")).sort()) {
      all.push(...(JSON.parse(readFileSync(resolve(dir, f), "utf8")) as PackItem[]));
    }
  }
  const filtered = filterSafetyPrunedItems(deckId, all);
  _poolCache.set(deckId, filtered);
  return filtered;
}

/**
 * Drop the in-memory caches for a deck (or all decks) so freshly written cards.json/titled.json
 * is re-read on the next pick — lets uploads go live WITHOUT restarting the server.
 */
export function resetDeckCache(deckId?: string): void {
  if (deckId) {
    _titledCache.delete(deckId);
    _poolCache.delete(deckId);
    _safetyPrunedCache.delete(deckId);
  } else {
    _titledCache.clear();
    _poolCache.clear();
    _safetyPrunedCache.clear();
  }
}

export function libraryStats(deckId: string, used?: ReadonlySet<string>) {
  const indexFile = resolve(deckDir(deckId), "index.json");
  const idx = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, "utf8"))
    : { total: 0, packs: 0, packSize: 300, range: [0, 0] };
  const t = titledItems(deckId);
  const pool = poolItems(deckId); // titled if present, else raw packs
  const usedCount = used && used.size ? pool.filter((it) => used.has(packItemKey(it))).length : 0;
  const byPack = new Map<number, number>();
  for (const it of t) byPack.set(it.pack, (byPack.get(it.pack) ?? 0) + 1);
  const readyPacks = [...byPack.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, titled]) => ({ n, name: `Пак ${n}`, titled }));
  return {
    total: idx.total || pool.length,
    titled: t.length,
    used: usedCount,
    available: Math.max(0, pool.length - usedCount),
    packs: idx.packs,
    range: idx.range,
    readyPacks,
    untitledPacks: Math.max(0, idx.packs - readyPacks.length),
    untitledTotal: Math.max(0, (idx.total || pool.length) - t.length),
  };
}
