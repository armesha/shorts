import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { DECKS, deckLang, getDeck, type Deck } from "../../src/anecdotes/decks.ts";
import { filterSafetyPrunedItems, packItemKey, withStableItemKeys, type PackItem } from "../../src/anecdotes/library.ts";

type SourceRead = { path: string; body: string };

const deckDir = (deckId: string): string => resolve(process.cwd(), getDeck(deckId).dir);

function readJson<T>(path: string, sources: SourceRead[], fallback: T): T {
  if (!existsSync(path)) return fallback;
  const body = readFileSync(path, "utf8");
  sources.push({ path, body });
  return JSON.parse(body) as T;
}

function sourceHash(deck: Deck, sources: SourceRead[]): string {
  const h = createHash("sha256");
  h.update(
    JSON.stringify({
      id: deck.id,
      name: deck.name,
      lang: deckLang(deck.id),
      preFact: !!deck.preFact,
      quoteVideo: !!deck.quoteVideo,
    }),
  );
  for (const s of sources.sort((a, b) => a.path.localeCompare(b.path))) {
    h.update("\0");
    h.update(s.path);
    h.update("\0");
    h.update(s.body);
  }
  return h.digest("hex");
}

function loadDeckItems(deck: Deck): { items: PackItem[]; hash: string } {
  const dir = deckDir(deck.id);
  const sources: SourceRead[] = [];
  let items: PackItem[] = [];

  if (deck.preFact) {
    const rows = readJson<{ file: string; title?: string; text?: string }[]>(resolve(dir, "videos.json"), sources, []);
    items = withStableItemKeys(rows.map((c, i) => ({
      id: i,
      pack: 1,
      text: c.text ?? "",
      chars: (c.text ?? "").length,
      title: c.title ?? "",
      videoFile: c.file,
    })));
  } else if (deck.psych) {
    const cards = readJson<{ title_lines?: string[] }[]>(resolve(dir, "cards.json"), sources, []);
    items = cards.map((c, i) => {
      const title = (c.title_lines ?? []).join(" ").trim();
      return { id: i, pack: 1, text: JSON.stringify(c), chars: title.length, title };
    });
  } else if (deck.islamic) {
    const cards = readJson<{ arabic?: string; ref?: string }[]>(resolve(dir, "cards.json"), sources, []);
    items = cards.map((c, i) => ({
      id: i,
      pack: 1,
      text: JSON.stringify(c),
      chars: (c.arabic ?? "").length,
      title: c.ref ?? "",
    }));
  } else if (deck.christian) {
    const cards = readJson<{ text?: string; ref?: string }[]>(resolve(dir, "cards.json"), sources, []);
    items = cards.map((c, i) => ({
      id: i,
      pack: 1,
      text: JSON.stringify(c),
      chars: (c.text ?? "").length,
      title: c.ref ?? "",
    }));
  } else if (deck.meme) {
    const cards = readJson<{ caption?: string }[]>(resolve(dir, "cards.json"), sources, []);
    items = cards.map((c, i) => {
      const cap = (c.caption ?? "").trim();
      return {
        id: i,
        pack: 1,
        text: JSON.stringify(c),
        chars: cap.length,
        title: (cap.split(/\r?\n/)[0] || "").slice(0, 40),
      };
    });
  } else {
    const titled = resolve(dir, "titled.json");
    if (existsSync(titled)) {
      items = readJson<PackItem[]>(titled, sources, []);
    } else if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((x) => x.startsWith("pack-") && x.endsWith(".json")).sort()) {
        items.push(...readJson<PackItem[]>(resolve(dir, f), sources, []));
      }
    }
  }

  return { items: filterSafetyPrunedItems(deck.id, items), hash: sourceHash(deck, sources) };
}

export function syncContentLibraryIndex(db: DatabaseSync): { decks: number; items: number } {
  const now = new Date().toISOString();
  const deckStmt = db.prepare(
    "INSERT INTO content_decks (deck_id, name, kind, lang, pre_fact, long_video, total, source_hash, synced_at) " +
      "VALUES (?, ?, 'builtin', ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(deck_id) DO UPDATE SET name=excluded.name, lang=excluded.lang, pre_fact=excluded.pre_fact, " +
      "long_video=excluded.long_video, total=excluded.total, source_hash=excluded.source_hash, synced_at=excluded.synced_at",
  );
  const itemStmt = db.prepare(
    "INSERT INTO content_items (deck_id, item_index, item_key, pack_no, title, text, chars, video_file, payload_json, synced_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const delItems = db.prepare("DELETE FROM content_items WHERE deck_id = ?");
  const seen = new Set<string>();
  let itemCount = 0;

  db.exec("BEGIN");
  try {
    for (const deck of DECKS) {
      const { items, hash } = loadDeckItems(deck);
      seen.add(deck.id);
      delItems.run(deck.id);
      deckStmt.run(deck.id, deck.name, deckLang(deck.id) || null, deck.preFact ? 1 : 0, 0, items.length, hash, now);
      items.forEach((item, index) => {
        const normalized: PackItem = {
          ...item,
          id: Number(item.id ?? index),
          pack: Number(item.pack ?? 1),
          text: String(item.text ?? ""),
          chars: Number(item.chars ?? String(item.text ?? "").length) || 0,
          title: String(item.title ?? ""),
          profession: item.profession,
          videoFile: item.videoFile,
        };
        itemStmt.run(
          deck.id,
          index,
          packItemKey(normalized),
          normalized.pack,
          normalized.title,
          normalized.text,
          normalized.chars,
          normalized.videoFile ?? null,
          JSON.stringify(normalized),
          now,
        );
        itemCount++;
      });
    }
    const delDeck = db.prepare("DELETE FROM content_decks WHERE deck_id = ?");
    for (const row of db.prepare("SELECT deck_id FROM content_decks WHERE kind = 'builtin'").all() as { deck_id: string }[]) {
      if (!seen.has(row.deck_id)) {
        delItems.run(row.deck_id);
        delDeck.run(row.deck_id);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { decks: seen.size, items: itemCount };
}
