// Shared DB types + small public constants. Re-exported by the db.ts barrel so callers keep importing
// `Account`, `Video`, `OAuthClientRow`, `MAX_OAUTH_CLIENTS_PER_USER`, … from "./db.ts" / "../db.ts".

// Placeholder name a freshly-created channel carries until it's connected to YouTube (or renamed).
// Kept in one place so createAccount's default and the OAuth "seed the dashboard name from the real
// YouTube title" check in setYouTube stay in sync — if they drift, auto-naming silently stops firing.
export const DEFAULT_CHANNEL_NAME = "Новый канал";

export interface Account {
  id: number;
  userId: number | null;
  channelName: string;
  theme: string;
  lang: string; // выбор КОНТЕНТА канала: встроенная дека (ru/de/…) или пак ("pack:<id>")
  sourceDecks: string[]; // все паки/деки, из которых канал может генерировать и выкладывать
  longVideoDecks: string[]; // длинные видео-паки: только ручное добавление в библиотеку + ручная выкладка
  channelLang: string; // ЯЗЫК канала (ru/de/it/fr/en/ar) — стабилен; пак должен совпадать по языку
  schedule: string[];
  template: string;
  status: string;
  enabled: boolean;
  uploadsToday: number;
  createdAt: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  ytChannelAvatar: string | null;
  slotVideos: Record<string, number>;
  slotDecks: Record<string, string>;
  avatar: string | null; // channel avatar URL (YouTube thumbnail, built-in "/avatars/...", or custom "/files/avatars/...")
  avatarSource: "random" | "youtube" | "manual";
  oauthClientId: number | null; // which uploaded Google key this channel was connected with (oauth_clients.id)
  authError: string | null; // last definitive OAuth/token rejection (RU) → channel needs reconnect; NULL = healthy
  authFailedAt: string | null; // ISO time the token first started being rejected — drives "disconnected since" UX
}

// One uploaded Google OAuth client (client_secret.json) belonging to a user. A user may store up to
// MAX_OAUTH_CLIENTS_PER_USER of these and bind each channel to one — channels then post under that
// project's own YouTube Data API quota. The raw JSON is server-only and never sent to the frontend.
export const MAX_OAUTH_CLIENTS_PER_USER = 5;

export interface OAuthClientRow {
  id: number;
  userId: number;
  label: string;
  clientId: string;
  projectId: string | null;
  createdAt: string;
  channelCount: number; // connected channels bound to this key (computed)
}

export interface HistoryItem {
  id: number;
  accountId: number;
  title: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  error?: string | null; // failure reason for `status: "failed"` rows (e.g. auto-upload errors)
  // Enriched fields (filled by listHistoryFiltered; used by the admin "all users" history view).
  channelName?: string;
  ownerUsername?: string | null;
  youtubeId?: string | null;
  videoRel?: string | null;
}

export interface Video {
  id: number;
  accountId: number;
  title: string;
  text: string;
  bg: string;
  music: string;
  deck: string;
  videoRel: string;
  imageRel: string | null;
  postCount: number;
  lastPostedAt: string | null;
  createdAt: string;
}

export interface CreatorGalleryItem {
  id: number;
  userId: number;
  packId: string;
  packName: string;
  templateType: string;
  cardIndex: number;
  title: string;
  text: string;
  narration: string | null;
  format: "png" | "mp4" | "zip" | string;
  imageRel: string | null;
  videoRel: string | null;
  zipRel: string | null;
  music: string;
  durationSec: number | null;
  createdAt: string;
}

export interface UserAuth {
  id: number;
  username: string;
  passHash: string;
  passwordSet: boolean;
  role: string;
  failedAttempts: number;
  lockedUntil: string | null;
  telegramId: string | null; // linked Telegram user id (for "Login with Telegram" + recovery)
  telegramUsername: string | null; // @username (or display name) shown in Settings
  createdAt: string;
}

/** One snapshot of a channel's YouTube totals (subscribers/views/videos) at a point in time. */
export interface ChannelSnapshot {
  id: number;
  accountId: number;
  subscribers: number;
  views: number;
  videos: number;
  analyticsStatus: string | null;
  analyticsError: string | null;
  dataThrough: string | null;
  watchMinutes: number;
  engagedViews: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  analyticsTakenAt: string | null;
  takenAt: string;
}

export interface ChannelDailyAnalytics {
  accountId: number;
  date: string;
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface YoutubeReportCache {
  accountId: number;
  reportKey: string;
  rangeFrom: string;
  rangeTo: string;
  payload: unknown;
  takenAt: string;
}

/** One logged error (server-side crash or client-reported), shown on the admin Errors page. */
export interface ErrorLogItem {
  id: number;
  source: string; // 'server' | 'client'
  level: string; // 'error' | 'warn'
  message: string;
  detail: string | null; // stack / extra
  context: string | null; // route, page url, accountId…
  userId: number | null;
  createdAt: string;
  firstCreatedAt?: string;
  count?: number;
}

/** User-facing issue notification. Repeated occurrences update one row via dedupeKey. */
export interface NotificationItem {
  id: number;
  userId: number;
  username: string | null;
  accountId: number | null;
  accountName: string | null;
  severity: string; // info | warning | error
  category: string;
  title: string;
  message: string;
  solution: string | null;
  actionUrl: string | null;
  dedupeKey: string;
  source: string | null;
  context: string | null;
  count: number;
  readAt: string | null;
  resolvedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}
