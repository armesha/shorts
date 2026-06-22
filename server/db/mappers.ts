// Pure, stateless row→domain mappers + tolerant JSON/credential parsers. No DB handle here.
// parseCredMeta / defaultClientLabel are re-exported by the db.ts barrel (callers + index.ts use them).
import type {
  Account,
  Video,
  UserAuth,
  ChannelSnapshot,
  ChannelDailyAnalytics,
  YoutubeReportCache,
  ErrorLogItem,
  NotificationItem,
} from "./types.ts";

export type Row = Record<string, any>;

export function parseStringArray(raw: unknown, fallback: string[] = []): string[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(arr)) return fallback;
    return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
  } catch {
    return fallback;
  }
}

export function parseStringRecord(raw: unknown): Record<string, string> {
  try {
    const obj = JSON.parse(String(raw ?? "{}"));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k || "").trim();
      const val = String(v || "").trim();
      if (key && val) out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

/** Tolerantly pull display metadata out of a client_secret.json (web/installed/raw shape). Never throws. */
export function parseCredMeta(json: string): { clientId: string; projectId: string | null } {
  try {
    const j = JSON.parse(json);
    const c = j.web ?? j.installed ?? j;
    return { clientId: String(c?.client_id ?? ""), projectId: c?.project_id ? String(c.project_id) : null };
  } catch {
    return { clientId: "", projectId: null };
  }
}

/** Default display label for a key: its Google project id, else a numbered fallback. */
export function defaultClientLabel(projectId: string | null, index: number): string {
  return (projectId && projectId.trim()) || `Ключ ${index}`;
}

export const rowToAccount = (r: Row): Account => ({
  id: r.id,
  userId: r.user_id ?? null,
  channelName: r.channel_name,
  theme: r.theme,
  lang: r.lang,
  sourceDecks: parseStringArray(r.source_decks, r.lang ? [r.lang] : []),
  channelLang: r.channel_lang ?? "",
  schedule: JSON.parse(r.schedule),
  template: r.template,
  status: r.yt_refresh_token ? "connected" : r.status || "needs_auth",
  enabled: !!r.enabled,
  uploadsToday: 0, // wired to history once the pipeline runs
  createdAt: r.created_at,
  ytChannelTitle: r.yt_channel_title ?? null,
  ytChannelId: r.yt_channel_id ?? null,
  ytChannelAvatar: r.yt_channel_avatar ?? null,
  slotVideos: JSON.parse(r.slot_videos || "{}"),
  slotDecks: parseStringRecord(r.slot_decks),
  avatar: r.avatar ?? null,
  avatarSource: r.avatar_source ?? "random",
  oauthClientId: r.oauth_client_id ?? null,
  authError: r.auth_error ?? null,
  authFailedAt: r.auth_failed_at ?? null,
});

export const rowToVideo = (r: Row): Video => ({
  id: r.id,
  accountId: r.account_id,
  title: r.title,
  text: r.text,
  bg: r.bg,
  music: r.music,
  deck: r.deck ?? "ru",
  videoRel: r.video_rel,
  imageRel: r.image_rel ?? null,
  postCount: r.post_count,
  lastPostedAt: r.last_posted_at ?? null,
  createdAt: r.created_at,
});

export const rowToUserAuth = (r: Row): UserAuth => ({
  id: r.id,
  username: r.username,
  passHash: r.pass_hash,
  role: r.role,
  failedAttempts: Number(r.failed_attempts) || 0,
  lockedUntil: r.locked_until ?? null,
  telegramId: r.telegram_id ?? null,
  telegramUsername: r.telegram_username ?? null,
  createdAt: r.created_at,
});

export const rowToSnapshot = (r: Row): ChannelSnapshot => ({
  id: r.id,
  accountId: r.account_id,
  subscribers: Number(r.subscribers) || 0,
  views: Number(r.views) || 0,
  videos: Number(r.videos) || 0,
  analyticsStatus: r.analytics_status ?? null,
  analyticsError: r.analytics_error ?? null,
  dataThrough: r.data_through ?? null,
  watchMinutes: Number(r.watch_minutes) || 0,
  engagedViews: Number(r.engaged_views) || 0,
  avgViewDuration: Number(r.avg_view_duration) || 0,
  avgViewPercentage: Number(r.avg_view_percentage) || 0,
  likes: Number(r.likes) || 0,
  comments: Number(r.comments) || 0,
  shares: Number(r.shares) || 0,
  subscribersGained: Number(r.subscribers_gained) || 0,
  subscribersLost: Number(r.subscribers_lost) || 0,
  analyticsTakenAt: r.analytics_taken_at ?? null,
  takenAt: r.taken_at,
});

export const rowToDailyAnalytics = (r: Row): ChannelDailyAnalytics => ({
  accountId: r.account_id,
  date: r.date,
  views: Number(r.views) || 0,
  engagedViews: Number(r.engaged_views) || 0,
  watchMinutes: Number(r.watch_minutes) || 0,
  avgViewDuration: Number(r.avg_view_duration) || 0,
  avgViewPercentage: Number(r.avg_view_percentage) || 0,
  likes: Number(r.likes) || 0,
  dislikes: Number(r.dislikes) || 0,
  comments: Number(r.comments) || 0,
  shares: Number(r.shares) || 0,
  subscribersGained: Number(r.subscribers_gained) || 0,
  subscribersLost: Number(r.subscribers_lost) || 0,
});

export const rowToReportCache = (r: Row): YoutubeReportCache => {
  let payload: unknown = null;
  try {
    payload = JSON.parse(String(r.payload_json ?? "null"));
  } catch {
    payload = null;
  }
  return {
    accountId: r.account_id,
    reportKey: r.report_key,
    rangeFrom: r.range_from,
    rangeTo: r.range_to,
    payload,
    takenAt: r.taken_at,
  };
};

export const rowToError = (r: Row): ErrorLogItem => ({
  id: r.id,
  source: r.source,
  level: r.level,
  message: r.message,
  detail: r.detail ?? null,
  context: r.context ?? null,
  userId: r.user_id ?? null,
  createdAt: r.created_at,
});

export const rowToNotification = (r: Row): NotificationItem => ({
  id: r.id,
  userId: r.user_id,
  username: r.username ?? null,
  accountId: r.account_id ?? null,
  accountName: r.account_name ?? null,
  severity: r.severity,
  category: r.category,
  title: r.title,
  message: r.message,
  solution: r.solution ?? null,
  actionUrl: r.action_url ?? null,
  dedupeKey: r.dedupe_key,
  source: r.source ?? null,
  context: r.context ?? null,
  count: Number(r.count) || 1,
  readAt: r.read_at ?? null,
  resolvedAt: r.resolved_at ?? null,
  firstSeenAt: r.first_seen_at,
  lastSeenAt: r.last_seen_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
