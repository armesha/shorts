// Auth users + sessions + Telegram linking + one-time password-reset codes. Method shorthand so
// createUser→this.getUserById resolves on the merged store.
import type { DatabaseSync } from "node:sqlite";
import { rowToUserAuth, type Row } from "./mappers.ts";
import type { UserAuth } from "./types.ts";

export function userMethods(db: DatabaseSync) {
  return {
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
    updateUserRole(id: number, role: "admin" | "user"): UserAuth | null {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      return this.getUserById(id);
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
  };
}
