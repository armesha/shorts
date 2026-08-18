// ALL schema DDL in one place, applied IN THE EXACT ORDER it must run on every boot:
// CREATE TABLE block → additive ADD COLUMN + backfill UPDATEs → CREATE INDEX → legacy single-key→
// oauth_clients migration → PRAGMA user_version-gated v2 backfill. Everything here is additive &
// idempotent, so it self-applies on each open. Do NOT scatter CREATE TABLE per domain — keep it ordered.
import type { DatabaseSync } from "node:sqlite";
import { parseCredMeta, defaultClientLabel, type Row } from "./mappers.ts";

export function applySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_name TEXT NOT NULL DEFAULT 'Новый канал',
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
    CREATE TABLE IF NOT EXISTS upload_quota_reservations (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      oauth_client_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS library_reservations (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
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
      password_set INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'user',
      is_super_admin INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS user_feature_access (
      user_id INTEGER NOT NULL,
      feature TEXT NOT NULL,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, feature)
    );
    CREATE TABLE IF NOT EXISTS user_szz_study_state (
      user_id INTEGER PRIMARY KEY,
      state_json TEXT NOT NULL,
      state_updated_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_szz_flashcard_state (
      user_id INTEGER PRIMARY KEY,
      revision INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      state_updated_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS car_seat_bookings (
      namespace TEXT NOT NULL,
      car_id TEXT NOT NULL,
      seat_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (namespace, car_id, seat_id)
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
    CREATE TABLE IF NOT EXISTS user_telegram_preferences (
      user_id INTEGER PRIMARY KEY,
      post_success INTEGER NOT NULL DEFAULT 0,
      post_failures INTEGER NOT NULL DEFAULT 1,
      generation_done INTEGER NOT NULL DEFAULT 1,
      quota_warnings INTEGER NOT NULL DEFAULT 1,
      channel_alerts INTEGER NOT NULL DEFAULT 1,
      stats_digest TEXT NOT NULL DEFAULT 'weekly',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    CREATE TABLE IF NOT EXISTS content_decks (
      deck_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'builtin',
      lang TEXT,
      pre_fact INTEGER NOT NULL DEFAULT 0,
      long_video INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      source_hash TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS content_items (
      deck_id TEXT NOT NULL,
      item_index INTEGER NOT NULL,
      item_key TEXT NOT NULL,
      pack_no INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      chars INTEGER NOT NULL DEFAULT 0,
      video_file TEXT,
      payload_json TEXT NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (deck_id, item_index)
    );
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      owner_user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      deck_ids TEXT NOT NULL DEFAULT '[]',
      total INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS creator_gallery_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      pack_name TEXT NOT NULL DEFAULT '',
      template_type TEXT NOT NULL DEFAULT 'custom',
      card_index INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      narration TEXT DEFAULT '',
      format TEXT NOT NULL DEFAULT 'mp4',
      image_rel TEXT,
      video_rel TEXT,
      zip_rel TEXT,
      music TEXT NOT NULL DEFAULT 'none',
      duration_sec REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      author_id INTEGER,
      author_name TEXT NOT NULL DEFAULT '',
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
  db.prepare(
    "UPDATE accounts SET source_decks = json_array(lang) WHERE (source_decks IS NULL OR source_decks = '[]') AND TRIM(COALESCE(lang, '')) != ''",
  ).run();
  addColumn("accounts", "channel_lang TEXT DEFAULT ''");
  addColumn("accounts", "timezone TEXT DEFAULT ''");
  addColumn("accounts", "avatar TEXT");
  addColumn("accounts", "yt_channel_avatar TEXT");
  addColumn("accounts", "avatar_source TEXT NOT NULL DEFAULT 'random'");
  db.prepare("UPDATE accounts SET avatar_source = 'youtube' WHERE avatar LIKE 'http%'").run();
  db.prepare("UPDATE accounts SET avatar_source = 'manual' WHERE avatar LIKE '/files/avatars/%'").run();
  db.prepare(
    "UPDATE accounts SET avatar = yt_channel_avatar, avatar_source = 'youtube' WHERE yt_channel_avatar IS NOT NULL AND TRIM(yt_channel_avatar) != ''",
  ).run();
  addColumn("videos", "deck TEXT NOT NULL DEFAULT 'ru'");
  addColumn("videos", "tags TEXT NOT NULL DEFAULT ''"); // comma-separated per-video YouTube tags override ('' = deck tags)
  addColumn("accounts", "user_id INTEGER");
  addColumn("accounts", "oauth_client_id INTEGER"); // which uploaded Google key the channel is bound to
  addColumn("accounts", "auth_error TEXT"); // last OAuth/token rejection → channel surfaced as "needs reconnect"
  addColumn("accounts", "auth_failed_at TEXT"); // when that rejection first started (ISO)
  addColumn("users", "client_secret_json TEXT");
  addColumn("users", "password_set INTEGER NOT NULL DEFAULT 1");
  addColumn("users", "is_super_admin INTEGER NOT NULL DEFAULT 0");
  addColumn("users", "timezone TEXT DEFAULT ''");
  addColumn("channel_analytics_daily", "dislikes INTEGER NOT NULL DEFAULT 0");
  addColumn("history", "error TEXT");
  addColumn("history", "deck TEXT"); // deck a post was actually published with (old rows NULL → fall back to channel lang)
  addColumn("history", "oauth_client_id INTEGER"); // Google key used at upload time; fixed even if channel is rebound later
  db.prepare(
    "UPDATE history SET oauth_client_id = (SELECT oauth_client_id FROM accounts WHERE accounts.id = history.account_id) WHERE oauth_client_id IS NULL",
  ).run();
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
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_one_super_admin ON users(is_super_admin) WHERE is_super_admin = 1");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_account_published ON history(account_id, published_at);
    CREATE INDEX IF NOT EXISTS idx_history_account_id ON history(account_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_history_account_status_published ON history(account_id, status, published_at);
    CREATE INDEX IF NOT EXISTS idx_history_video_path ON history(video_path);
    CREATE INDEX IF NOT EXISTS idx_history_image_path ON history(image_path);
    CREATE INDEX IF NOT EXISTS idx_history_status_published ON history(status, published_at);
    CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at);
    CREATE INDEX IF NOT EXISTS idx_history_oauth_created ON history(oauth_client_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_upload_res_account_created ON upload_quota_reservations(account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_upload_res_key_created ON upload_quota_reservations(oauth_client_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_library_res_account_created ON library_reservations(account_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_videos_account ON videos(account_id);
    CREATE INDEX IF NOT EXISTS idx_videos_account_id_desc ON videos(account_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_videos_account_deck ON videos(account_id, deck);
    CREATE INDEX IF NOT EXISTS idx_videos_ready_any ON videos(account_id, post_count, last_posted_at, id);
    CREATE INDEX IF NOT EXISTS idx_videos_ready_deck ON videos(account_id, deck, post_count, last_posted_at, id);
    CREATE INDEX IF NOT EXISTS idx_videos_account_deck_bg ON videos(account_id, deck, bg);
    CREATE INDEX IF NOT EXISTS idx_videos_video_rel ON videos(video_rel);
    CREATE INDEX IF NOT EXISTS idx_videos_image_rel ON videos(image_rel);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_channel_stats_account_taken ON channel_stats(account_id, taken_at);
    CREATE INDEX IF NOT EXISTS idx_channel_stats_account_id ON channel_stats(account_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_channel_analytics_daily_date ON channel_analytics_daily(date);
    CREATE INDEX IF NOT EXISTS idx_channel_analytics_daily_date_account ON channel_analytics_daily(date, account_id);
    CREATE INDEX IF NOT EXISTS idx_report_cache_account_key_taken ON youtube_report_cache(account_id, report_key, taken_at);
    CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_last ON notifications(user_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_last_seen ON notifications(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_oauth_clients_user ON oauth_clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_oauth_client ON accounts(oauth_client_id);
    CREATE INDEX IF NOT EXISTS idx_content_items_deck_key ON content_items(deck_id, item_key);
    CREATE INDEX IF NOT EXISTS idx_content_decks_lang ON content_decks(lang);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_state_created ON generation_jobs(state, created_at);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_state ON generation_jobs(user_id, state);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_account_state ON generation_jobs(account_id, state);
    CREATE INDEX IF NOT EXISTS idx_creator_gallery_user_created ON creator_gallery_items(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_creator_gallery_user_type ON creator_gallery_items(user_id, template_type, id DESC);
    CREATE INDEX IF NOT EXISTS idx_creator_gallery_pack ON creator_gallery_items(pack_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC, id DESC);
  `);

  // Первый общий список перенесён из переписки Стаса и Армена. Вставляется только в совсем пустой список.
  db.exec(`
    INSERT INTO ideas (title, description, author_name)
    SELECT title, description, author_name
    FROM (
      SELECT 'Разборы популярных роликов' AS title, 'Делать собственный пересказ или разбор с оригинальным сценарием и реакцией, без перезалива чужого контента.' AS description, 'Стас' AS author_name
      UNION ALL SELECT 'Реакционный ИИ-аватар', 'Аватар реагирует на анекдоты и мемы; голос, эмоции и тайминг должны совпадать с роликом.', 'Стас'
      UNION ALL SELECT 'Анимационные ролики', 'Попробовать короткие смешные мультфильмы и отдельные анимированные форматы.', 'Стас'
      UNION ALL SELECT 'Дайджест за несколько часов', 'Собирать выжимку событий за 3–4 часа вокруг одного тезиса и выпускать её как один Shorts.', 'Стас'
      UNION ALL SELECT 'Конвейер локального производства', 'Подготовить поток производства контента на локальной машине и ставить ролики в очередь.', 'Стас'
      UNION ALL SELECT 'Единый промпт для полного ролика', 'Собрать один подробный запрос, который за запуск создаёт все нужные части ролика.', 'Стас'
      UNION ALL SELECT 'Новые шаблоны по теме и языку', 'Сделать стандарт: тема и язык вводятся один раз, после чего готовый шаблон сразу появляется на сайте.', 'Армен'
    )
    WHERE NOT EXISTS (SELECT 1 FROM ideas)
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
  const SCHEMA_VERSION = 3;
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
  // v3: long-video packs and their dedicated UI/API were retired. Remove stale grants, catalog rows,
  // channel settings and the two old feature ideas only after the old server process has stopped.
  if (schemaVersion < 3) {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM content_items WHERE deck_id LIKE 'long-%'").run();
      db.prepare("DELETE FROM content_decks WHERE deck_id LIKE 'long-%'").run();
      db.prepare("DELETE FROM videos WHERE deck LIKE 'long-%'").run();
      db.prepare("DELETE FROM user_granted_decks WHERE deck_id LIKE 'long-%'").run();
      db.prepare(
        "DELETE FROM ideas WHERE title IN ('Длинные видео с автоматической нарезкой', 'Контекстные Shorts в длинный ролик')",
      ).run();
      db.exec("DROP TABLE IF EXISTS user_granted_long_video_decks");
      const accountColumns = db.prepare("PRAGMA table_info(accounts)").all() as Row[];
      if (accountColumns.some((column) => column.name === "long_video_decks")) {
        db.exec("ALTER TABLE accounts DROP COLUMN long_video_decks");
      }
      db.exec("PRAGMA user_version = 3");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  if (schemaVersion < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
