// Auth users + sessions + Telegram linking + one-time password-reset codes. Method shorthand so
// createUser→this.getUserById resolves on the merged store.
import type { DatabaseSync } from "node:sqlite";
import { rowToUserAuth, type Row } from "./mappers.ts";
import type { TelegramDigestFrequency, TelegramPreferences, UserAuth } from "./types.ts";
import { normalizeUserRole, type UserRole } from "../auth.ts";

const TELEGRAM_DIGESTS = new Set<TelegramDigestFrequency>(["off", "daily", "weekly"]);
const DEFAULT_TELEGRAM_PREFERENCES: TelegramPreferences = {
  postSuccess: false,
  postFailures: true,
  generationDone: true,
  quotaWarnings: true,
  channelAlerts: true,
  statsDigest: "weekly",
};

function asBool(value: unknown, fallback: boolean): boolean {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

function asDigest(value: unknown, fallback: TelegramDigestFrequency): TelegramDigestFrequency {
  return TELEGRAM_DIGESTS.has(value as TelegramDigestFrequency) ? (value as TelegramDigestFrequency) : fallback;
}

function rowToTelegramPreferences(r?: Row): TelegramPreferences {
  return {
    postSuccess: asBool(r?.post_success, DEFAULT_TELEGRAM_PREFERENCES.postSuccess),
    postFailures: asBool(r?.post_failures, DEFAULT_TELEGRAM_PREFERENCES.postFailures),
    generationDone: asBool(r?.generation_done, DEFAULT_TELEGRAM_PREFERENCES.generationDone),
    quotaWarnings: asBool(r?.quota_warnings, DEFAULT_TELEGRAM_PREFERENCES.quotaWarnings),
    channelAlerts: asBool(r?.channel_alerts, DEFAULT_TELEGRAM_PREFERENCES.channelAlerts),
    statsDigest: asDigest(r?.stats_digest, DEFAULT_TELEGRAM_PREFERENCES.statsDigest),
  };
}

function normalizeTelegramPreferences(input: Partial<TelegramPreferences>, base: TelegramPreferences): TelegramPreferences {
  return {
    postSuccess: asBool(input.postSuccess, base.postSuccess),
    postFailures: asBool(input.postFailures, base.postFailures),
    generationDone: asBool(input.generationDone, base.generationDone),
    quotaWarnings: asBool(input.quotaWarnings, base.quotaWarnings),
    channelAlerts: asBool(input.channelAlerts, base.channelAlerts),
    statsDigest: asDigest(input.statsDigest, base.statsDigest),
  };
}

export function userMethods(db: DatabaseSync) {
  return {
    // ---- Auth: users & sessions ----
    countUsers(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row;
      return Number(r.n) || 0;
    },
    createUser(u: { username: string; passHash: string; role?: string; passwordSet?: boolean; isSuperAdmin?: boolean }): UserAuth {
      const role = normalizeUserRole(u.role);
      const info = db
        .prepare("INSERT INTO users (username, pass_hash, password_set, role, is_super_admin) VALUES (?,?,?,?,?)")
        .run(u.username, u.passHash, u.passwordSet === false ? 0 : 1, role, u.isSuperAdmin && role === "admin" ? 1 : 0);
      return this.getUserById(Number(info.lastInsertRowid))!;
    },
    updateUserRole(id: number, role: UserRole): UserAuth | null {
      const nextRole = normalizeUserRole(role);
      db.prepare("UPDATE users SET role = ?, is_super_admin = CASE WHEN ? = 'admin' THEN is_super_admin ELSE 0 END WHERE id = ?").run(
        nextRole,
        nextRole,
        id,
      );
      return this.getUserById(id);
    },
    setUserSuperAdmin(id: number, enabled: boolean): UserAuth | null {
      if (!this.getUserById(id)) return null;
      if (enabled) {
        db.exec("BEGIN");
        try {
          db.prepare("UPDATE users SET is_super_admin = 0 WHERE id <> ?").run(id);
          db.prepare("UPDATE users SET role = 'admin', is_super_admin = 1 WHERE id = ?").run(id);
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      } else {
        db.prepare("UPDATE users SET is_super_admin = 0 WHERE id = ?").run(id);
      }
      return this.getUserById(id);
    },
    getSuperAdminUser(): UserAuth | null {
      const r = db.prepare("SELECT * FROM users WHERE role = 'admin' AND is_super_admin = 1 ORDER BY id LIMIT 1").get() as
        | Row
        | undefined;
      return r ? rowToUserAuth(r) : null;
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
    setUserPassword(userId: number, passHash: string, passwordSet = true): void {
      db.prepare(
        "UPDATE users SET pass_hash = ?, password_set = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?",
      ).run(passHash, passwordSet ? 1 : 0, userId);
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
    getTelegramPreferences(userId: number): TelegramPreferences {
      const r = db.prepare("SELECT * FROM user_telegram_preferences WHERE user_id = ?").get(userId) as Row | undefined;
      return rowToTelegramPreferences(r);
    },
    updateTelegramPreferences(userId: number, input: Partial<TelegramPreferences>): TelegramPreferences {
      const next = normalizeTelegramPreferences(input, this.getTelegramPreferences(userId));
      db.prepare(
        "INSERT INTO user_telegram_preferences " +
          "(user_id, post_success, post_failures, generation_done, quota_warnings, channel_alerts, stats_digest, updated_at) " +
          "VALUES (?,?,?,?,?,?,?,datetime('now')) " +
          "ON CONFLICT(user_id) DO UPDATE SET " +
          "post_success=excluded.post_success, post_failures=excluded.post_failures, " +
          "generation_done=excluded.generation_done, quota_warnings=excluded.quota_warnings, " +
          "channel_alerts=excluded.channel_alerts, stats_digest=excluded.stats_digest, updated_at=datetime('now')",
      ).run(
        userId,
        next.postSuccess ? 1 : 0,
        next.postFailures ? 1 : 0,
        next.generationDone ? 1 : 0,
        next.quotaWarnings ? 1 : 0,
        next.channelAlerts ? 1 : 0,
        next.statsDigest,
      );
      return this.getTelegramPreferences(userId);
    },
  };
}
