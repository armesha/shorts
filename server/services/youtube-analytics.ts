import { google } from "googleapis";
import type { ClientCreds } from "./youtube.ts";
import type { ChannelDailyAnalytics } from "../db.ts";

export interface AnalyticsBreakdownRow {
  key: string;
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration?: number;
}

// Demographics: the API returns ONLY viewerPercentage (no views/watch-time), for logged-in viewers.
export interface AnalyticsDemographicsRow {
  ageGroup: string;
  gender: string;
  viewerPercentage: number;
}

// Where viewers shared the video (WhatsApp / Telegram / Copy to clipboard / …).
export interface AnalyticsSharingRow {
  service: string;
  shares: number;
}

export interface AnalyticsTopVideo {
  videoId: string;
  title: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
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
}

export interface AnalyticsRetentionPoint {
  elapsedRatio: number;
  audienceWatchRatio: number;
  relativeRetentionPerformance: number;
  startedWatching: number;
  stoppedWatching: number;
  totalSegmentImpressions: number;
}

export interface AnalyticsVideoRetention {
  videoId: string;
  title: string;
  points: AnalyticsRetentionPoint[];
}

export interface ChannelAnalyticsBundle {
  from: string;
  to: string;
  dataThrough: string | null;
  daily: ChannelDailyAnalytics[];
  summary: Omit<ChannelDailyAnalytics, "accountId" | "date">;
  topVideos: AnalyticsTopVideo[];
  trafficSources: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
  countries: AnalyticsBreakdownRow[];
  subscribedStatus: AnalyticsBreakdownRow[];
  demographics: AnalyticsDemographicsRow[];
  sharing: AnalyticsSharingRow[];
  retention: AnalyticsVideoRetention[];
}

type QueryRow = Record<string, unknown>;

const DAILY_METRICS = [
  "views",
  "engagedViews",
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
  "likes",
  "dislikes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
].join(",");

const TOP_VIDEO_METRICS = DAILY_METRICS;

function client(creds: ClientCreds, redirectUri: string) {
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
}

function num(v: unknown): number {
  return Number(v) || 0;
}

function rowsByHeader(data: { columnHeaders?: { name?: string | null }[] | null; rows?: unknown[][] | null }): QueryRow[] {
  const headers = (data.columnHeaders ?? []).map((h) => String(h.name ?? ""));
  return (data.rows ?? []).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

function dailyFromRows(accountId: number, rows: QueryRow[]): ChannelDailyAnalytics[] {
  return rows
    .filter((r) => r.day)
    .map((r) => ({
      accountId,
      date: String(r.day),
      views: num(r.views),
      engagedViews: num(r.engagedViews),
      watchMinutes: num(r.estimatedMinutesWatched),
      avgViewDuration: num(r.averageViewDuration),
      avgViewPercentage: num(r.averageViewPercentage),
      likes: num(r.likes),
      dislikes: num(r.dislikes),
      comments: num(r.comments),
      shares: num(r.shares),
      subscribersGained: num(r.subscribersGained),
      subscribersLost: num(r.subscribersLost),
    }));
}

function summarizeDaily(rows: ChannelDailyAnalytics[]): ChannelAnalyticsBundle["summary"] {
  const totals = rows.reduce(
    (acc, r) => {
      acc.views += r.views;
      acc.engagedViews += r.engagedViews;
      acc.watchMinutes += r.watchMinutes;
      acc.likes += r.likes;
      acc.dislikes += r.dislikes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      acc.subscribersGained += r.subscribersGained;
      acc.subscribersLost += r.subscribersLost;
      return acc;
    },
    {
      views: 0,
      engagedViews: 0,
      watchMinutes: 0,
      avgViewDuration: 0,
      avgViewPercentage: 0,
      likes: 0,
      dislikes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    },
  );
  if (totals.views > 0) {
    totals.avgViewDuration = rows.reduce((sum, r) => sum + r.avgViewDuration * r.views, 0) / totals.views;
    totals.avgViewPercentage = rows.reduce((sum, r) => sum + r.avgViewPercentage * r.views, 0) / totals.views;
  }
  return totals;
}

function breakdownRows(rows: QueryRow[], key: string): AnalyticsBreakdownRow[] {
  return rows.map((r) => ({
    key: String(r[key] ?? ""),
    views: num(r.views),
    engagedViews: num(r.engagedViews),
    watchMinutes: num(r.estimatedMinutesWatched),
    avgViewDuration: num(r.averageViewDuration),
  }));
}

function topVideoRows(rows: QueryRow[]): AnalyticsTopVideo[] {
  return rows
    .filter((r) => r.video)
    .map((r) => ({
      videoId: String(r.video),
      title: String(r.video),
      publishedAt: null,
      thumbnailUrl: null,
      views: num(r.views),
      engagedViews: num(r.engagedViews),
      watchMinutes: num(r.estimatedMinutesWatched),
      avgViewDuration: num(r.averageViewDuration),
      avgViewPercentage: num(r.averageViewPercentage),
      likes: num(r.likes),
      comments: num(r.comments),
      shares: num(r.shares),
      subscribersGained: num(r.subscribersGained),
      subscribersLost: num(r.subscribersLost),
    }));
}

async function enrichVideos(
  yt: ReturnType<typeof google.youtube>,
  videos: AnalyticsTopVideo[],
): Promise<AnalyticsTopVideo[]> {
  const ids = videos.map((v) => v.videoId).filter(Boolean).slice(0, 50);
  if (!ids.length) return videos;
  const res = await yt.videos.list({ part: ["snippet"], id: ids });
  const meta = new Map(
    (res.data.items ?? []).map((item) => [
      item.id ?? "",
      {
        title: item.snippet?.title ?? item.id ?? "",
        publishedAt: item.snippet?.publishedAt ?? null,
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          item.snippet?.thumbnails?.high?.url ??
          null,
      },
    ]),
  );
  return videos.map((v) => ({ ...v, ...(meta.get(v.videoId) ?? {}) }));
}

function retentionRows(rows: QueryRow[]): AnalyticsRetentionPoint[] {
  return rows.map((r) => ({
    elapsedRatio: num(r.elapsedVideoTimeRatio),
    audienceWatchRatio: num(r.audienceWatchRatio),
    relativeRetentionPerformance: num(r.relativeRetentionPerformance),
    startedWatching: num(r.startedWatching),
    stoppedWatching: num(r.stoppedWatching),
    totalSegmentImpressions: num(r.totalSegmentImpressions),
  }));
}

export async function fetchChannelAnalyticsBundle(
  creds: ClientCreds,
  redirectUri: string,
  refreshToken: string,
  accountId: number,
  range: { from: string; to: string },
): Promise<ChannelAnalyticsBundle> {
  const oauth = client(creds, redirectUri);
  oauth.setCredentials({ refresh_token: refreshToken });
  const analytics = google.youtubeAnalytics({ version: "v2", auth: oauth });
  const yt = google.youtube({ version: "v3", auth: oauth });
  const query = async (params: Record<string, string | number | undefined>): Promise<QueryRow[]> => {
    const res = await analytics.reports.query({
      ids: "channel==MINE",
      startDate: range.from,
      endDate: range.to,
      ...params,
    });
    return rowsByHeader(res.data);
  };
  const optionalQuery = async (params: Record<string, string | number | undefined>): Promise<QueryRow[]> => {
    try {
      return await query(params);
    } catch {
      return [];
    }
  };

  const daily = dailyFromRows(
    accountId,
    await query({ dimensions: "day", metrics: DAILY_METRICS, sort: "day" }),
  );
  const summary = summarizeDaily(daily);
  const topVideoBase = topVideoRows(
    await query({
      dimensions: "video",
      metrics: TOP_VIDEO_METRICS,
      sort: "-views",
      maxResults: 50,
    }),
  );
  const topVideos = await enrichVideos(yt, topVideoBase).catch(() => topVideoBase);

  const [trafficSources, devices, countries, subscribedStatus] = await Promise.all([
    optionalQuery({
      dimensions: "insightTrafficSourceType",
      metrics: "views,engagedViews,estimatedMinutesWatched",
      sort: "-views",
      maxResults: 25,
    }).then((rows) => breakdownRows(rows, "insightTrafficSourceType")),
    optionalQuery({
      dimensions: "deviceType",
      metrics: "views,engagedViews,estimatedMinutesWatched",
      sort: "-views",
      maxResults: 25,
    }).then((rows) => breakdownRows(rows, "deviceType")),
    optionalQuery({
      dimensions: "country",
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      sort: "-views",
      maxResults: 10,
    }).then((rows) => breakdownRows(rows, "country")),
    optionalQuery({
      dimensions: "subscribedStatus",
      metrics: "views,estimatedMinutesWatched,averageViewDuration",
      sort: "-views",
      maxResults: 10,
    }).then((rows) => breakdownRows(rows, "subscribedStatus")),
  ]);

  // Demographics (ageGroup×gender → viewerPercentage only) and share destinations.
  // optionalQuery swallows errors so an unsupported combo never breaks the whole refresh.
  const [demographics, sharing] = await Promise.all([
    optionalQuery({
      dimensions: "ageGroup,gender",
      metrics: "viewerPercentage",
      sort: "-viewerPercentage",
    }).then((rows) =>
      rows.map((r) => ({
        ageGroup: String(r.ageGroup ?? ""),
        gender: String(r.gender ?? ""),
        viewerPercentage: num(r.viewerPercentage),
      })),
    ),
    optionalQuery({
      dimensions: "sharingService",
      metrics: "shares",
      sort: "-shares",
      maxResults: 25,
    }).then((rows) =>
      rows
        .map((r) => ({ service: String(r.sharingService ?? ""), shares: num(r.shares) }))
        .filter((r) => r.shares > 0),
    ),
  ]);

  const retention: AnalyticsVideoRetention[] = [];
  for (const v of topVideos.slice(0, 3)) {
    try {
      const points = retentionRows(
        await query({
          dimensions: "elapsedVideoTimeRatio",
          metrics:
            "audienceWatchRatio,relativeRetentionPerformance,startedWatching,stoppedWatching,totalSegmentImpressions",
          filters: `video==${v.videoId}`,
          sort: "elapsedVideoTimeRatio",
        }),
      );
      if (points.length) retention.push({ videoId: v.videoId, title: v.title, points });
    } catch {
      // Retention can be missing for low-traffic or very fresh videos; keep the channel refresh useful.
    }
  }

  return {
    from: range.from,
    to: range.to,
    dataThrough: daily.at(-1)?.date ?? null,
    daily,
    summary,
    topVideos,
    trafficSources,
    devices,
    countries,
    subscribedStatus,
    demographics,
    sharing,
    retention,
  };
}

export function ytAnalyticsErrorMessage(err: unknown): string {
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error_description?: string; error?: unknown } };
    errors?: { message?: string; reason?: string }[];
    message?: string;
  };
  const data = e?.response?.data;
  const status = e?.response?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  const apiErr =
    data?.error && typeof data.error === "object"
      ? (data.error as { message?: string; errors?: { reason?: string; message?: string }[] })
      : null;
  const reason = apiErr?.errors?.[0]?.reason ?? e?.errors?.[0]?.reason ?? "";
  const raw =
    data?.error_description ||
    (typeof data?.error === "string" ? data.error : apiErr?.message) ||
    apiErr?.errors?.[0]?.message ||
    e?.errors?.[0]?.message ||
    e?.message ||
    String(err);
  const s = `${String(raw)} ${reason}`.trim();
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project|API has not been used/i.test(s)) {
    return "В проекте этого Google-ключа не включён YouTube Analytics API. Откройте Google Cloud Console → APIs & Services → Library → YouTube Analytics API → Enable, затем обновите статистику ещё раз.";
  }
  if (/insufficient|scope|forbidden|permission/i.test(s)) {
    return "Токен канала не даёт доступ к YouTube Analytics. Переподключите канал через Google и отметьте доступ к YouTube Analytics.";
  }
  if (/quota|rateLimit|userRateLimitExceeded/i.test(s)) {
    return `Квота YouTube Analytics API исчерпана или ограничена (${s}) — попробуйте позже.`;
  }
  if (status === 401 || /\bunauthorized\b|authorizationRequired|invalid_grant/i.test(s)) {
    return "YouTube Analytics не принял авторизацию — переподключите канал через Google.";
  }
  return `Ошибка YouTube Analytics: ${s || "неизвестно"}${status ? ` (HTTP ${status})` : ""}`;
}
