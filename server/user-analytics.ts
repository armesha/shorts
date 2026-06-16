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
    watchMinutes: number;
    engagedViews: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    likes: number;
    comments: number;
    shares: number;
    subscribersGained: number;
    subscribersLost: number;
    dataThrough: string | null;
  };
  daily: { date: string; published: number; scheduled: number; failed: number }[];
  youtubeDaily: {
    date: string;
    views: number;
    engagedViews: number;
    watchMinutes: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    subscribersGained: number;
    subscribersLost: number;
  }[];
}

export function buildUserAnalytics(dbh: Db, userId: number, input: AnalyticsRange): UserAnalytics {
  const range = normalizeAnalyticsRange(input);
  const sql = dbh.db;
  const ids = (sql.prepare("SELECT id FROM accounts WHERE user_id = ?").all(userId) as Row[]).map((r) => num(r.id));

  const blank: UserAnalytics = {
    range,
    summary: {
      published: 0,
      scheduled: 0,
      failed: 0,
      queuedVideos: 0,
      channels: ids.length,
      connected: 0,
      subscribers: 0,
      views: 0,
      youtubeVideos: 0,
      subscriberDelta: 0,
      viewsDelta: 0,
      watchMinutes: 0,
      engagedViews: 0,
      avgViewDuration: 0,
      avgViewPercentage: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      dataThrough: null,
    },
    daily: [],
    youtubeDaily: [],
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

  const ytRows = sql
    .prepare(
      `SELECT date,
              SUM(views) AS views,
              SUM(engaged_views) AS engagedViews,
              SUM(watch_minutes) AS watchMinutes,
              SUM(avg_view_duration * views) AS durationWeighted,
              SUM(avg_view_percentage * views) AS percentageWeighted,
              SUM(likes) AS likes,
              SUM(comments) AS comments,
              SUM(shares) AS shares,
              SUM(subscribers_gained) AS subscribersGained,
              SUM(subscribers_lost) AS subscribersLost
       FROM channel_analytics_daily
       WHERE account_id IN (${ph}) AND date BETWEEN ? AND ?
       GROUP BY date ORDER BY date`,
    )
    .all(...ids, range.from, range.to) as Row[];
  const youtubeDaily = ytRows.map((r) => {
    const views = num(r.views);
    return {
      date: String(r.date),
      views,
      engagedViews: num(r.engagedViews),
      watchMinutes: num(r.watchMinutes),
      avgViewDuration: views > 0 ? num(r.durationWeighted) / views : 0,
      avgViewPercentage: views > 0 ? num(r.percentageWeighted) / views : 0,
      subscribersGained: num(r.subscribersGained),
      subscribersLost: num(r.subscribersLost),
    };
  });
  const ytSummary = (
    sql
      .prepare(
        `SELECT
          SUM(views) AS views,
          SUM(engaged_views) AS engagedViews,
          SUM(watch_minutes) AS watchMinutes,
          SUM(avg_view_duration * views) AS durationWeighted,
          SUM(avg_view_percentage * views) AS percentageWeighted,
          SUM(likes) AS likes,
          SUM(comments) AS comments,
          SUM(shares) AS shares,
          SUM(subscribers_gained) AS subscribersGained,
          SUM(subscribers_lost) AS subscribersLost,
          MAX(date) AS dataThrough
         FROM channel_analytics_daily
         WHERE account_id IN (${ph}) AND date BETWEEN ? AND ?`,
      )
      .get(...ids, range.from, range.to) as Row
  );
  const ytViews = num(ytSummary.views);

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
      views: ytViews || num(latest?.views),
      youtubeVideos: num(latest?.videos),
      subscriberDelta: num(growth?.subDelta),
      viewsDelta: ytViews || num(growth?.viewsDelta),
      watchMinutes: num(ytSummary.watchMinutes),
      engagedViews: num(ytSummary.engagedViews),
      avgViewDuration: ytViews > 0 ? num(ytSummary.durationWeighted) / ytViews : 0,
      avgViewPercentage: ytViews > 0 ? num(ytSummary.percentageWeighted) / ytViews : 0,
      likes: num(ytSummary.likes),
      comments: num(ytSummary.comments),
      shares: num(ytSummary.shares),
      subscribersGained: num(ytSummary.subscribersGained),
      subscribersLost: num(ytSummary.subscribersLost),
      dataThrough: ytSummary.dataThrough ? String(ytSummary.dataThrough) : null,
    },
    daily,
    youtubeDaily,
  };
}
