import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { unlinkSync, readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { loadBaseConfig, resolveClientSecretFile, credsFileExists } from "./config.ts";
import { openDb, type Account } from "./db.ts";
import { randomAnecdote, libraryStats, anecdoteKey } from "../src/anecdotes/library.ts";
import { DECKS, getDeck, ytMeta, pickGenericTitle, isPackDeckId, deckLang } from "../src/anecdotes/decks.ts";
import { listAllPacks, setGrant, setPackOwner, getPack } from "../src/packs/store.ts";
import { pickUnusedPackCard, buildPackLibraryVideo } from "./pack-gen.ts";
import { buildFactLibraryVideo } from "./fact-gen.ts";
import { renderAnecdote, listBackgrounds } from "../src/anecdotes/render.ts";
import { assembleStillVideo, listAudio, audioPathFor, pickIslamicAudio, pickChristianAudio } from "../src/video.ts";
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
import { registerTelegramRoutes } from "./telegram-routes.ts";
import { registerPsychCardsRoutes } from "./psych-cards-routes.ts";
import { registerPacksRoutes } from "./packs-routes.ts";
import { initGenQueue, enqueue as genEnqueue, jobStatus as genJobStatus, cancelJob as genCancelJob, drainQueue as genDrainQueue } from "./gen-queue.ts";
import { gracefulShutdown } from "./shutdown.ts";
import { buildAdminAnalytics } from "./admin-analytics.ts";
import { buildUserAnalytics } from "./user-analytics.ts";

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

// Backfill channel language for existing channels (new channel_lang column): built-in deck → its
// language; custom pack → the pack's own lang. Lets the «язык пака ≠ язык канала» guard work for
// channels created before this field existed. Runs once (only fills empty channel_lang).
{
  const DECK_LANG: Record<string, string> = {
    ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
    tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en",
  };
  for (const acc of db.listAccounts()) {
    if (acc.channelLang) continue;
    let lng = DECK_LANG[acc.lang] || "";
    if (!lng && isPackDeckId(acc.lang)) lng = getPack(acc.lang.slice(5), acc.userId ?? 0, true)?.lang || "";
    if (lng) db.updateAccount(acc.id, { channelLang: lng });
  }
}

// ---- Channel avatars: built-in CC0 set in assets/avatars; random by default, custom upload allowed ----
const AVATAR_DIR = resolve(process.cwd(), "assets/avatars");
function listAvatarFiles(): string[] {
  try {
    return readdirSync(AVATAR_DIR).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort();
  } catch {
    return [];
  }
}
function randomAvatar(): string | null {
  const all = listAvatarFiles();
  return all.length ? `/avatars/${all[Math.floor(Math.random() * all.length)]}` : null;
}
// Backfill: existing channels with no avatar get a random one (only fills empty).
for (const acc of db.listAccounts()) {
  if (!acc.avatar) {
    const av = randomAvatar();
    if (av) db.updateAccount(acc.id, { avatar: av });
  }
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
// Pre-built fact videos (preFact deck) — served for the Studio random-preview player.
await app.register(fastifyStatic, { root: resolve(process.cwd(), "assets/fact-videos"), prefix: "/fact-videos/", decorateReply: false });
// Channel avatars (built-in CC0 set) — served for the channel grid + picker.
await app.register(fastifyStatic, { root: resolve(process.cwd(), "assets/avatars"), prefix: "/avatars/", decorateReply: false });

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
      !req.url.startsWith("/audio/") &&
      !req.url.startsWith("/fact-videos/") &&
      !req.url.startsWith("/avatars/")
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
const PUBLIC_API = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/telegram/info", // pre-login: is Telegram offered here + bot @username
  "/api/auth/telegram/login/start", // login via bot: mint a /start deep-link token
  "/api/auth/telegram/login/status", // login via bot: poll until the user pressed Start
  "/api/telegram/webhook", // Telegram pushes bot updates (/start) here
  "/api/auth/recover/start", // password recovery: ask the bot to DM a code
  "/api/auth/recover/complete", // password recovery: submit code + new password
]);
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
registerPacksRoutes(app, db);
// Telegram login + account binding + bot-delivered password recovery (public routes whitelisted above).
registerTelegramRoutes(app, db, { setSessionCookie });

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

// True if the user may use a deck (pack): admins always; admin-only packs never for non-admins;
// otherwise unless the deck is hidden for them.
function deckAllowed(req: unknown, deckId: string): boolean {
  if (db.getUserById(uid(req))?.role === "admin") return true;
  // Кастомные паки: доступ по владению/гранту (getPack применяет canAccess), а не по hidden.
  if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), false) !== null;
  if (getDeck(deckId).adminOnly) return false;
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
  // встроенные деки + кастомные паки (всегда показываем паки колонками; id = "pack:<id>")
  return [
    // adminOnly built-in decks (e.g. fact-en, quotes-de, christian) are NOT user-grantable —
    // the adminOnly flag hard-hides them from non-admins, so they don't belong in the per-user matrix.
    ...DECKS.filter((d) => !d.adminOnly).map((d) => ({ id: d.id, name: d.name, pack: false })),
    ...listAllPacks().map((p) => ({ id: `pack:${p.id}`, name: p.name, pack: true })),
  ];
});
// Matrix data: per user — which packs are hidden + which packs they actually use.
app.get("/api/admin/user-decks", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const hidden = db.hiddenDecksByUser();
  const used = db.usedDecksByUser();
  const posted = db.postedByUserDeck();
  const allPacks = listAllPacks();
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
      grantedPacks: allPacks
        .filter((p) => u.role === "admin" || p.userId === u.id || p.grants.includes(u.id))
        .map((p) => `pack:${p.id}`),
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
  const body = (req.body as { hidden?: string[]; grants?: string[] }) ?? {};
  const valid = Array.isArray(body.hidden) ? body.hidden.filter((d) => DECKS.some((x) => x.id === d)) : [];
  const finalHidden = target.role === "admin" ? [] : valid;
  db.setHiddenDecks(id, finalHidden);
  // Кастомные паки (opt-in): выдать/снять доступ этому юзеру по body.grants (id вида "pack:<id>").
  // Владельца не трогаем; админ и так видит всё.
  if (target.role !== "admin") {
    const want = new Set((Array.isArray(body.grants) ? body.grants : []).map((g) => g.replace(/^pack:/, "")));
    for (const p of listAllPacks()) {
      if (p.userId === id) continue;
      setGrant(p.id, id, want.has(p.id));
    }
  }
  return { ok: true, hidden: finalHidden };
});

// Admin: reassign a custom pack's owner. Owner = who may edit the pack (name/lang/cards) on /cards.
app.put("/api/admin/packs/:id/owner", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = (req.params as { id: string }).id.replace(/^pack:/, "");
  const ownerId = Number((req.body as { ownerId?: number })?.ownerId);
  if (!db.getUserById(ownerId)) return reply.code(404).send({ error: "Пользователь не найден" });
  if (!setPackOwner(id, ownerId)) return reply.code(404).send({ error: "Пак не найден" });
  return { ok: true, ownerId };
});

// Pack overview for the «Паки» tab (any logged-in user): their VISIBLE packs with total/used/remaining/posted.
// Admins may pass ?userId=<id> to view another user's packs.
// Decks a user may see/use: per-user not hidden AND (admin OR not an admin-only deck).
function visibleDecksForUser(userId: number) {
  const u = db.getUserById(userId);
  const isAdminUser = u?.role === "admin";
  const hidden = isAdminUser ? new Set<string>() : new Set(db.hiddenDecksFor(userId));
  return DECKS.filter((d) => (isAdminUser || !d.adminOnly) && !hidden.has(d.id));
}

app.get("/api/my-decks", async (req, reply) => {
  const me = db.getUserById(uid(req));
  const isAdmin = me?.role === "admin";
  const q = (req.query as { userId?: string }) ?? {};
  const targetId = isAdmin && q.userId ? Number(q.userId) : uid(req);
  const target = db.getUserById(targetId);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  const usedKeys = new Set(db.usedAnecdoteKeys(targetId));
  const posted = db.postedByUserDeck()[targetId] ?? {};
  const decks = visibleDecksForUser(targetId).map((d) => {
    const s = libraryStats(d.id, usedKeys);
    return { id: d.id, name: d.name, total: s.total, used: s.used, available: s.available, posted: posted[d.id] ?? 0 };
  });
  return { userId: targetId, username: target.username, decks };
});

// Admin: every (user, pack) where the user's remaining cards in that pack is below the threshold (100).
// Across ALL users (admin included) so the admin sees who is about to run out. Lowest remaining first.
app.get("/api/admin/low-decks", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const THRESHOLD = 100;
  const posted = db.postedByUserDeck();
  const out: {
    userId: number;
    username: string;
    deckId: string;
    deckName: string;
    available: number;
    total: number;
    used: number;
    posted: number;
  }[] = [];
  for (const u of db.listUsers()) {
    const usedKeys = new Set(db.usedAnecdoteKeys(u.id));
    for (const d of visibleDecksForUser(u.id)) {
      const s = libraryStats(d.id, usedKeys);
      if (s.available < THRESHOLD) {
        out.push({
          userId: u.id,
          username: u.username,
          deckId: d.id,
          deckName: d.name,
          available: s.available,
          total: s.total,
          used: s.used,
          posted: posted[u.id]?.[d.id] ?? 0,
        });
      }
    }
  }
  out.sort((a, b) => a.available - b.available);
  return out;
});

// ---- Accounts (scoped to the current user) ----
// Own channels; admins may pass ?scope=all to list every user's channels (for the history filter).
app.get("/api/accounts", async (req) => visibleAccounts(req, (req.query as { scope?: string })?.scope));
app.get("/api/accounts/:id", async (req, reply) => {
  const a = ownAccount(req, reply, Number((req.params as { id: string }).id));
  if (!a) return;
  return a;
});
app.post("/api/accounts", async (req) => {
  const body = (req.body as Partial<Account>) ?? {};
  return db.createAccount({ ...body, userId: uid(req), avatar: body.avatar ?? randomAvatar() });
});
// Built-in avatar set (CC0) for the channel avatar picker.
app.get("/api/avatars", async () => listAvatarFiles().map((f) => `/avatars/${f}`));
// Upload a custom channel avatar (JSON { dataUrl }); stored under data/output/avatars, served via /files/.
app.post("/api/accounts/:id/avatar", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!ownAccount(req, reply, id)) return;
  const { dataUrl } = (req.body as { dataUrl?: string }) ?? {};
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m) return reply.code(400).send({ error: "Нужен PNG / JPEG / WEBP (data URL)." });
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3_000_000) return reply.code(400).send({ error: "Слишком большой файл (макс 3 МБ)." });
  const rel = `avatars/acc-${id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  mkdirSync(resolve(process.cwd(), base.outputDir, "avatars"), { recursive: true });
  writeFileSync(resolve(process.cwd(), base.outputDir, rel), buf);
  return db.updateAccount(id, { avatar: `/files/${rel}` });
});
app.put("/api/accounts/:id", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!ownAccount(req, reply, id)) return;
  const body = (req.body as Partial<Account>) ?? {};
  // avatar can only be one of our served paths (built-in /avatars/ or uploaded /files/avatars/)
  if (body.avatar != null && !/^\/(avatars|files)\//.test(body.avatar)) delete body.avatar;
  if (body.lang) {
    const known = DECKS.some((d) => d.id === body.lang) || isPackDeckId(body.lang);
    if (!known) return reply.code(400).send({ error: `Неизвестный язык канала «${body.lang}».` });
    if (!deckAllowed(req, body.lang))
      return reply.code(403).send({ error: "Этот пак вам недоступен — нельзя поставить его языком канала." });
  }
  // Бэкстоп языка: язык выбранного контента (деки/пака) обязан совпадать с языком канала.
  {
    const cur0 = db.getAccount(id);
    const newLang = body.lang ?? cur0?.lang ?? "";
    const newChannelLang = (body.channelLang ?? cur0?.channelLang ?? "") as string;
    if (newChannelLang) {
      const cl = isPackDeckId(newLang)
        ? getPack(newLang.slice(5), uid(req), db.getUserById(uid(req))?.role === "admin")?.lang || ""
        : deckLang(newLang);
      if (cl && cl !== newChannelLang)
        return reply
          .code(400)
          .send({ error: `Язык контента (${cl.toUpperCase()}) ≠ язык канала (${newChannelLang.toUpperCase()}) — выровняй их.` });
    }
  }
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

// Admin analytics: one read-only aggregated snapshot per requested period. No polling and no
// YouTube calls here; it uses stored channel_stats snapshots so opening the tab is cheap.
app.get("/api/admin/analytics", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const q = (req.query as { from?: string; to?: string }) ?? {};
  return buildAdminAnalytics(db, { from: q.from, to: q.to });
});

// Per-user analytics — any signed-in user, HARD-scoped to their OWN channels only.
app.get("/api/analytics", async (req) => {
  const q = (req.query as { from?: string; to?: string }) ?? {};
  return buildUserAnalytics(db, uid(req), { from: q.from, to: q.to });
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
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error_description?: string; error?: unknown } };
    errors?: { message?: string; reason?: string }[];
    message?: string;
  };
  const data = e?.response?.data;
  const status = e?.response?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  // Token endpoint → error/error_description are STRINGS; YouTube Data API → `error` is an OBJECT
  // { code, message, errors:[{reason,message}] }. Extracting .message avoids "[object Object]".
  const apiErr =
    data?.error && typeof data.error === "object"
      ? (data.error as { message?: string; errors?: { reason?: string; message?: string }[] })
      : null;
  const reason = apiErr?.errors?.[0]?.reason ?? e?.errors?.[0]?.reason ?? "";
  const raw =
    data?.error_description ||
    (typeof data?.error === "string" ? data.error : apiErr?.message) ||
    apiErr?.errors?.[0]?.message ||
    e?.errors?.[0]?.message ||
    e?.message ||
    String(err);
  const s = `${String(raw)} ${reason}`.trim();
  if (/youtubeSignupRequired|channelNotFound/i.test(s))
    return `У выбранного Google-аккаунта нет YouTube-канала — создайте канал на youtube.com и переподключите.`;
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project/i.test(s))
    return `В проекте этого Google-ключа не включён YouTube Data API v3 — включите его в Google Cloud и переподключите.`;
  if (/unauthorized_client|invalid_client/i.test(s))
    return `Токен канала не принят (${s}) — переподключите канал в «Каналы».`;
  if (/invalid_grant/i.test(s)) return `Доступ отозван или истёк (${s}) — переподключите канал.`;
  if (status === 401 || /\bunauthorized\b|authorizationRequired/i.test(s))
    return `YouTube не принял авторизацию (401${reason ? " · " + reason : ""}). Обычно причина: у выбранного Google-аккаунта нет YouTube-канала, либо на экране согласия не отмечены галочки доступа к YouTube, либо в проекте ключа не включён YouTube Data API v3.`;
  if (/insufficient|scope|forbidden/i.test(s))
    return `Недостаточно прав токена (${s}) — переподключите канал и отметьте все доступы.`;
  if (/quota|rateLimit|userRateLimitExceeded/i.test(s))
    return `Квота YouTube API исчерпана (${s}) — попробуйте позже.`;
  return `Ошибка YouTube: ${s || "неизвестно"}${status ? ` (HTTP ${status})` : ""}`;
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
  // Backstop (covers save, batch, and the gen-queue worker): never build an admin-only or hidden deck.
  if (
    db.getUserById(input.userId)?.role !== "admin" &&
    (deck.adminOnly || db.isDeckHiddenFor(input.userId, deck.id))
  )
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
  // Christian deck → sacred organ/choir pad (never instrumental music); explicit "none" still means silent.
  if (deck.christian && music !== "none") {
    const pad = pickChristianAudio();
    if (pad) {
      music = pad;
      audioPath = audioPathFor(pad);
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
  if (isPackDeckId(acc.lang))
    return reply.code(400).send({ error: "Это пак-канал — добавляйте ролики кнопкой «Сгенерировать» или через Студию." });
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if (channelDeck.preFact)
    return reply.code(400).send({ error: "Это видео-пак — добавляйте ролики кнопкой «Сгенерировать»." });
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
  const requested = Math.max(1, Math.min(25, Number(body.count) || 5));
  const seen = new Set<string>(db.usedAnecdoteKeys(uid(req))); // exclude this user's used + dedupe batch
  const created: unknown[] = [];
  // Пак-канал (язык = "pack:<id>"): случайные неиспользованные карточки пака → рендер мостом.
  if (isPackDeckId(acc.lang)) {
    if (!deckAllowed(req, acc.lang)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
    const pack = getPack(acc.lang.slice(5), uid(req), db.getUserById(uid(req))?.role === "admin");
    if (!pack) return reply.code(404).send({ error: "Пак не найден." });
    if (!pack.templates.length) return reply.code(400).send({ error: "У пака нет шаблона." });
    for (let i = 0; i < requested; i++) {
      const picked = pickUnusedPackCard(pack, seen);
      if (!picked) break;
      seen.add(picked.key);
      created.push(await buildPackLibraryVideo({ db, userId: uid(req), accountId: body.accountId, pack, picked, music: body.music || undefined }));
    }
    return { created, requested, made: created.length, exhausted: created.length < requested };
  }
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if (!deckAllowed(req, channelDeck.id))
    return reply.code(403).send({ error: "Этот пак вам недоступен." });
  const deckId = channelDeck.id; // FORCE the channel's language — no cross-language mixing
  for (let i = 0; i < requested; i++) {
    const a = randomAnecdote(deckId, seen);
    if (!a) break; // no unused anecdotes left
    seen.add(anecdoteKey(a.text));
    if (channelDeck.preFact) {
      // Pre-built fact videos: copy the chosen mp4 into the library (no rendering).
      created.push(await buildFactLibraryVideo({ db, userId: uid(req), accountId: body.accountId, deckId, picked: a }));
      continue;
    }
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
  const seen = new Set<string>(db.usedAnecdoteKeys(job.userId)); // skip this user's already-used cards
  // Пак-канал: одна случайная неиспользованная карточка пака → видео в библиотеку.
  if (isPackDeckId(acc.lang)) {
    const pack = getPack(acc.lang.slice(5), job.userId, db.getUserById(job.userId)?.role === "admin");
    if (!pack || !pack.templates.length) throw new Error(`Пак «${acc.lang}» не найден или без шаблона`);
    const picked = pickUnusedPackCard(pack, seen);
    if (!picked) return "exhausted";
    await buildPackLibraryVideo({ db, userId: job.userId, accountId: job.accountId, pack, picked });
    return "made";
  }
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck) throw new Error(`У канала язык «${acc.lang}» без пака`);
  const a = randomAnecdote(channelDeck.id, seen);
  if (!a) return "exhausted"; // deck has no unused cards left
  if (channelDeck.preFact) {
    await buildFactLibraryVideo({ db, userId: job.userId, accountId: job.accountId, deckId: channelDeck.id, picked: a });
    return "made";
  }
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
  // Пак-канал тоже можно ставить в очередь (воркер сгенерит карточки пака); иначе — встроенная дека.
  if (isPackDeckId(acc.lang)) {
    if (!deckAllowed(req, acc.lang)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  } else {
    const channelDeck = DECKS.find((d) => d.id === acc.lang);
    if (!channelDeck)
      return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
    if (!deckAllowed(req, channelDeck.id))
      return reply.code(403).send({ error: "Этот пак вам недоступен." });
  }
  const cap = db.getUserById(uid(req))?.role === "admin" ? 100 : 50;
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
  // Admin-only packs (e.g. new decks) are never exposed to non-admins.
  const base = DECKS.filter((d) => !hidden.has(d.id) && (isAdmin || !d.adminOnly)).map((d) => {
    const s = libraryStats(d.id, used);
    return {
      id: d.id,
      name: d.name,
      ai: false,
      preFact: !!d.preFact, // pre-built video pack (no text render) — Studio shows a random video
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

// Random PRE-BUILT fact video (preFact deck) for the Studio preview player — no rendering, no "used" filter.
app.get("/api/fact/random", async (req, reply) => {
  const deckId = (req.query as { deck?: string })?.deck || "fact-en";
  const deck = getDeck(deckId);
  if (!deck.preFact) return reply.code(400).send({ error: "Это не видео-пак." });
  if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  const a = randomAnecdote(deck.id); // preview may repeat — don't exclude used
  if (!a?.videoFile) return { error: "В этом паке пока нет видео." };
  return { videoUrl: `/fact-videos/${a.videoFile}`, title: a.title, text: a.text };
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
  // Christian deck → sacred organ/choir pad (never instrumental music); explicit "none" still means silent.
  if (deck.christian && music !== "none") {
    const pad = pickChristianAudio();
    if (pad) {
      music = pad;
      audioPath = audioPathFor(pad);
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
    const scheduler = startScheduler({
      db,
      outputDir: resolve(process.cwd(), base.outputDir),
      credsForUser: userCreds,
      redirectUri: REDIRECT_URI,
      log: (m) => app.log.info(m),
    });
    metrics.startSampler(resolve(process.cwd(), base.outputDir));

    // ---- Graceful shutdown: drain in-flight render/upload, then close cleanly (SIGTERM/SIGINT) ----
    // So a restart never interrupts a render mid-flight (no orphan temp files / no double-post).
    let shuttingDown = false;
    const onSignal = async (sig: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`[shutdown] получен ${sig}`);
      try {
        await gracefulShutdown({
          log: (m) => app.log.info("[shutdown] " + m),
          stopScheduler: () => scheduler.stop(),
          drainQueue: () => genDrainQueue(),
          activeCounts: () => metrics.activeCounts(),
          closeServer: () => app.close(),
          closeDb: () => {
            try {
              db.db.close();
            } catch {
              /* already closed */
            }
          },
        });
      } catch (e) {
        app.log.error(e, "[shutdown] ошибка при остановке");
      }
      process.exit(0);
    };
    process.on("SIGTERM", () => void onSignal("SIGTERM"));
    process.on("SIGINT", () => void onSignal("SIGINT"));
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
