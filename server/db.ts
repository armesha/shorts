import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Account {
  id: number;
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

type Row = Record<string, any>;

const rowToAccount = (r: Row): Account => ({
  id: r.id,
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

  return {
    db,
    listAccounts(): Account[] {
      return (db.prepare("SELECT * FROM accounts ORDER BY id").all() as Row[]).map(rowToAccount);
    },
    getAccount(id: number): Account | null {
      const r = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
      return r ? rowToAccount(r) : null;
    },
    createAccount(input: Partial<Account>): Account {
      const info = db
        .prepare(
          "INSERT INTO accounts (channel_name, theme, lang, schedule, template, status) VALUES (?,?,?,?,?,?)",
        )
        .run(
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
    // Next never-posted video (FIFO) — for the post-once queue (each video uploaded exactly once).
    nextUnpostedVideo(accountId: number): Video | null {
      const r = db
        .prepare("SELECT * FROM videos WHERE account_id = ? AND post_count = 0 ORDER BY id ASC LIMIT 1")
        .get(accountId) as Row | undefined;
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
    // Used anecdotes: once an anecdote becomes a saved/auto-posted video, its key lands here
    // so randomAnecdote() never picks it again (per-install state — not shipped content).
    markAnecdoteUsed(key: string): void {
      db.prepare("INSERT INTO used_anecdotes (key) VALUES (?) ON CONFLICT(key) DO NOTHING").run(key);
    },
    usedAnecdoteKeys(): Set<string> {
      const rows = db.prepare("SELECT key FROM used_anecdotes").all() as Row[];
      return new Set(rows.map((r) => r.key as string));
    },
    usedAnecdoteCount(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM used_anecdotes").get() as Row;
      return Number(r.n) || 0;
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
  };
}

export type Db = ReturnType<typeof openDb>;
