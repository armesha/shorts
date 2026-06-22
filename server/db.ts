import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

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

export interface UserAuth {
  id: number;
  username: string;
  passHash: string;
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

type Row = Record<string, any>;

function parseStringArray(raw: unknown, fallback: string[] = []): string[] {
  try {
    const arr = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(arr)) return fallback;
    return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
  } catch {
    return fallback;
  }
}

function parseStringRecord(raw: unknown): Record<string, string> {
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

const rowToAccount = (r: Row): Account => ({
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

const rowToVideo = (r: Row): Video => ({
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

const rowToUserAuth = (r: Row): UserAuth => ({
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

const rowToSnapshot = (r: Row): ChannelSnapshot => ({
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

const rowToDailyAnalytics = (r: Row): ChannelDailyAnalytics => ({
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

const rowToReportCache = (r: Row): YoutubeReportCache => {
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

const rowToError = (r: Row): ErrorLogItem => ({
  id: r.id,
  source: r.source,
  level: r.level,
  message: r.message,
  detail: r.detail ?? null,
  context: r.context ?? null,
  userId: r.user_id ?? null,
  createdAt: r.created_at,
});

const rowToNotification = (r: Row): NotificationItem => ({
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

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // Concurrency hardening: WAL lets readers and a writer coexist; busy_timeout makes brief lock
  // contention (scheduler + live user + short-lived side connections) wait-and-retry instead of
  // throwing SQLITE_BUSY immediately. synchronous=NORMAL is the safe WAL companion. Best-effort
  // (e.g. in-memory ":memory:" ignores journal pragmas — fine for tests).
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  } catch {
    /* pragmas best-effort */
  }
  // The DB file holds YouTube refresh tokens + per-user Google client secrets — keep it owner-only.
  // chmod is a no-op on Windows and harmless if it fails.
  if (path !== ":memory:") {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best-effort */
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_name TEXT NOT NULL DEFAULT 'Новый канал',
      theme TEXT NOT NULL DEFAULT '',
      lang TEXT NOT NULL DEFAULT 'de',
      schedule TEXT NOT NULL DEFAULT '["12:00"]',
      template TEXT NOT NULL DEFAULT '1 · Kraft Paper',
      status TEXT NOT NULL DEFAULT 'needs_auth',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      image_path TEXT,
      video_path TEXT,
      youtube_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      published_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      bg TEXT DEFAULT '',
      music TEXT DEFAULT '',
      deck TEXT NOT NULL DEFAULT 'ru',
      video_rel TEXT NOT NULL,
      image_rel TEXT,
      post_count INTEGER NOT NULL DEFAULT 0,
      last_posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_used_anecdotes (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key)
    );
    CREATE TABLE IF NOT EXISTS channel_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      subscribers INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      videos INTEGER NOT NULL DEFAULT 0,
      analytics_status TEXT,
      analytics_error TEXT,
      data_through TEXT,
      watch_minutes REAL NOT NULL DEFAULT 0,
      engaged_views INTEGER NOT NULL DEFAULT 0,
      avg_view_duration REAL NOT NULL DEFAULT 0,
      avg_view_percentage REAL NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      subscribers_gained INTEGER NOT NULL DEFAULT 0,
      subscribers_lost INTEGER NOT NULL DEFAULT 0,
      analytics_taken_at TEXT,
      taken_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS channel_analytics_daily (
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      engaged_views INTEGER NOT NULL DEFAULT 0,
      watch_minutes REAL NOT NULL DEFAULT 0,
      avg_view_duration REAL NOT NULL DEFAULT 0,
      avg_view_percentage REAL NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      dislikes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      subscribers_gained INTEGER NOT NULL DEFAULT 0,
      subscribers_lost INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, date)
    );
    CREATE TABLE IF NOT EXISTS youtube_report_cache (
      account_id INTEGER NOT NULL,
      report_key TEXT NOT NULL,
      range_from TEXT NOT NULL,
      range_to TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      taken_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, report_key, range_from, range_to)
    );
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL DEFAULT 'server',
      level TEXT NOT NULL DEFAULT 'error',
      message TEXT NOT NULL,
      detail TEXT,
      context TEXT,
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER,
      severity TEXT NOT NULL DEFAULT 'info',
      category TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      solution TEXT,
      action_url TEXT,
      dedupe_key TEXT NOT NULL,
      source TEXT,
      context TEXT,
      count INTEGER NOT NULL DEFAULT 1,
      read_at TEXT,
      resolved_at TEXT,
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, dedupe_key)
    );
    CREATE TABLE IF NOT EXISTS user_hidden_decks (
      user_id INTEGER NOT NULL,
      deck_id TEXT NOT NULL,
      PRIMARY KEY (user_id, deck_id)
    );
    CREATE TABLE IF NOT EXISTS user_granted_decks (
      user_id INTEGER NOT NULL,
      deck_id TEXT NOT NULL,
      PRIMARY KEY (user_id, deck_id)
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      user_id INTEGER PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS telegram_links (
      token TEXT PRIMARY KEY,
      purpose TEXT NOT NULL,            -- 'bind' | 'login'
      user_id INTEGER,                 -- bind: the logged-in user; login: matched user (set on /start)
      telegram_id TEXT,
      telegram_username TEXT,
      chat_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending|ready|consumed|nomatch|conflict
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      client_secret_json TEXT NOT NULL, -- full uploaded JSON; server-only, never returned to the client
      client_id TEXT NOT NULL DEFAULT '',
      project_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Additive schema migrations. ADD COLUMN is idempotent across restarts, but ONLY the expected
  // "duplicate column name" error means "already applied" — anything else (typo, constraint failure)
  // must surface loudly instead of being silently swallowed.
  const addColumn = (table: string, def: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    } catch (e) {
      if (!/duplicate column name/i.test(String((e as Error)?.message ?? e))) throw e;
    }
  };
  for (const col of ["yt_refresh_token", "yt_channel_id", "yt_channel_title"]) addColumn("accounts", `${col} TEXT`);
  addColumn("accounts", "slot_videos TEXT DEFAULT '{}'");
  addColumn("accounts", "slot_decks TEXT DEFAULT '{}'");
  addColumn("accounts", "source_decks TEXT DEFAULT '[]'");
  db.prepare("UPDATE accounts SET source_decks = json_array(lang) WHERE source_decks IS NULL OR source_decks = '[]'").run();
  addColumn("accounts", "channel_lang TEXT DEFAULT ''");
  addColumn("accounts", "avatar TEXT");
  addColumn("accounts", "yt_channel_avatar TEXT");
  addColumn("accounts", "avatar_source TEXT NOT NULL DEFAULT 'random'");
  db.prepare("UPDATE accounts SET avatar_source = 'youtube' WHERE avatar LIKE 'http%'").run();
  db.prepare("UPDATE accounts SET avatar_source = 'manual' WHERE avatar LIKE '/files/avatars/%'").run();
  addColumn("videos", "deck TEXT NOT NULL DEFAULT 'ru'");
  addColumn("accounts", "user_id INTEGER");
  addColumn("accounts", "oauth_client_id INTEGER"); // which uploaded Google key the channel is bound to
  addColumn("accounts", "auth_error TEXT"); // last OAuth/token rejection → channel surfaced as "needs reconnect"
  addColumn("accounts", "auth_failed_at TEXT"); // when that rejection first started (ISO)
  addColumn("users", "client_secret_json TEXT");
  addColumn("channel_analytics_daily", "dislikes INTEGER NOT NULL DEFAULT 0");
  addColumn("history", "error TEXT");
  addColumn("history", "deck TEXT"); // deck a post was actually published with (old rows NULL → fall back to channel lang)
  addColumn("channel_stats", "analytics_status TEXT");
  addColumn("channel_stats", "analytics_error TEXT");
  addColumn("channel_stats", "data_through TEXT");
  addColumn("channel_stats", "watch_minutes REAL NOT NULL DEFAULT 0");
  addColumn("channel_stats", "engaged_views INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "avg_view_duration REAL NOT NULL DEFAULT 0");
  addColumn("channel_stats", "avg_view_percentage REAL NOT NULL DEFAULT 0");
  addColumn("channel_stats", "likes INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "comments INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "shares INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "subscribers_gained INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "subscribers_lost INTEGER NOT NULL DEFAULT 0");
  addColumn("channel_stats", "analytics_taken_at TEXT");
  for (const col of ["telegram_id", "telegram_username"]) addColumn("users", `${col} TEXT`);
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL",
    );
  } catch {
    /* older SQLite without partial indexes — binding still works, uniqueness just not DB-enforced */
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_account_published ON history(account_id, published_at);
    CREATE INDEX IF NOT EXISTS idx_history_status_published ON history(status, published_at);
    CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at);
    CREATE INDEX IF NOT EXISTS idx_videos_account ON videos(account_id);
    CREATE INDEX IF NOT EXISTS idx_channel_stats_account_taken ON channel_stats(account_id, taken_at);
    CREATE INDEX IF NOT EXISTS idx_channel_analytics_daily_date ON channel_analytics_daily(date);
    CREATE INDEX IF NOT EXISTS idx_report_cache_account_key_taken ON youtube_report_cache(account_id, report_key, taken_at);
    CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_last ON notifications(user_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_last_seen ON notifications(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_oauth_clients_user ON oauth_clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_oauth_client ON accounts(oauth_client_id);
  `);

  // Multi-key OAuth migration (idempotent via MOVE semantics): pull each user's legacy single
  // `users.client_secret_json` into one `oauth_clients` row, bind their already-connected channels to
  // it (so refresh tokens keep matching the same client_id), then NULL the legacy column so deleting
  // every key later never resurrects one. Runs only while a legacy value is still present.
  const legacyKeys = db
    .prepare("SELECT id, client_secret_json FROM users WHERE client_secret_json IS NOT NULL AND TRIM(client_secret_json) != ''")
    .all() as Row[];
  for (const u of legacyKeys) {
    const userId = Number(u.id);
    const json = String(u.client_secret_json);
    const meta = parseCredMeta(json);
    let clientRowId: number;
    const existing = db.prepare("SELECT id FROM oauth_clients WHERE user_id = ? ORDER BY id LIMIT 1").get(userId) as Row | undefined;
    if (existing) {
      clientRowId = Number(existing.id);
    } else {
      const info = db
        .prepare("INSERT INTO oauth_clients (user_id, label, client_secret_json, client_id, project_id) VALUES (?,?,?,?,?)")
        .run(userId, defaultClientLabel(meta.projectId, 1), json, meta.clientId, meta.projectId);
      clientRowId = Number(info.lastInsertRowid);
    }
    db.prepare("UPDATE accounts SET oauth_client_id = ? WHERE user_id = ? AND oauth_client_id IS NULL").run(clientRowId, userId);
    db.prepare("UPDATE users SET client_secret_json = NULL WHERE id = ?").run(userId);
  }

  // Schema version stamp. Everything above is additive & idempotent, so it self-applies on every boot.
  // For a FUTURE non-additive change (rename/drop/type/constraint), gate it on this version, e.g.:
  //   if (schemaVersion < 2) { db.exec("BEGIN; <migration>; PRAGMA user_version = 2; COMMIT;"); }
  const SCHEMA_VERSION = 2;
  const schemaVersion = (db.prepare("PRAGMA user_version").get() as { user_version?: number })?.user_version ?? 0;
  // v2 (one-time): mirror every connected channel's editable dashboard name to its real YouTube title —
  // a forced backfill so existing channels stop showing the "Новый канал" placeholder / stale labels.
  // Gated on user_version so it runs EXACTLY once and never re-clobbers names users edit afterwards.
  // Channels never connected to YouTube (no title yet) keep their current name.
  if (schemaVersion < 2) {
    db.prepare(
      "UPDATE accounts SET channel_name = yt_channel_title " +
        "WHERE yt_channel_title IS NOT NULL AND TRIM(yt_channel_title) != ''",
    ).run();
  }
  if (schemaVersion < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // "Uploaded today" per channel — count of published history rows dated today (UTC).
  const countUploadsToday = (accountId: number): number => {
    const r = db
      .prepare(
        "SELECT COUNT(*) AS n FROM history WHERE account_id = ? AND status = 'published' AND date(published_at) = date('now')",
      )
      .get(accountId) as Row;
    return Number(r.n) || 0;
  };

  return {
    db,
    listAccounts(): Account[] {
      return (db.prepare("SELECT * FROM accounts ORDER BY id").all() as Row[])
        .map(rowToAccount)
        .map((a) => ({ ...a, uploadsToday: countUploadsToday(a.id) }));
    },
    listAccountsByUser(userId: number): Account[] {
      return (db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id").all(userId) as Row[])
        .map(rowToAccount)
        .map((a) => ({ ...a, uploadsToday: countUploadsToday(a.id) }));
    },
    // One-time migration: existing channels (no owner) become the first admin's.
    assignOrphanAccounts(userId: number): void {
      db.prepare("UPDATE accounts SET user_id = ? WHERE user_id IS NULL").run(userId);
    },
    getAccount(id: number): Account | null {
      const r = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
      if (!r) return null;
      return { ...rowToAccount(r), uploadsToday: countUploadsToday(r.id) };
    },
    createAccount(input: Partial<Account>): Account {
      const avatarSource = input.avatarSource ?? (input.avatar ? "manual" : "random");
      const info = db
        .prepare(
          "INSERT INTO accounts (user_id, channel_name, theme, lang, source_decks, channel_lang, schedule, template, status, avatar, avatar_source) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          input.userId ?? null,
          input.channelName ?? DEFAULT_CHANNEL_NAME,
          input.theme ?? "",
          input.lang ?? "de",
          JSON.stringify(input.sourceDecks?.length ? input.sourceDecks : [input.lang ?? "de"]),
          input.channelLang ?? input.lang ?? "de",
          JSON.stringify(input.schedule ?? ["12:00"]),
          input.template ?? "1 · Kraft Paper",
          input.status ?? "needs_auth",
          input.avatar ?? null,
          avatarSource,
        );
      return this.getAccount(Number(info.lastInsertRowid))!;
    },
    updateAccount(id: number, input: Partial<Account>): Account | null {
      const cur = this.getAccount(id);
      if (!cur) return null;
      const hasAvatar = Object.prototype.hasOwnProperty.call(input, "avatar");
      db.prepare(
        "UPDATE accounts SET channel_name=?, theme=?, lang=?, source_decks=?, channel_lang=?, schedule=?, template=?, enabled=?, slot_videos=?, slot_decks=?, avatar=?, avatar_source=? WHERE id=?",
      ).run(
        input.channelName ?? cur.channelName,
        input.theme ?? cur.theme,
        input.lang ?? cur.lang,
        JSON.stringify(input.sourceDecks ?? cur.sourceDecks),
        input.channelLang ?? cur.channelLang,
        JSON.stringify(input.schedule ?? cur.schedule),
        input.template ?? cur.template,
        (input.enabled ?? cur.enabled) ? 1 : 0,
        JSON.stringify(input.slotVideos ?? cur.slotVideos),
        JSON.stringify(input.slotDecks ?? cur.slotDecks),
        input.avatar ?? cur.avatar,
        hasAvatar ? (input.avatarSource ?? "manual") : cur.avatarSource,
        id,
      );
      return this.getAccount(id);
    },
    deleteAccount(id: number): void {
      db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
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
               WHEN ? IS NOT NULL AND TRIM(?) != ''
                    AND (channel_name IS NULL OR TRIM(channel_name) = '' OR channel_name = ?)
                 THEN ?
               ELSE channel_name
             END,
             yt_channel_avatar=COALESCE(?, yt_channel_avatar),
             avatar=CASE
               WHEN ? IS NOT NULL AND COALESCE(avatar_source, 'random') != 'manual' THEN ?
               ELSE avatar
             END,
             avatar_source=CASE
               WHEN ? IS NOT NULL AND COALESCE(avatar_source, 'random') != 'manual' THEN 'youtube'
               ELSE avatar_source
             END,
             auth_error=NULL,
             auth_failed_at=NULL
         WHERE id=?`,
      ).run(
        d.refreshToken,
        d.channelId,
        d.channelTitle,
        // Seed the editable dashboard name from the real YouTube title — but ONLY while it's still the
        // placeholder/empty, so a re-auth or a stats refresh never clobbers a name the user edited.
        d.channelTitle,
        d.channelTitle,
        DEFAULT_CHANNEL_NAME,
        d.channelTitle,
        d.channelAvatar ?? null,
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
     */
    markAuthError(id: number, reason: string, at: string): void {
      db.prepare(
        `UPDATE accounts
            SET auth_error = ?,
                auth_failed_at = COALESCE(auth_failed_at, ?)
          WHERE id = ?`,
      ).run(reason.slice(0, 300), at, id);
    },
    /** Clear the auth-error flag (token works again / channel reconnected). No-op if already clean. */
    clearAuthError(id: number): void {
      db.prepare(
        "UPDATE accounts SET auth_error = NULL, auth_failed_at = NULL WHERE id = ? AND auth_error IS NOT NULL",
      ).run(id);
    },
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
    createVideo(v: {
      accountId: number;
      title: string;
      text: string;
      bg: string;
      music: string;
      deck: string;
      videoRel: string;
      imageRel: string | null;
    }): Video {
      const info = db
        .prepare(
          "INSERT INTO videos (account_id,title,text,bg,music,deck,video_rel,image_rel) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(v.accountId, v.title, v.text, v.bg, v.music, v.deck, v.videoRel, v.imageRel);
      return this.getVideo(Number(info.lastInsertRowid))!;
    },
    getVideo(id: number): Video | null {
      const r = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as Row | undefined;
      return r ? rowToVideo(r) : null;
    },
    listVideos(accountId: number): Video[] {
      return (
        db.prepare("SELECT * FROM videos WHERE account_id = ? ORDER BY id DESC").all(accountId) as Row[]
      ).map(rowToVideo);
    },
    findOutputFileOwner(rel: string): { accountId: number; userId: number | null } | null {
      const r = db
        .prepare(
          `SELECT v.account_id, a.user_id
             FROM videos v JOIN accounts a ON a.id = v.account_id
            WHERE v.video_rel = ? OR v.image_rel = ?
           UNION ALL
           SELECT h.account_id, a.user_id
             FROM history h JOIN accounts a ON a.id = h.account_id
            WHERE h.video_path = ? OR h.image_path = ?
            LIMIT 1`,
        )
        .get(rel, rel, rel, rel) as Row | undefined;
      return r ? { accountId: r.account_id, userId: r.user_id ?? null } : null;
    },
    deleteVideo(id: number): void {
      db.prepare("DELETE FROM videos WHERE id = ?").run(id);
    },
    // Total rendered videos waiting in the library across all channels (server-health "очередь").
    totalVideoCount(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM videos").get() as Row;
      return Number(r.n) || 0;
    },
    incrementPost(id: number): void {
      db.prepare("UPDATE videos SET post_count = post_count + 1, last_posted_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        id,
      );
    },
    // Atomic post-claim: flip an UNPOSTED video (post_count 0) to in-flight in ONE statement and
    // report whether WE won (changes===1). Guarantees at-most-once upload across post-now (incl.
    // double-clicks) and the scheduler. On upload failure → releaseVideoPost so it can be retried.
    claimVideoForPost(id: number): boolean {
      const info = db
        .prepare(
          "UPDATE videos SET post_count = post_count + 1, last_posted_at = ? WHERE id = ? AND post_count = 0",
        )
        .run(new Date().toISOString(), id);
      return Number(info.changes) === 1;
    },
    releaseVideoPost(id: number): void {
      db.prepare(
        "UPDATE videos SET post_count = post_count - 1, last_posted_at = NULL WHERE id = ? AND post_count > 0",
      ).run(id);
    },
    leastPostedVideo(accountId: number): Video | null {
      const r = db
        .prepare("SELECT * FROM videos WHERE account_id = ? ORDER BY post_count ASC, id ASC LIMIT 1")
        .get(accountId) as Row | undefined;
      return r ? rowToVideo(r) : null;
    },
    // Next never-posted video (FIFO) for the post-once queue, optionally restricted to a deck/language.
    nextUnpostedVideo(accountId: number, deck?: string): Video | null {
      const r = (
        deck
          ? db
              .prepare(
                "SELECT * FROM videos WHERE account_id = ? AND post_count = 0 AND deck = ? ORDER BY id ASC LIMIT 1",
              )
              .get(accountId, deck)
          : db
              .prepare("SELECT * FROM videos WHERE account_id = ? AND post_count = 0 ORDER BY id ASC LIMIT 1")
              .get(accountId)
      ) as Row | undefined;
      return r ? rowToVideo(r) : null;
    },
    // Next never-posted video from any allowed deck/source. The scheduler uses this for
    // multi-pack channels; it still only uploads videos already present in the library.
    nextUnpostedVideoForDecks(accountId: number, decks: string[]): Video | null {
      const ids = [...new Set(decks.map((d) => String(d || "").trim()).filter(Boolean))];
      if (ids.length === 0) return this.nextUnpostedVideo(accountId);
      if (ids.length === 1) return this.nextUnpostedVideo(accountId, ids[0]);
      const placeholders = ids.map(() => "?").join(",");
      const r = db
        .prepare(
          `SELECT * FROM videos
           WHERE account_id = ? AND post_count = 0 AND deck IN (${placeholders})
           ORDER BY post_count ASC, id ASC
           LIMIT 1`,
        )
        .get(accountId, ...ids) as Row | undefined;
      return r ? rowToVideo(r) : null;
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
    // Used anecdotes: once an anecdote becomes a saved/auto-posted video, its key lands here
    // so randomAnecdote() never picks it again (per-install state — not shipped content).
    markAnecdoteUsed(userId: number, key: string): void {
      db.prepare(
        "INSERT INTO user_used_anecdotes (user_id, key) VALUES (?, ?) ON CONFLICT(user_id, key) DO NOTHING",
      ).run(userId, key);
    },
    // Atomic claim: mark a card used and report whether WE were the one who claimed it (changes>0).
    // Lets concurrent generation paths reserve a card BEFORE the slow render so the same card is
    // never built into two videos. A losing caller (false) re-picks; on render failure → releaseAnecdote.
    claimAnecdote(userId: number, key: string): boolean {
      const info = db
        .prepare(
          "INSERT INTO user_used_anecdotes (user_id, key) VALUES (?, ?) ON CONFLICT(user_id, key) DO NOTHING",
        )
        .run(userId, key);
      return Number(info.changes) > 0;
    },
    releaseAnecdote(userId: number, key: string): void {
      db.prepare("DELETE FROM user_used_anecdotes WHERE user_id = ? AND key = ?").run(userId, key);
    },
    usedAnecdoteKeys(userId: number): Set<string> {
      const rows = db
        .prepare("SELECT key FROM user_used_anecdotes WHERE user_id = ?")
        .all(userId) as Row[];
      return new Set(rows.map((r) => r.key as string));
    },
    usedAnecdoteCount(userId: number): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM user_used_anecdotes WHERE user_id = ?")
        .get(userId) as Row;
      return Number(r.n) || 0;
    },
    clearAnecdoteUsedKeys(userId: number, keys: string[]): number {
      const uniq = [...new Set(keys.map((k) => String(k || "").trim()).filter(Boolean))];
      if (!uniq.length) return 0;
      const del = db.prepare("DELETE FROM user_used_anecdotes WHERE user_id = ? AND key = ?");
      let removed = 0;
      db.exec("BEGIN");
      try {
        for (const key of uniq) removed += Number(del.run(userId, key).changes) || 0;
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return removed;
    },
    // ---- Auth: users & sessions ----
    countUsers(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row;
      return Number(r.n) || 0;
    },
    createUser(u: { username: string; passHash: string; role?: string }): UserAuth {
      const info = db
        .prepare("INSERT INTO users (username, pass_hash, role) VALUES (?,?,?)")
        .run(u.username, u.passHash, u.role ?? "user");
      return this.getUserById(Number(info.lastInsertRowid))!;
    },
    getUserById(id: number): UserAuth | null {
      const r = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
      return r ? rowToUserAuth(r) : null;
    },
    getUserByUsername(username: string): UserAuth | null {
      const r = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as Row | undefined;
      return r ? rowToUserAuth(r) : null;
    },
    incFailedAttempts(id: number): number {
      db.prepare("UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?").run(id);
      const r = db.prepare("SELECT failed_attempts AS n FROM users WHERE id = ?").get(id) as Row;
      return Number(r.n) || 0;
    },
    lockUser(id: number, untilIso: string): void {
      db.prepare("UPDATE users SET locked_until = ? WHERE id = ?").run(untilIso, id);
    },
    clearLock(id: number): void {
      db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?").run(id);
    },
    createSession(token: string, userId: number, expiresAtIso: string): void {
      db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(
        token,
        userId,
        expiresAtIso,
      );
    },
    getSession(token: string): { userId: number; expiresAt: string } | null {
      const r = db.prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?").get(token) as
        | Row
        | undefined;
      return r ? { userId: r.user_id as number, expiresAt: r.expires_at as string } : null;
    },
    deleteSession(token: string): void {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    },
    listUsers(): UserAuth[] {
      return (db.prepare("SELECT * FROM users ORDER BY id").all() as Row[]).map(rowToUserAuth);
    },
    // ---- Telegram linking (Login with Telegram + password recovery) ----
    getUserByTelegramId(telegramId: string): UserAuth | null {
      const r = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId) as Row | undefined;
      return r ? rowToUserAuth(r) : null;
    },
    setUserTelegram(userId: number, telegramId: string | null, username: string | null): void {
      db.prepare("UPDATE users SET telegram_id = ?, telegram_username = ? WHERE id = ?").run(
        telegramId,
        username,
        userId,
      );
    },
    // Set a new password hash directly (used by Telegram-based recovery); also lifts any lockout.
    setUserPassword(userId: number, passHash: string): void {
      db.prepare(
        "UPDATE users SET pass_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
      ).run(passHash, userId);
    },
    // ---- One-time password-reset codes (delivered via the Telegram bot) ----
    upsertPasswordReset(userId: number, codeHash: string, expiresAtIso: string): void {
      db.prepare(
        "INSERT INTO password_resets (user_id, code_hash, expires_at, attempts, created_at) " +
          "VALUES (?,?,?,0,datetime('now')) " +
          "ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, " +
          "expires_at=excluded.expires_at, attempts=0, created_at=datetime('now')",
      ).run(userId, codeHash, expiresAtIso);
    },
    getPasswordReset(
      userId: number,
    ): { codeHash: string; expiresAt: string; attempts: number; createdAt: string } | null {
      const r = db
        .prepare("SELECT code_hash, expires_at, attempts, created_at FROM password_resets WHERE user_id = ?")
        .get(userId) as Row | undefined;
      return r
        ? {
            codeHash: r.code_hash as string,
            expiresAt: r.expires_at as string,
            attempts: Number(r.attempts) || 0,
            createdAt: r.created_at as string,
          }
        : null;
    },
    bumpPasswordResetAttempts(userId: number): number {
      db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?").run(userId);
      const r = db.prepare("SELECT attempts AS n FROM password_resets WHERE user_id = ?").get(userId) as Row;
      return Number(r?.n) || 0;
    },
    deletePasswordReset(userId: number): void {
      db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
    },
    // ---- Telegram bot deep-link handshake (bind/login via /start, not the widget) ----
    createTelegramLink(token: string, purpose: string, userId: number | null): void {
      // GC: drop stale handshakes so this table never grows (no cron needed).
      db.prepare("DELETE FROM telegram_links WHERE created_at < datetime('now','-1 hour')").run();
      db.prepare("INSERT INTO telegram_links (token, purpose, user_id) VALUES (?,?,?)").run(
        token,
        purpose,
        userId,
      );
    },
    getTelegramLink(token: string): {
      token: string;
      purpose: string;
      userId: number | null;
      telegramId: string | null;
      telegramUsername: string | null;
      chatId: string | null;
      status: string;
      createdAt: string;
    } | null {
      const r = db.prepare("SELECT * FROM telegram_links WHERE token = ?").get(token) as Row | undefined;
      return r
        ? {
            token: r.token as string,
            purpose: r.purpose as string,
            userId: (r.user_id as number) ?? null,
            telegramId: (r.telegram_id as string) ?? null,
            telegramUsername: (r.telegram_username as string) ?? null,
            chatId: (r.chat_id as string) ?? null,
            status: r.status as string,
            createdAt: r.created_at as string,
          }
        : null;
    },
    updateTelegramLink(
      token: string,
      f: { telegramId?: string; telegramUsername?: string | null; chatId?: string; status?: string; userId?: number },
    ): void {
      const sets: string[] = [];
      const vals: (string | number | null)[] = [];
      if (f.telegramId !== undefined) (sets.push("telegram_id = ?"), vals.push(f.telegramId));
      if (f.telegramUsername !== undefined) (sets.push("telegram_username = ?"), vals.push(f.telegramUsername));
      if (f.chatId !== undefined) (sets.push("chat_id = ?"), vals.push(f.chatId));
      if (f.status !== undefined) (sets.push("status = ?"), vals.push(f.status));
      if (f.userId !== undefined) (sets.push("user_id = ?"), vals.push(f.userId));
      if (!sets.length) return;
      vals.push(token);
      db.prepare(`UPDATE telegram_links SET ${sets.join(", ")} WHERE token = ?`).run(...vals);
    },
    deleteTelegramLink(token: string): void {
      db.prepare("DELETE FROM telegram_links WHERE token = ?").run(token);
    },
    // ---- Per-user pack (deck) visibility. Rows = HIDDEN decks; NO rows = user sees ALL (default). ----
    hiddenDecksFor(userId: number): string[] {
      return (db.prepare("SELECT deck_id FROM user_hidden_decks WHERE user_id = ?").all(userId) as Row[]).map(
        (r) => r.deck_id as string,
      );
    },
    isDeckHiddenFor(userId: number, deckId: string): boolean {
      return !!db.prepare("SELECT 1 FROM user_hidden_decks WHERE user_id = ? AND deck_id = ?").get(userId, deckId);
    },
    grantedDecksFor(userId: number): string[] {
      return (db.prepare("SELECT deck_id FROM user_granted_decks WHERE user_id = ?").all(userId) as Row[]).map(
        (r) => r.deck_id as string,
      );
    },
    isDeckGrantedFor(userId: number, deckId: string): boolean {
      return !!db.prepare("SELECT 1 FROM user_granted_decks WHERE user_id = ? AND deck_id = ?").get(userId, deckId);
    },
    setGrantedDecks(userId: number, deckIds: string[]): void {
      db.prepare("DELETE FROM user_granted_decks WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT OR IGNORE INTO user_granted_decks (user_id, deck_id) VALUES (?, ?)");
      for (const id of [...new Set(deckIds)]) if (id) ins.run(userId, id);
    },
    // Replace the user's hidden-deck set with exactly `deckIds`.
    setHiddenDecks(userId: number, deckIds: string[]): void {
      db.prepare("DELETE FROM user_hidden_decks WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT OR IGNORE INTO user_hidden_decks (user_id, deck_id) VALUES (?, ?)");
      for (const id of [...new Set(deckIds)]) if (id) ins.run(userId, id);
    },
    // All hidden decks across users → { userId: [deckId,…] } (for the admin matrix).
    hiddenDecksByUser(): Record<number, string[]> {
      const out: Record<number, string[]> = {};
      for (const r of db.prepare("SELECT user_id, deck_id FROM user_hidden_decks").all() as Row[]) {
        (out[r.user_id as number] ??= []).push(r.deck_id as string);
      }
      return out;
    },
    grantedDecksByUser(): Record<number, string[]> {
      const out: Record<number, string[]> = {};
      for (const r of db.prepare("SELECT user_id, deck_id FROM user_granted_decks").all() as Row[]) {
        (out[r.user_id as number] ??= []).push(r.deck_id as string);
      }
      return out;
    },
    // Decks each user actually USES = languages of their channels + decks of their library videos.
    usedDecksByUser(): Record<number, string[]> {
      const sets: Record<number, Set<string>> = {};
      const add = (u: number, d: string) => {
        if (u == null || !d) return;
        (sets[u] ??= new Set<string>()).add(d);
      };
      for (const r of db.prepare("SELECT user_id, lang, source_decks FROM accounts WHERE user_id IS NOT NULL").all() as Row[]) {
        add(r.user_id as number, r.lang as string);
        for (const d of parseStringArray(r.source_decks, [])) add(r.user_id as number, d);
      }
      for (const r of db
        .prepare(
          "SELECT a.user_id AS uid, v.deck FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.user_id IS NOT NULL",
        )
        .all() as Row[])
        add(r.uid as number, r.deck as string);
      const out: Record<number, string[]> = {};
      for (const k of Object.keys(sets)) out[Number(k)] = [...sets[Number(k)]];
      return out;
    },
    // Total daily schedule slots (= posts/day) across a user's channels, optionally excluding one account.
    // Used for the per-user aggregate schedule cap.
    scheduleSlotsForUser(userId: number, excludeAccountId?: number): number {
      const rows = db.prepare("SELECT id, schedule FROM accounts WHERE user_id = ?").all(userId) as Row[];
      let n = 0;
      for (const r of rows) {
        if (excludeAccountId != null && (r.id as number) === excludeAccountId) continue;
        try {
          n += (JSON.parse((r.schedule as string) || "[]") as unknown[]).length;
        } catch {
          /* malformed schedule → count as 0 */
        }
      }
      return n;
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
    scheduleSlotsForKey(oauthClientId: number, excludeAccountId?: number): number {
      const rows = db.prepare("SELECT id, schedule FROM accounts WHERE oauth_client_id = ?").all(oauthClientId) as Row[];
      let n = 0;
      for (const r of rows) {
        if (excludeAccountId != null && (r.id as number) === excludeAccountId) continue;
        try {
          n += (JSON.parse((r.schedule as string) || "[]") as unknown[]).length;
        } catch {
          /* malformed schedule → count as 0 */
        }
      }
      return n;
    },
    // Total library videos (queued, not yet posted) across a user's channels.
    countVideosByUser(userId: number): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.user_id = ?")
        .get(userId) as { n: number };
      return r.n;
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
    // ---- Per-user Google OAuth clients (uploaded client_secret.json; up to MAX_OAUTH_CLIENTS_PER_USER) ----
    // The raw client_secret_json is SERVER-ONLY — list/meta helpers below never expose it.
    countOAuthClients(userId: number): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM oauth_clients WHERE user_id = ?").get(userId) as Row;
      return Number(r.n) || 0;
    },
    listOAuthClients(userId: number): OAuthClientRow[] {
      const rows = db.prepare("SELECT * FROM oauth_clients WHERE user_id = ? ORDER BY id").all(userId) as Row[];
      return rows.map((r) => ({
        id: Number(r.id),
        userId: Number(r.user_id),
        label: String(r.label ?? ""),
        clientId: String(r.client_id ?? ""),
        projectId: (r.project_id as string) ?? null,
        createdAt: String(r.created_at),
        channelCount:
          Number((db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE oauth_client_id = ?").get(r.id) as Row).n) || 0,
      }));
    },
    addOAuthClient(
      userId: number,
      input: { json: string; label?: string; clientId: string; projectId: string | null },
    ): OAuthClientRow {
      const label = (input.label && input.label.trim()) || defaultClientLabel(input.projectId, this.countOAuthClients(userId) + 1);
      const info = db
        .prepare("INSERT INTO oauth_clients (user_id, label, client_secret_json, client_id, project_id) VALUES (?,?,?,?,?)")
        .run(userId, label, input.json, input.clientId, input.projectId);
      const id = Number(info.lastInsertRowid);
      return this.listOAuthClients(userId).find((c) => c.id === id)!;
    },
    renameOAuthClient(userId: number, id: number, label: string): boolean {
      return db.prepare("UPDATE oauth_clients SET label = ? WHERE id = ? AND user_id = ?").run(label.trim(), id, userId).changes > 0;
    },
    /** Channels bound to a key (powers the "in use → can't delete" guard and UI counts). */
    accountsUsingOAuthClient(id: number): { id: number; channelName: string }[] {
      return (db.prepare("SELECT id, channel_name FROM accounts WHERE oauth_client_id = ?").all(id) as Row[]).map((r) => ({
        id: Number(r.id),
        channelName: String(r.channel_name),
      }));
    },
    deleteOAuthClient(userId: number, id: number): boolean {
      return db.prepare("DELETE FROM oauth_clients WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
    },
    /** Owner-scoped raw JSON (server-only) — used to confirm a chosen key belongs to the user. */
    getOAuthClientSecretForUser(userId: number, id: number): string | null {
      const r = db.prepare("SELECT client_secret_json FROM oauth_clients WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
      return (r?.client_secret_json as string) ?? null;
    },
    bindAccountOAuthClient(accountId: number, oauthClientId: number): void {
      db.prepare("UPDATE accounts SET oauth_client_id = ? WHERE id = ?").run(oauthClientId, accountId);
    },
    /**
     * Resolve the client_secret JSON a channel must use for OAuth refresh/upload. A BOUND channel uses
     * exactly its key (its refresh token's client_id must match); if that key was removed we return null
     * (caller → "reconnect") rather than silently using a different, mismatched key. A never-bound
     * (legacy) channel falls back to the owner's most-recent key.
     */
    oauthClientSecretForAccount(account: Account): string | null {
      if (account.oauthClientId != null) {
        const r = db.prepare("SELECT client_secret_json FROM oauth_clients WHERE id = ?").get(account.oauthClientId) as Row | undefined;
        return (r?.client_secret_json as string) ?? null;
      }
      // Unbound channel: a CONNECTED one must not guess a key — its refresh token is client_id-specific, so
      // returning the owner's newest key could upload under the wrong client_id. Force a reconnect instead.
      // Only a not-yet-connected channel may borrow the owner's newest key (it has no token to mismatch).
      if (account.userId != null && account.status !== "connected") {
        const r = db
          .prepare("SELECT client_secret_json FROM oauth_clients WHERE user_id = ? ORDER BY id DESC LIMIT 1")
          .get(account.userId) as Row | undefined;
        return (r?.client_secret_json as string) ?? null;
      }
      return null;
    },
    getSetting(key: string): string | null {
      const r = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
      return r ? (r.value as string) : null;
    },
    setSetting(key: string, value: string): void {
      db.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(key, value);
    },
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
    // ---- User-facing notifications (deduped issue inbox) ----
    upsertNotification(n: {
      userId: number;
      accountId?: number | null;
      severity?: string;
      category?: string;
      title: string;
      message: string;
      solution?: string | null;
      actionUrl?: string | null;
      dedupeKey: string;
      source?: string | null;
      context?: string | null;
    }): NotificationItem {
      const severity = ["info", "warning", "error"].includes(n.severity ?? "") ? n.severity! : "info";
      db.prepare(
        `INSERT INTO notifications
          (user_id, account_id, severity, category, title, message, solution, action_url,
           dedupe_key, source, context, count, first_seen_at, last_seen_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'),datetime('now'),datetime('now'))
         ON CONFLICT(user_id, dedupe_key) DO UPDATE SET
           account_id=excluded.account_id,
           severity=excluded.severity,
           category=excluded.category,
           title=excluded.title,
           message=excluded.message,
           solution=excluded.solution,
           action_url=excluded.action_url,
           source=excluded.source,
           context=excluded.context,
           count=notifications.count + 1,
           read_at=NULL,
           resolved_at=NULL,
           last_seen_at=datetime('now'),
           updated_at=datetime('now')`,
      ).run(
        n.userId,
        n.accountId ?? null,
        severity,
        String(n.category || "system").slice(0, 80),
        String(n.title).slice(0, 240),
        String(n.message).slice(0, 2000),
        n.solution ? String(n.solution).slice(0, 4000) : null,
        n.actionUrl ? String(n.actionUrl).slice(0, 1000) : null,
        String(n.dedupeKey).slice(0, 300),
        n.source ? String(n.source).slice(0, 80) : null,
        n.context ? String(n.context).slice(0, 500) : null,
      );
      return this.getNotificationByKey(n.userId, String(n.dedupeKey).slice(0, 300))!;
    },
    getNotification(id: number): NotificationItem | null {
      const r = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           WHERE n.id = ?`,
        )
        .get(id) as Row | undefined;
      return r ? rowToNotification(r) : null;
    },
    getNotificationByKey(userId: number, dedupeKey: string): NotificationItem | null {
      const r = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           WHERE n.user_id = ? AND n.dedupe_key = ?`,
        )
        .get(userId, dedupeKey) as Row | undefined;
      return r ? rowToNotification(r) : null;
    },
    listNotifications(opts: {
      userId?: number;
      includeResolved?: boolean;
      onlyResolved?: boolean;
      onlyUnread?: boolean;
      limit?: number;
      offset?: number;
    } = {}): NotificationItem[] {
      const where: string[] = [];
      const args: (string | number)[] = [];
      if (opts.userId != null) {
        where.push("n.user_id = ?");
        args.push(opts.userId);
      }
      if (opts.onlyResolved) where.push("n.resolved_at IS NOT NULL");
      else if (!opts.includeResolved) where.push("n.resolved_at IS NULL");
      if (opts.onlyUnread) where.push("n.read_at IS NULL");
      const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
      const offset = Math.max(0, opts.offset ?? 0);
      const rows = db
        .prepare(
          `SELECT n.*, u.username, COALESCE(a.yt_channel_title, a.channel_name) AS account_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.user_id
           LEFT JOIN accounts a ON a.id = n.account_id
           ${where.length ? "WHERE " + where.join(" AND ") : ""}
           ORDER BY (n.resolved_at IS NULL) DESC, n.last_seen_at DESC, n.id DESC
           LIMIT ? OFFSET ?`,
        )
        .all(...args, limit, offset) as Row[];
      return rows.map(rowToNotification);
    },
    notificationCounts(userId?: number): { open: number; unread: number; total: number } {
      const where = userId != null ? "WHERE user_id = ?" : "";
      const args = userId != null ? [userId] : [];
      const r = db
        .prepare(
          `SELECT
            SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN resolved_at IS NULL AND read_at IS NULL THEN 1 ELSE 0 END) AS unread,
            COUNT(*) AS total
           FROM notifications ${where}`,
        )
        .get(...args) as Row;
      return {
        open: Number(r.open) || 0,
        unread: Number(r.unread) || 0,
        total: Number(r.total) || 0,
      };
    },
    markNotificationRead(id: number): NotificationItem | null {
      db.prepare(
        "UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
      ).run(id);
      return this.getNotification(id);
    },
    markNotificationUnread(id: number): NotificationItem | null {
      db.prepare("UPDATE notifications SET read_at = NULL, updated_at = datetime('now') WHERE id = ?").run(id);
      return this.getNotification(id);
    },
    markAllNotificationsRead(userId?: number): number {
      const where = userId != null ? "WHERE user_id = ? AND resolved_at IS NULL" : "WHERE resolved_at IS NULL";
      const args = userId != null ? [userId] : [];
      const info = db
        .prepare(`UPDATE notifications SET read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') ${where}`)
        .run(...args);
      return Number(info.changes) || 0;
    },
    resolveNotification(id: number): NotificationItem | null {
      db.prepare(
        "UPDATE notifications SET resolved_at = COALESCE(resolved_at, datetime('now')), read_at = COALESCE(read_at, datetime('now')), updated_at = datetime('now') WHERE id = ?",
      ).run(id);
      return this.getNotification(id);
    },
    deleteNotification(id: number): boolean {
      const info = db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
      return (Number(info.changes) || 0) > 0;
    },
    // ---- Error log (self-cleaning: keeps last 7 days, capped at 1000 rows) ----
    addError(e: {
      source?: string;
      level?: string;
      message: string;
      detail?: string | null;
      context?: string | null;
      userId?: number | null;
    }): void {
      db.prepare(
        "INSERT INTO error_log (source, level, message, detail, context, user_id) VALUES (?,?,?,?,?,?)",
      ).run(
        e.source ?? "server",
        e.level ?? "error",
        String(e.message).slice(0, 2000),
        e.detail ? String(e.detail).slice(0, 8000) : null,
        e.context ? String(e.context).slice(0, 500) : null,
        e.userId ?? null,
      );
      db.prepare("DELETE FROM error_log WHERE created_at < datetime('now','-7 days')").run();
      db.prepare(
        "DELETE FROM error_log WHERE id NOT IN (SELECT id FROM error_log ORDER BY id DESC LIMIT 1000)",
      ).run();
    },
    listErrors(limit = 200): ErrorLogItem[] {
      const rows = db.prepare("SELECT * FROM error_log ORDER BY id DESC LIMIT 1000").all() as Row[];
      const groups = new Map<
        string,
        ErrorLogItem & { _contexts: Set<string>; _firstCreatedAt: string }
      >();
      for (const r of rows) {
        const key = [r.source, r.level, r.message].map((x) => String(x ?? "")).join("\u0000");
        let g = groups.get(key);
        if (!g) {
          g = { ...rowToError(r), count: 0, _contexts: new Set<string>(), _firstCreatedAt: r.created_at };
          groups.set(key, g);
        }
        g.count = (g.count ?? 0) + 1;
        g._firstCreatedAt = r.created_at;
        if (r.context) g._contexts.add(String(r.context));
      }
      return [...groups.values()].slice(0, Math.max(1, limit)).map((g) => {
        const contexts = [...g._contexts];
        const shown = contexts.slice(0, 8);
        const rest = contexts.length - shown.length;
        return {
          id: g.id,
          source: g.source,
          level: g.level,
          message: g.message,
          detail: g.detail,
          context: shown.length ? shown.join(", ") + (rest > 0 ? `, +${rest}` : "") : g.context,
          userId: g.userId,
          createdAt: g.createdAt,
          firstCreatedAt: g._firstCreatedAt,
          count: g.count,
        };
      });
    },
    errorCount(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM error_log").get() as Row;
      return Number(r.n) || 0;
    },
    // Errors logged within the last N hours (for the server-health page's "ошибок за 24ч").
    recentErrorCount(hours = 24): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM error_log WHERE created_at >= datetime('now', ?)")
        .get(`-${Math.max(1, Math.floor(hours))} hours`) as Row;
      return Number(r.n) || 0;
    },
    clearErrors(): void {
      db.prepare("DELETE FROM error_log").run();
    },
  };
}

export type Db = ReturnType<typeof openDb>;
