// Per-user deck/pack state: used-anecdote tracking (claim/release), hidden & granted deck visibility,
// and per-user / per-key schedule-slot aggregates. No sibling this.-calls here.
import type { DatabaseSync } from "node:sqlite";
import { parseStringArray, type Row } from "./mappers.ts";
import { invalidateReadCache } from "../services/read-cache.ts";

export function deckMethods(db: DatabaseSync) {
  return {
    // Used anecdotes: once an anecdote becomes a saved/auto-posted video, its key lands here
    // so randomAnecdote() never picks it again (per-install state — not shipped content).
    markAnecdoteUsed(userId: number, key: string): void {
      db.prepare(
        "INSERT INTO user_used_anecdotes (user_id, key) VALUES (?, ?) ON CONFLICT(user_id, key) DO NOTHING",
      ).run(userId, key);
      invalidateReadCache();
    },
    // Atomic claim: mark a card used and report whether WE were the one who claimed it (changes>0).
    // Lets concurrent generation paths reserve a card BEFORE the slow render so the same card is
    // never built into two videos. A losing caller (false) re-picks; on render failure → releaseAnecdote.
    claimAnecdote(userId: number, key: string): boolean {
      const info = db
        .prepare(
          "INSERT INTO user_used_anecdotes (user_id, key) VALUES (?, ?) ON CONFLICT(user_id, key) DO NOTHING",
        )
        .run(userId, key);
      if (Number(info.changes) > 0) invalidateReadCache();
      return Number(info.changes) > 0;
    },
    releaseAnecdote(userId: number, key: string): void {
      db.prepare("DELETE FROM user_used_anecdotes WHERE user_id = ? AND key = ?").run(userId, key);
      invalidateReadCache();
    },
    usedAnecdoteKeys(userId: number): Set<string> {
      const rows = db
        .prepare("SELECT key FROM user_used_anecdotes WHERE user_id = ?")
        .all(userId) as Row[];
      return new Set(rows.map((r) => r.key as string));
    },
    usedAnecdoteCount(userId: number): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM user_used_anecdotes WHERE user_id = ?")
        .get(userId) as Row;
      return Number(r.n) || 0;
    },
    clearAnecdoteUsedKeys(userId: number, keys: string[]): number {
      const uniq = [...new Set(keys.map((k) => String(k || "").trim()).filter(Boolean))];
      if (!uniq.length) return 0;
      const del = db.prepare("DELETE FROM user_used_anecdotes WHERE user_id = ? AND key = ?");
      let removed = 0;
      db.exec("BEGIN");
      try {
        for (const key of uniq) removed += Number(del.run(userId, key).changes) || 0;
        db.exec("COMMIT");
        if (removed > 0) invalidateReadCache();
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return removed;
    },
    // ---- Per-user pack (deck) visibility. Rows = HIDDEN decks; NO rows = user sees ALL (default). ----
    hiddenDecksFor(userId: number): string[] {
      return (db.prepare("SELECT deck_id FROM user_hidden_decks WHERE user_id = ?").all(userId) as Row[]).map(
        (r) => r.deck_id as string,
      );
    },
    isDeckHiddenFor(userId: number, deckId: string): boolean {
      return !!db.prepare("SELECT 1 FROM user_hidden_decks WHERE user_id = ? AND deck_id = ?").get(userId, deckId);
    },
    grantedDecksFor(userId: number): string[] {
      return (db.prepare("SELECT deck_id FROM user_granted_decks WHERE user_id = ?").all(userId) as Row[]).map(
        (r) => r.deck_id as string,
      );
    },
    isDeckGrantedFor(userId: number, deckId: string): boolean {
      return !!db.prepare("SELECT 1 FROM user_granted_decks WHERE user_id = ? AND deck_id = ?").get(userId, deckId);
    },
    setGrantedDecks(userId: number, deckIds: string[]): void {
      db.prepare("DELETE FROM user_granted_decks WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT OR IGNORE INTO user_granted_decks (user_id, deck_id) VALUES (?, ?)");
      for (const id of [...new Set(deckIds)]) if (id) ins.run(userId, id);
      invalidateReadCache();
    },
    // Replace the user's hidden-deck set with exactly `deckIds`.
    setHiddenDecks(userId: number, deckIds: string[]): void {
      db.prepare("DELETE FROM user_hidden_decks WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT OR IGNORE INTO user_hidden_decks (user_id, deck_id) VALUES (?, ?)");
      for (const id of [...new Set(deckIds)]) if (id) ins.run(userId, id);
      invalidateReadCache();
    },
    // All hidden decks across users → { userId: [deckId,…] } (for the admin matrix).
    hiddenDecksByUser(): Record<number, string[]> {
      const out: Record<number, string[]> = {};
      for (const r of db.prepare("SELECT user_id, deck_id FROM user_hidden_decks").all() as Row[]) {
        (out[r.user_id as number] ??= []).push(r.deck_id as string);
      }
      return out;
    },
    grantedDecksByUser(): Record<number, string[]> {
      const out: Record<number, string[]> = {};
      for (const r of db.prepare("SELECT user_id, deck_id FROM user_granted_decks").all() as Row[]) {
        (out[r.user_id as number] ??= []).push(r.deck_id as string);
      }
      return out;
    },
    // Decks each user actually USES = languages of their channels + decks of their library videos.
    usedDecksByUser(): Record<number, string[]> {
      const sets: Record<number, Set<string>> = {};
      const add = (u: number, d: string) => {
        if (u == null || !d) return;
        (sets[u] ??= new Set<string>()).add(d);
      };
      for (const r of db.prepare("SELECT user_id, lang, source_decks FROM accounts WHERE user_id IS NOT NULL").all() as Row[]) {
        add(r.user_id as number, r.lang as string);
        for (const d of parseStringArray(r.source_decks, [])) add(r.user_id as number, d);
      }
      for (const r of db
        .prepare(
          "SELECT a.user_id AS uid, v.deck FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.user_id IS NOT NULL",
        )
        .all() as Row[])
        add(r.uid as number, r.deck as string);
      const out: Record<number, string[]> = {};
      for (const k of Object.keys(sets)) out[Number(k)] = [...sets[Number(k)]];
      return out;
    },
    // Total daily schedule slots (= posts/day) across a user's channels, optionally excluding one account.
    // Used for the per-user aggregate schedule cap.
    scheduleSlotsForUser(userId: number, excludeAccountId?: number): number {
      const rows = db.prepare("SELECT id, schedule FROM accounts WHERE user_id = ?").all(userId) as Row[];
      let n = 0;
      for (const r of rows) {
        if (excludeAccountId != null && (r.id as number) === excludeAccountId) continue;
        try {
          n += (JSON.parse((r.schedule as string) || "[]") as unknown[]).length;
        } catch {
          /* malformed schedule → count as 0 */
        }
      }
      return n;
    },
    scheduleSlotsForKey(oauthClientId: number, excludeAccountId?: number): number {
      const rows = db.prepare("SELECT id, schedule FROM accounts WHERE oauth_client_id = ?").all(oauthClientId) as Row[];
      let n = 0;
      for (const r of rows) {
        if (excludeAccountId != null && (r.id as number) === excludeAccountId) continue;
        try {
          n += (JSON.parse((r.schedule as string) || "[]") as unknown[]).length;
        } catch {
          /* malformed schedule → count as 0 */
        }
      }
      return n;
    },
  };
}
