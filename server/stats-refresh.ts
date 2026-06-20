// One channel's "refresh": pull YouTube Data totals + the YouTube Analytics bundle, write a fresh
// snapshot, return any user-facing error. Extracted (verbatim in behaviour) from the per-account
// block of POST /api/stats/refresh in index.ts so the HTTP route AND the Telegram bot share ONE code
// path — same 15-min/6-h TTL caching, same snapshot shape, same error handling. The two pieces that
// live in index.ts (the `summarizeStored` reader and the `formatStatsError` formatter, plus the
// notification side-effects) are injected, so this module stays a dependency-free leaf.
import type { Db, Account } from "./db.ts";
import type { ClientCreds } from "./youtube.ts";
import { fetchChannelStats } from "./stats.ts";
import { fetchChannelAnalyticsBundle, ytAnalyticsErrorMessage } from "./youtube-analytics.ts";

// Channel totals (subscribers/views/videos) are cheap-ish but quota-bound → reuse for 15 min.
// The Analytics bundle is many API calls → reuse for 6 h. Pressing "refresh" inside the window
// returns the cached snapshot instead of re-hitting YouTube (keeps the bot/route light).
export const CHANNEL_TOTALS_TTL_MS = 15 * 60 * 1000;
export const YT_ANALYTICS_TTL_MS = 6 * 60 * 60 * 1000;

/** SQLite datetime('now') strings are "YYYY-MM-DD HH:MM:SS" UTC (no zone) → epoch ms. */
export function parseUtcMs(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").getTime();
}
export function freshEnough(takenAt: string | null | undefined, ttlMs: number): boolean {
  const t = parseUtcMs(takenAt);
  return t > 0 && Date.now() - t < ttlMs;
}

// The analytics fields a channel_stats snapshot carries. Both summarizeStoredAnalytics()'s return
// and ChannelAnalyticsBundle["summary"] are structurally assignable to this.
export interface SnapshotAnalyticsFields {
  views: number;
  watchMinutes: number;
  engagedViews: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
}

// Side-effects that the HTTP route performs on failure (app.log + error_log row + user notification).
// Injected so this leaf never imports index.ts. The bot passes the SAME hooks → identical behaviour.
export interface RefreshHooks {
  onAnalyticsError?(account: Account, err: unknown, message: string): void;
  onStatsError?(account: Account, err: unknown, message: string): void;
}

export interface RefreshAccountOpts {
  db: Db;
  account: Account;
  creds: ClientCreds | null;
  refreshToken: string | null;
  redirectUri: string;
  analyticsRange: { from: string; to: string };
  /** index.ts summarizeStoredAnalytics, bound to its db. Summarizes stored daily rows for the range. */
  summarizeStored: (accountId: number, from: string, to: string) => SnapshotAnalyticsFields;
  /** index.ts ytErrorMessage — turns a YouTube Data/OAuth failure into a short Russian hint. */
  formatStatsError: (err: unknown) => string;
  hooks?: RefreshHooks;
}

/**
 * Refresh one connected channel. Returns `{ error }` for the caller to surface (the route collects
 * these into the response row; the bot shows it on the card). The caller is responsible for skipping
 * non-connected channels — here a missing key/token is reported as an error, matching the route.
 */
export async function refreshAccountStats(opts: RefreshAccountOpts): Promise<{ error: string | null }> {
  const { db, account: a, creds, refreshToken: token, redirectUri, analyticsRange, summarizeStored, formatStatsError, hooks } = opts;
  if (!creds) return { error: "Нет Google-ключа у владельца канала" };
  if (!token) return { error: "Канал не подключён к YouTube" };

  let resultError: string | null = null;
  try {
    const latest = db.latestSnapshot(a.id);
    let totals = latest && freshEnough(latest.takenAt, CHANNEL_TOTALS_TTL_MS)
      ? { subscribers: latest.subscribers, views: latest.views, videos: latest.videos }
      : null;
    let wroteSnapshot = false;
    if (!totals) {
      const freshTotals = await fetchChannelStats(creds, redirectUri, token);
      totals = freshTotals;
      db.setYouTube(a.id, {
        refreshToken: token,
        channelId: freshTotals.channelId ?? a.ytChannelId,
        channelTitle: freshTotals.channelTitle ?? a.ytChannelTitle,
        channelAvatar: freshTotals.channelAvatar,
      });
    }

    const cachedTopVideos = db.getReportCache(a.id, "topVideos", analyticsRange.from, analyticsRange.to);
    let analyticsStatus = latest?.analyticsStatus ?? null;
    let analyticsError: string | null = null;
    let dataThrough = latest?.dataThrough ?? db.latestDailyAnalyticsDate(a.id);
    let analyticsTakenAt = latest?.analyticsTakenAt ?? null;
    let analyticsSummary: SnapshotAnalyticsFields = summarizeStored(a.id, analyticsRange.from, analyticsRange.to);
    let analyticsTouched = false;

    if (cachedTopVideos && freshEnough(cachedTopVideos.takenAt, YT_ANALYTICS_TTL_MS)) {
      analyticsStatus = "cached";
      analyticsTakenAt = cachedTopVideos.takenAt;
    } else {
      try {
        const bundle = await fetchChannelAnalyticsBundle(creds, redirectUri, token, a.id, analyticsRange);
        db.upsertDailyAnalytics(bundle.daily);
        db.setReportCache(a.id, "topVideos", analyticsRange.from, analyticsRange.to, bundle.topVideos);
        db.setReportCache(a.id, "trafficSources", analyticsRange.from, analyticsRange.to, bundle.trafficSources);
        db.setReportCache(a.id, "devices", analyticsRange.from, analyticsRange.to, bundle.devices);
        db.setReportCache(a.id, "countries", analyticsRange.from, analyticsRange.to, bundle.countries);
        db.setReportCache(a.id, "subscribedStatus", analyticsRange.from, analyticsRange.to, bundle.subscribedStatus);
        db.setReportCache(a.id, "demographics", analyticsRange.from, analyticsRange.to, bundle.demographics);
        db.setReportCache(a.id, "sharing", analyticsRange.from, analyticsRange.to, bundle.sharing);
        db.setReportCache(a.id, "retention", analyticsRange.from, analyticsRange.to, bundle.retention);
        analyticsStatus = "ok";
        analyticsSummary = bundle.summary;
        dataThrough = bundle.dataThrough;
        analyticsTakenAt = new Date().toISOString();
        analyticsTouched = true;
      } catch (err) {
        analyticsStatus = "error";
        analyticsError = ytAnalyticsErrorMessage(err);
        analyticsTouched = true;
        resultError = analyticsError;
        hooks?.onAnalyticsError?.(a, err, analyticsError);
      }
    }

    if (
      !latest ||
      !freshEnough(latest.takenAt, CHANNEL_TOTALS_TTL_MS) ||
      analyticsTouched ||
      analyticsStatus !== latest.analyticsStatus ||
      analyticsError
    ) {
      db.addChannelSnapshot({
        accountId: a.id,
        subscribers: totals.subscribers,
        views: totals.views,
        videos: totals.videos,
        analyticsStatus,
        analyticsError,
        dataThrough,
        watchMinutes: analyticsSummary.watchMinutes,
        engagedViews: analyticsSummary.engagedViews,
        avgViewDuration: analyticsSummary.avgViewDuration,
        avgViewPercentage: analyticsSummary.avgViewPercentage,
        likes: analyticsSummary.likes,
        comments: analyticsSummary.comments,
        shares: analyticsSummary.shares,
        subscribersGained: analyticsSummary.subscribersGained,
        subscribersLost: analyticsSummary.subscribersLost,
        analyticsTakenAt,
      });
      wroteSnapshot = true;
    }
    if (!wroteSnapshot && analyticsError) resultError = analyticsError;
  } catch (err) {
    const msg = formatStatsError(err);
    hooks?.onStatsError?.(a, err, msg);
    resultError = msg;
  }
  return { error: resultError };
}
