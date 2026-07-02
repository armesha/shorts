// Telegram via the BOT (no Login Widget): bind/login by pressing Start in @bot, plus password
// recovery codes. The bot is event-driven — Telegram PUSHES /start to /api/telegram/webhook; the
// browser only polls a tiny status endpoint while the user is on the "waiting" screen (bounded).
// Public routes here are whitelisted in PUBLIC_API in index.ts; bind/* + me + unbind stay gated.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Db, Account } from "../db.ts";
import type { ClientCreds } from "../services/youtube.ts";
import type { RefreshHooks, SnapshotAnalyticsFields } from "../services/stats-refresh.ts";
import { hashPassword, isSuperAdminUser, newSessionToken, SESSION_TTL_DAYS } from "../auth.ts";
import { sendBotMessage, getBotUsername, setBotWebhook, botStartLink, setBotCommands } from "../telegram.ts";
import { makeBotStats, type BotCallbackQuery } from "../services/telegram-stats.ts";
import { COMMERCIAL_CREATOR_FEATURE } from "../services/creator-assets.ts";
import { grantDefaultRegisteredUserDecks } from "../services/default-user-decks.ts";

const DAY_MS = 86_400_000;
const LINK_TTL_MIN = 10; // a bot-handshake token is valid 10 min
const RESET_TTL_MIN = 10; // a recovery code is valid 10 min
const RESET_MAX_ATTEMPTS = 5;
const RESET_RESEND_SEC = 60;
const MIN_PASSWORD_LEN = 3;

interface Deps {
  // Reuse index.ts's cookie writer so session-cookie attributes live in one place.
  setSessionCookie: (reply: { header(k: string, v: string): unknown }, token: string) => void;
  // ---- For the in-bot stats menu: index.ts hands over the per-account refresh ingredients so the
  // bot and the /api/stats/refresh route share one code path (same TTL cache, same notifications). ----
  accountCreds: (account: Account) => ClientCreds | null;
  redirectUri: string;
  analyticsRange: (days: number) => { from: string; to: string };
  summarizeStored: (accountId: number, from: string, to: string) => SnapshotAnalyticsFields;
  formatStatsError: (err: unknown) => string;
  refreshHooks: RefreshHooks;
}

interface TgFrom {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}
interface TgMessage {
  text?: string;
  from?: TgFrom;
  chat?: { id?: number };
}
interface TgUpdate {
  message?: TgMessage;
  callback_query?: BotCallbackQuery;
}

const hashCode = (code: string, userId: number) =>
  createHash("sha256").update(`${userId}:${code}`).digest("hex");
// SQLite datetime('now') is "YYYY-MM-DD HH:MM:SS" UTC → age in seconds.
const ageSec = (createdAt: string) =>
  (Date.now() - new Date(createdAt.replace(" ", "T") + "Z").getTime()) / 1000;
const tgLabel = (f?: TgFrom) =>
  f?.username ? `@${f.username}` : [f?.first_name, f?.last_name].filter(Boolean).join(" ") || String(f?.id ?? "");
const authUser = (user: NonNullable<ReturnType<Db["getUserById"]>>) => ({
  id: user.id,
  username: user.username,
  role: user.role,
  isSuperAdmin: isSuperAdminUser(user),
  passwordSet: user.passwordSet,
});

function cleanUsernamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 28);
}

function defaultTelegramUsername(db: Db, from: TgFrom | undefined, tgId: string): string {
  const raw = from?.username || [from?.first_name, from?.last_name].filter(Boolean).join("_") || tgId;
  const base = cleanUsernamePart(`tg_${raw}`) || `tg_${tgId}`;
  for (let i = 0; i < 500; i++) {
    const candidate = i === 0 ? base : `${base}_${i}`;
    if (!db.getUserByUsername(candidate)) return candidate.slice(0, 32);
  }
  return `tg_${tgId}_${randomBytes(3).toString("hex")}`.slice(0, 32);
}

export function registerTelegramRoutes(app: FastifyInstance, db: Db, deps: Deps) {
  const botToken = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const enabled = () => !!botToken();
  const webhookSecret = () => createHash("sha256").update(botToken() + ":webhook").digest("hex").slice(0, 40);

  // The in-bot channel-statistics menu (list → card → refresh). Shares the per-account refresh path
  // with /api/stats/refresh via the injected deps, so behaviour/caching/notifications stay identical.
  const botStats = makeBotStats({
    db,
    botToken,
    accountCreds: deps.accountCreds,
    redirectUri: deps.redirectUri,
    analyticsRange: deps.analyticsRange,
    summarizeStored: deps.summarizeStored,
    formatStatsError: deps.formatStatsError,
    refreshHooks: deps.refreshHooks,
  });

  // Register the webhook on boot so Telegram pushes updates to us (needs a public HTTPS URL).
  void (async () => {
    if (!enabled()) return;
    // Show «/stats» in the bot's command menu (independent of the webhook — works even without a base URL).
    await setBotCommands(botToken(), [{ command: "stats", description: "📊 Статистика каналов" }]);
    const base = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!base) {
      app.log.warn("[telegram] PUBLIC_BASE_URL not set — bot webhook NOT registered (bot login/bind/stats won't work; password recovery still does)");
      return;
    }
    const url = `${base}/api/telegram/webhook`;
    const r = await setBotWebhook(botToken(), url, webhookSecret());
    if (r.ok) app.log.info(`[telegram] webhook set → ${url}`);
    else app.log.error(`[telegram] setWebhook failed: ${r.error}`);
  })();

  function issueSession(reply: { header(k: string, v: string): unknown }, userId: number) {
    const token = newSessionToken();
    db.createSession(token, userId, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
    deps.setSessionCookie(reply, token);
  }

  // ---- Public: is Telegram offered here + bot @username ----
  app.get("/api/auth/telegram/info", async () => {
    if (!enabled()) return { enabled: false, bot: null };
    return { enabled: true, bot: await getBotUsername(botToken()) };
  });

  // ---- Gated: current account's link status (powers Settings) ----
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

  // ---- Gated: start binding via the bot → returns a t.me deep link to press Start ----
  app.post("/api/auth/telegram/bind/start", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!enabled()) return reply.code(404).send({ error: "Telegram не настроен" });
    const bot = await getBotUsername(botToken());
    if (!bot) return reply.code(500).send({ error: "Не удалось определить бота" });
    const token = randomBytes(24).toString("hex");
    db.createTelegramLink(token, "bind", userId);
    return { token, url: botStartLink(bot, token), bot };
  });

  // ---- Gated: poll binding status ----
  app.get("/api/auth/telegram/bind/status", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const token = String((req.query as { token?: string })?.token ?? "");
    const link = token ? db.getTelegramLink(token) : null;
    if (!link || link.userId !== userId || link.purpose !== "bind") return { status: "notfound" };
    if (link.status === "consumed") return { status: "linked", username: link.telegramUsername };
    if (link.status === "conflict") return { status: "conflict" };
    if (ageSec(link.createdAt) > LINK_TTL_MIN * 60) return { status: "expired" };
    return { status: "pending" };
  });

  // ---- Gated: unbind ----
  app.post("/api/auth/telegram/unbind", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    db.setUserTelegram(userId, null, null);
    return { ok: true };
  });

  // ---- Public: start login via the bot ----
  app.post("/api/auth/telegram/login/start", async (req, reply) => {
    if (!enabled()) return reply.code(404).send({ error: "Telegram не настроен" });
    const bot = await getBotUsername(botToken());
    if (!bot) return reply.code(500).send({ error: "Не удалось определить бота" });
    const token = randomBytes(24).toString("hex");
    db.createTelegramLink(token, "login", null);
    return { token, url: botStartLink(bot, token), bot };
  });

  // ---- Public: start registration via the bot ----
  app.post("/api/auth/telegram/register/start", async (req, reply) => {
    if (!enabled()) return reply.code(404).send({ error: "Telegram не настроен" });
    const bot = await getBotUsername(botToken());
    if (!bot) return reply.code(500).send({ error: "Не удалось определить бота" });
    const token = randomBytes(24).toString("hex");
    db.createTelegramLink(token, "register", null);
    return { token, url: botStartLink(bot, token), bot };
  });

  // ---- Public: poll login status; on success issue the session cookie ----
  app.get("/api/auth/telegram/login/status", async (req, reply) => {
    const token = String((req.query as { token?: string })?.token ?? "");
    const link = token ? db.getTelegramLink(token) : null;
    if (!link || link.purpose !== "login") return { status: "notfound" };
    if (link.status === "nomatch") return { status: "nomatch" };
    if (link.status === "ready" && link.userId) {
      const user = db.getUserById(link.userId);
      db.deleteTelegramLink(token); // single use
      if (!user) return { status: "nomatch" };
      db.clearLock(user.id);
      issueSession(reply, user.id);
      return { status: "ok", user: authUser(user) };
    }
    if (ageSec(link.createdAt) > LINK_TTL_MIN * 60) return { status: "expired" };
    return { status: "pending" };
  });

  // ---- Public: poll registration status; on success issue the session cookie ----
  app.get("/api/auth/telegram/register/status", async (req, reply) => {
    const token = String((req.query as { token?: string })?.token ?? "");
    const link = token ? db.getTelegramLink(token) : null;
    if (!link || link.purpose !== "register") return { status: "notfound" };
    if (link.status === "conflict") return { status: "conflict" };
    if (link.status === "ready" && link.userId) {
      const user = db.getUserById(link.userId);
      db.deleteTelegramLink(token); // single use
      if (!user) return { status: "conflict" };
      db.clearLock(user.id);
      issueSession(reply, user.id);
      return { status: "ok", user: authUser(user) };
    }
    if (ageSec(link.createdAt) > LINK_TTL_MIN * 60) return { status: "expired" };
    return { status: "pending" };
  });

  // ---- Public: Telegram webhook — receives bot updates: /start <token>, /stats, button taps ----
  app.post("/api/telegram/webhook", async (req, reply) => {
    if (!enabled()) return reply.code(404).send({ ok: false });
    const secret = (req.headers["x-telegram-bot-api-secret-token"] as string) || "";
    // constant-time compare of the secret
    const a = Buffer.from(secret);
    const b = Buffer.from(webhookSecret());
    if (a.length !== b.length || !timingSafeEqual(a, b)) return reply.code(401).send({ ok: false });
    // Handle in the background and 200 immediately: a stats refresh can take several seconds and
    // Telegram retries the webhook if we don't answer fast. The handler acks its own callback query.
    void handleUpdate(req.body as TgUpdate).catch((e) => app.log.error(e, "[telegram] webhook handler failed"));
    return { ok: true }; // always 200 so Telegram doesn't retry-storm
  });

  async function handleUpdate(update: TgUpdate) {
    if (update?.callback_query) return void (await botStats.callback(update.callback_query));
    if (update?.message) return void (await handleMessage(update.message));
  }

  async function handleMessage(msg: TgMessage) {
    const text = (msg.text ?? "").trim();
    const chatId = msg.chat?.id;
    const tgId = msg.from?.id != null ? String(msg.from.id) : "";
    const label = tgLabel(msg.from);
    const dm = (t: string) => (chatId != null ? sendBotMessage(botToken(), chatId, t) : Promise.resolve({ ok: false }));

    // /stats or a bare /start → open the in-bot statistics menu (it handles linked vs not-linked).
    if (text.startsWith("/stats")) return void (await botStats.entry(msg));
    if (!text.startsWith("/start")) return;
    const token = text.slice("/start".length).trim();
    if (!token) return void (await botStats.entry(msg));

    // ---- /start <token>: site-minted handshake for account binding / login (unchanged) ----
    const link = db.getTelegramLink(token);
    if (!link || !tgId || link.status === "consumed" || ageSec(link.createdAt) > LINK_TTL_MIN * 60) {
      await dm("Ссылка устарела или недействительна. Вернитесь на сайт и начните заново.");
      return;
    }

    if (link.purpose === "bind") {
      if (link.userId == null) return;
      const existing = db.getUserByTelegramId(tgId);
      if (existing && existing.id !== link.userId) {
        db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "conflict" });
        await dm("Этот Telegram уже привязан к другому аккаунту.");
        return;
      }
      db.setUserTelegram(link.userId, tgId, label);
      db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "consumed" });
      await dm("✅ Telegram привязан. Теперь можно входить через Telegram и получать здесь коды для сброса пароля.");
      return;
    }

    if (link.purpose === "login") {
      const user = db.getUserByTelegramId(tgId);
      if (!user) {
        db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "nomatch" });
        await dm("Этот Telegram не привязан ни к одному аккаунту. Войдите паролем и привяжите его в Настройках.");
        return;
      }
      db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "ready", userId: user.id });
      await dm("✅ Вход подтверждён. Вернитесь на сайт — вы уже авторизованы.");
      return;
    }

    if (link.purpose === "register") {
      const existing = db.getUserByTelegramId(tgId);
      if (existing) {
        db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "ready", userId: existing.id });
        await dm("✅ Этот Telegram уже привязан к аккаунту. Вернитесь на сайт — вход подтверждён.");
        return;
      }
      const username = defaultTelegramUsername(db, msg.from, tgId);
      const user = db.createUser({
        username,
        passHash: hashPassword(randomBytes(32).toString("hex")),
        role: "user",
        passwordSet: false,
      });
      db.setFeature(user.id, COMMERCIAL_CREATOR_FEATURE, true);
      grantDefaultRegisteredUserDecks(db, user.id);
      db.setUserTelegram(user.id, tgId, label);
      db.updateTelegramLink(token, { telegramId: tgId, telegramUsername: label, chatId: String(chatId ?? ""), status: "ready", userId: user.id });
      await dm(`✅ Аккаунт создан: ${username}\n\nПароль не нужен. Если захотите входить по паролю — установите его в настройках.`);
      return;
    }
  }

  // ---- Public: start password recovery — the bot DMs a one-time code (generic response) ----
  app.post("/api/auth/recover/start", async (req) => {
    const generic = { ok: true };
    const username = String((req.body as { username?: string })?.username ?? "").trim();
    if (!enabled() || !username) return generic;
    const user = db.getUserByUsername(username);
    if (!user || !user.telegramId) return generic;

    const existing = db.getPasswordReset(user.id);
    if (existing && ageSec(existing.createdAt) < RESET_RESEND_SEC) return generic; // resend cooldown

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    db.upsertPasswordReset(
      user.id,
      hashCode(code, user.id),
      new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString(),
    );
    await sendBotMessage(
      botToken(),
      user.telegramId,
      `🔐 Сброс пароля Shorts Factory\n\nКод: ${code}\nДействует ${RESET_TTL_MIN} минут.\n\nЕсли вы не запрашивали сброс — просто проигнорируйте это сообщение.`,
    );
    return generic;
  });

  // ---- Public: complete recovery — verify code, set new password ----
  app.post("/api/auth/recover/complete", async (req, reply) => {
    const b = (req.body as { username?: string; code?: string; newPassword?: string }) ?? {};
    const username = String(b.username ?? "").trim();
    const code = String(b.code ?? "").trim();
    const next = String(b.newPassword ?? "");
    if (!username || !code || !next) return reply.code(400).send({ error: "Заполните все поля" });
    if (next.length < MIN_PASSWORD_LEN) return reply.code(400).send({ error: "Новый пароль — минимум 3 символа" });

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
    db.setUserPassword(user.id, hashPassword(next));
    db.deletePasswordReset(user.id);
    return { ok: true };
  });
}
