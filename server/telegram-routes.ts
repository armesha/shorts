// Telegram login (Login Widget) + account binding + password recovery via the bot.
// Mounted from server/index.ts. The PUBLIC routes below are whitelisted in PUBLIC_API there;
// /bind, /unbind and /me stay behind the global session gate (req.userId is set for those).
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Db } from "./db.ts";
import { hashPassword, newSessionToken, SESSION_TTL_DAYS } from "./auth.ts";
import { verifyTelegramAuth, sendBotMessage, getBotUsername } from "./telegram.ts";

const DAY_MS = 86_400_000;
const RESET_TTL_MIN = 10; // a recovery code is valid for 10 minutes
const RESET_MAX_ATTEMPTS = 5; // wrong tries before the code is burned
const RESET_RESEND_SEC = 60; // min seconds between code requests for one account

interface Deps {
  // Reuse index.ts's cookie writer so session-cookie attributes stay defined in one place.
  setSessionCookie: (reply: { header(k: string, v: string): unknown }, token: string) => void;
}

const hashCode = (code: string, userId: number): string =>
  createHash("sha256").update(`${userId}:${code}`).digest("hex");

export function registerTelegramRoutes(app: FastifyInstance, db: Db, deps: Deps) {
  const botToken = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const enabled = () => !!botToken();

  function issueSession(reply: { header(k: string, v: string): unknown }, userId: number) {
    const token = newSessionToken();
    db.createSession(token, userId, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
    deps.setSessionCookie(reply, token);
  }

  // ---- Public: is Telegram login offered here, and under which bot @username? ----
  app.get("/api/auth/telegram/info", async () => {
    if (!enabled()) return { enabled: false, bot: null };
    return { enabled: true, bot: await getBotUsername(botToken()) };
  });

  // ---- Public: log in with a Telegram Login Widget payload ----
  app.post("/api/auth/telegram", async (req, reply) => {
    if (!enabled()) return reply.code(404).send({ error: "Telegram-вход не настроен" });
    const v = verifyTelegramAuth((req.body as Record<string, unknown>) ?? {}, botToken());
    if (!v.ok) return reply.code(401).send({ error: v.reason });
    const user = db.getUserByTelegramId(v.user.id);
    if (!user)
      return reply.code(403).send({
        error: "Этот Telegram ни к кому не привязан. Войдите паролем и привяжите его в Настройках.",
      });
    db.clearLock(user.id); // a valid Telegram auth also lifts a password-bruteforce lockout
    issueSession(reply, user.id);
    return { id: user.id, username: user.username, role: user.role };
  });

  // ---- Gated: bind the CURRENT account to a Telegram (widget payload, write access requested) ----
  app.post("/api/auth/telegram/bind", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!enabled()) return reply.code(404).send({ error: "Telegram-вход не настроен" });
    const v = verifyTelegramAuth((req.body as Record<string, unknown>) ?? {}, botToken());
    if (!v.ok) return reply.code(401).send({ error: v.reason });
    const existing = db.getUserByTelegramId(v.user.id);
    if (existing && existing.id !== userId)
      return reply.code(409).send({ error: "Этот Telegram уже привязан к другому аккаунту" });
    const label =
      (v.user.username && `@${v.user.username}`) ||
      [v.user.first_name, v.user.last_name].filter(Boolean).join(" ") ||
      v.user.id;
    db.setUserTelegram(userId, v.user.id, label);
    return { ok: true, username: label };
  });

  // ---- Gated: unbind the current account's Telegram ----
  app.post("/api/auth/telegram/unbind", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    db.setUserTelegram(userId, null, null);
    return { ok: true };
  });

  // ---- Gated: is the current account linked? (powers the Settings UI) ----
  app.get("/api/auth/telegram/me", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const u = db.getUserById(userId);
    return {
      enabled: enabled(),
      bot: enabled() ? await getBotUsername(botToken()) : null,
      linked: !!u?.telegramId,
      username: u?.telegramUsername ?? null,
    };
  });

  // ---- Public: start recovery — the bot DMs a one-time code (answers generically, no enumeration) ----
  app.post("/api/auth/recover/start", async (req) => {
    const generic = { ok: true };
    const username = String((req.body as { username?: string })?.username ?? "").trim();
    if (!enabled() || !username) return generic;
    const user = db.getUserByUsername(username);
    if (!user || !user.telegramId) return generic;

    // Resend cooldown: don't spam a new code if one was just issued.
    const existing = db.getPasswordReset(user.id);
    if (existing) {
      // SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" in UTC — normalise to a parseable ISO instant.
      const issuedMs = new Date(existing.createdAt.replace(" ", "T") + "Z").getTime();
      if ((Date.now() - issuedMs) / 1000 < RESET_RESEND_SEC) return generic;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    db.upsertPasswordReset(
      user.id,
      hashCode(code, user.id),
      new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString(),
    );
    const text =
      `🔐 Сброс пароля Shorts Factory\n\nКод: ${code}\nДействует ${RESET_TTL_MIN} минут.\n\n` +
      `Если вы не запрашивали сброс — просто проигнорируйте это сообщение.`;
    await sendBotMessage(botToken(), user.telegramId, text); // failure is swallowed → stay generic
    return generic;
  });

  // ---- Public: complete recovery — verify the code, set a new password ----
  app.post("/api/auth/recover/complete", async (req, reply) => {
    const b = (req.body as { username?: string; code?: string; newPassword?: string }) ?? {};
    const username = String(b.username ?? "").trim();
    const code = String(b.code ?? "").trim();
    const next = String(b.newPassword ?? "");
    if (!username || !code || !next) return reply.code(400).send({ error: "Заполните все поля" });
    if (next.length < 6) return reply.code(400).send({ error: "Новый пароль — минимум 6 символов" });

    const user = db.getUserByUsername(username);
    const rec = user ? db.getPasswordReset(user.id) : null;
    if (!user || !rec) return reply.code(400).send({ error: "Неверный код или срок действия истёк" });
    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      db.deletePasswordReset(user.id);
      return reply.code(400).send({ error: "Срок действия кода истёк — запросите новый" });
    }
    if (rec.attempts >= RESET_MAX_ATTEMPTS) {
      db.deletePasswordReset(user.id);
      return reply.code(429).send({ error: "Слишком много попыток — запросите новый код" });
    }
    const expected = Buffer.from(rec.codeHash, "hex");
    const got = Buffer.from(hashCode(code, user.id), "hex");
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      const left = RESET_MAX_ATTEMPTS - db.bumpPasswordResetAttempts(user.id);
      return reply.code(400).send({ error: `Неверный код. Осталось попыток: ${Math.max(0, left)}` });
    }
    db.setUserPassword(user.id, hashPassword(next)); // also clears any lockout
    db.deletePasswordReset(user.id);
    return { ok: true };
  });
}
