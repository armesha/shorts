// Channel statistics: YouTube total snapshots over time, daily analytics rows, the report cache, and
// the platform-wide production summary shown to every user. No sibling this.-calls here.
import type { DatabaseSync } from "node:sqlite";
import { rowToSnapshot, rowToDailyAnalytics, rowToReportCache, type Row } from "./mappers.ts";
import type { ChannelSnapshot, ChannelDailyAnalytics, YoutubeReportCache } from "./types.ts";

export function statsMethods(db: DatabaseSync) {
  return {
    // ---- Channel stats snapshots (YouTube totals over time) ----
    // Append a fresh snapshot; returns the stored row (with id + taken_at).
    addChannelSnapshot(s: {
      accountId: number;
      subscribers: number;
      views: number;
      videos: number;
      analyticsStatus?: string | null;
      analyticsError?: string | null;
      dataThrough?: string | null;
      watchMinutes?: number;
      engagedViews?: number;
      avgViewDuration?: number;
      avgViewPercentage?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      subscribersGained?: number;
      subscribersLost?: number;
      analyticsTakenAt?: string | null;
    }): ChannelSnapshot {
      const info = db
        .prepare(
          `INSERT INTO channel_stats
            (account_id, subscribers, views, videos, analytics_status, analytics_error, data_through,
             watch_minutes, engaged_views, avg_view_duration, avg_view_percentage, likes, comments, shares,
             subscribers_gained, subscribers_lost, analytics_taken_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          s.accountId,
          s.subscribers,
          s.views,
          s.videos,
          s.analyticsStatus ?? null,
          s.analyticsError ?? null,
          s.dataThrough ?? null,
          s.watchMinutes ?? 0,
          s.engagedViews ?? 0,
          s.avgViewDuration ?? 0,
          s.avgViewPercentage ?? 0,
          s.likes ?? 0,
          s.comments ?? 0,
          s.shares ?? 0,
          s.subscribersGained ?? 0,
          s.subscribersLost ?? 0,
          s.analyticsTakenAt ?? null,
        );
      const r = db
        .prepare("SELECT * FROM channel_stats WHERE id = ?")
        .get(Number(info.lastInsertRowid)) as Row;
      return rowToSnapshot(r);
    },
    latestSnapshot(accountId: number): ChannelSnapshot | null {
      const r = db
        .prepare("SELECT * FROM channel_stats WHERE account_id = ? ORDER BY id DESC LIMIT 1")
        .get(accountId) as Row | undefined;
      return r ? rowToSnapshot(r) : null;
    },
    // Two most recent snapshots → latest + previous, for the +/- delta on the card.
    twoLatestSnapshots(accountId: number): {
      latest: ChannelSnapshot | null;
      prev: ChannelSnapshot | null;
    } {
      const rows = db
        .prepare("SELECT * FROM channel_stats WHERE account_id = ? ORDER BY id DESC LIMIT 2")
        .all(accountId) as Row[];
      return {
        latest: rows[0] ? rowToSnapshot(rows[0]) : null,
        prev: rows[1] ? rowToSnapshot(rows[1]) : null,
      };
    },
    // Snapshots in chronological order (oldest→newest), capped, for the chart.
    listChannelSnapshots(accountId: number, limit = 200): ChannelSnapshot[] {
      const rows = db
        .prepare(
          "SELECT * FROM (SELECT * FROM channel_stats WHERE account_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC",
        )
        .all(accountId, limit) as Row[];
      return rows.map(rowToSnapshot);
    },
    upsertDailyAnalytics(rows: ChannelDailyAnalytics[]): void {
      if (!rows.length) return;
      const stmt = db.prepare(
        `INSERT INTO channel_analytics_daily
          (account_id, date, views, engaged_views, watch_minutes, avg_view_duration, avg_view_percentage,
           likes, dislikes, comments, shares, subscribers_gained, subscribers_lost, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
         ON CONFLICT(account_id, date) DO UPDATE SET
           views=excluded.views,
           engaged_views=excluded.engaged_views,
           watch_minutes=excluded.watch_minutes,
           avg_view_duration=excluded.avg_view_duration,
           avg_view_percentage=excluded.avg_view_percentage,
           likes=excluded.likes,
           dislikes=excluded.dislikes,
           comments=excluded.comments,
           shares=excluded.shares,
           subscribers_gained=excluded.subscribers_gained,
           subscribers_lost=excluded.subscribers_lost,
           updated_at=datetime('now')`,
      );
      for (const r of rows) {
        stmt.run(
          r.accountId,
          r.date,
          r.views,
          r.engagedViews,
          r.watchMinutes,
          r.avgViewDuration,
          r.avgViewPercentage,
          r.likes,
          r.dislikes,
          r.comments,
          r.shares,
          r.subscribersGained,
          r.subscribersLost,
        );
      }
    },
    listDailyAnalytics(accountIds: number[], from: string, to: string): ChannelDailyAnalytics[] {
      const ids = [...new Set(accountIds.filter((id) => Number.isFinite(id)))];
      if (!ids.length) return [];
      const ph = ids.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT * FROM channel_analytics_daily
           WHERE account_id IN (${ph}) AND date BETWEEN ? AND ?
           ORDER BY date, account_id`,
        )
        .all(...ids, from, to) as Row[];
      return rows.map(rowToDailyAnalytics);
    },
    latestDailyAnalyticsDate(accountId: number): string | null {
      const r = db
        .prepare("SELECT MAX(date) AS date FROM channel_analytics_daily WHERE account_id = ?")
        .get(accountId) as Row | undefined;
      return r?.date ? String(r.date) : null;
    },
    setReportCache(accountId: number, reportKey: string, rangeFrom: string, rangeTo: string, payload: unknown): void {
      db.prepare(
        `INSERT INTO youtube_report_cache (account_id, report_key, range_from, range_to, payload_json, taken_at)
         VALUES (?,?,?,?,?,datetime('now'))
         ON CONFLICT(account_id, report_key, range_from, range_to) DO UPDATE SET
           payload_json=excluded.payload_json,
           taken_at=datetime('now')`,
      ).run(accountId, reportKey, rangeFrom, rangeTo, JSON.stringify(payload ?? null));
    },
    getReportCache(accountId: number, reportKey: string, rangeFrom: string, rangeTo: string): YoutubeReportCache | null {
      const r = db
        .prepare(
          `SELECT * FROM youtube_report_cache
           WHERE account_id = ? AND report_key = ? AND range_from = ? AND range_to = ?`,
        )
        .get(accountId, reportKey, rangeFrom, rangeTo) as Row | undefined;
      return r ? rowToReportCache(r) : null;
    },
    latestReportCache(accountId: number, reportKey: string): YoutubeReportCache | null {
      const r = db
        .prepare(
          `SELECT * FROM youtube_report_cache
           WHERE account_id = ? AND report_key = ?
           ORDER BY taken_at DESC LIMIT 1`,
        )
        .get(accountId, reportKey) as Row | undefined;
      return r ? rowToReportCache(r) : null;
    },
    // Platform-wide production totals (no per-user / PII) — shown to EVERY user on /statistics.
    platformSummary(): {
      queued: number;
      published: number;
      scheduled: number;
      failed: number;
      channels: number;
      channelsConnected: number;
      users: number;
    } {
      const v = db.prepare("SELECT COUNT(*) AS n FROM videos").get() as Row;
      const h = db
        .prepare(
          `SELECT
            SUM(CASE WHEN status='published' AND youtube_id IS NOT NULL AND youtube_id <> '' THEN 1 ELSE 0 END) AS published,
            SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) AS scheduled,
            SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
           FROM history`,
        )
        .get() as Row;
      const a = db
        .prepare(
          `SELECT COUNT(*) AS total,
            SUM(CASE WHEN yt_refresh_token IS NOT NULL AND yt_refresh_token <> '' THEN 1 ELSE 0 END) AS connected
           FROM accounts`,
        )
        .get() as Row;
      const u = db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row;
      return {
        queued: Number(v.n) || 0,
        published: Number(h.published) || 0,
        scheduled: Number(h.scheduled) || 0,
        failed: Number(h.failed) || 0,
        channels: Number(a.total) || 0,
        channelsConnected: Number(a.connected) || 0,
        users: Number(u.n) || 0,
      };
    },
  };
}
