// Per-user analytics for the Statistics page: same idea as admin analytics but HARD-scoped to the
// requesting user's own channels (account_id IN <their accounts>). Self-contained — does NOT touch
// buildAdminAnalytics, so the admin dashboard is unaffected. Read-only, uses stored snapshots.
import type { Db } from "./db.ts";
import { normalizeAnalyticsRange, type AnalyticsRange } from "./admin-analytics.ts";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);

export interface UserAnalytics {
  range: { from: string; to: string };
  summary: {
    published: number;
    scheduled: number;
    failed: number;
    queuedVideos: number;
    channels: number;
    connected: number;
    subscribers: number;
    views: number;
    youtubeVideos: number;
    subscriberDelta: number;
    viewsDelta: number;
  };
  daily: { date: string; published: number; scheduled: number; failed: number }[];
}

export function buildUserAnalytics(dbh: Db, userId: number, input: AnalyticsRange): UserAnalytics {
  const range = normalizeAnalyticsRange(input);
  const sql = dbh.db;
  const ids = (sql.prepare("SELECT id FROM accounts WHERE user_id = ?").all(userId) as Row[]).map((r) => num(r.id));

  const blank: UserAnalytics = {
    range,
    summary: { published: 0, scheduled: 0, failed: 0, queuedVideos: 0, channels: ids.length, connected: 0, subscribers: 0, views: 0, youtubeVideos: 0, subscriberDelta: 0, viewsDelta: 0 },
    daily: [],
  };
  if (ids.length === 0) return blank;

  const ph = ids.map(() => "?").join(",");
  const dateExpr = "date(COALESCE(h.published_at, h.created_at))";
  const pub = "h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> ''";

  const hsum = sql
    .prepare(
      `SELECT SUM(CASE WHEN ${pub} THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN h.status='scheduled' THEN 1 ELSE 0 END) AS scheduled,
              SUM(CASE WHEN h.status='failed' THEN 1 ELSE 0 END) AS failed
       FROM history h WHERE h.account_id IN (${ph}) AND ${dateExpr} BETWEEN ? AND ?`,
    )
    .get(...ids, range.from, range.to) as Row;

  const daily = (
    sql
      .prepare(
        `SELECT ${dateExpr} AS date,
                SUM(CASE WHEN ${pub} THEN 1 ELSE 0 END) AS published,
                SUM(CASE WHEN h.status='scheduled' THEN 1 ELSE 0 END) AS scheduled,
                SUM(CASE WHEN h.status='failed' THEN 1 ELSE 0 END) AS failed
         FROM history h WHERE h.account_id IN (${ph}) AND ${dateExpr} BETWEEN ? AND ?
         GROUP BY date ORDER BY date`,
      )
      .all(...ids, range.from, range.to) as Row[]
  ).map((r) => ({ date: String(r.date), published: num(r.published), scheduled: num(r.scheduled), failed: num(r.failed) }));

  const latest = sql
    .prepare(
      `WITH l AS (SELECT account_id, MAX(id) AS id FROM channel_stats WHERE account_id IN (${ph}) GROUP BY account_id)
       SELECT SUM(cs.subscribers) AS subscribers, SUM(cs.views) AS views, SUM(cs.videos) AS videos
       FROM l JOIN channel_stats cs ON cs.id = l.id`,
    )
    .get(...ids) as Row;

  const growth = sql
    .prepare(
      `WITH fi AS (SELECT account_id, MIN(id) AS id FROM channel_stats WHERE account_id IN (${ph}) AND date(taken_at) BETWEEN ? AND ? GROUP BY account_id),
            li AS (SELECT account_id, MAX(id) AS id FROM channel_stats WHERE account_id IN (${ph}) AND date(taken_at) BETWEEN ? AND ? GROUP BY account_id)
       SELECT SUM(lcs.subscribers - fcs.subscribers) AS subDelta, SUM(lcs.views - fcs.views) AS viewsDelta
       FROM fi JOIN li ON li.account_id = fi.account_id
       JOIN channel_stats fcs ON fcs.id = fi.id JOIN channel_stats lcs ON lcs.id = li.id`,
    )
    .get(...ids, range.from, range.to, ...ids, range.from, range.to) as Row;

  const queued = num((sql.prepare(`SELECT COUNT(*) AS n FROM videos WHERE account_id IN (${ph})`).get(...ids) as Row).n);
  const connected = num(
    (sql.prepare("SELECT COUNT(*) AS n FROM accounts WHERE user_id = ? AND yt_refresh_token IS NOT NULL AND yt_refresh_token <> ''").get(userId) as Row).n,
  );

  return {
    range,
    summary: {
      published: num(hsum.published),
      scheduled: num(hsum.scheduled),
      failed: num(hsum.failed),
      queuedVideos: queued,
      channels: ids.length,
      connected,
      subscribers: num(latest?.subscribers),
      views: num(latest?.views),
      youtubeVideos: num(latest?.videos),
      subscriberDelta: num(growth?.subDelta),
      viewsDelta: num(growth?.viewsDelta),
    },
    daily,
  };
}
