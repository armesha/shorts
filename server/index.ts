import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { extname, isAbsolute, relative, resolve } from "node:path";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { loadBaseConfig, resolveClientSecretFile, credsFileExists } from "./config.ts";
import { openDb, type Account } from "./db.ts";
import { randomAnecdote, libraryStats, anecdoteKey, deckAnecdoteKeys } from "../src/anecdotes/library.ts";
import { DECKS, getDeck, ytMeta, pickGenericTitle, isPackDeckId, deckLang } from "../src/anecdotes/decks.ts";
import { listAllPacks, setGrant, setPackOwners, getPack, canAccess } from "../src/packs/store.ts";
import { pickUnusedPackCard, buildPackLibraryVideo, packCardKey } from "./pack-gen.ts";
import { buildFactLibraryVideo } from "./fact-gen.ts";
import { renderAnecdote, listBackgrounds } from "../src/anecdotes/render.ts";
import { assembleStillVideo, listAudio, resolveAudio } from "../src/video.ts";
import { buildStillVideoFiles } from "./media.ts";
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
import { fetchChannelAnalyticsBundle, ytAnalyticsErrorMessage } from "./youtube-analytics.ts";
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
import {
  initGenQueue,
  enqueue as genEnqueue,
  jobStatus as genJobStatus,
  cancelJob as genCancelJob,
  drainQueue as genDrainQueue,
  queuedRemainingForUser as genQueuedRemainingForUser,
} from "./gen-queue.ts";
import { gracefulShutdown } from "./shutdown.ts";
import { buildAdminAnalytics } from "./admin-analytics.ts";
import { buildUserAnalytics } from "./user-analytics.ts";
import { dailyScheduleLimitError } from "./account-limits.ts";
import {
  RATE_LIMIT_MESSAGE,
  RateLimitError,
  checkRateLimit,
  heavyActiveKey,
  withActiveLimit,
} from "./rate-limits.ts";
import { rememberedOutputOwner, rememberOutputOwner } from "./output-access.ts";

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
for (const acc of db.listAccounts()) {
  if (acc.channelLang) continue;
  let lng = deckLang(acc.lang); // built-in deck → its content language ("" for custom packs)
  if (!lng && isPackDeckId(acc.lang)) lng = getPack(acc.lang.slice(5), acc.userId ?? 0, true)?.lang || "";
  if (lng) db.updateAccount(acc.id, { channelLang: lng });
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
    if (av) db.updateAccount(acc.id, { avatar: av, avatarSource: "random" });
  }
}

const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT ?? `http://localhost:${process.env.PORT ?? 8080}/api/youtube/callback`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const CHANNEL_TOTALS_TTL_MS = 15 * 60 * 1000;
const YT_ANALYTICS_TTL_MS = 6 * 60 * 60 * 1000;
const USER_GEN_QUEUE_CAP = 100;
const STUDIO_IMAGE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };
const STUDIO_VIDEO_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };
const BATCH_VIDEO_LIMIT = { limit: 2, windowMs: 30 * 60 * 1000 };
const NORMAL_BATCH_VIDEO_CAP = 5;

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
      (req.method === "GET" || req.method === "HEAD") &&
      !req.url.startsWith("/api/") &&
      !req.url.startsWith("/files/") &&
      !req.url.startsWith("/audio/") &&
      !req.url.startsWith("/fact-videos/") &&
      !req.url.startsWith("/avatars/")
    ) {
      reply.type("text/html; charset=utf-8");
      if (req.method === "HEAD") return reply.send();
      return reply.send(createReadStream(resolve(WEB_DIST, "index.html"))); // SPA fallback (e.g. /accounts/1, /login)
    }
    return reply.code(404).send({ error: "not found" });
  });
  app.log.info("[web] serving built frontend from web/dist (single-origin production mode)");
}

// ---- Auth: session cookie + login throttling ------------------------------------------------
const SESSION_COOKIE = "sid";
const ADMIN_SESSION_COOKIE = "admin_sid";
// Secure cookie: ON by default whenever the app is served over HTTPS (PUBLIC_BASE_URL=https://…),
// which is the prod case (Cloudflare Tunnel). SESSION_COOKIE_SECURE=1/0 forces it on/off for edge cases.
const COOKIE_SECURE =
  process.env.SESSION_COOKIE_SECURE === "1" ||
  (process.env.SESSION_COOKIE_SECURE !== "0" && (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://"));
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
function sessionCookieHeader(token: string): string {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function adminSessionCookieHeader(token: string): string {
  const attrs = [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${SESSION_TTL_DAYS * 86_400}`,
  ];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function clearSessionCookieHeader(): string {
  const attrs = [`${SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function clearAdminSessionCookieHeader(): string {
  const attrs = [`${ADMIN_SESSION_COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (COOKIE_SECURE) attrs.push("Secure");
  return attrs.join("; ");
}

function setSessionCookie(reply: { header: (k: string, v: string) => unknown }, token: string) {
  reply.header("Set-Cookie", sessionCookieHeader(token));
}
function clearSessionCookie(reply: { header: (k: string, v: string) => unknown }) {
  reply.header("Set-Cookie", clearSessionCookieHeader());
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
  "/api/auth/impersonation/stop", // restore admin session from admin_sid while impersonating
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
registerPasswordRoutes(app, db);
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
  return publicUser(req, user);
});

app.post("/api/auth/logout", async (req, reply) => {
  const token = getCookie(req, SESSION_COOKIE);
  const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
  if (token) db.deleteSession(token);
  if (adminToken && adminToken !== token) db.deleteSession(adminToken);
  reply.header("Set-Cookie", [clearSessionCookieHeader(), clearAdminSessionCookieHeader()]);
  return { ok: true };
});

app.get("/api/auth/me", async (req, reply) => {
  const user = db.getUserById(uid(req));
  if (!user) return reply.code(401).send({ error: "Не авторизован" });
  return publicUser(req, user);
});

app.post("/api/auth/impersonation/stop", async (req, reply) => {
  const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
  const admin = validSessionUser(adminToken);
  if (!admin || admin.role !== "admin" || !adminToken) {
    reply.header("Set-Cookie", clearAdminSessionCookieHeader());
    return reply.code(401).send({ error: "Админская сессия не найдена" });
  }
  const currentToken = getCookie(req, SESSION_COOKIE);
  if (currentToken && currentToken !== adminToken) db.deleteSession(currentToken);
  reply.header("Set-Cookie", [sessionCookieHeader(adminToken), clearAdminSessionCookieHeader()]);
  return publicUser(req, admin, null);
});

// uid of the authenticated request (guaranteed set by the hook for gated routes).
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;
type Replyish = { code: (n: number) => { send: (b: unknown) => unknown } };

function validSessionUser(token: string | null): { id: number; username: string; role: string } | null {
  const sess = token ? db.getSession(token) : null;
  if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) {
    if (token) db.deleteSession(token);
    return null;
  }
  const u = db.getUserById(sess.userId);
  return u ? { id: u.id, username: u.username, role: u.role } : null;
}

function impersonatorUser(req: unknown): { id: number; username: string; role: string } | null {
  const currentId = (req as { userId?: number }).userId ?? null;
  const admin = validSessionUser(getCookie(req as { headers: { cookie?: string } }, ADMIN_SESSION_COOKIE));
  if (!admin || admin.role !== "admin" || admin.id === currentId) return null;
  return admin;
}

function publicUser(
  req: unknown,
  user: { id: number; username: string; role: string },
  impersonator = impersonatorUser(req),
) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    impersonator,
  };
}

const OUTPUT_ROOT = resolve(process.cwd(), base.outputDir);

function cleanOutputRel(raw: string): string | null {
  let rel = raw.replace(/^\/+/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (!rel || isAbsolute(rel) || rel.includes("\\")) return null;
  const parts = rel.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  const abs = resolve(OUTPUT_ROOT, rel);
  const back = relative(OUTPUT_ROOT, abs);
  if (!back || back.startsWith("..") || isAbsolute(back)) return null;
  return rel;
}

function outputContentType(rel: string): string {
  const ext = extname(rel).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function parseRangeHeader(raw: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
  if (!m) return null;
  if (!m[1] && !m[2]) return null;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

function canReadOutputFile(rel: string, user: { id: number; role: string }): boolean {
  if (user.role === "admin") return true;
  const rememberedOwner = rememberedOutputOwner(rel);
  if (rememberedOwner != null) return rememberedOwner === user.id;
  if (rel.startsWith("preview/")) return true;
  if (rel.startsWith("avatars/")) return true;
  if (rel.startsWith("admin-demos/")) return false;
  const packPreview = /^packs\/(.+)-\d+\.png$/i.exec(rel);
  if (packPreview) return getPack(packPreview[1], user.id, false) !== null;
  if (rel.startsWith("library/")) return db.findOutputFileOwner(rel)?.userId === user.id;
  return false;
}

// Output files are user data. Serve them through an authz gate instead of exposing data/output.
app.get("/files/*", async (req, reply) => {
  const user = validSessionUser(getCookie(req, SESSION_COOKIE));
  if (!user) return reply.code(401).send({ error: "Не авторизован" });
  const rel = cleanOutputRel(String((req.params as Record<string, string>)["*"] ?? ""));
  if (!rel || !canReadOutputFile(rel, user)) return reply.code(404).send({ error: "not found" });
  const abs = resolve(OUTPUT_ROOT, rel);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(abs);
  } catch {
    return reply.code(404).send({ error: "not found" });
  }
  if (!st.isFile()) return reply.code(404).send({ error: "not found" });

  const contentType = outputContentType(rel);
  reply.header("Content-Type", contentType);
  reply.header("Accept-Ranges", "bytes");
  const rangeRaw = req.headers.range;
  const range = typeof rangeRaw === "string" ? parseRangeHeader(rangeRaw, st.size) : null;
  if (rangeRaw && !range) {
    reply.header("Content-Range", `bytes */${st.size}`);
    return reply.code(416).send();
  }
  if (range) {
    reply.header("Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
    reply.header("Content-Length", String(range.end - range.start + 1));
    return reply.code(206).send(createReadStream(abs, { start: range.start, end: range.end }));
  }
  reply.header("Content-Length", String(st.size));
  return reply.send(createReadStream(abs));
});

function requireAdmin(req: unknown, reply: Replyish): boolean {
  const u = db.getUserById(uid(req));
  if (u?.role !== "admin") {
    reply.code(403).send({ error: "Только для администратора" });
    return false;
  }
  return true;
}

function isAdminReq(req: unknown): boolean {
  return db.getUserById(uid(req))?.role === "admin";
}

type ElevenLabsLimitKey = {
  index: number;
  keyHint: string;
  status: "ok" | "exhausted" | "invalid" | "rate_limited" | "error" | "blocked";
  httpStatus?: number;
  tier?: string | null;
  characterCount: number | null;
  characterLimit: number | null;
  remaining: number | null;
  usedPercent: number | null;
  resetAt: string | null;
  error?: string;
};

function readElevenLabsKeys(): string[] {
  const raw = [
    process.env.ELEVENLABS_API_KEYS ?? "",
    process.env.ELEVENLABS_API_KEY ?? "",
    ...Object.entries(process.env)
      .filter(([name]) => /^ELEVENLABS_API_KEY_\d+$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, value]) => value ?? ""),
  ].join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];
}

function secretHint(key: string, index: number): string {
  return `key #${index + 1} · ...${key.slice(-4)}`;
}

function scrubElevenLabsError(value: unknown, key?: string): string {
  let msg = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!msg || msg === "\"\"") return "ElevenLabs did not return an error body";
  if (key) msg = msg.split(key).join("[secret]");
  return msg.replace(/sk_[A-Za-z0-9_]+/g, "[secret]").slice(0, 240);
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// "Roger" — a premade voice; free-tier API may use it (Voice-Library voices are barred on free).
const ELEVENLABS_PROBE_VOICE = "CwhRBWXzGAHq8TQ4Fs17";

// A key can pass the subscription check yet be barred from generating: ElevenLabs
// flags free accounts for "unusual activity" (VPN / datacenter / shared-IP / multi-account)
// and disables Free-Tier generation, but the subscription endpoint still returns 200/ok.
// Detect it with an EMPTY-text TTS request — it bills 0 characters, yet a flagged account
// still returns 401 detected_unusual_activity before any generation. Returns a reason if
// barred, else null. Only an explicit unusual-activity signal flips the verdict (conservative).
async function probeElevenLabsBlocked(key: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_PROBE_VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: "", model_id: "eleven_multilingual_v2" }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { detail?: { status?: string; message?: string } } | null;
    if (res.status === 401 && body?.detail?.status === "detected_unusual_activity") {
      return scrubElevenLabsError(body?.detail?.message ?? "Free Tier disabled (unusual activity)", key);
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchElevenLabsLimit(key: string, index: number): Promise<ElevenLabsLimitKey> {
  const baseRow = {
    index,
    keyHint: secretHint(key, index),
    characterCount: null,
    characterLimit: null,
    remaining: null,
    usedPercent: null,
    resetAt: null,
  };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: {
        accept: "application/json",
        "xi-api-key": key,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const status =
        res.status === 401 || res.status === 403
          ? "invalid"
          : res.status === 429
            ? "rate_limited"
            : "error";
      return {
        ...baseRow,
        status,
        httpStatus: res.status,
        error: scrubElevenLabsError(body, key),
      };
    }

    const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const count = asNumber(obj.character_count);
    const limit = asNumber(obj.character_limit);
    const remaining = count != null && limit != null ? Math.max(0, limit - count) : null;
    const resetUnix = asNumber(obj.next_character_count_reset_unix);
    const resetAt = resetUnix ? new Date(resetUnix * 1000).toISOString() : null;
    const usedPercent = count != null && limit != null && limit > 0 ? Math.min(100, Math.round((count / limit) * 1000) / 10) : null;
    const row: ElevenLabsLimitKey = {
      ...baseRow,
      status: remaining === 0 && limit != null && limit > 0 ? "exhausted" : "ok",
      tier: typeof obj.tier === "string" ? obj.tier : null,
      characterCount: count,
      characterLimit: limit,
      remaining,
      usedPercent,
      resetAt,
    };
    // Subscription says "ok", but the account may still be barred from generating — probe it.
    if (row.status === "ok") {
      const blocked = await probeElevenLabsBlocked(key);
      if (blocked) {
        row.status = "blocked";
        row.error = blocked;
      }
    }
    return row;
  } catch (err) {
    return {
      ...baseRow,
      status: "error",
      error: scrubElevenLabsError((err as Error)?.message ?? err, key),
    };
  }
}

type LimitedReplyish = Replyish & { header: (k: string, v: string) => unknown };

function sendGenerationRateLimit(reply: LimitedReplyish, retryAfterMs = 1_000): unknown {
  reply.header("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return reply.code(429).send({ error: RATE_LIMIT_MESSAGE });
}

function enforceGenerationWindow(
  req: unknown,
  reply: LimitedReplyish,
  route: string,
  rule: { limit: number; windowMs: number },
): boolean {
  if (isAdminReq(req)) return true;
  const hit = checkRateLimit(`user:${uid(req)}:${route}:window`, rule);
  if (!hit.ok) {
    sendGenerationRateLimit(reply, hit.retryAfterMs);
    return false;
  }
  return true;
}

async function runHeavyGenerationLimited<T>(
  req: unknown,
  reply: LimitedReplyish,
  route: string,
  fn: () => Promise<T>,
): Promise<T | unknown> {
  try {
    const isAdmin = isAdminReq(req);
    return await withActiveLimit(heavyActiveKey(uid(req), isAdmin, route), isAdmin ? 2 : 1, fn);
  } catch (e) {
    if (e instanceof RateLimitError) return sendGenerationRateLimit(reply, e.retryAfterMs);
    throw e;
  }
}

// Admins may inspect/edit any channel; regular users stay locked to their own channels.
function accessibleAccount(req: unknown, reply: Replyish, id: number): Account | null {
  const a = db.getAccount(id);
  if (!a || (!isAdminReq(req) && a.userId !== uid(req))) {
    reply.code(404).send({ error: "Канал не найден" });
    return null;
  }
  return a;
}

function accountOwnerId(req: unknown, account: Account): number {
  return account.userId ?? uid(req);
}

function rejectScheduleLimit(reply: Replyish, schedule: unknown, ownerId: number, excludeAccountId?: number): boolean {
  if (!Array.isArray(schedule)) return false;
  const otherSlots = db.scheduleSlotsForUser(ownerId, excludeAccountId);
  const limitError = dailyScheduleLimitError(schedule.length, otherSlots);
  if (!limitError) return false;
  reply.code(400).send({ error: limitError });
  return true;
}

function accountOwnerCreds(req: unknown, account: Account): ClientCreds | null {
  return userCreds(accountOwnerId(req, account));
}

// True if the user may use a deck (pack): admins always; admin-only packs never for non-admins;
// otherwise unless the deck is hidden for them.
function deckAllowed(req: unknown, deckId: string): boolean {
  if (isAdminReq(req)) return true;
  // Кастомные паки: доступ по владению/гранту (getPack применяет canAccess), а не по hidden.
  if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), false) !== null;
  if (getDeck(deckId).adminOnly) return false;
  return !db.isDeckHiddenFor(uid(req), deckId);
}

function cleanDeckIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
}

function accountSourceDecks(account: Account): string[] {
  const ids = account.sourceDecks?.length ? account.sourceDecks : [account.lang];
  return [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
}

function deckExists(req: unknown, deckId: string): boolean {
  if (DECKS.some((d) => d.id === deckId)) return true;
  return isPackDeckId(deckId) && !!getPack(deckId.slice(5), uid(req), isAdminReq(req));
}

function deckContentLang(req: unknown, deckId: string): string {
  if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), isAdminReq(req))?.lang || "";
  return deckLang(deckId);
}

function validateAccountSourceDeck(req: unknown, deckId: string, channelLang: string): string | null {
  if (!deckExists(req, deckId)) return `Неизвестный пак «${deckId}».`;
  if (!deckAllowed(req, deckId)) return "Этот пак вам недоступен — нельзя поставить его источником канала.";
  const contentLang = deckContentLang(req, deckId);
  if (channelLang && contentLang && contentLang !== channelLang)
    return `Язык контента (${contentLang.toUpperCase()}) ≠ язык канала (${channelLang.toUpperCase()}) — выровняй их.`;
  return null;
}

function resolveAccountSourceDeck(
  req: unknown,
  reply: Replyish,
  account: Account,
  requested?: string | null,
): string | null {
  const deckId = String(requested || account.lang || "").trim();
  const sources = accountSourceDecks(account);
  if (!deckId || !sources.includes(deckId)) {
    reply.code(400).send({ error: "Этот пак не выбран источником канала — сначала добавьте его в «Паки канала»." });
    return null;
  }
  const err = validateAccountSourceDeck(req, deckId, account.channelLang);
  if (err) {
    reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
    return null;
  }
  return deckId;
}

function notificationVisible(req: unknown, notificationId: number): boolean {
  const n = db.getNotification(notificationId);
  return !!n && (isAdminReq(req) || n.userId === uid(req));
}

type NotificationStreamClient = {
  userId: number;
  scopeAll: boolean;
  write: (chunk: string) => void;
};

const notificationStreams = new Set<NotificationStreamClient>();

function writeNotificationEvent(client: NotificationStreamClient, event: string, data: unknown) {
  try {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    notificationStreams.delete(client);
  }
}

function emitNotificationChange(userId?: number | null) {
  const data = { userId: userId ?? null, at: new Date().toISOString() };
  for (const client of notificationStreams) {
    if (userId == null || client.scopeAll || client.userId === userId) {
      writeNotificationEvent(client, "notifications", data);
    }
  }
}

function errorText(err: unknown): string {
  const e = err as { message?: string; stack?: string; response?: { data?: unknown }; errors?: unknown };
  const parts = [e?.message, e?.response?.data, e?.errors, e?.stack]
    .filter((x) => x != null)
    .map((x) => {
      if (typeof x === "string") return x;
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    });
  return parts.join("\n");
}

function publicErrorMessage(err: unknown): string {
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 500);
  return "Не удалось выполнить операцию";
}

function extractGoogleApiUrl(text: string): string | null {
  const m = text.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/youtubeanalytics\.googleapis\.com\/overview\?project=\d+/i);
  return m?.[0] ?? null;
}

function extractGoogleProjectId(text: string): string | null {
  return (
    text.match(/[?&]project=(\d+)/)?.[1] ??
    text.match(/\bproject\s+(\d+)\b/i)?.[1] ??
    null
  );
}

function notifyYouTubeAnalyticsIssue(account: Account, err: unknown, analyticsError: string) {
  if (account.userId == null) return;
  const raw = `${analyticsError}\n${errorText(err)}`;
  const disabled = /SERVICE_DISABLED|accessNotConfigured|has not been used|not enabled|disabled/i.test(raw);
  const projectId = extractGoogleProjectId(raw);
  const actionUrl =
    extractGoogleApiUrl(raw) ??
    (projectId
      ? `https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=${projectId}`
      : null);
  const channelName = account.ytChannelTitle || account.channelName || `#${account.id}`;
  const notification = db.upsertNotification({
    userId: account.userId,
    accountId: account.id,
    severity: "error",
    category: "youtube_analytics",
    title: disabled ? "YouTube Analytics API выключен" : "Проблема YouTube Analytics",
    message: `Канал «${channelName}»: ${analyticsError}`,
    solution: disabled
      ? "Откройте Google Cloud Console → APIs & Services → Library → YouTube Analytics API → Enable. Если API только что включили, подождите несколько минут и снова нажмите «Обновить статистику»."
      : "Проверьте Google-ключ владельца канала, доступы OAuth и подключение канала. После исправления нажмите «Обновить статистику» ещё раз.",
    actionUrl,
    dedupeKey: disabled
      ? `youtube-analytics-disabled:account=${account.id}:project=${projectId ?? "unknown"}`
      : `youtube-analytics-error:account=${account.id}:${analyticsError.slice(0, 120)}`,
    source: "server",
    context: `analytics refresh account=${account.id}`,
  });
  emitNotificationChange(notification.userId);
}

function notifyStatsRefreshIssue(account: Account, err: unknown, message: string) {
  if (account.userId == null) return;
  const channelName = account.ytChannelTitle || account.channelName || `#${account.id}`;
  const notification = db.upsertNotification({
    userId: account.userId,
    accountId: account.id,
    severity: "error",
    category: "youtube_stats",
    title: "Статистика YouTube не обновилась",
    message: `Канал «${channelName}»: ${message}`,
    solution:
      "Проверьте, что канал подключён к YouTube, Google-ключ владельца загружен в «Настройках», а в Google Cloud включён YouTube Data API v3. Потом обновите статистику снова.",
    actionUrl: null,
    dedupeKey: `youtube-stats-error:account=${account.id}:${message.slice(0, 120)}`,
    source: "server",
    context: `stats refresh account=${account.id}`,
  });
  emitNotificationChange(notification.userId);
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
app.get("/api/settings", async (req) => ({
  hasGoogleKey: !!db.getUserClientSecret(uid(req)),
}));

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

app.post("/api/admin/users/:id/impersonate", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const targetId = Number((req.params as { id: string }).id);
  const target = db.getUserById(targetId);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  if (target.id === uid(req)) return reply.code(400).send({ error: "Нельзя войти под самим собой" });
  const adminToken = getCookie(req, SESSION_COOKIE);
  if (!adminToken) return reply.code(401).send({ error: "Админская сессия не найдена" });
  const targetToken = newSessionToken();
  db.createSession(targetToken, target.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
  reply.header("Set-Cookie", [sessionCookieHeader(targetToken), adminSessionCookieHeader(adminToken)]);
  const admin = db.getUserById(uid(req))!;
  return {
    id: target.id,
    username: target.username,
    role: target.role,
    impersonator: { id: admin.id, username: admin.username, role: admin.role },
  };
});

app.post("/api/admin/users/:id/notifications", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const targetId = Number((req.params as { id: string }).id);
  const target = db.getUserById(targetId);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  const body =
    (req.body as {
      severity?: string;
      title?: string;
      message?: string;
      solution?: string;
      actionUrl?: string;
    }) ?? {};
  const message = (body.message ?? "").trim();
  if (!message) return reply.code(400).send({ error: "Текст уведомления обязателен" });
  const title = (body.title ?? "").trim() || "Сообщение от администратора";
  const severity = ["info", "warning", "error"].includes(body.severity ?? "") ? body.severity! : "info";
  const admin = db.getUserById(uid(req))!;
  const notification = db.upsertNotification({
    userId: target.id,
    accountId: null,
    severity,
    category: "admin_message",
    title,
    message,
    solution: (body.solution ?? "").trim() || null,
    actionUrl: (body.actionUrl ?? "").trim() || null,
    dedupeKey: `admin-message:${target.id}:${Date.now()}:${newSessionToken().slice(0, 12)}`,
    source: "admin",
    context: `admin notification by ${admin.username}#${admin.id}`,
  });
  emitNotificationChange(notification.userId);
  return notification;
});

app.get("/api/admin/limits", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const keys = readElevenLabsKeys();
  const rows = await Promise.all(keys.map((key, index) => fetchElevenLabsLimit(key, index)));
  const numericRows = rows.filter((row) => row.characterCount != null && row.characterLimit != null);
  const characterCount = numericRows.reduce((sum, row) => sum + (row.characterCount ?? 0), 0);
  const characterLimit = numericRows.reduce((sum, row) => sum + (row.characterLimit ?? 0), 0);
  const remaining = numericRows.reduce((sum, row) => sum + Math.max(0, row.remaining ?? 0), 0);
  return {
    provider: "elevenlabs",
    updatedAt: new Date().toISOString(),
    keys: rows,
    totals: {
      configured: rows.length,
      active: rows.filter((row) => row.status === "ok" && (row.remaining == null || row.remaining > 0)).length,
      exhausted: rows.filter((row) => row.status === "exhausted").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      rateLimited: rows.filter((row) => row.status === "rate_limited").length,
      errors: rows.filter((row) => row.status === "error").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      characterCount: numericRows.length ? characterCount : null,
      characterLimit: numericRows.length ? characterLimit : null,
      remaining: numericRows.length ? remaining : null,
      usedPercent: characterLimit > 0 ? Math.min(100, Math.round((characterCount / characterLimit) * 1000) / 10) : null,
    },
  };
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
        .filter((p) => u.role === "admin" || p.owners.includes(u.id) || p.grants.includes(u.id))
        .map((p) => `pack:${p.id}`),
      used: used[u.id] ?? [],
      scheduled: db.scheduleSlotsForUser(u.id), // posts/day planned across all their channels
      library: db.countVideosByUser(u.id), // videos queued in their libraries
      usedTotal: db.usedAnecdoteCount(u.id), // всего использованных карточек (встроенные + кастомные) — бейдж в панели сброса
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
      if (p.owners.includes(id)) continue; // владельцу грант не нужен
      setGrant(p.id, id, want.has(p.id));
    }
  }
  return { ok: true, hidden: finalHidden };
});

// Reset one user's used-history for a built-in deck. Existing library videos stay intact;
// the next generation can pick that deck's items from the beginning again.
app.post("/api/admin/users/:id/decks/:deckId/reset", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number((req.params as { id: string; deckId: string }).id);
  const deckId = decodeURIComponent((req.params as { id: string; deckId: string }).deckId);
  const target = db.getUserById(id);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  // Кастомный пак: ключи карточек = packCardKey(values); чистим именно их у этого юзера.
  if (deckId.startsWith("pack:")) {
    const pack = getPack(deckId.slice(5), id, true); // admin-load: читаем карточки любого пака
    if (!pack) return reply.code(404).send({ error: "Пак не найден" });
    const removed = db.clearAnecdoteUsedKeys(id, pack.cards.map((c) => packCardKey(c.values)));
    return { ok: true, removed };
  }
  if (!DECKS.some((d) => d.id === deckId)) return reply.code(404).send({ error: "Пак не найден" });
  const removed = db.clearAnecdoteUsedKeys(id, deckAnecdoteKeys(deckId));
  return { ok: true, removed };
});

// Admin: полная «занятость паков» одного юзера — каждый встроенный дек и кастомный пак, который он
// МОЖЕТ использовать ИЛИ уже использовал, с per-user used/total/available. Кормит панель сброса
// (встроенные `DECKS` + кастомные `pack:*`), чтобы было видно ВСЕ паки юзера, а не только использованные.
app.get("/api/admin/users/:id/pack-usage", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = Number((req.params as { id: string }).id);
  const target = db.getUserById(id);
  if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
  const usedKeys = db.usedAnecdoteKeys(id);
  const targetIsAdmin = target.role === "admin";
  const hidden = targetIsAdmin ? new Set<string>() : new Set(db.hiddenDecksFor(id));
  const items: { id: string; name: string; pack: boolean; total: number; used: number; available: number }[] = [];
  // Встроенные деки: видимые юзеру ИЛИ уже использованные (чтобы ничего сбрасываемого не пряталось).
  for (const d of DECKS) {
    const visible = (targetIsAdmin || !d.adminOnly) && !hidden.has(d.id);
    const s = libraryStats(d.id, usedKeys);
    if (!visible && s.used === 0) continue;
    items.push({ id: d.id, name: d.name, pack: false, total: s.total, used: s.used, available: s.available });
  }
  // Кастомные паки: доступные юзеру ИЛИ уже использованные (ключи карточек — packCardKey(values)).
  for (const summary of listAllPacks()) {
    const pack = getPack(summary.id, id, true); // admin-load: нужны карточки, чтобы посчитать used
    if (!pack) continue;
    let used = 0;
    for (const c of pack.cards) if (usedKeys.has(packCardKey(c.values))) used++;
    if (!canAccess(pack, id, targetIsAdmin) && used === 0) continue;
    const total = pack.cards.length;
    items.push({ id: `pack:${pack.id}`, name: pack.name, pack: true, total, used, available: Math.max(0, total - used) });
  }
  return { userId: id, username: target.username, items };
});

// Admin: set a custom pack's owners (0+ users). Owners may edit the pack (name/lang/cards) on /cards.
// Админов во владельцы НЕ пишем — админ и так редактирует любой пак; пустой список = у пака нет владельца.
app.put("/api/admin/packs/:id/owners", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const id = (req.params as { id: string }).id.replace(/^pack:/, "");
  const raw = (req.body as { owners?: unknown })?.owners;
  const ids = Array.isArray(raw) ? [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
  const owners: number[] = [];
  for (const oid of ids) {
    const u = db.getUserById(oid);
    if (!u) return reply.code(404).send({ error: "Пользователь не найден" });
    if (u.role === "admin") continue; // админ владельцем не становится — у него и так полный доступ
    owners.push(oid);
  }
  if (!setPackOwners(id, owners)) return reply.code(404).send({ error: "Пак не найден" });
  return { ok: true, owners };
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

// ---- Accounts ----
// Regular users see/edit only their own channels. Admins may pass ?scope=all to list every user's
// channels and may open/edit a specific /accounts/:id directly.
app.get("/api/accounts", async (req) => visibleAccounts(req, (req.query as { scope?: string })?.scope));
app.get("/api/accounts/:id", async (req, reply) => {
  const a = accessibleAccount(req, reply, Number((req.params as { id: string }).id));
  if (!a) return;
  return a;
});
app.post("/api/accounts", async (req, reply) => {
  const body = (req.body as Partial<Account>) ?? {};
  if (rejectScheduleLimit(reply, body.schedule, uid(req))) return;
  return db.createAccount({
    ...body,
    userId: uid(req),
    avatar: body.avatar ?? randomAvatar(),
    avatarSource: body.avatar ? "manual" : "random",
  });
});
// Built-in avatar set (CC0) for the channel avatar picker.
app.get("/api/avatars", async () => listAvatarFiles().map((f) => `/avatars/${f}`));
// Upload a custom channel avatar (JSON { dataUrl }); stored under data/output/avatars, served via /files/.
app.post("/api/accounts/:id/avatar", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!accessibleAccount(req, reply, id)) return;
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
  const acc = accessibleAccount(req, reply, id);
  if (!acc) return;
  const body = (req.body as Partial<Account>) ?? {};
  // avatar can only be one of our served paths (built-in /avatars/ or uploaded /files/avatars/)
  if (body.avatar != null && !/^\/(avatars|files)\//.test(body.avatar)) delete body.avatar;
  else if (body.avatar != null) body.avatarSource = "manual";
  const requestedSources = cleanDeckIds((body as { sourceDecks?: unknown }).sourceDecks);
  if (requestedSources.length) {
    const channelLang = (body.channelLang ?? acc.channelLang ?? "") as string;
    for (const deckId of requestedSources) {
      const err = validateAccountSourceDeck(req, deckId, channelLang);
      if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
    }
    body.sourceDecks = requestedSources;
    if (!body.lang || !requestedSources.includes(body.lang)) body.lang = requestedSources[0];
  } else if (body.lang) {
    const err = validateAccountSourceDeck(req, body.lang, (body.channelLang ?? acc.channelLang ?? "") as string);
    if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
    body.sourceDecks = [body.lang];
  }
  // Бэкстоп языка: язык выбранного контента (деки/пака) обязан совпадать с языком канала.
  {
    const sources = body.sourceDecks?.length ? body.sourceDecks : accountSourceDecks(acc);
    const newLang = body.lang ?? sources[0] ?? acc.lang ?? "";
    const newChannelLang = (body.channelLang ?? acc.channelLang ?? "") as string;
    for (const source of sources) {
      const cl = deckContentLang(req, source);
      if (newChannelLang && cl && cl !== newChannelLang)
        return reply
          .code(400)
          .send({ error: `Язык контента (${cl.toUpperCase()}) ≠ язык канала (${newChannelLang.toUpperCase()}) — выровняй их.` });
    }
    if (!sources.includes(newLang)) body.lang = sources[0] ?? newLang;
  }
  if (body.slotDecks && typeof body.slotDecks === "object" && !Array.isArray(body.slotDecks)) {
    const allowed = new Set(body.sourceDecks?.length ? body.sourceDecks : accountSourceDecks(acc));
    const clean: Record<string, string> = {};
    for (const [time, deckId] of Object.entries(body.slotDecks)) {
      const t = String(time || "").trim();
      const d = String(deckId || "").trim();
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) && allowed.has(d)) clean[t] = d;
    }
    body.slotDecks = clean;
  }
  // Caps apply to admins too; they are about platform load, not permissions.
  if (rejectScheduleLimit(reply, body.schedule, accountOwnerId(req, acc), id)) return;
  const a = db.updateAccount(id, body);
  if (!a) return reply.code(404).send({ error: "not found" });
  return a;
});
app.delete("/api/accounts/:id", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!accessibleAccount(req, reply, id)) return;
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

// Per-user analytics — any signed-in user, scoped to their OWN channels. Admins may pass
// ?scope=all to aggregate publishing activity across EVERY channel (matches the «Все каналы» tab).
app.get("/api/analytics", async (req) => {
  const q = (req.query as { from?: string; to?: string; scope?: string }) ?? {};
  const allChannels = q.scope === "all" && db.getUserById(uid(req))?.role === "admin";
  return buildUserAnalytics(db, uid(req), { from: q.from, to: q.to }, { allChannels });
});

// ---- Channel stats: subscribers/views/videos snapshots + deltas ----
// Reads (`readonly`): ANY signed-in user may view every channel's stats (?scope=all).
// Writes/refresh (default): ?scope=all targets every channel ONLY for admins — a regular
// user always gets just their own channels, so the «Обновить» button can't touch others'.
// Reads use the SAME OAuth as uploads (youtube.readonly) — no re-auth.
function visibleAccounts(req: unknown, scope?: string, readonly = false): Account[] {
  const u = db.getUserById(uid(req));
  if (scope === "all" && (readonly || u?.role === "admin")) return db.listAccounts();
  return db.listAccountsByUser(uid(req));
}
// A channel the current user may view: read-only stat history is visible to everyone; for
// anything else only the owner (or an admin) may see it.
function visibleAccount(req: unknown, id: number, readonly = false): Account | null {
  const a = db.getAccount(id);
  if (!a) return null;
  if (readonly) return a;
  const u = db.getUserById(uid(req));
  return a.userId === uid(req) || u?.role === "admin" ? a : null;
}

function parseUtcMs(s: string | null | undefined): number {
  if (!s) return 0;
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").getTime();
}

function freshEnough(takenAt: string | null | undefined, ttlMs: number): boolean {
  const t = parseUtcMs(takenAt);
  return t > 0 && Date.now() - t < ttlMs;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// Refresh always pulls a WIDE 90-day window of per-day rows; the read endpoint then summarizes any
// 7/30/90-day sub-range from the stored daily rows (no extra YouTube calls per period switch).
const ANALYTICS_FETCH_DAYS = 90;
const ALLOWED_STAT_DAYS = [7, 30, 90] as const;
function youtubeAnalyticsRange(now = new Date(), days = ANALYTICS_FETCH_DAYS): { from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 2);
  const to = isoDate(end);
  return { from: addDays(to, -(days - 1)), to };
}
function clampStatDays(v: string | undefined): number {
  const n = Number(v);
  return (ALLOWED_STAT_DAYS as readonly number[]).includes(n) ? n : 30;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function accountAnalyticsPayload(accountId: number, days = 30) {
  const latest = db.latestSnapshot(accountId);
  const range = youtubeAnalyticsRange(new Date(), days);
  const daily = db.listDailyAnalytics([accountId], range.from, range.to);
  const summary = daily.reduce(
    (acc, r) => {
      acc.views += r.views;
      acc.engagedViews += r.engagedViews;
      acc.watchMinutes += r.watchMinutes;
      acc.likes += r.likes;
      acc.dislikes += r.dislikes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      acc.subscribersGained += r.subscribersGained;
      acc.subscribersLost += r.subscribersLost;
      if (r.views > 0) {
        acc._durationWeighted += r.avgViewDuration * r.views;
        acc._percentageWeighted += r.avgViewPercentage * r.views;
      }
      return acc;
    },
    {
      views: 0,
      engagedViews: 0,
      watchMinutes: 0,
      avgViewDuration: 0,
      avgViewPercentage: 0,
      likes: 0,
      dislikes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
      _durationWeighted: 0,
      _percentageWeighted: 0,
    },
  );
  if (summary.views > 0) {
    summary.avgViewDuration = summary._durationWeighted / summary.views;
    summary.avgViewPercentage = summary._percentageWeighted / summary.views;
  }
  const { _durationWeighted, _percentageWeighted, ...cleanSummary } = summary;
  return {
    range,
    days,
    status: latest?.analyticsStatus ?? null,
    error: latest?.analyticsError ?? null,
    dataThrough: latest?.dataThrough ?? db.latestDailyAnalyticsDate(accountId),
    takenAt: latest?.analyticsTakenAt ?? null,
    summary: cleanSummary,
    daily,
    topVideos: asArray(db.latestReportCache(accountId, "topVideos")?.payload),
    trafficSources: asArray(db.latestReportCache(accountId, "trafficSources")?.payload),
    devices: asArray(db.latestReportCache(accountId, "devices")?.payload),
    countries: asArray(db.latestReportCache(accountId, "countries")?.payload),
    subscribedStatus: asArray(db.latestReportCache(accountId, "subscribedStatus")?.payload),
    demographics: asArray(db.latestReportCache(accountId, "demographics")?.payload),
    sharing: asArray(db.latestReportCache(accountId, "sharing")?.payload),
    retention: asArray(db.latestReportCache(accountId, "retention")?.payload),
  };
}

function summarizeStoredAnalytics(accountId: number, from: string, to: string) {
  const rows = db.listDailyAnalytics([accountId], from, to);
  const summary = rows.reduce(
    (acc, r) => {
      acc.watchMinutes += r.watchMinutes;
      acc.engagedViews += r.engagedViews;
      acc.avgViewDuration += r.avgViewDuration * r.views;
      acc.avgViewPercentage += r.avgViewPercentage * r.views;
      acc.likes += r.likes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      acc.subscribersGained += r.subscribersGained;
      acc.subscribersLost += r.subscribersLost;
      acc.views += r.views;
      return acc;
    },
    {
      views: 0,
      watchMinutes: 0,
      engagedViews: 0,
      avgViewDuration: 0,
      avgViewPercentage: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    },
  );
  if (summary.views > 0) {
    summary.avgViewDuration /= summary.views;
    summary.avgViewPercentage /= summary.views;
  }
  return summary;
}

// One row for the stats table: current totals + the previous snapshot (frontend computes +/-).
function statRow(a: Account, error?: string | null, days = 30) {
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
    analytics: accountAnalyticsPayload(a.id, days),
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
  const q = req.query as { scope?: string; days?: string };
  const days = clampStatDays(q.days);
  const me = uid(req);
  const isAdmin = db.getUserById(me)?.role === "admin";
  // Everyone may view all channels' stats; the owner's identity is hidden from non-admins.
  return visibleAccounts(req, q.scope, true).map((a) => {
    const row = statRow(a, null, days);
    if (!isAdmin && a.userId !== me) row.ownerUsername = null;
    return row;
  });
});

// Platform-wide production totals (queue / uploaded / scheduled / channels) — visible to every
// signed-in user. No per-user breakdown or PII; just the aggregate counters.
app.get("/api/summary", async () => db.platformSummary());

// Poll YouTube for each visible+connected channel, store a fresh snapshot, return rows with deltas.
// Each channel is queried with ITS OWNER's Google key (per-user isolation), all in parallel.
app.post("/api/stats/refresh", async (req) => {
  const scope = (req.query as { scope?: string }).scope;
  const accounts = visibleAccounts(req, scope);
  const errors = new Map<number, string>();
  const analyticsRange = youtubeAnalyticsRange();
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
        const latest = db.latestSnapshot(a.id);
        let totals = latest && freshEnough(latest.takenAt, CHANNEL_TOTALS_TTL_MS)
          ? { subscribers: latest.subscribers, views: latest.views, videos: latest.videos }
          : null;
        let wroteSnapshot = false;
        if (!totals) {
          const freshTotals = await fetchChannelStats(creds, REDIRECT_URI, token);
          totals = freshTotals;
          db.setYouTube(a.id, {
            refreshToken: token,
            channelId: freshTotals.channelId ?? a.ytChannelId,
            channelTitle: freshTotals.channelTitle ?? a.ytChannelTitle,
            channelAvatar: freshTotals.channelAvatar,
          });
        }

        const cachedTopVideos = db.getReportCache(a.id, "topVideos", analyticsRange.from, analyticsRange.to);
        let analyticsStatus = latest?.analyticsStatus ?? null;
        let analyticsError: string | null = null;
        let dataThrough = latest?.dataThrough ?? db.latestDailyAnalyticsDate(a.id);
        let analyticsTakenAt = latest?.analyticsTakenAt ?? null;
        let analyticsSummary = summarizeStoredAnalytics(a.id, analyticsRange.from, analyticsRange.to);
        let analyticsTouched = false;

        if (cachedTopVideos && freshEnough(cachedTopVideos.takenAt, YT_ANALYTICS_TTL_MS)) {
          analyticsStatus = "cached";
          analyticsTakenAt = cachedTopVideos.takenAt;
        } else {
          try {
            const bundle = await fetchChannelAnalyticsBundle(creds, REDIRECT_URI, token, a.id, analyticsRange);
            db.upsertDailyAnalytics(bundle.daily);
            db.setReportCache(a.id, "topVideos", analyticsRange.from, analyticsRange.to, bundle.topVideos);
            db.setReportCache(a.id, "trafficSources", analyticsRange.from, analyticsRange.to, bundle.trafficSources);
            db.setReportCache(a.id, "devices", analyticsRange.from, analyticsRange.to, bundle.devices);
            db.setReportCache(a.id, "countries", analyticsRange.from, analyticsRange.to, bundle.countries);
            db.setReportCache(a.id, "subscribedStatus", analyticsRange.from, analyticsRange.to, bundle.subscribedStatus);
            db.setReportCache(a.id, "demographics", analyticsRange.from, analyticsRange.to, bundle.demographics);
            db.setReportCache(a.id, "sharing", analyticsRange.from, analyticsRange.to, bundle.sharing);
            db.setReportCache(a.id, "retention", analyticsRange.from, analyticsRange.to, bundle.retention);
            analyticsStatus = "ok";
            analyticsSummary = bundle.summary;
            dataThrough = bundle.dataThrough;
            analyticsTakenAt = new Date().toISOString();
            analyticsTouched = true;
          } catch (err) {
            analyticsStatus = "error";
            analyticsError = ytAnalyticsErrorMessage(err);
            analyticsTouched = true;
            errors.set(a.id, analyticsError);
            app.log.error({ err: String(err), accountId: a.id }, "youtube analytics refresh failed");
            db.addError({
              source: "server",
              message: "YouTube Analytics: " + analyticsError,
              detail: (err as Error)?.stack ?? null,
              context: `analytics refresh account=${a.id}`,
              userId: a.userId ?? null,
            });
            notifyYouTubeAnalyticsIssue(a, err, analyticsError);
          }
        }

        if (
          !latest ||
          !freshEnough(latest.takenAt, CHANNEL_TOTALS_TTL_MS) ||
          analyticsTouched ||
          analyticsStatus !== latest.analyticsStatus ||
          analyticsError
        ) {
          db.addChannelSnapshot({
            accountId: a.id,
            subscribers: totals.subscribers,
            views: totals.views,
            videos: totals.videos,
            analyticsStatus,
            analyticsError,
            dataThrough,
            watchMinutes: analyticsSummary.watchMinutes,
            engagedViews: analyticsSummary.engagedViews,
            avgViewDuration: analyticsSummary.avgViewDuration,
            avgViewPercentage: analyticsSummary.avgViewPercentage,
            likes: analyticsSummary.likes,
            comments: analyticsSummary.comments,
            shares: analyticsSummary.shares,
            subscribersGained: analyticsSummary.subscribersGained,
            subscribersLost: analyticsSummary.subscribersLost,
            analyticsTakenAt,
          });
          wroteSnapshot = true;
        }
        if (!wroteSnapshot && analyticsError) errors.set(a.id, analyticsError);
      } catch (err) {
        app.log.error({ err: String(err), accountId: a.id }, "stats refresh failed");
        const msg = ytErrorMessage(err);
        db.addError({
          source: "server",
          message: "Статистика: " + msg,
          detail: (err as Error)?.stack ?? null,
          context: `stats refresh account=${a.id}`,
          userId: a.userId ?? null,
        });
        notifyStatsRefreshIssue(a, err, msg);
        errors.set(a.id, msg);
      }
    }),
  );
  return accounts.map((a) => statRow(a, errors.get(a.id)));
});

app.post("/api/stats/refresh-data-only", async (req, reply) => {
  if (!requireAdmin(req, reply)) return;
  const q = (req.query as { scope?: string }) ?? {};
  const body = (req.body as { accountIds?: number[] }) ?? {};
  const requested = new Set(
    Array.isArray(body.accountIds) ? body.accountIds.map(Number).filter((id) => Number.isFinite(id)) : [],
  );
  if (Array.isArray(body.accountIds) && requested.size === 0) return [];

  const all = visibleAccounts(req, q.scope);
  const accounts = all.filter((a) => {
    if (a.status !== "connected") return false;
    if (requested.size) return requested.has(a.id);
    return true;
  });
  const errors = new Map<number, string>();
  const analyticsRange = youtubeAnalyticsRange();
  await Promise.all(
    accounts.map(async (a) => {
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
        const totals = await fetchChannelStats(creds, REDIRECT_URI, token);
        db.setYouTube(a.id, {
          refreshToken: token,
          channelId: totals.channelId ?? a.ytChannelId,
          channelTitle: totals.channelTitle ?? a.ytChannelTitle,
          channelAvatar: totals.channelAvatar,
        });
        const latest = db.latestSnapshot(a.id);
        const analyticsSummary = summarizeStoredAnalytics(a.id, analyticsRange.from, analyticsRange.to);
        db.addChannelSnapshot({
          accountId: a.id,
          subscribers: totals.subscribers,
          views: totals.views,
          videos: totals.videos,
          analyticsStatus: "data_only",
          analyticsError: null,
          dataThrough: latest?.dataThrough ?? db.latestDailyAnalyticsDate(a.id),
          watchMinutes: analyticsSummary.watchMinutes,
          engagedViews: analyticsSummary.engagedViews,
          avgViewDuration: analyticsSummary.avgViewDuration,
          avgViewPercentage: analyticsSummary.avgViewPercentage,
          likes: analyticsSummary.likes,
          comments: analyticsSummary.comments,
          shares: analyticsSummary.shares,
          subscribersGained: analyticsSummary.subscribersGained,
          subscribersLost: analyticsSummary.subscribersLost,
          analyticsTakenAt: latest?.analyticsTakenAt ?? null,
        });
      } catch (err) {
        app.log.error({ err: String(err), accountId: a.id }, "youtube data-only refresh failed");
        const msg = ytErrorMessage(err);
        db.addError({
          source: "server",
          message: "Статистика YouTube Data: " + msg,
          detail: (err as Error)?.stack ?? null,
          context: `stats data-only refresh account=${a.id}`,
          userId: a.userId ?? null,
        });
        errors.set(a.id, msg);
      }
    }),
  );
  return accounts.map((a) => statRow(a, errors.get(a.id)));
});

app.get("/api/stats/:id/history", async (req, reply) => {
  // Read-only snapshot history of any channel — visible to every signed-in user (matches the
  // «Все каналы» stats view; same harmless subscribers/views series already shown on the card).
  const a = visibleAccount(req, Number((req.params as { id: string }).id), true);
  if (!a) return reply.code(404).send({ error: "Канал не найден" });
  return db.listChannelSnapshots(a.id);
});

// ---- User notifications: user issue inbox; admins may inspect all users' inboxes ----
app.get("/api/notifications", async (req, reply) => {
  const q = (req.query as { scope?: string; status?: string; userId?: string; limit?: string; offset?: string }) ?? {};
  const scopeAll = q.scope === "all";
  if (scopeAll && !requireAdmin(req, reply)) return;
  const userId = scopeAll && q.userId ? Number(q.userId) : uid(req);
  if (!Number.isFinite(userId) || userId <= 0) return reply.code(400).send({ error: "Некорректный пользователь" });
  const status = q.status || "open";
  return db.listNotifications({
    userId: scopeAll && !q.userId ? undefined : userId,
    includeResolved: status === "all",
    onlyResolved: status === "resolved",
    onlyUnread: status === "unread",
    limit: Number(q.limit) || 100,
    offset: Number(q.offset) || 0,
  });
});

app.get("/api/notifications/stream", async (req, reply) => {
  const q = (req.query as { scope?: string }) ?? {};
  const scopeAll = q.scope === "all";
  if (scopeAll && !requireAdmin(req, reply)) return;

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const client: NotificationStreamClient = {
    userId: uid(req),
    scopeAll,
    write: (chunk) => reply.raw.write(chunk),
  };
  notificationStreams.add(client);
  writeNotificationEvent(client, "ready", { at: new Date().toISOString() });

  const ping = setInterval(() => {
    try {
      reply.raw.write(": ping\n\n");
    } catch {
      clearInterval(ping);
      notificationStreams.delete(client);
    }
  }, 25_000);

  req.raw.on("close", () => {
    clearInterval(ping);
    notificationStreams.delete(client);
  });
});

app.get("/api/notifications/counts", async (req, reply) => {
  const q = (req.query as { scope?: string }) ?? {};
  const scopeAll = q.scope === "all";
  if (scopeAll && !requireAdmin(req, reply)) return;
  return db.notificationCounts(scopeAll ? undefined : uid(req));
});

app.post("/api/notifications/read-all", async (req, reply) => {
  const q = (req.query as { scope?: string }) ?? {};
  const scopeAll = q.scope === "all";
  if (scopeAll && !requireAdmin(req, reply)) return;
  const changed = db.markAllNotificationsRead(scopeAll ? undefined : uid(req));
  emitNotificationChange(scopeAll ? null : uid(req));
  return { ok: true, changed };
});

app.post("/api/notifications/:id/read", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
  const notification = db.markNotificationRead(id);
  if (notification) emitNotificationChange(notification.userId);
  return notification;
});

app.post("/api/notifications/:id/unread", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
  const notification = db.markNotificationUnread(id);
  if (notification) emitNotificationChange(notification.userId);
  return notification;
});

app.post("/api/notifications/:id/resolve", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
  const notification = db.resolveNotification(id);
  if (notification) emitNotificationChange(notification.userId);
  return notification;
});

app.delete("/api/notifications/:id", async (req, reply) => {
  const id = Number((req.params as { id: string }).id);
  if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
  const notification = db.getNotification(id);
  db.deleteNotification(id);
  if (notification) emitNotificationChange(notification.userId);
  return { ok: true };
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
  const acc = accessibleAccount(req, reply, accountId);
  if (!acc) return;
  const creds = accountOwnerCreds(req, acc);
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
  if (!accessibleAccount(req, reply, accountId)) return;
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
  const { music, audioPath } = resolveAudio(input.music, deck);
  const { imgRel, vidRel, render: r } = await buildStillVideoFiles({
    prefix: "vid",
    outputDir: base.outputDir,
    audioPath,
    render: (imgAbs) =>
      renderAnecdote(
        { title, text: input.text, channel: deck.name, bg: input.bg, deck: deck.id, profession: input.profession },
        imgAbs,
      ),
  });
  const v = db.createVideo({
    accountId: input.accountId,
    title,
    text: input.text,
    bg: r.bg,
    music,
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
  const acc = accessibleAccount(req, reply, body.accountId);
  if (!acc) return;
  const ownerId = accountOwnerId(req, acc);
  const sourceDeckId = resolveAccountSourceDeck(req, reply, acc, body.deck);
  if (!sourceDeckId) return;
  if (isPackDeckId(sourceDeckId))
    return reply.code(400).send({ error: "Это пак-канал — добавляйте ролики кнопкой «Сгенерировать» или через Студию." });
  const channelDeck = DECKS.find((d) => d.id === sourceDeckId);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${sourceDeckId}» без пака — смените язык канала.` });
  if (channelDeck.preFact)
    return reply.code(400).send({ error: "Это видео-пак — добавляйте ролики кнопкой «Сгенерировать»." });
  if (!deckAllowed(req, channelDeck.id))
    return reply.code(403).send({ error: "Этот пак вам недоступен." });
  return buildLibraryVideo({
    userId: ownerId,
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
  const accountId = body.accountId;
  const acc = accessibleAccount(req, reply, accountId);
  if (!acc) return;
  if (!enforceGenerationWindow(req, reply, "videos-batch", BATCH_VIDEO_LIMIT)) return;
  return runHeavyGenerationLimited(req, reply, "videos-batch", async () => {
    const ownerId = accountOwnerId(req, acc);
    const requested = Math.max(1, Math.min(isAdminReq(req) ? 25 : NORMAL_BATCH_VIDEO_CAP, Number(body.count) || 5));
    const seen = new Set<string>(db.usedAnecdoteKeys(ownerId)); // exclude owner-used + dedupe batch
    const created: unknown[] = [];
    const sourceDeckId = resolveAccountSourceDeck(req, reply, acc, body.deck);
    if (!sourceDeckId) return;
    // Пак-канал (язык = "pack:<id>"): случайные неиспользованные карточки пака → рендер мостом.
    if (isPackDeckId(sourceDeckId)) {
      if (!deckAllowed(req, sourceDeckId)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
      const pack = getPack(sourceDeckId.slice(5), ownerId, isAdminReq(req));
      if (!pack) return reply.code(404).send({ error: "Пак не найден." });
      if (!pack.templates.length) return reply.code(400).send({ error: "У пака нет шаблона." });
      for (let i = 0; i < requested; i++) {
        const picked = pickUnusedPackCard(pack, seen);
        if (!picked) break;
        seen.add(picked.key);
        created.push(
          await buildPackLibraryVideo({
            db,
            userId: ownerId,
            accountId,
            pack,
            picked,
            music: body.music || undefined,
          }),
        );
      }
      return { created, requested, made: created.length, exhausted: created.length < requested };
    }
    const channelDeck = DECKS.find((d) => d.id === sourceDeckId);
    if (!channelDeck)
      return reply.code(400).send({ error: `У канала язык «${sourceDeckId}» без пака — смените язык канала.` });
    if (!deckAllowed(req, channelDeck.id))
      return reply.code(403).send({ error: "Этот пак вам недоступен." });
    const deckId = channelDeck.id; // FORCE the channel's language — no cross-language mixing
    for (let i = 0; i < requested; i++) {
      const a = randomAnecdote(deckId, seen);
      if (!a) break; // no unused anecdotes left
      seen.add(anecdoteKey(a.text));
      if (channelDeck.preFact) {
        // Pre-built fact videos: copy the chosen mp4 into the library (no rendering).
        created.push(await buildFactLibraryVideo({ db, userId: ownerId, accountId, deckId, picked: a }));
        continue;
      }
      created.push(
        await buildLibraryVideo({
          userId: ownerId,
          accountId,
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
});

// ---- Global generation queue: ONE video at a time across ALL users → bounds server load ----
// Worker = make ONE random unused video for the job's channel (a single batch step).
initGenQueue(async (job) => {
  const acc = db.getAccount(job.accountId);
  if (!acc) throw new Error("Канал не найден");
  const ownerId = job.ownerUserId ?? job.userId;
  const seen = new Set<string>(db.usedAnecdoteKeys(ownerId)); // skip owner's already-used cards
  const sources = job.deckIds?.length ? job.deckIds : accountSourceDecks(acc);
  const generateFromSource = async (sourceDeck: string): Promise<"made" | "exhausted"> => {
    // Пак-канал: одна случайная неиспользованная карточка пака → видео в библиотеку.
    if (isPackDeckId(sourceDeck)) {
      const pack = getPack(sourceDeck.slice(5), ownerId, db.getUserById(job.userId)?.role === "admin");
      if (!pack || !pack.templates.length) throw new Error(`Пак «${sourceDeck}» не найден или без шаблона`);
      const picked = pickUnusedPackCard(pack, seen);
      if (!picked) return "exhausted";
      await buildPackLibraryVideo({ db, userId: ownerId, accountId: job.accountId, pack, picked });
      return "made";
    }
    const channelDeck = DECKS.find((d) => d.id === sourceDeck);
    if (!channelDeck) throw new Error(`У канала язык «${sourceDeck}» без пака`);
    const a = randomAnecdote(channelDeck.id, seen);
    if (!a) return "exhausted"; // deck has no unused cards left
    if (channelDeck.preFact) {
      await buildFactLibraryVideo({ db, userId: ownerId, accountId: job.accountId, deckId: channelDeck.id, picked: a });
      return "made";
    }
    await buildLibraryVideo({
      userId: ownerId,
      accountId: job.accountId,
      text: a.text,
      title: a.title,
      deck: channelDeck.id,
      profession: a.profession,
    });
    return "made";
  };
  for (let offset = 0; offset < Math.max(1, sources.length); offset++) {
    const sourceDeck = sources[(job.done + offset) % Math.max(1, sources.length)] || acc.lang;
    const result = await generateFromSource(sourceDeck);
    if (result === "made") return "made";
  }
  return "exhausted";
});

// Enqueue a batch. Regular users may have at most USER_GEN_QUEUE_CAP unfinished videos queued
// across their jobs; admins are not capped.
app.post("/api/gen-queue", async (req, reply) => {
  const body = (req.body as { accountId?: number; count?: number; deckIds?: string[] }) ?? {};
  if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
  const acc = accessibleAccount(req, reply, body.accountId);
  if (!acc) return;
  const ownerId = accountOwnerId(req, acc);
  const requestedDecks = cleanDeckIds(body.deckIds);
  const sources = accountSourceDecks(acc);
  const deckIds = requestedDecks.length ? requestedDecks : [acc.lang];
  for (const deckId of deckIds) {
    if (!sources.includes(deckId))
      return reply.code(400).send({ error: "Этот пак не выбран источником канала — сначала добавьте его в «Паки канала»." });
    const err = validateAccountSourceDeck(req, deckId, acc.channelLang);
    if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
  }
  const isAdmin = db.getUserById(uid(req))?.role === "admin";
  const perRequestCap = isAdmin ? Number.MAX_SAFE_INTEGER : 50;
  const total = Math.max(1, Math.min(perRequestCap, Math.floor(Number(body.count) || 1)));
  if (!isAdmin) {
    const queued = genQueuedRemainingForUser(uid(req));
    const remaining = Math.max(0, USER_GEN_QUEUE_CAP - queued);
    if (total > remaining)
      return reply.code(400).send({
        error:
          remaining > 0
            ? `В вашей очереди уже ${queued} видео. Можно добавить ещё максимум ${remaining}.`
            : `В вашей очереди уже максимум ${USER_GEN_QUEUE_CAP} видео — дождитесь завершения части задач.`,
      });
  }
  const job = genEnqueue(uid(req), body.accountId, total, ownerId, deckIds);
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
  if (!accessibleAccount(req, reply, v.accountId)) return;
  db.deleteVideo(v.id);
  return { ok: true };
});

app.post("/api/videos/:id/post-now", async (req, reply) => {
  const v = db.getVideo(Number((req.params as { id: string }).id));
  if (!v) return reply.code(404).send({ error: "not found" });
  const acc = accessibleAccount(req, reply, v.accountId);
  if (!acc) return;
  const token = db.getRefreshToken(v.accountId);
  if (!token) return reply.code(400).send({ error: "Канал не подключён к YouTube" });
  const creds = accountOwnerCreds(req, acc);
  if (!creds) return reply.code(400).send({ error: "Сначала загрузите свой Google-ключ в Настройках" });
  // HARD source guard: never post a video whose deck is not selected for this channel.
  if (!accountSourceDecks(acc).includes(v.deck))
    return reply.code(400).send({ error: `Пак ролика (${v.deck}) не выбран у канала — не выложено.` });
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
  const body = (req.body as { text?: string; title?: string; bg?: string; avoidBg?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  if (!enforceGenerationWindow(req, reply, "studio-image", STUDIO_IMAGE_LIMIT)) return;
  return runHeavyGenerationLimited(req, reply, "studio-image", async () => {
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
      renderAnecdote(
        { title, text, channel: deck.name, bg: body.bg, avoidBg: body.avoidBg, deck: deck.id, profession },
        out,
      ),
    );
    rememberOutputOwner([rel], uid(req));
    return { imageUrl: `/files/${rel}`, title, text, chars: text.length, bg: r.bg, fontPx: r.fontPx };
  });
});

app.get("/api/backgrounds", async () => listBackgrounds());
app.get("/api/music", async () => listAudio());

let videoCounter = 0;
app.post("/api/generate/anecdote-video", async (req, reply) => {
  const body = (req.body as { text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
  if (!enforceGenerationWindow(req, reply, "studio-video", STUDIO_VIDEO_LIMIT)) return;
  return runHeavyGenerationLimited(req, reply, "studio-video", async () => {
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

    // Music: explicit track | "none" = silent | empty = random; islamic/christian get their own ambient bed.
    const { music, audioPath } = resolveAudio(body.music, deck);

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
    rememberOutputOwner([imgRel, vidRel], uid(req));
    return { videoUrl: `/files/${vidRel}`, imageUrl: `/files/${imgRel}`, title, text, chars: text.length, bg: r.bg, music };
  });
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
