// Channel (account) data-access methods. Object-literal method shorthand ONLY (never arrows) so
// sibling `this.` calls (createAccount→this.getAccount, updateAccount→this.getAccount) resolve on the
// merged store. `countUploadsToday` is a private factory-local helper, not part of the public surface.
import type { DatabaseSync } from "node:sqlite";
import { rowToAccount, type Row } from "./mappers.ts";
import { DEFAULT_CHANNEL_NAME, type Account } from "./types.ts";
import { invalidateReadCache } from "../services/read-cache.ts";
import { normalizeTimeZone } from "../services/timezone.ts";

export function accountMethods(db: DatabaseSync) {
  // "Uploaded today" per channel — count of published history rows dated today (UTC).
  const countUploadsToday = (accountId: number): number => {
    const r = db
      .prepare(
        "SELECT COUNT(*) AS n FROM history WHERE account_id = ? AND status = 'published' AND published_at >= date('now') AND published_at < date('now','+1 day')",
      )
      .get(accountId) as Row;
    return Number(r.n) || 0;
  };

  const accountsWithUploadsToday = (where = "", args: (string | number)[] = []): Account[] =>
    (
      db
        .prepare(
          `SELECT a.*, COALESCE(today.uploads_today, 0) AS uploads_today
                  , u.username AS owner_username, u.role AS owner_role, u.is_super_admin AS owner_is_super_admin
             FROM accounts a
             LEFT JOIN users u ON u.id = a.user_id
             LEFT JOIN (
               SELECT account_id, COUNT(*) AS uploads_today
                 FROM history
                WHERE status = 'published'
                  AND published_at >= date('now')
                  AND published_at < date('now','+1 day')
                GROUP BY account_id
             ) today ON today.account_id = a.id
             ${where}
            ORDER BY a.id`,
        )
        .all(...args) as Row[]
    ).map((row) => ({ ...rowToAccount(row), uploadsToday: Number(row.uploads_today) || 0 }));

  return {
    listAccounts(): Account[] {
      return accountsWithUploadsToday();
    },
    listAccountsByUser(userId: number): Account[] {
      return accountsWithUploadsToday("WHERE a.user_id = ?", [userId]);
    },
    // One-time migration: existing channels (no owner) become the first admin's.
    assignOrphanAccounts(userId: number): void {
      db.prepare("UPDATE accounts SET user_id = ? WHERE user_id IS NULL").run(userId);
    },
    getAccount(id: number): Account | null {
      const r = db
        .prepare(
          `SELECT a.*, u.username AS owner_username, u.role AS owner_role, u.is_super_admin AS owner_is_super_admin
             FROM accounts a
             LEFT JOIN users u ON u.id = a.user_id
            WHERE a.id = ?`,
        )
        .get(id) as Row | undefined;
      if (!r) return null;
      return { ...rowToAccount(r), uploadsToday: countUploadsToday(r.id) };
    },
    createAccount(input: Partial<Account>): Account {
      const avatarSource = input.avatarSource ?? "youtube";
      const info = db
        .prepare(
          "INSERT INTO accounts (user_id, channel_name, lang, source_decks, long_video_decks, channel_lang, timezone, schedule, template, status, avatar, avatar_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          input.userId ?? null,
          input.channelName ?? DEFAULT_CHANNEL_NAME,
          input.lang ?? "de",
          JSON.stringify(input.sourceDecks?.length ? input.sourceDecks : [input.lang ?? "de"]),
          JSON.stringify(input.longVideoDecks ?? []),
          input.channelLang ?? input.lang ?? "de",
          normalizeTimeZone(input.timezone),
          JSON.stringify(input.schedule ?? ["12:00"]),
          input.template ?? "1 · Kraft Paper",
          input.status ?? "needs_auth",
          input.avatar ?? null,
          avatarSource,
        );
      invalidateReadCache();
      return this.getAccount(Number(info.lastInsertRowid))!;
    },
    updateAccount(id: number, input: Partial<Account>): Account | null {
      const cur = this.getAccount(id);
      if (!cur) return null;
      const hasAvatar = Object.prototype.hasOwnProperty.call(input, "avatar");
      const hasTimezone = Object.prototype.hasOwnProperty.call(input, "timezone");
      db.prepare(
        "UPDATE accounts SET channel_name=?, lang=?, source_decks=?, long_video_decks=?, channel_lang=?, timezone=?, schedule=?, template=?, enabled=?, slot_videos=?, slot_decks=?, avatar=?, avatar_source=? WHERE id=?",
      ).run(
        input.channelName ?? cur.channelName,
        input.lang ?? cur.lang,
        JSON.stringify(input.sourceDecks ?? cur.sourceDecks),
        JSON.stringify(input.longVideoDecks ?? cur.longVideoDecks),
        input.channelLang ?? cur.channelLang,
        hasTimezone ? normalizeTimeZone(input.timezone) : cur.timezone,
        JSON.stringify(input.schedule ?? cur.schedule),
        input.template ?? cur.template,
        (input.enabled ?? cur.enabled) ? 1 : 0,
        JSON.stringify(input.slotVideos ?? cur.slotVideos),
        JSON.stringify(input.slotDecks ?? cur.slotDecks),
        input.avatar ?? cur.avatar,
        hasAvatar ? (input.avatarSource ?? "manual") : cur.avatarSource,
        id,
      );
      invalidateReadCache();
      return this.getAccount(id);
    },
    deleteAccount(id: number): void {
      db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
      invalidateReadCache();
    },
    setYouTube(
      id: number,
      d: { refreshToken: string | null; channelId: string | null; channelTitle: string | null; channelAvatar?: string | null },
    ): void {
      db.prepare(
        `UPDATE accounts
         SET yt_refresh_token=?,
             yt_channel_id=?,
             yt_channel_title=?,
             channel_name=CASE
               WHEN ? IS NOT NULL AND TRIM(?) != '' THEN ?
               ELSE channel_name
             END,
             yt_channel_avatar=COALESCE(?, yt_channel_avatar),
             avatar=COALESCE(?, avatar),
             avatar_source=CASE WHEN ? IS NOT NULL THEN 'youtube' ELSE avatar_source END,
             auth_error=NULL,
             auth_failed_at=NULL
         WHERE id=?`,
      ).run(
        d.refreshToken,
        d.channelId,
        d.channelTitle,
        // YouTube title is the source of truth for connected channels.
        d.channelTitle,
        d.channelTitle,
        d.channelTitle,
        d.channelAvatar ?? null,
        d.channelAvatar ?? null,
        d.channelAvatar ?? null,
        id,
      );
    },
    getRefreshToken(id: number): string | null {
      const r = db.prepare("SELECT yt_refresh_token FROM accounts WHERE id = ?").get(id) as Row | undefined;
      return (r?.yt_refresh_token as string) ?? null;
    },
    /**
     * Flag a channel as having a dead/rejected token (YouTube returned a definitive auth error on
     * upload). Surfaced as "needs reconnect" on /channels. Keeps the FIRST failure time so the UI can
     * show "disconnected since …", but always refreshes the human reason to the latest one.
     * Returns TRUE only on the healthy→broken EDGE (the channel was clean before this call) so callers
     * can alert the owner exactly once per disconnect episode (in-app + Telegram), never on every retry.
     */
    markAuthError(id: number, reason: string, at: string): boolean {
      const before = db.prepare("SELECT auth_error FROM accounts WHERE id = ?").get(id) as Row | undefined;
      if (!before) return false; // no such channel → nothing to flag/notify
      const wasHealthy = before.auth_error == null;
      db.prepare(
        `UPDATE accounts
            SET auth_error = ?,
                auth_failed_at = COALESCE(auth_failed_at, ?)
          WHERE id = ?`,
      ).run(reason.slice(0, 300), at, id);
      return wasHealthy;
    },
    /** Clear the auth-error flag (token works again / channel reconnected). No-op if already clean. */
    clearAuthError(id: number): void {
      db.prepare(
        "UPDATE accounts SET auth_error = NULL, auth_failed_at = NULL WHERE id = ? AND auth_error IS NOT NULL",
      ).run(id);
    },
  };
}
