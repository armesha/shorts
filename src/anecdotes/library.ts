import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getDeck } from "./decks.ts";

export interface PackItem {
  id: number;
  pack: number;
  text: string;
  chars: number;
  title: string;
}

const deckDir = (deckId: string): string => resolve(process.cwd(), getDeck(deckId).dir);

// titled.json per deck = the pool of READY (titled) anecdotes — the only ones generation may use.
const _titledCache = new Map<string, PackItem[]>();
function titledItems(deckId: string): PackItem[] {
  const hit = _titledCache.get(deckId);
  if (hit) return hit;
  const titled = resolve(deckDir(deckId), "titled.json");
  const items = existsSync(titled) ? (JSON.parse(readFileSync(titled, "utf8")) as PackItem[]) : [];
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

/**
 * Pick a random READY anecdote (titled) from a deck, skipping any whose key is in `used`.
 * Falls back to a raw pack before titling exists. Returns null when nothing is left.
 */
export function randomAnecdote(deckId: string, used?: ReadonlySet<string>): PackItem | null {
  const skip = used && used.size ? used : null;
  const t = titledItems(deckId);
  if (t.length > 0) {
    const pool = skip ? t.filter((it) => !skip.has(anecdoteKey(it.text))) : t;
    if (pool.length === 0) return null; // every titled anecdote already used
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // Fallback so generation still works before any pack is titled.
  const dir = deckDir(deckId);
  if (!existsSync(dir)) return null;
  const packs = readdirSync(dir).filter((f) => f.startsWith("pack-") && f.endsWith(".json")).sort();
  if (packs.length === 0) return null;
  const file = packs[Math.floor(Math.random() * packs.length)];
  let items = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as PackItem[];
  if (skip) items = items.filter((it) => !skip.has(anecdoteKey(it.text)));
  return items[Math.floor(Math.random() * items.length)] ?? null;
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
  _poolCache.set(deckId, all);
  return all;
}

export function libraryStats(deckId: string, used?: ReadonlySet<string>) {
  const indexFile = resolve(deckDir(deckId), "index.json");
  const idx = existsSync(indexFile)
    ? JSON.parse(readFileSync(indexFile, "utf8"))
    : { total: 0, packs: 0, packSize: 300, range: [0, 0] };
  const t = titledItems(deckId);
  const pool = poolItems(deckId); // titled if present, else raw packs
  const usedCount = used && used.size ? pool.filter((it) => used.has(anecdoteKey(it.text))).length : 0;
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
