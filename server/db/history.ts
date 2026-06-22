// Upload-history data-access methods (the per-channel published/failed log + per-key quota counting).
import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./mappers.ts";
import type { HistoryItem } from "./types.ts";

export function historyMethods(db: DatabaseSync) {
  return {
    addHistory(h: {
      accountId: number;
      title: string;
      status: string;
      youtubeId?: string | null;
      videoPath?: string | null;
      publishedAt?: string | null;
      error?: string | null;
      deck?: string | null;
    }): void {
      db.prepare(
        "INSERT INTO history (account_id, title, status, youtube_id, video_path, published_at, error, deck) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        h.accountId,
        h.title,
        h.status,
        h.youtubeId ?? null,
        h.videoPath ?? null,
        h.publishedAt ?? null,
        h.error ?? null,
        h.deck ?? null,
      );
    },
    listHistory(): HistoryItem[] {
      return (db.prepare("SELECT * FROM history ORDER BY id DESC LIMIT 100").all() as Row[]).map(
        (r) => ({
          id: r.id,
          accountId: r.account_id,
          title: r.title,
          status: r.status,
          publishedAt: r.published_at,
          createdAt: r.created_at,
          error: r.error ?? null,
        }),
      );
    },
    // History scoped to one user's channels only (join on accounts.user_id).
    listHistoryByUser(userId: number): HistoryItem[] {
      return (
        db
          .prepare(
            "SELECT h.* FROM history h JOIN accounts a ON a.id = h.account_id WHERE a.user_id = ? ORDER BY h.id DESC LIMIT 100",
          )
          .all(userId) as Row[]
      ).map((r) => ({
        id: r.id,
        accountId: r.account_id,
        title: r.title,
        status: r.status,
        publishedAt: r.published_at,
        createdAt: r.created_at,
        error: r.error ?? null,
      }));
    },
    // Enriched + filterable history for the admin "all users" view (and the own view).
    // ownerId/accountId narrow the rows; neither → all channels. Newest first; paginate via limit/offset.
    listHistoryFiltered(
      opts: { ownerId?: number; accountId?: number; onlyErrors?: boolean; limit?: number; offset?: number } = {},
    ): HistoryItem[] {
      const where: string[] = [];
      const args: unknown[] = [];
      if (opts.accountId != null) {
        where.push("h.account_id = ?");
        args.push(opts.accountId);
      } else if (opts.ownerId != null) {
        where.push("a.user_id = ?");
        args.push(opts.ownerId);
      }
      // «Только с ошибками»: ролики, которые в итоге не выложились (status=failed либо записан error).
      if (opts.onlyErrors) where.push("(h.status = 'failed' OR h.error IS NOT NULL)");
      const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
      const offset = Math.max(0, opts.offset ?? 0);
      const sql =
        "SELECT h.*, a.channel_name, a.yt_channel_title, a.user_id AS owner_id, u.username AS owner_username " +
        "FROM history h JOIN accounts a ON a.id = h.account_id LEFT JOIN users u ON u.id = a.user_id " +
        (where.length ? "WHERE " + where.join(" AND ") + " " : "") +
        "ORDER BY h.id DESC LIMIT ? OFFSET ?";
      return (db.prepare(sql).all(...(args as (string | number)[]), limit, offset) as Row[]).map((r) => ({
        id: r.id,
        accountId: r.account_id,
        title: r.title,
        status: r.status,
        publishedAt: r.published_at,
        createdAt: r.created_at,
        error: r.error ?? null,
        channelName: r.yt_channel_title || r.channel_name,
        ownerUsername: r.owner_username ?? null,
        youtubeId: r.youtube_id ?? null,
        videoRel: r.video_path ?? null,
      }));
    },
    // Row count for the same filter (pagination total).
    countHistoryFiltered(opts: { ownerId?: number; accountId?: number; onlyErrors?: boolean } = {}): number {
      const where: string[] = [];
      const args: unknown[] = [];
      if (opts.accountId != null) {
        where.push("h.account_id = ?");
        args.push(opts.accountId);
      } else if (opts.ownerId != null) {
        where.push("a.user_id = ?");
        args.push(opts.ownerId);
      }
      if (opts.onlyErrors) where.push("(h.status = 'failed' OR h.error IS NOT NULL)");
      const sql =
        "SELECT COUNT(*) AS n FROM history h JOIN accounts a ON a.id = h.account_id " +
        (where.length ? "WHERE " + where.join(" AND ") + " " : "");
      return (db.prepare(sql).get(...(args as (string | number)[])) as { n: number }).n;
    },
    // Total daily schedule slots across channels bound to ONE Google key (oauth_client) — per-key cap.
    // YouTube upload quota is per Cloud project (~100/day; we hold 92), shared by all channels on that key.
    // Actual upload OPERATIONS today on one Google key (Cloud project), across all its channels.
    // Counted by created_at (when the upload ran) so scheduled-future publishes still count toward
    // the per-key daily quota. Used to stop post-now / the scheduler from blowing the YouTube quota.
    uploadsTodayForKey(oauthClientId: number): number {
      const r = db
        .prepare(
          `SELECT COUNT(*) AS n FROM history h JOIN accounts a ON a.id = h.account_id
            WHERE a.oauth_client_id = ? AND h.status IN ('published','scheduled')
              AND date(h.created_at) = date('now')`,
        )
        .get(oauthClientId) as Row;
      return Number(r.n) || 0;
    },
    // Posted (uploaded to YouTube) count per user per deck — by the deck each post was ACTUALLY
    // published with (history.deck); old rows predating that column fall back to the channel's lang.
    postedByUserDeck(): Record<number, Record<string, number>> {
      const out: Record<number, Record<string, number>> = {};
      const rows = db
        .prepare(
          "SELECT a.user_id AS uid, COALESCE(h.deck, a.lang) AS deck, COUNT(*) AS n FROM history h JOIN accounts a ON a.id = h.account_id " +
            "WHERE a.user_id IS NOT NULL AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' GROUP BY a.user_id, COALESCE(h.deck, a.lang)",
        )
        .all() as Row[];
      for (const r of rows) {
        const uid = r.uid as number;
        (out[uid] ??= {})[r.deck as string] = r.n as number;
      }
      return out;
    },
  };
}
