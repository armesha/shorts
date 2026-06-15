import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
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
  takenAt: r.taken_at,
});

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
    CREATE TABLE IF NOT EXISTS used_anecdotes (
      key TEXT PRIMARY KEY,
      used_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      taken_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);

  for (const col of ["yt_refresh_token", "yt_channel_id", "yt_channel_title"]) {
    try {
      db.exec(`ALTER TABLE accounts ADD COLUMN ${col} TEXT`);
    } catch {
      /* column already exists */
    }
  }
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN slot_videos TEXT DEFAULT '{}'");
  } catch {
    /* column already exists */
  }
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN channel_lang TEXT DEFAULT ''");
  } catch {
    /* column already exists */
  }
  try {
    db.exec("ALTER TABLE videos ADD COLUMN deck TEXT NOT NULL DEFAULT 'ru'");
  } catch {
    /* column already exists */
  }
  try {
    db.exec("ALTER TABLE accounts ADD COLUMN user_id INTEGER");
  } catch {
    /* column already exists */
  }
  try {
    db.exec("ALTER TABLE users ADD COLUMN client_secret_json TEXT");
  } catch {
    /* column already exists (or fresh users table) */
  }
  try {
    db.exec("ALTER TABLE history ADD COLUMN error TEXT");
  } catch {
    /* column already exists */
  }
  for (const col of ["telegram_id", "telegram_username"]) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT`);
    } catch {
      /* column already exists */
    }
  }
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL",
    );
  } catch {
    /* older SQLite without partial indexes — binding still works, uniqueness just not DB-enforced */
  }

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
          "INSERT INTO accounts (user_id, channel_name, theme, lang, channel_lang, schedule, template, status) VALUES (?,?,?,?,?,?,?,?)",
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
        );
      return this.getAccount(Number(info.lastInsertRowid))!;
    },
    updateAccount(id: number, input: Partial<Account>): Account | null {
      const cur = this.getAccount(id);
      if (!cur) return null;
      db.prepare(
        "UPDATE accounts SET channel_name=?, theme=?, lang=?, channel_lang=?, schedule=?, template=?, enabled=?, slot_videos=? WHERE id=?",
      ).run(
        input.channelName ?? cur.channelName,
        input.theme ?? cur.theme,
        input.lang ?? cur.lang,
        input.channelLang ?? cur.channelLang,
        JSON.stringify(input.schedule ?? cur.schedule),
        input.template ?? cur.template,
        (input.enabled ?? cur.enabled) ? 1 : 0,
        JSON.stringify(input.slotVideos ?? cur.slotVideos),
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
      return (db.prepare(sql).all(...args, limit, offset) as Row[]).map((r) => ({
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
      return (db.prepare(sql).get(...args) as { n: number }).n;
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
    // One-time migration: copy the old GLOBAL used-marks into a user's per-user set (admin).
    migrateGlobalUsedTo(userId: number): void {
      try {
        db.prepare(
          "INSERT OR IGNORE INTO user_used_anecdotes (user_id, key) SELECT ?, key FROM used_anecdotes",
        ).run(userId);
      } catch {
        /* old global table missing — nothing to migrate */
      }
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
    }): ChannelSnapshot {
      const info = db
        .prepare(
          "INSERT INTO channel_stats (account_id, subscribers, views, videos) VALUES (?,?,?,?)",
        )
        .run(s.accountId, s.subscribers, s.views, s.videos);
      const r = db
        .prepare("SELECT * FROM channel_stats WHERE id = ?")
        .get(Number(info.lastInsertRowid)) as Row;
      return rowToSnapshot(r);
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
