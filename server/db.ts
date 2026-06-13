import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Account {
  id: number;
  userId: number | null;
  channelName: string;
  theme: string;
  lang: string;
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

type Row = Record<string, any>;

const rowToAccount = (r: Row): Account => ({
  id: r.id,
  userId: r.user_id ?? null,
  channelName: r.channel_name,
  theme: r.theme,
  lang: r.lang,
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

  return {
    db,
    listAccounts(): Account[] {
      return (db.prepare("SELECT * FROM accounts ORDER BY id").all() as Row[]).map(rowToAccount);
    },
    listAccountsByUser(userId: number): Account[] {
      return (
        db.prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY id").all(userId) as Row[]
      ).map(rowToAccount);
    },
    // One-time migration: existing channels (no owner) become the first admin's.
    assignOrphanAccounts(userId: number): void {
      db.prepare("UPDATE accounts SET user_id = ? WHERE user_id IS NULL").run(userId);
    },
    getAccount(id: number): Account | null {
      const r = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
      return r ? rowToAccount(r) : null;
    },
    createAccount(input: Partial<Account>): Account {
      const info = db
        .prepare(
          "INSERT INTO accounts (user_id, channel_name, theme, lang, schedule, template, status) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          input.userId ?? null,
          input.channelName ?? "Новый канал",
          input.theme ?? "",
          input.lang ?? "de",
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
        "UPDATE accounts SET channel_name=?, theme=?, lang=?, schedule=?, template=?, enabled=?, slot_videos=? WHERE id=?",
      ).run(
        input.channelName ?? cur.channelName,
        input.theme ?? cur.theme,
        input.lang ?? cur.lang,
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
    }): void {
      db.prepare(
        "INSERT INTO history (account_id, title, status, youtube_id, video_path, published_at) VALUES (?,?,?,?,?,?)",
      ).run(h.accountId, h.title, h.status, h.youtubeId ?? null, h.videoPath ?? null, h.publishedAt ?? null);
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
      }));
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
  };
}

export type Db = ReturnType<typeof openDb>;
