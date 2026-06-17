import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

export interface Account {
  id: number;
  userId: number | null;
  channelName: string;
  theme: string;
  lang: string; // выбор КОНТЕНТА канала: встроенная дека (ru/de/…) или пак ("pack:<id>")
  channelLang: string; // ЯЗЫК канала (ru/de/it/fr/en/ar) — стабилен; пак должен совпадать по языку
  schedule: string[];
  template: string;
  status: string;
  enabled: boolean;
  uploadsToday: number;
  createdAt: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  slotVideos: Record<string, number>;
  avatar: string | null; // channel avatar URL (built-in "/avatars/av-XXX.png" or custom "/files/avatars/..."); null = none
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
}

type Row = Record<string, any>;

const rowToAccount = (r: Row): Account => ({
  id: r.id,
  userId: r.user_id ?? null,
  channelName: r.channel_name,
  theme: r.theme,
  lang: r.lang,
  channelLang: r.channel_lang ?? "",
  schedule: JSON.parse(r.schedule),
  template: r.template,
  status: r.yt_refresh_token ? "connected" : r.status || "needs_auth",
  enabled: !!r.enabled,
  uploadsToday: 0, // wired to history once the pipeline runs
  createdAt: r.created_at,
  ytChannelTitle: r.yt_channel_title ?? null,
  ytChannelId: r.yt_channel_id ?? null,
  slotVideos: JSON.parse(r.slot_videos || "{}"),
  avatar: r.avatar ?? null,
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
    CREATE TABLE IF NOT EXISTS user_hidden_decks (
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
  addColumn("accounts", "channel_lang TEXT DEFAULT ''");
  addColumn("accounts", "avatar TEXT");
  addColumn("videos", "deck TEXT NOT NULL DEFAULT 'ru'");
  addColumn("accounts", "user_id INTEGER");
  addColumn("users", "client_secret_json TEXT");
  addColumn("channel_analytics_daily", "dislikes INTEGER NOT NULL DEFAULT 0");
  addColumn("history", "error TEXT");
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
  `);

  // Schema version stamp. Everything above is additive & idempotent, so it self-applies on every boot.
  // For a FUTURE non-additive change (rename/drop/type/constraint), gate it on this version, e.g.:
  //   if (schemaVersion < 2) { db.exec("BEGIN; <migration>; PRAGMA user_version = 2; COMMIT;"); }
  const SCHEMA_VERSION = 1;
  const schemaVersion = (db.prepare("PRAGMA user_version").get() as { user_version?: number })?.user_version ?? 0;
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
      const info = db
        .prepare(
          "INSERT INTO accounts (user_id, channel_name, theme, lang, channel_lang, schedule, template, status, avatar) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          input.userId ?? null,
          input.channelName ?? "Новый канал",
          input.theme ?? "",
          input.lang ?? "de",
          input.channelLang ?? input.lang ?? "de",
          JSON.stringify(input.schedule ?? ["12:00"]),
          input.template ?? "1 · Kraft Paper",
          input.status ?? "needs_auth",
          input.avatar ?? null,
        );
      return this.getAccount(Number(info.lastInsertRowid))!;
    },
    updateAccount(id: number, input: Partial<Account>): Account | null {
      const cur = this.getAccount(id);
      if (!cur) return null;
      db.prepare(
        "UPDATE accounts SET channel_name=?, theme=?, lang=?, channel_lang=?, schedule=?, template=?, enabled=?, slot_videos=?, avatar=? WHERE id=?",
      ).run(
        input.channelName ?? cur.channelName,
        input.theme ?? cur.theme,
        input.lang ?? cur.lang,
        input.channelLang ?? cur.channelLang,
        JSON.stringify(input.schedule ?? cur.schedule),
        input.template ?? cur.template,
        (input.enabled ?? cur.enabled) ? 1 : 0,
        JSON.stringify(input.slotVideos ?? cur.slotVideos),
        input.avatar ?? cur.avatar,
        id,
      );
      return this.getAccount(id);
    },
    deleteAccount(id: number): void {
      db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    },
    setYouTube(
      id: number,
      d: { refreshToken: string | null; channelId: string | null; channelTitle: string | null },
    ): void {
      db.prepare(
        "UPDATE accounts SET yt_refresh_token=?, yt_channel_id=?, yt_channel_title=? WHERE id=?",
      ).run(d.refreshToken, d.channelId, d.channelTitle, id);
    },
    getRefreshToken(id: number): string | null {
      const r = db.prepare("SELECT yt_refresh_token FROM accounts WHERE id = ?").get(id) as Row | undefined;
      return (r?.yt_refresh_token as string) ?? null;
    },
    addHistory(h: {
      accountId: number;
      title: string;
      status: string;
      youtubeId?: string | null;
      videoPath?: string | null;
      publishedAt?: string | null;
      error?: string | null;
    }): void {
      db.prepare(
        "INSERT INTO history (account_id, title, status, youtube_id, video_path, published_at, error) VALUES (?,?,?,?,?,?,?)",
      ).run(
        h.accountId,
        h.title,
        h.status,
        h.youtubeId ?? null,
        h.videoPath ?? null,
        h.publishedAt ?? null,
        h.error ?? null,
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
    listHistoryFiltered(opts: { ownerId?: number; accountId?: number; limit?: number; offset?: number } = {}): HistoryItem[] {
      const where: string[] = [];
      const args: unknown[] = [];
      if (opts.accountId != null) {
        where.push("h.account_id = ?");
        args.push(opts.accountId);
      } else if (opts.ownerId != null) {
        where.push("a.user_id = ?");
        args.push(opts.ownerId);
      }
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
    countHistoryFiltered(opts: { ownerId?: number; accountId?: number } = {}): number {
      const where: string[] = [];
      const args: unknown[] = [];
      if (opts.accountId != null) {
        where.push("h.account_id = ?");
        args.push(opts.accountId);
      } else if (opts.ownerId != null) {
        where.push("a.user_id = ?");
        args.push(opts.ownerId);
      }
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
    // Decks each user actually USES = languages of their channels + decks of their library videos.
    usedDecksByUser(): Record<number, string[]> {
      const sets: Record<number, Set<string>> = {};
      const add = (u: number, d: string) => {
        if (u == null || !d) return;
        (sets[u] ??= new Set<string>()).add(d);
      };
      for (const r of db.prepare("SELECT user_id, lang FROM accounts WHERE user_id IS NOT NULL").all() as Row[])
        add(r.user_id as number, r.lang as string);
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
    // Used to cap a user at ≤100 scheduled posts per 24h.
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
    // Posted (uploaded to YouTube) count per user per deck (by the channel's current language).
    postedByUserDeck(): Record<number, Record<string, number>> {
      const out: Record<number, Record<string, number>> = {};
      const rows = db
        .prepare(
          "SELECT a.user_id AS uid, a.lang AS deck, COUNT(*) AS n FROM history h JOIN accounts a ON a.id = h.account_id " +
            "WHERE a.user_id IS NOT NULL AND h.youtube_id IS NOT NULL AND h.youtube_id <> '' GROUP BY a.user_id, a.lang",
        )
        .all() as Row[];
      for (const r of rows) {
        const uid = r.uid as number;
        (out[uid] ??= {})[r.deck as string] = r.n as number;
      }
      return out;
    },
    // Per-user Google client_secret JSON (uploaded in Settings). Never sent back to the frontend.
    getUserClientSecret(userId: number): string | null {
      const r = db.prepare("SELECT client_secret_json FROM users WHERE id = ?").get(userId) as Row | undefined;
      return (r?.client_secret_json as string) ?? null;
    },
    setUserClientSecret(userId: number, json: string | null): void {
      db.prepare("UPDATE users SET client_secret_json = ? WHERE id = ?").run(json, userId);
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
      return (db.prepare("SELECT * FROM error_log ORDER BY id DESC LIMIT ?").all(limit) as Row[]).map(
        rowToError,
      );
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
