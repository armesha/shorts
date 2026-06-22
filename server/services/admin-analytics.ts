import type { Db } from "../db.ts";

type Row = Record<string, any>;
type YtMetrics = {
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
};

export interface AnalyticsRange {
  from?: string;
  to?: string;
}

export interface AdminAnalytics {
  range: { from: string; to: string };
  updatedAt: string;
  summary: {
    published: number;
    scheduled: number;
    failed: number;
    historyTotal: number;
    queuedVideos: number;
    accountsTotal: number;
    accountsEnabled: number;
    accountsConnected: number;
    usersTotal: number;
    errors: number;
    subscribers: number;
    views: number;
    youtubeVideos: number;
    subscriberDelta: number;
    viewsDelta: number;
    youtubeVideosDelta: number;
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
  daily: {
    date: string;
    published: number;
    scheduled: number;
    failed: number;
  }[];
  youtubeSeries: {
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    watchMinutes: number;
    engagedViews: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    subscribersGained: number;
    subscribersLost: number;
  }[];
  topChannels: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    published: number;
    scheduled: number;
    failed: number;
    latestPublishedAt: string | null;
    queued: number;
    postsPerDay: number;
    runwayDays: number | null;
    subscribers: number;
    views: number;
    watchMinutes: number;
    avgViewDuration: number;
  }[];
  topUsers: {
    userId: number;
    username: string;
    published: number;
    scheduled: number;
    failed: number;
    channels: number;
    queued: number;
    postsPerDay: number;
  }[];
  runway: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    queued: number;
    postsPerDay: number;
    runwayDays: number | null;
    enabled: boolean;
    connected: boolean;
  }[];
  youtubeGrowth: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    subscribers: number;
    views: number;
    videos: number;
    subscriberDelta: number;
    viewsDelta: number;
    videoDelta: number;
    watchMinutes: number;
    avgViewDuration: number;
    subscribersGained: number;
    subscribersLost: number;
  }[];
  failures: {
    id: number;
    accountId: number;
    title: string;
    channelName: string;
    ownerUsername: string | null;
    error: string | null;
    createdAt: string;
    publishedAt: string | null;
  }[];
  recentErrors: {
    id: number;
    source: string;
    level: string;
    message: string;
    context: string | null;
    createdAt: string;
  }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

function isDate(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / DAY_MS);
}

export function normalizeAnalyticsRange(input: AnalyticsRange, now = new Date()): { from: string; to: string } {
  let to = isDate(input.to) ? input.to : isoDate(now);
  let from = isDate(input.from) ? input.from : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -MAX_RANGE_DAYS);
  return { from, to };
}

function num(v: unknown): number {
  return Number(v) || 0;
}

function safeJsonArrayLen(raw: unknown): number {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function fillDaily(from: string, to: string, rows: Row[]): AdminAnalytics["daily"] {
  const byDate = new Map(
    rows.map((r) => [
      String(r.date),
      {
        date: String(r.date),
        published: num(r.published),
        scheduled: num(r.scheduled),
        failed: num(r.failed),
      },
    ]),
  );
  const out: AdminAnalytics["daily"] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(byDate.get(d) ?? { date: d, published: 0, scheduled: 0, failed: 0 });
  }
  return out;
}

function emptyYtMetrics(): YtMetrics {
  return {
    views: 0,
    engagedViews: 0,
    watchMinutes: 0,
    avgViewDuration: 0,
    avgViewPercentage: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    subscribersGained: 0,
    subscribersLost: 0,
  };
}

function addYtMetrics(acc: YtMetrics, r: Row): YtMetrics {
  const views = num(r.views);
  acc.views += views;
  acc.engagedViews += num(r.engaged_views);
  acc.watchMinutes += num(r.watch_minutes);
  acc.avgViewDuration += num(r.avg_view_duration) * views;
  acc.avgViewPercentage += num(r.avg_view_percentage) * views;
  acc.likes += num(r.likes);
  acc.comments += num(r.comments);
  acc.shares += num(r.shares);
  acc.subscribersGained += num(r.subscribers_gained);
  acc.subscribersLost += num(r.subscribers_lost);
  return acc;
}

function finishYtMetrics<T extends ReturnType<typeof emptyYtMetrics>>(acc: T): T {
  if (acc.views > 0) {
    acc.avgViewDuration /= acc.views;
    acc.avgViewPercentage /= acc.views;
  }
  return acc;
}

export function buildAdminAnalytics(dbh: Db, input: AnalyticsRange): AdminAnalytics {
  const range = normalizeAnalyticsRange(input);
  const sql = dbh.db;
  const dateExpr = "date(COALESCE(h.published_at, h.created_at))";

  const historySummary = sql
    .prepare(
      `SELECT
        SUM(CASE WHEN h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN h.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
        SUM(CASE WHEN h.status = 'failed' THEN 1 ELSE 0 END) AS failed,
        COUNT(h.id) AS historyTotal
       FROM history h
       WHERE ${dateExpr} BETWEEN ? AND ?`,
    )
    .get(range.from, range.to) as Row;

  const dailyRows = sql
    .prepare(
      `SELECT ${dateExpr} AS date,
        SUM(CASE WHEN h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN h.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
        SUM(CASE WHEN h.status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM history h
       WHERE ${dateExpr} BETWEEN ? AND ?
       GROUP BY date
       ORDER BY date`,
    )
    .all(range.from, range.to) as Row[];

  const accountRows = sql
    .prepare(
      `SELECT
        a.id AS accountId,
        COALESCE(a.yt_channel_title, a.channel_name) AS channelName,
        a.schedule AS schedule,
        a.enabled AS enabled,
        a.yt_refresh_token AS refreshToken,
        u.id AS userId,
        u.username AS ownerUsername,
        COUNT(v.id) AS queued
       FROM accounts a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN videos v ON v.account_id = a.id
       GROUP BY a.id
       ORDER BY a.id`,
    )
    .all() as Row[];

  const accounts = accountRows.map((r) => {
    const postsPerDay = r.enabled ? safeJsonArrayLen(r.schedule) : 0;
    const queued = num(r.queued);
    return {
      accountId: num(r.accountId),
      channelName: String(r.channelName || `#${r.accountId}`),
      ownerUsername: r.ownerUsername ? String(r.ownerUsername) : null,
      userId: r.userId == null ? null : num(r.userId),
      enabled: !!r.enabled,
      connected: !!r.refreshToken,
      queued,
      postsPerDay,
      runwayDays: postsPerDay > 0 ? queued / postsPerDay : null,
    };
  });
  const accountById = new Map(accounts.map((a) => [a.accountId, a]));

  const latestStatsRows = sql
    .prepare(
      `WITH latest AS (
        SELECT account_id, MAX(id) AS id
        FROM channel_stats
        GROUP BY account_id
      )
      SELECT cs.account_id AS accountId, cs.subscribers, cs.views, cs.videos
      FROM latest
      JOIN channel_stats cs ON cs.id = latest.id`,
    )
    .all() as Row[];
  const latestStats = new Map(
    latestStatsRows.map((r) => [
      num(r.accountId),
      { subscribers: num(r.subscribers), views: num(r.views), videos: num(r.videos) },
    ]),
  );

  const ytRows = sql
    .prepare(
      `SELECT account_id AS accountId, date, views, engaged_views, watch_minutes, avg_view_duration,
              avg_view_percentage, likes, comments, shares, subscribers_gained, subscribers_lost
       FROM channel_analytics_daily
       WHERE date BETWEEN ? AND ?
       ORDER BY date, account_id`,
    )
    .all(range.from, range.to) as Row[];
  const hasYtAnalytics = ytRows.length > 0;
  const ytTotals = finishYtMetrics(ytRows.reduce<YtMetrics>((acc, r) => addYtMetrics(acc, r), emptyYtMetrics()));
  const ytByAccount = new Map<number, YtMetrics>();
  const ytByDate = new Map<string, YtMetrics>();
  for (const r of ytRows) {
    const accountId = num(r.accountId);
    const date = String(r.date);
    ytByAccount.set(accountId, addYtMetrics(ytByAccount.get(accountId) ?? emptyYtMetrics(), r));
    ytByDate.set(date, addYtMetrics(ytByDate.get(date) ?? emptyYtMetrics(), r));
  }
  for (const [id, m] of ytByAccount) ytByAccount.set(id, finishYtMetrics(m));
  for (const [date, m] of ytByDate) ytByDate.set(date, finishYtMetrics(m));
  const dataThrough = ytRows.length ? String(ytRows.at(-1)?.date ?? "") : null;

  const topChannels = (
    sql
      .prepare(
        `SELECT
          a.id AS accountId,
          COALESCE(a.yt_channel_title, a.channel_name) AS channelName,
          u.username AS ownerUsername,
          SUM(CASE WHEN h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' THEN 1 ELSE 0 END) AS published,
          SUM(CASE WHEN h.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
          SUM(CASE WHEN h.status = 'failed' THEN 1 ELSE 0 END) AS failed,
          MAX(CASE WHEN h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' THEN COALESCE(h.published_at, h.created_at) ELSE NULL END) AS latestPublishedAt
         FROM accounts a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN history h ON h.account_id = a.id AND ${dateExpr} BETWEEN ? AND ?
         GROUP BY a.id
         HAVING COUNT(h.id) > 0
         ORDER BY published DESC, scheduled DESC, failed DESC, a.id ASC
         LIMIT 10`,
      )
      .all(range.from, range.to) as Row[]
  ).map((r) => {
    const account = accountById.get(num(r.accountId));
    const stat = latestStats.get(num(r.accountId));
    const yt = ytByAccount.get(num(r.accountId));
    return {
      accountId: num(r.accountId),
      channelName: String(r.channelName || `#${r.accountId}`),
      ownerUsername: r.ownerUsername ? String(r.ownerUsername) : null,
      published: num(r.published),
      scheduled: num(r.scheduled),
      failed: num(r.failed),
      latestPublishedAt: r.latestPublishedAt ? String(r.latestPublishedAt) : null,
      queued: account?.queued ?? 0,
      postsPerDay: account?.postsPerDay ?? 0,
      runwayDays: account?.runwayDays ?? null,
      subscribers: stat?.subscribers ?? 0,
      views: hasYtAnalytics ? yt?.views ?? 0 : stat?.views ?? 0,
      watchMinutes: yt?.watchMinutes ?? 0,
      avgViewDuration: yt?.avgViewDuration ?? 0,
    };
  });

  const topUserRows = sql
    .prepare(
      `SELECT
        u.id AS userId,
        u.username AS username,
        COUNT(DISTINCT a.id) AS channels,
        SUM(CASE WHEN h.status = 'published' AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' THEN 1 ELSE 0 END) AS published,
        SUM(CASE WHEN h.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
        SUM(CASE WHEN h.status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM users u
       LEFT JOIN accounts a ON a.user_id = u.id
       LEFT JOIN history h ON h.account_id = a.id AND ${dateExpr} BETWEEN ? AND ?
       GROUP BY u.id
       HAVING COUNT(h.id) > 0
       ORDER BY published DESC, scheduled DESC, failed DESC, u.id ASC
       LIMIT 10`,
    )
    .all(range.from, range.to) as Row[];

  const userOps = new Map<number, { queued: number; postsPerDay: number }>();
  for (const a of accounts) {
    if (a.userId == null) continue;
    const cur = userOps.get(a.userId) ?? { queued: 0, postsPerDay: 0 };
    cur.queued += a.queued;
    cur.postsPerDay += a.postsPerDay;
    userOps.set(a.userId, cur);
  }
  const topUsers = topUserRows.map((r) => {
    const ops = userOps.get(num(r.userId));
    return {
      userId: num(r.userId),
      username: String(r.username),
      published: num(r.published),
      scheduled: num(r.scheduled),
      failed: num(r.failed),
      channels: num(r.channels),
      queued: ops?.queued ?? 0,
      postsPerDay: ops?.postsPerDay ?? 0,
    };
  });

  const snapshotSeries = (
    sql
      .prepare(
        `WITH last_ids AS (
          SELECT date(taken_at) AS date, account_id, MAX(id) AS id
          FROM channel_stats
          WHERE date(taken_at) BETWEEN ? AND ?
          GROUP BY date, account_id
        )
        SELECT last_ids.date AS date,
          SUM(cs.subscribers) AS subscribers,
          SUM(cs.views) AS views,
          SUM(cs.videos) AS videos
        FROM last_ids
        JOIN channel_stats cs ON cs.id = last_ids.id
        GROUP BY last_ids.date
        ORDER BY last_ids.date`,
      )
      .all(range.from, range.to) as Row[]
  ).map((r) => ({
    date: String(r.date),
    subscribers: num(r.subscribers),
    views: num(r.views),
    videos: num(r.videos),
    watchMinutes: 0,
    engagedViews: 0,
    avgViewDuration: 0,
    avgViewPercentage: 0,
    subscribersGained: 0,
    subscribersLost: 0,
  }));
  const snapshotByDate = new Map(snapshotSeries.map((r) => [r.date, r]));
  const youtubeSeries = hasYtAnalytics
    ? [...ytByDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, yt]) => ({
          date,
          subscribers: snapshotByDate.get(date)?.subscribers ?? 0,
          views: yt.views,
          videos: snapshotByDate.get(date)?.videos ?? 0,
          watchMinutes: yt.watchMinutes,
          engagedViews: yt.engagedViews,
          avgViewDuration: yt.avgViewDuration,
          avgViewPercentage: yt.avgViewPercentage,
          subscribersGained: yt.subscribersGained,
          subscribersLost: yt.subscribersLost,
        }))
    : snapshotSeries;

  const youtubeGrowthAll = (
    sql
      .prepare(
        `WITH first_ids AS (
          SELECT account_id, MIN(id) AS id
          FROM channel_stats
          WHERE date(taken_at) BETWEEN ? AND ?
          GROUP BY account_id
        ),
        last_ids AS (
          SELECT account_id, MAX(id) AS id
          FROM channel_stats
          WHERE date(taken_at) BETWEEN ? AND ?
          GROUP BY account_id
        )
        SELECT
          a.id AS accountId,
          COALESCE(a.yt_channel_title, a.channel_name) AS channelName,
          u.username AS ownerUsername,
          first.subscribers AS firstSubscribers,
          first.views AS firstViews,
          first.videos AS firstVideos,
          last.subscribers AS subscribers,
          last.views AS views,
          last.videos AS videos
        FROM accounts a
        JOIN first_ids fi ON fi.account_id = a.id
        JOIN last_ids li ON li.account_id = a.id
        JOIN channel_stats first ON first.id = fi.id
        JOIN channel_stats last ON last.id = li.id
        LEFT JOIN users u ON u.id = a.user_id`,
      )
      .all(range.from, range.to, range.from, range.to) as Row[]
  ).map((r) => ({
    accountId: num(r.accountId),
    channelName: String(r.channelName || `#${r.accountId}`),
    ownerUsername: r.ownerUsername ? String(r.ownerUsername) : null,
    subscribers: num(r.subscribers),
    views: num(r.views),
    videos: num(r.videos),
    subscriberDelta: num(r.subscribers) - num(r.firstSubscribers),
    viewsDelta: num(r.views) - num(r.firstViews),
    videoDelta: num(r.videos) - num(r.firstVideos),
    watchMinutes: 0,
    avgViewDuration: 0,
    subscribersGained: 0,
    subscribersLost: 0,
  }));
  // Snapshot-derived period change (last − first) per account — reused below so the analytics branch
  // doesn't report a meaningless viewsDelta (it used to set viewsDelta = period views, i.e. delta == value)
  // or a hardcoded videoDelta of 0.
  const snapGrowthByAccount = new Map(youtubeGrowthAll.map((r) => [r.accountId, r]));
  const youtubeGrowthRows = hasYtAnalytics
    ? [...ytByAccount.entries()].map(([accountId, yt]) => {
        const account = accountById.get(accountId);
        const stat = latestStats.get(accountId);
        const snap = snapGrowthByAccount.get(accountId);
        return {
          accountId,
          channelName: account?.channelName ?? `#${accountId}`,
          ownerUsername: account?.ownerUsername ?? null,
          subscribers: stat?.subscribers ?? 0,
          views: yt.views,
          videos: stat?.videos ?? 0,
          subscriberDelta: yt.subscribersGained - yt.subscribersLost,
          viewsDelta: snap?.viewsDelta ?? 0,
          videoDelta: snap?.videoDelta ?? 0,
          watchMinutes: yt.watchMinutes,
          avgViewDuration: yt.avgViewDuration,
          subscribersGained: yt.subscribersGained,
          subscribersLost: yt.subscribersLost,
        };
      })
    : youtubeGrowthAll;

  const failures = (
    sql
      .prepare(
        `SELECT
          h.id,
          h.account_id AS accountId,
          h.title,
          COALESCE(a.yt_channel_title, a.channel_name) AS channelName,
          u.username AS ownerUsername,
          h.error,
          h.created_at AS createdAt,
          h.published_at AS publishedAt
        FROM history h
        JOIN accounts a ON a.id = h.account_id
        LEFT JOIN users u ON u.id = a.user_id
        WHERE h.status = 'failed' AND ${dateExpr} BETWEEN ? AND ?
        ORDER BY h.id DESC
        LIMIT 10`,
      )
      .all(range.from, range.to) as Row[]
  ).map((r) => ({
    id: num(r.id),
    accountId: num(r.accountId),
    title: String(r.title || "ошибка"),
    channelName: String(r.channelName || `#${r.accountId}`),
    ownerUsername: r.ownerUsername ? String(r.ownerUsername) : null,
    error: r.error ? String(r.error) : null,
    createdAt: String(r.createdAt),
    publishedAt: r.publishedAt ? String(r.publishedAt) : null,
  }));

  const recentErrors = (
    sql
      .prepare(
        `SELECT id, source, level, message, context, created_at AS createdAt
        FROM error_log
        WHERE date(created_at) BETWEEN ? AND ?
        ORDER BY id DESC
        LIMIT 10`,
      )
      .all(range.from, range.to) as Row[]
  ).map((r) => ({
    id: num(r.id),
    source: String(r.source),
    level: String(r.level),
    message: String(r.message),
    context: r.context ? String(r.context) : null,
    createdAt: String(r.createdAt),
  }));

  const errors = sql
    .prepare("SELECT COUNT(*) AS n FROM error_log WHERE date(created_at) BETWEEN ? AND ?")
    .get(range.from, range.to) as Row;

  const youtubeGrowthSorted = [...youtubeGrowthRows].sort(
    (a, b) => b.viewsDelta - a.viewsDelta || b.subscriberDelta - a.subscriberDelta,
  );
  const latestTotals = latestStatsRows.reduce(
    (acc, r) => {
      acc.subscribers += num(r.subscribers);
      acc.views += num(r.views);
      acc.videos += num(r.videos);
      return acc;
    },
    { subscribers: 0, views: 0, videos: 0 },
  );
  const growthTotals = youtubeGrowthRows.reduce(
    (acc, r) => {
      acc.subscriberDelta += r.subscriberDelta;
      acc.viewsDelta += r.viewsDelta;
      acc.youtubeVideosDelta += r.videoDelta;
      return acc;
    },
    { subscriberDelta: 0, viewsDelta: 0, youtubeVideosDelta: 0 },
  );

  return {
    range,
    updatedAt: new Date().toISOString(),
    summary: {
      published: num(historySummary.published),
      scheduled: num(historySummary.scheduled),
      failed: num(historySummary.failed),
      historyTotal: num(historySummary.historyTotal),
      queuedVideos: accounts.reduce((sum, a) => sum + a.queued, 0),
      accountsTotal: accounts.length,
      accountsEnabled: accounts.filter((a) => a.enabled).length,
      accountsConnected: accounts.filter((a) => a.connected).length,
      usersTotal: num((sql.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n),
      errors: num(errors.n),
      subscribers: latestTotals.subscribers,
      views: hasYtAnalytics ? ytTotals.views : latestTotals.views,
      youtubeVideos: latestTotals.videos,
      ...growthTotals,
      watchMinutes: ytTotals.watchMinutes,
      engagedViews: ytTotals.engagedViews,
      avgViewDuration: ytTotals.avgViewDuration,
      avgViewPercentage: ytTotals.avgViewPercentage,
      likes: ytTotals.likes,
      comments: ytTotals.comments,
      shares: ytTotals.shares,
      subscribersGained: ytTotals.subscribersGained,
      subscribersLost: ytTotals.subscribersLost,
      dataThrough,
    },
    daily: fillDaily(range.from, range.to, dailyRows),
    youtubeSeries,
    topChannels,
    topUsers,
    runway: [...accounts]
      .sort((a, b) => {
        if (a.runwayDays == null && b.runwayDays == null) return a.accountId - b.accountId;
        if (a.runwayDays == null) return 1;
        if (b.runwayDays == null) return -1;
        return a.runwayDays - b.runwayDays;
      })
      .slice(0, 12)
      .map(({ accountId, channelName, ownerUsername, queued, postsPerDay, runwayDays, enabled, connected }) => ({
        accountId,
        channelName,
        ownerUsername,
        queued,
        postsPerDay,
        runwayDays,
        enabled,
        connected,
      })),
    youtubeGrowth: youtubeGrowthSorted.slice(0, 10),
    failures,
    recentErrors,
  };
}
