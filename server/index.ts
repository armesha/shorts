import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { unlinkSync, readFileSync, existsSync } from "node:fs";
import { loadBaseConfig, resolveClientSecretFile, credsFileExists } from "./config.ts";
import { openDb, type Account } from "./db.ts";
import { randomAnecdote, libraryStats, anecdoteKey } from "../src/anecdotes/library.ts";
import { DECKS, getDeck, ytMeta, pickGenericTitle } from "../src/anecdotes/decks.ts";
import { renderAnecdote, listBackgrounds } from "../src/anecdotes/render.ts";
import { assembleStillVideo, listAudio, audioPathFor, pickIslamicAudio } from "../src/video.ts";
import {
  buildAuthUrl,
  exchangeAndGetChannel,
  uploadShort,
  parseCreds,
  type ClientCreds,
} from "./youtube.ts";
import { startScheduler } from "./scheduler.ts";
import * as metrics from "./metrics.ts";
import { fetchChannelStats } from "./stats.ts";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  SESSION_TTL_DAYS,
} from "./auth.ts";
import { registerPasswordRoutes } from "./password-routes.ts";
import { registerPsychCardsRoutes } from "./psych-cards-routes.ts";
import { initGenQueue, enqueue as genEnqueue, jobStatus as genJobStatus, cancelJob as genCancelJob } from "./gen-queue.ts";

const base = loadBaseConfig();
const db = openDb(base.dbPath);

const credsPath = (): string => resolveClientSecretFile(db.getSetting("googleClientSecretFile"));

// ---- Seed users (idempotent — creates each only if missing, never clobbers a password) ----
function ensureUser(username: string, password: string, role: string) {
  const u = username.trim();
  if (!u || !password) return;
  if (db.getUserByUsername(u)) return;
  db.createUser({ username: u, passHash: hashPassword(password), role });
  console.log(`[auth] Seeded ${role} "${u}".`);
}
ensureUser(process.env.ADMIN_USERNAME ?? "", process.env.ADMIN_PASSWORD ?? "", "admin");
for (const entry of (process.env.SEED_USERS ?? "").split(",")) {
  const t = entry.trim();
  const idx = t.indexOf(":");
  if (idx > 0) ensureUser(t.slice(0, idx), t.slice(idx + 1), "user");
}
if (db.countUsers() === 0)
  console.warn("[auth] No users seeded — set ADMIN_USERNAME/ADMIN_PASSWORD in .env, then restart.");

// ---- One-time migrations: all pre-existing data belongs to the first admin ----
const firstAdmin = db.listUsers().find((u) => u.role === "admin") ?? db.listUsers()[0] ?? null;
if (firstAdmin) {
  db.assignOrphanAccounts(firstAdmin.id); // channels with no owner → admin
  db.migrateGlobalUsedTo(firstAdmin.id); // old global used-marks → admin
  // Seed the admin's Google key from the legacy global client-secret file so already-connected
  // channels keep working (their refresh tokens were minted with that client_id).
  if (!db.getUserClientSecret(firstAdmin.id)) {
    try {
      const p = credsPath();
      if (credsFileExists(p)) db.setUserClientSecret(firstAdmin.id, readFileSync(p, "utf8"));
    } catch {
      /* no global file — admin uploads his own key in Settings */
    }
  }
}

// Self-heal used-anecdote marks PER OWNER (every saved library video is a used anecdote).
for (const acc of db.listAccounts()) {
  if (acc.userId == null) continue;
  for (const v of db.listVideos(acc.id)) db.markAnecdoteUsed(acc.userId, anecdoteKey(v.text));
}

const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT ?? `http://localhost:${process.env.PORT ?? 8080}/api/youtube/callback`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// Multi-user: no global key required to boot — each user uploads their own in Settings.
if (!credsFileExists(credsPath())) {
  console.warn(
    "[creds] Глобальный client-secret не найден — это нормально: каждый юзер грузит свой Google-ключ в Настройках.",
  );
}

// Per-user ONLY: a user can act on YouTube solely with THEIR OWN uploaded key (full isolation —
// nobody inherits anyone else's key). The admin's key is seeded once from the legacy global file
// in the migration above; everyone else uploads their own in Settings.
function userCreds(userId: number): ClientCreds | null {
  const json = db.getUserClientSecret(userId);
  if (!json) return null;
  try {
    return parseCreds(json);
  } catch {
    return null;
  }
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: resolve(process.cwd(), base.outputDir), prefix: "/files/" });
await app.register(fastifyStatic, { root: resolve(process.cwd(), "assets/audio"), prefix: "/audio/", decorateReply: false });

// ---- Production: serve the built web app so ONE origin/port serves the whole site (easy to tunnel).
// Falls back to index.html for client-side routes. Skipped in dev (no web/dist → use `npm run web`).
const WEB_DIST = resolve(process.cwd(), "web/dist");
if (existsSync(resolve(WEB_DIST, "index.html"))) {
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/", decorateReply: false });
  app.setNotFoundHandler((req, reply) => {
    if (
      req.method === "GET" &&
      !req.url.startsWith("/api/") &&
      !req.url.startsWith("/files/") &&
      !req.url.startsWith("/audio/")
    ) {
      return reply.sendFile("index.html", WEB_DIST); // SPA fallback (e.g. /accounts/1, /login)
    }
    return reply.code(404).send({ error: "not found" });
  });
  app.log.info("[web] serving built frontend from web/dist (single-origin production mode)");
}

// ---- Auth: session cookie + login throttling ------------------------------------------------
const SESSION_COOKIE = "sid";
const COOKIE_SECURE = process.env.SESSION_COOKIE_SECURE === "1"; // enable when served over HTTPS
const DAY_MS = 86_400_000;

function getCookie(req: { headers: { cookie?: string } }, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setSessionCookie(reply: { header: (k: string, v: string) => unknown }, token: string) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (COOKIE_SECURE) attrs.push("Secure");
  reply.header("Set-Cookie", attrs.join("; "));
}
function clearSessionCookie(reply: { header: (k: string, v: string) => unknown }) {
  const attrs = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (COOKIE_SECURE) attrs.push("Secure");
  reply.header("Set-Cookie", attrs.join("; "));
}

// Gate the whole API behind a session. Exceptions: health, the login endpoint, and the YouTube
// OAuth callback (Google redirects the browser there). Static /files & /audio are not under /api/.
const PUBLIC_API = new Set(["/api/health", "/api/auth/login"]);
app.addHook("onRequest", async (req, reply) => {
  const path = req.url.split("?")[0];
  if (!path.startsWith("/api/")) return;
  if (PUBLIC_API.has(path) || path === "/api/youtube/callback") return;
  const token = getCookie(req, SESSION_COOKIE);
  const sess = token ? db.getSession(token) : null;
  if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) {
    if (token) db.deleteSession(token); // drop stale/expired token
    return reply.code(401).send({ error: "Не авторизован" });
  }
  (req as { userId?: number }).userId = sess.userId;
});

// Global crash handler → log to error_log (visible on the admin Errors page), return clean JSON.
app.setErrorHandler((err, req, reply) => {
  app.log.error(err);
  const e = err as { message?: string; stack?: string; statusCode?: number };
  try {
    db.addError({
      source: "server",
      message: e?.message || String(err),
      detail: e?.stack || null,
      context: `${req.method} ${req.url.split("?")[0]}`,
      userId: (req as { userId?: number }).userId ?? null,
    });
  } catch {
    /* logging must never throw */
  }
  const sc = e?.statusCode;
  reply
    .code(sc && sc >= 400 && sc < 600 ? sc : 500)
    .send({ error: e?.message || "Внутренняя ошибка сервера" });
});

// Self-service password change (logic in a separate file → minimal footprint in this shared module).
registerPasswordRoutes(app, db, base.dbPath);
registerPsychCardsRoutes(app);

app.post("/api/auth/login", async (req, reply) => {
  const body = (req.body as { username?: string; password?: string }) ?? {};
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) return reply.code(400).send({ error: "Введите логин и пароль" });

  const user = db.getUserByUsername(username);
  // Generic message so an attacker can't probe which usernames exist.
  if (!user) return reply.code(401).send({ error: "Неверный логин или пароль" });

  // Lockout: refuse even a correct password while the account is locked.
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const mins = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000));
    return reply.code(423).send({
      error: `Аккаунт заблокирован после ${MAX_FAILED_ATTEMPTS} неудачных попыток. Подождите ~${mins} мин.`,
    });
  }

  if (!verifyPassword(password, user.passHash)) {
    const attempts = db.incFailedAttempts(user.id);
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
      db.lockUser(user.id, until);
      return reply.code(423).send({
        error: `Слишком много попыток. Аккаунт заблокирован на ${LOCK_MINUTES} мин.`,
      });
    }
    return reply.code(401).send({
      error: `Неверный логин или пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - attempts}`,
    });
  }

  // Success → reset the counter and issue a session.
  db.clearLock(user.id);
  const token = newSessionToken();
  db.createSession(token, user.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
  setSessionCookie(reply, token);
  return { id: user.id, username: user.username, role: user.role };
});

app.post("/api/auth/logout", async (req, reply) => {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) db.deleteSession(token);
  clearSessionCookie(reply);
  return { ok: true };
});

app.get("/api/auth/me", async (req, reply) => {
  const user = db.getUserById(uid(req));
  if (!user) return reply.code(401).send({ error: "Не авторизован" });
  return { id: user.id, username: user.username, role: user.role };
});

// uid of the authenticated request (guaranteed set by the hook for gated routes).
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;
type Replyish = { code: (n: number) => { send: (b: unknown) => unknown } };

function requireAdmin(req: unknown, reply: Replyish): boolean {
  const u = db.getUserById(uid(req));
  if (u?.role !== "admin") {
    reply.code(403).send({ error: "Только для администратора" });
    return false;
  }
  return true;
}
// Return the account only if it belongs to the current user, else send 404 and return null.
function ownAccount(req: unknown, reply: Replyish, id: number): Account | null {
  const a = db.getAccount(id);
  if (!a || a.userId !== uid(req)) {
    reply.code(404).send({ error: "Канал не найден" });
    return null;
  }
  return a;
}

// True if the user may use a deck (pack): admins always; others unless the deck is hidden for them.
function deckAllowed(req: unknown, deckId: string): boolean {
  if (db.getUserById(uid(req))?.role === "admin") return true;
  return !db.isDeckHiddenFor(uid(req), deckId);
}

app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

// Project changelog (CHANGELOG.md) surfaced on the site — read live so it always reflects the file.
app.get("/api/changelog", async () => {
  const file = resolve(process.cwd(), "CHANGELOG.md");
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
  return { raw };
});

app.get("/api/config", async (req) => {
  const hasGoogleKey = !!userCreds(uid(req));
  return {
    hasGoogleKey,
    credsConfigured: hasGoogleKey, // alias kept for the channels badge
    chromePath: base.chromePath,
    llm: "claude-code-headless",
  };
});

// ---- Settings: per-user Google key (client_secret JSON, uploaded by each user) ----
app.get("/api/settings", async (req) => ({ hasGoogleKey: !!db.getUserClientSecret(uid(req)) }));

app.put("/api/settings/google-key", async (req, reply) => {
  const body = (req.body as { json?: string }) ?? {};
  const json = (body.json ?? "").trim();
  if (!json) return reply.code(400).send({ error: "Пустой файл ключа" });
  try {
    parseCreds(json); // validate shape (client_id/client_secret present)
  } catch (e) {
    return reply.code(400).send({ error: "Неверный client_secret.json: " + String(e).slice(0, 120) });
  }
  db.setUserClientSecret(uid(req), json);
  return { hasGoogleKey: true };
});

app.delete("/api/settings/google-key", async (req) => {
  db.setUserClientSecret(uid(req), null);
  return { hasGoogleKey: false };
});

// ---- Admin: user management (admin creates accounts for friends) ----
app.get("/api/admin/users", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  return db.listUsers().map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    locked: !!(u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()),
    createdAt: u.createdAt,
  }));
});

app.post("/api/admin/users", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const body = (req.body as { username?: string; password?: string; role?: string; hidden?: string[] }) ?? {};
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const role = body.role === "admin" ? "admin" : "user";
  if (!username || password.length < 6)
    return reply.code(400).send({ error: "Логин обязателен, пароль ≥ 6 символов" });
  if (db.getUserByUsername(username)) return reply.code(409).send({ error: "Такой логин уже есть" });
  const u = db.createUser({ username, passHash: hashPassword(password), role });
  // Optionally hide some packs for the new user from the start (admins are never restricted).
  if (role !== "admin" && Array.isArray(body.hidden)) {
    const valid = body.hidden.filter((id) => DECKS.some((d) => d.id === id));
    if (valid.length) db.setHiddenDecks(u.id, valid);
  }
  return { id: u.id, username: u.username, role: u.role };
});

// ---- Admin: per-user pack (deck) visibility ----
// All packs (matrix columns).
app.get("/api/admin/decks", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  return DECKS.map((d) => ({ id: d.id, name: d.name }));
});
// Matrix data: per user — which packs are hidden + which packs they actually use.
app.get("/api/admin/user-decks", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const hidden = db.hiddenDecksByUser();
  const used = db.usedDecksByUser();
  const posted = db.postedByUserDeck();
  return db.listUsers().map((u) => {
    // Per-deck remaining/used/posted for the decks this user actually uses (so admin sees when a pack runs out).
    const usedKeys = new Set(db.usedAnecdoteKeys(u.id));
    const deckStats: Record<string, { used: number; available: number; total: number; posted: number }> = {};
    for (const deckId of used[u.id] ?? []) {
      if (!DECKS.some((d) => d.id === deckId)) continue; // skip non-deck langs (e.g. "en")
      const s = libraryStats(deckId, usedKeys);
      deckStats[deckId] = { used: s.used, available: s.available, total: s.total, posted: posted[u.id]?.[deckId] ?? 0 };
    }
    return {
      userId: u.id,
      username: u.username,
      role: u.role,
      hidden: hidden[u.id] ?? [],
      used: used[u.id] ?? [],
      scheduled: db.scheduleSlotsForUser(u.id), // posts/day planned across all their channels
      library: db.countVideosByUser(u.id), // videos queued in their libraries
      deckStats,
    };
  });
});
// Replace a user's hidden-pack set (body.hidden = pack ids to hide). Admins can't be restricted.
app.put("/api/admin/users/:id/decks", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number((req.params as { id: string }).id);
  const target = db.getUserById(id);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  const body = (req.body as { hidden?: string[] }) ?? {};
  const valid = Array.isArray(body.hidden) ? body.hidden.filter((d) => DECKS.some((x) => x.id === d)) : [];
  const finalHidden = target.role === "admin" ? [] : valid;
  db.setHiddenDecks(id, finalHidden);
  return { ok: true, hidden: finalHidden };
});

// Pack overview for the «Паки» tab (any logged-in user): their VISIBLE packs with total/used/remaining/posted.
// Admins may pass ?userId=<id> to view another user's packs.
app.get("/api/my-decks", async (req, reply) => {
  const me = db.getUserById(uid(req));
  const isAdmin = me?.role === "admin";
  const q = (req.query as { userId?: string }) ?? {};
  const targetId = isAdmin && q.userId ? Number(q.userId) : uid(req);
  const target = db.getUserById(targetId);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  const hidden = new Set(target.role === "admin" ? [] : db.hiddenDecksFor(targetId));
  const usedKeys = new Set(db.usedAnecdoteKeys(targetId));
  const posted = db.postedByUserDeck()[targetId] ?? {};
  const decks = DECKS.filter((d) => !hidden.has(d.id)).map((d) => {
    const s = libraryStats(d.id, usedKeys);
    return { id: d.id, name: d.name, total: s.total, used: s.used, available: s.available, posted: posted[d.id] ?? 0 };
  });
  return { userId: targetId, username: target.username, decks };
});

// ---- Accounts (scoped to the current user) ----
// Own channels; admins may pass ?scope=all to list every user's channels (for the history filter).
app.get("/api/accounts", async (req) => visibleAccounts(req, (req.query as { scope?: string })?.scope));
app.get("/api/accounts/:id", async (req, reply) => {
  const a = ownAccount(req, reply, Number((req.params as { id: string }).id));
  if (!a) return;
  return a;
});
app.post("/api/accounts", async (req) =>
  db.createAccount({ ...((req.body as Partial<Account>) ?? {}), userId: uid(req) }),
);
app.put("/api/accounts/:id", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!ownAccount(req, reply, id)) return;
  const body = (req.body as Partial<Account>) ?? {};
  if (body.lang && DECKS.some((d) => d.id === body.lang) && !deckAllowed(req, body.lang))
    return reply.code(403).send({ error: "Этот пак вам недоступен — нельзя поставить его языком канала." });
  // Cap: ≤ 100 scheduled posts per day per user (sum of schedule slots across all their channels). Admins exempt.
  if (Array.isArray(body.schedule) && db.getUserById(uid(req))?.role !== "admin") {
    const others = db.scheduleSlotsForUser(uid(req), id);
    if (others + body.schedule.length > 100)
      return reply.code(400).send({
        error: `Лимит 100 публикаций в сутки на пользователя. На остальных каналах уже ${others}, этому каналу доступно ${Math.max(0, 100 - others)}.`,
      });
  }
  const a = db.updateAccount(id, body);
  if (!a) return reply.code(404).send({ error: "not found" });
  return a;
});
app.delete("/api/accounts/:id", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!ownAccount(req, reply, id)) return;
  db.deleteAccount(id);
  return { ok: true };
});

// History list (paginated). Regular users see ONLY their own channels. Admins may pass
// scope=all (every user), or narrow with userId / accountId. Returns { items, total, page, pageSize }.
app.get("/api/history", async (req) => {
  const q =
    (req.query as { scope?: string; userId?: string; accountId?: string; page?: string; pageSize?: string }) ?? {};
  const isAdmin = db.getUserById(uid(req))?.role === "admin";
  let filter: { ownerId?: number; accountId?: number };
  if (!isAdmin) filter = { ownerId: uid(req) }; // non-admin: locked to own channels
  else if (q.accountId) filter = { accountId: Number(q.accountId) };
  else if (q.userId) filter = { ownerId: Number(q.userId) };
  else if (q.scope === "all") filter = {}; // every user's channels
  else filter = { ownerId: uid(req) }; // admin's own (default)
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
  const total = db.countHistoryFiltered(filter);
  const items = db.listHistoryFiltered({ ...filter, limit: pageSize, offset: (page - 1) * pageSize });
  return { items, total, page, pageSize };
});

// ---- Channel stats: subscribers/views/videos snapshots + deltas ----
// Available to EVERY user for their own channels. Admins may pass ?scope=all to also see
// everyone's channels. Reads use the SAME OAuth as uploads (youtube.readonly) — no re-auth.
function visibleAccounts(req: unknown, scope?: string): Account[] {
  const u = db.getUserById(uid(req));
  if (u?.role === "admin" && scope === "all") return db.listAccounts();
  return db.listAccountsByUser(uid(req));
}
// A channel the current user may view: their own, or any channel if they're an admin.
function visibleAccount(req: unknown, id: number): Account | null {
  const a = db.getAccount(id);
  if (!a) return null;
  const u = db.getUserById(uid(req));
  return a.userId === uid(req) || u?.role === "admin" ? a : null;
}
// One row for the stats table: current totals + the previous snapshot (frontend computes +/-).
function statRow(a: Account, error?: string | null) {
  const { latest, prev } = db.twoLatestSnapshots(a.id);
  const owner = a.userId != null ? db.getUserById(a.userId) : null;
  return {
    accountId: a.id,
    channelName: a.channelName,
    ytChannelTitle: a.ytChannelTitle,
    ytChannelId: a.ytChannelId,
    ownerUsername: owner?.username ?? null,
    connected: a.status === "connected",
    latest,
    prev,
    error: error ?? null,
  };
}

// Turn a googleapis/OAuth failure into a short Russian hint; raw reason stays in () for the F12 console.
function ytErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error_description?: string; error?: string } }; message?: string };
  const raw = e?.response?.data?.error_description || e?.response?.data?.error || e?.message || String(err);
  const s = String(raw);
  if (/unauthorized_client|invalid_client/i.test(s))
    return `Токен канала не принят (${s}) — переподключите канал в «Каналы».`;
  if (/invalid_grant/i.test(s)) return `Доступ отозван или истёк (${s}) — переподключите канал.`;
  if (/insufficient|scope|forbidden/i.test(s))
    return `Недостаточно прав токена (${s}) — переподключите канал заново.`;
  if (/quota|rateLimit|userRateLimitExceeded/i.test(s))
    return `Квота YouTube API исчерпана (${s}) — попробуйте позже.`;
  return `Ошибка YouTube: ${s}`;
}

app.get("/api/stats", async (req) => {
  const scope = (req.query as { scope?: string }).scope;
  return visibleAccounts(req, scope).map((a) => statRow(a));
});

// Poll YouTube for each visible+connected channel, store a fresh snapshot, return rows with deltas.
// Each channel is queried with ITS OWNER's Google key (per-user isolation), all in parallel.
app.post("/api/stats/refresh", async (req) => {
  const scope = (req.query as { scope?: string }).scope;
  const accounts = visibleAccounts(req, scope);
  const errors = new Map<number, string>();
  await Promise.all(
    accounts.map(async (a) => {
      if (a.status !== "connected") return;
      const creds = a.userId != null ? userCreds(a.userId) : null;
      const token = db.getRefreshToken(a.id);
      if (!creds) {
        errors.set(a.id, "Нет Google-ключа у владельца канала");
        return;
      }
      if (!token) {
        errors.set(a.id, "Канал не подключён к YouTube");
        return;
      }
      try {
        const s = await fetchChannelStats(creds, REDIRECT_URI, token);
        db.addChannelSnapshot({ accountId: a.id, subscribers: s.subscribers, views: s.views, videos: s.videos });
      } catch (err) {
        app.log.error({ err: String(err), accountId: a.id }, "stats refresh failed");
        db.addError({
          source: "server",
          message: "Статистика: " + ytErrorMessage(err),
          detail: (err as Error)?.stack ?? null,
          context: `stats refresh account=${a.id}`,
        });
        errors.set(a.id, ytErrorMessage(err));
      }
    }),
  );
  return accounts.map((a) => statRow(a, errors.get(a.id)));
});

app.get("/api/stats/:id/history", async (req, reply) => {
  const a = visibleAccount(req, Number((req.params as { id: string }).id));
  if (!a) return reply.code(404).send({ error: "Канал не найден" });
  return db.listChannelSnapshots(a.id);
});

// ---- Error log: client-side reports (any user) + admin viewer/clear ----
app.post("/api/client-error", async (req) => {
  const b = (req.body as { message?: string; detail?: string; context?: string }) ?? {};
  if (!b.message) return { ok: false };
  db.addError({
    source: "client",
    message: b.message,
    detail: b.detail ?? null,
    context: b.context ?? null,
    userId: uid(req),
  });
  return { ok: true };
});

app.get("/api/errors", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  return db.listErrors(200);
});

app.delete("/api/errors", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  db.clearErrors();
  return { ok: true };
});

// ---- Server health (any logged-in user, per owner request): live CPU/RAM/disk + history + activity ----
// All values are cheap in-process reads; history is an in-memory ring (no DB, no disk growth).
// Behind the session gate (not public) but no longer admin-only — every user sees the load graph.
app.get("/api/system", async () => {
  const accs = db.listAccounts();
  return {
    ...metrics.snapshot(),
    domain: {
      videosQueued: db.totalVideoCount(),
      accountsTotal: accs.length,
      accountsEnabled: accs.filter((a) => a.enabled).length,
      accountsConnected: accs.filter((a) => a.status === "connected").length,
      errors24h: db.recentErrorCount(24),
      errorsTotal: db.errorCount(),
    },
  };
});

// ---- YouTube OAuth (connect a channel — uses the current user's key) ----
app.get("/api/youtube/auth-url", async (req, reply) => {
  const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
  if (!accountId) return reply.code(400).send({ error: "accountId required" });
  if (!ownAccount(req, reply, accountId)) return;
  const creds = userCreds(uid(req));
  if (!creds) return reply.code(400).send({ error: "Сначала загрузите свой Google-ключ в Настройках" });
  app.log.info({ accountId, user: uid(req), redirect: REDIRECT_URI }, "[oauth] auth-url issued");
  return { url: buildAuthUrl(creds, REDIRECT_URI, String(accountId)) };
});

app.get("/api/youtube/callback", async (req, reply) => {
  const { code, state, error: gError } = req.query as { code?: string; state?: string; error?: string };
  app.log.info({ state, hasCode: !!code, gError, webOrigin: WEB_ORIGIN }, "[oauth] callback received");
  const fail = (where: string, msg: string, detail: string | null = null) => {
    app.log.error({ state, where, msg }, "[oauth] callback failed");
    db.addError({
      source: "server",
      message: "Привязка YouTube: " + msg,
      detail,
      context: `youtube/callback ${where} state=${state}`,
    });
    return reply.redirect(`${WEB_ORIGIN}/accounts/${state ?? ""}?error=${encodeURIComponent(msg)}`);
  };
  if (gError) return fail("google", `Google отклонил доступ (${gError})`);
  if (!code || !state) return fail("params", "Google вернул запрос без code/state");
  // No session here (Google redirects the browser) — derive the owner's key from the account.
  const acc = db.getAccount(Number(state));
  if (!acc || acc.userId == null) return fail("account", `Канал #${state} не найден или без владельца`);
  const creds = userCreds(acc.userId);
  if (!creds) return fail("creds", "У владельца канала нет Google-ключа (загрузите его в Настройках)");
  try {
    app.log.info({ state, owner: acc.userId }, "[oauth] exchanging code for tokens…");
    const r = await exchangeAndGetChannel(creds, REDIRECT_URI, code);
    db.setYouTube(Number(state), r);
    app.log.info(
      { state, channelId: r.channelId, channelTitle: r.channelTitle, hasRefresh: !!r.refreshToken },
      "[oauth] connected ✓",
    );
    if (!r.refreshToken)
      app.log.warn({ state }, "[oauth] no refresh_token — re-consent likely needed (prompt=consent)");
    return reply.redirect(`${WEB_ORIGIN}/accounts/${state}?connected=1`);
  } catch (err) {
    return fail("exchange", ytErrorMessage(err), (err as Error)?.stack ?? null);
  }
});

// ---- Video library (save / list / delete / post-now) ----
app.get("/api/videos", async (req, reply) => {
  const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
  if (!accountId) return [];
  if (!ownAccount(req, reply, accountId)) return;
  return db.listVideos(accountId);
});

// Render + assemble one library video, persist it, and mark the anecdote used for THIS user.
// music: explicit track name | "none" = silent | empty/undefined = random track per video.
async function buildLibraryVideo(input: {
  userId: number;
  accountId: number;
  text: string;
  title?: string;
  bg?: string;
  music?: string;
  deck?: string;
  profession?: string;
}) {
  const deck = getDeck(input.deck);
  // Backstop (covers save, batch, and the gen-queue worker): never build a deck hidden for this user.
  if (db.getUserById(input.userId)?.role !== "admin" && db.isDeckHiddenFor(input.userId, deck.id))
    throw new Error("Этот пак вам недоступен");
  const title = input.title || pickGenericTitle(deck);
  let music = input.music;
  let audioPath: string | null | undefined;
  if (music === "none") audioPath = null;
  else if (music) audioPath = audioPathFor(music);
  else {
    const tracks = listAudio();
    if (tracks.length) {
      music = tracks[Math.floor(Math.random() * tracks.length)];
      audioPath = audioPathFor(music);
    } else {
      music = "none";
      audioPath = null;
    }
  }
  // Islamic deck → nature ambient (never instrumental music); explicit "none" still means silent.
  if (deck.islamic && music !== "none") {
    const amb = pickIslamicAudio();
    if (amb) {
      music = amb;
      audioPath = audioPathFor(amb);
    }
  }
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const imgRel = `library/vid-${stamp}.png`;
  const vidRel = `library/vid-${stamp}.mp4`;
  const r = await metrics.track("render", async () => {
    const rr = await renderAnecdote(
      { title, text: input.text, channel: deck.name, bg: input.bg, deck: deck.id, profession: input.profession },
      resolve(process.cwd(), base.outputDir, imgRel),
    );
    await assembleStillVideo(
      resolve(process.cwd(), base.outputDir, imgRel),
      resolve(process.cwd(), base.outputDir, vidRel),
      { durationSec: 6, audioPath },
    );
    return rr;
  });
  const v = db.createVideo({
    accountId: input.accountId,
    title,
    text: input.text,
    bg: r.bg,
    music: music ?? "",
    deck: deck.id,
    videoRel: vidRel,
    imageRel: imgRel,
  });
  db.markAnecdoteUsed(input.userId, anecdoteKey(input.text)); // never reuse this anecdote for this user
  return v;
}

app.post("/api/videos", async (req, reply) => {
  const body = (req.body as { accountId?: number; text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
  if (!body.accountId || !body.text) return reply.code(400).send({ error: "accountId и text обязательны" });
  const acc = ownAccount(req, reply, body.accountId);
  if (!acc) return;
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if (!deckAllowed(req, channelDeck.id))
    return reply.code(403).send({ error: "Этот пак вам недоступен." });
  if ((body.deck || channelDeck.id) !== channelDeck.id)
    return reply.code(400).send({ error: `Язык ролика не совпадает с языком канала (${channelDeck.name}) — не сохранено.` });
  return buildLibraryVideo({
    userId: uid(req),
    accountId: body.accountId,
    text: body.text,
    title: body.title,
    bg: body.bg,
    music: body.music,
    deck: channelDeck.id, // forced to the channel's language
  });
});

// Batch: generate N random UNUSED anecdotes straight into a channel's library.
app.post("/api/videos/batch", async (req, reply) => {
  const body = (req.body as { accountId?: number; count?: number; bg?: string; music?: string; deck?: string }) ?? {};
  if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
  const acc = ownAccount(req, reply, body.accountId);
  if (!acc) return;
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if (!deckAllowed(req, channelDeck.id))
    return reply.code(403).send({ error: "Этот пак вам недоступен." });
  const deckId = channelDeck.id; // FORCE the channel's language — no cross-language mixing
  const requested = Math.max(1, Math.min(20, Number(body.count) || 5));
  const seen = new Set<string>(db.usedAnecdoteKeys(uid(req))); // exclude this user's used + dedupe batch
  const created: unknown[] = [];
  for (let i = 0; i < requested; i++) {
    const a = randomAnecdote(deckId, seen);
    if (!a) break; // no unused anecdotes left
    seen.add(anecdoteKey(a.text));
    created.push(
      await buildLibraryVideo({
        userId: uid(req),
        accountId: body.accountId,
        text: a.text,
        title: a.title,
        bg: body.bg, // undefined → random background per video
        music: body.music || undefined, // empty/undefined → random track per video
        deck: deckId,
        profession: a.profession, // tips deck → which profession background to render on
      }),
    );
  }
  return { created, requested, made: created.length, exhausted: created.length < requested };
});

// ---- Global generation queue: ONE video at a time across ALL users → bounds server load ----
// Worker = make ONE random unused video for the job's channel (a single batch step).
initGenQueue(async (job) => {
  const acc = db.getAccount(job.accountId);
  if (!acc) throw new Error("Канал не найден");
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck) throw new Error(`У канала язык «${acc.lang}» без пака`);
  const seen = new Set<string>(db.usedAnecdoteKeys(job.userId)); // skip this user's already-used cards
  const a = randomAnecdote(channelDeck.id, seen);
  if (!a) return "exhausted"; // deck has no unused cards left
  await buildLibraryVideo({
    userId: job.userId,
    accountId: job.accountId,
    text: a.text,
    title: a.title,
    deck: channelDeck.id,
    profession: a.profession,
  });
  return "made";
});

// Enqueue a batch (1–20 for regular users; admins up to 100). Returns the job id to poll.
app.post("/api/gen-queue", async (req, reply) => {
  const body = (req.body as { accountId?: number; count?: number }) ?? {};
  if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
  const acc = ownAccount(req, reply, body.accountId);
  if (!acc) return;
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if (!deckAllowed(req, channelDeck.id))
    return reply.code(403).send({ error: "Этот пак вам недоступен." });
  const cap = db.getUserById(uid(req))?.role === "admin" ? 100 : 20;
  const total = Math.max(1, Math.min(cap, Number(body.count) || 1));
  const job = genEnqueue(uid(req), body.accountId, total);
  return { jobId: job.id, total: job.total };
});

// Poll one job's progress + position in the queue.
app.get("/api/gen-queue/:id", async (req, reply) => {
  const st = genJobStatus((req.params as { id: string }).id);
  if (!st || st.userId !== uid(req)) return reply.code(404).send({ error: "Задача не найдена" });
  return {
    id: st.id,
    total: st.total,
    done: st.done,
    state: st.state,
    ahead: st.ahead,
    position: st.position,
    error: st.error ?? null,
  };
});

// Cancel a job: soft-stops after the current video; already-made videos stay in the library.
app.post("/api/gen-queue/:id/cancel", async (req) => {
  return { ok: genCancelJob((req.params as { id: string }).id, uid(req)) };
});

app.delete("/api/videos/:id", async (req, reply) => {
  const v = db.getVideo(Number((req.params as { id: string }).id));
  if (!v) return reply.code(404).send({ error: "not found" });
  if (!ownAccount(req, reply, v.accountId)) return;
  db.deleteVideo(v.id);
  return { ok: true };
});

app.post("/api/videos/:id/post-now", async (req, reply) => {
  const v = db.getVideo(Number((req.params as { id: string }).id));
  if (!v) return reply.code(404).send({ error: "not found" });
  const acc = ownAccount(req, reply, v.accountId);
  if (!acc) return;
  const token = db.getRefreshToken(v.accountId);
  if (!token) return reply.code(400).send({ error: "Канал не подключён к YouTube" });
  const creds = userCreds(uid(req));
  if (!creds) return reply.code(400).send({ error: "Сначала загрузите свой Google-ключ в Настройках" });
  // HARD language guard: never post a video whose language differs from the channel's.
  if (DECKS.some((d) => d.id === acc.lang) && v.deck !== acc.lang)
    return reply.code(400).send({ error: `Язык ролика (${v.deck}) ≠ язык канала (${acc.lang}) — не выложено.` });
  // Optional publishAt (RFC3339) → scheduled (private until then); empty → publish now.
  const publishAt = ((req.body as { publishAt?: string })?.publishAt || "").trim() || null;
  try {
    const meta = ytMeta(getDeck(v.deck), v.title, v.text);
    const youtubeId = await metrics.track("upload", () =>
      uploadShort(creds, REDIRECT_URI, token, {
        videoPath: resolve(process.cwd(), base.outputDir, v.videoRel),
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        publishAt,
      }),
    );
    db.addHistory({
      accountId: v.accountId,
      title: v.title,
      status: youtubeId ? (publishAt ? "scheduled" : "published") : "failed",
      youtubeId,
      videoPath: v.videoRel,
      publishedAt: publishAt ?? new Date().toISOString(),
    });
    if (youtubeId) {
      // posted once → remove from the library (files + row) so it never reposts
      for (const rel of [v.videoRel, v.imageRel]) {
        if (rel) {
          try {
            unlinkSync(resolve(process.cwd(), base.outputDir, rel));
          } catch {
            /* already gone */
          }
        }
      }
      db.deleteVideo(v.id);
    }
    return {
      ok: true,
      youtubeId,
      url: youtubeId ? `https://youtu.be/${youtubeId}` : null,
      scheduled: !!publishAt,
      removed: !!youtubeId,
    };
  } catch (err) {
    app.log.error(err);
    db.addError({
      source: "server",
      message: "Загрузка видео: " + String((err as Error)?.message ?? err),
      detail: (err as Error)?.stack ?? null,
      context: `post-now account=${v.accountId} video=${v.id}`,
      userId: uid(req),
    });
    return reply.code(500).send({ error: "Ошибка загрузки: " + String(err).slice(0, 200) });
  }
});

// ---- Generators / Studio (per-user used counter) ----
app.get("/api/generators", async (req) => {
  const used = db.usedAnecdoteKeys(uid(req));
  // Hide packs the admin has turned off for this user (admins always see all).
  const isAdmin = db.getUserById(uid(req))?.role === "admin";
  const hidden = isAdmin ? new Set<string>() : new Set(db.hiddenDecksFor(uid(req)));
  const base = DECKS.filter((d) => !hidden.has(d.id)).map((d) => {
    const s = libraryStats(d.id, used);
    return {
      id: d.id,
      name: d.name,
      ai: false,
      total: s.total,
      titled: s.titled,
      used: s.used,
      available: s.available,
      packs: s.packs,
      range: s.range,
      readyPacks: s.readyPacks,
      untitledPacks: s.untitledPacks,
      untitledTotal: s.untitledTotal,
    };
  });
  return base;
});

let previewCounter = 0;
app.post("/api/generate/anecdote", async (req, reply) => {
  const body = (req.body as { text?: string; title?: string; bg?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  let text = body.text;
  let title = body.title;
  let profession: string | undefined;
  if (!text) {
    const a = randomAnecdote(deck.id, db.usedAnecdoteKeys(uid(req)));
    if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
    text = a.text;
    title = a.title || undefined;
    profession = a.profession;
    db.markAnecdoteUsed(uid(req), anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот
  }
  if (!title) title = pickGenericTitle(deck);

  previewCounter++;
  const rel = `preview/anek-${Date.now()}-${previewCounter}.png`;
  const out = resolve(process.cwd(), base.outputDir, rel);
  const r = await metrics.track("render", () =>
    renderAnecdote({ title, text, channel: deck.name, bg: body.bg, deck: deck.id, profession }, out),
  );
  return { imageUrl: `/files/${rel}`, title, text, chars: text.length, bg: r.bg, fontPx: r.fontPx };
});

app.get("/api/backgrounds", async () => listBackgrounds());
app.get("/api/music", async () => listAudio());

let videoCounter = 0;
app.post("/api/generate/anecdote-video", async (req, reply) => {
  const body = (req.body as { text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  let text = body.text;
  let title = body.title;
  let profession: string | undefined;
  if (!text) {
    const a = randomAnecdote(deck.id, db.usedAnecdoteKeys(uid(req)));
    if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
    text = a.text;
    title = a.title || undefined;
    profession = a.profession;
    db.markAnecdoteUsed(uid(req), anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот
  }
  if (!title) title = pickGenericTitle(deck);

  // Music: explicit track name, "none" = silent, empty/undefined = random.
  let music = body.music;
  let audioPath: string | null | undefined;
  if (music === "none") audioPath = null;
  else if (music) audioPath = audioPathFor(music);
  else {
    const tracks = listAudio();
    if (tracks.length) {
      music = tracks[Math.floor(Math.random() * tracks.length)];
      audioPath = audioPathFor(music);
    } else {
      music = "none";
      audioPath = null;
    }
  }

  // Islamic deck → nature ambient (never instrumental music); explicit "none" still means silent.
  if (deck.islamic && music !== "none") {
    const amb = pickIslamicAudio();
    if (amb) {
      music = amb;
      audioPath = audioPathFor(amb);
    }
  }

  videoCounter++;
  const stamp = `${Date.now()}-${videoCounter}`;
  const imgRel = `preview/anek-${stamp}.png`;
  const vidRel = `preview/anek-${stamp}.mp4`;
  const imgOut = resolve(process.cwd(), base.outputDir, imgRel);
  const vidOut = resolve(process.cwd(), base.outputDir, vidRel);
  const r = await metrics.track("render", async () => {
    const rr = await renderAnecdote({ title, text, channel: deck.name, bg: body.bg, deck: deck.id, profession }, imgOut);
    await assembleStillVideo(imgOut, vidOut, { durationSec: 6, audioPath });
    return rr;
  });
  return { videoUrl: `/files/${vidRel}`, imageUrl: `/files/${imgRel}`, title, text, chars: text.length, bg: r.bg, music };
});

app
  .listen({ port: base.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Shorts Factory API on :${base.port}`);
    startScheduler({
      db,
      outputDir: resolve(process.cwd(), base.outputDir),
      credsForUser: userCreds,
      redirectUri: REDIRECT_URI,
      log: (m) => app.log.info(m),
    });
    metrics.startSampler(resolve(process.cwd(), base.outputDir));
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
