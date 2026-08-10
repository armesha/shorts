// Composition root for the Fastify backend. Boots the DB, runs idempotent seeds/migrations, wires the
// plugins + static + SPA fallback, installs the global auth gate (PUBLIC_API allowlist), builds the
// shared foundation singletons ONCE (auth-session, deck-access, the SSE notifier, buildLibraryVideo),
// then registers every route module with that injected foundation, and finally listens + starts the
// scheduler + graceful shutdown. All HTTP handlers + domain helpers live in routes/ + services/ + infra/.
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { loadBaseConfig, resolveClientSecretFile, credsFileExists } from "./config.ts";
import { openDb, parseCredMeta, type Account } from "./db.ts";
import { anecdoteKey } from "../src/anecdotes/library.ts";
import { isPackDeckId, deckLang } from "../src/anecdotes/decks.ts";
import { getPack } from "../src/packs/store.ts";
import { parseCreds, type ClientCreds } from "./services/youtube.ts";
import { startScheduler } from "./infra/scheduler.ts";
import * as metrics from "./infra/metrics.ts";
import { type RefreshHooks } from "./services/stats-refresh.ts";
import { hashPassword, isSuperAdminUser } from "./auth.ts";
import { gracefulShutdown } from "./infra/shutdown.ts";
import { attachGenQueueDb, drainQueue as genDrainQueue } from "./services/gen-queue.ts";
import { ensureSuperAdminBootstrap } from "./services/super-admin-bootstrap.ts";
import { startGeminiTtsLocalJobRunner } from "./services/gemini-tts-local-jobs.ts";

// ---- Foundation singletons (built once, injected everywhere) ----
import { makeAuthSession, getCookie, SESSION_COOKIE, setSessionCookie } from "./infra/auth-session.ts";
import { makeDeckAccess } from "./services/deck-access.ts";
import { makeNotifier } from "./services/notify-stream.ts";
import { makeBuildLibraryVideo } from "./services/library-build.ts";
import { startTelegramDigestScheduler } from "./services/telegram-digest.ts";
import { youtubeAnalyticsRange, summarizeStoredAnalytics } from "./services/analytics-range.ts";
import { ytErrorMessage } from "./services/youtube-errors.ts";
import { syncContentLibraryIndex } from "./services/content-library-index.ts";
import { makeRouteDeps } from "./routes/deps.ts";
import { markPackLibraryVideoUsed } from "./services/pack-gen.ts";

// ---- Route modules ----
import { registerPasswordRoutes } from "./routes/password-routes.ts";
import { registerTelegramRoutes } from "./routes/telegram-routes.ts";
import { registerPsychCardsRoutes } from "./routes/psych-cards-routes.ts";
import { registerPacksRoutes } from "./routes/packs-routes.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerFilesRoutes } from "./routes/files.ts";
import { registerSettingsKeysRoutes } from "./routes/settings-keys.ts";
import { registerAdminRoutes } from "./routes/admin.ts";
import { registerAccountsRoutes } from "./routes/accounts.ts";
import { registerStatsRoutes } from "./routes/stats.ts";
import { registerNotificationsRoutes } from "./routes/notifications.ts";
import { registerYouTubeOAuthRoutes } from "./routes/youtube-oauth.ts";
import { registerVideosRoutes } from "./routes/videos.ts";
import { registerGenQueueRoutes } from "./routes/gen-queue.ts";
import { registerStudioGalleryRoutes } from "./routes/studio-gallery.ts";
import { registerClipDemosRoutes } from "./routes/clip-demos.ts";
import { registerContentCatalogRoutes } from "./routes/content-catalog.ts";
import { registerQueueRoutes } from "./routes/queue.ts";
import { registerAccountReadinessRoutes } from "./routes/account-readiness.ts";
import { registerSuperAdminChannelBlockRoutes } from "./routes/super-admin-channel-blocks.ts";
import { registerExamplesRoutes } from "./routes/examples.ts";
import { registerAudioRoutes } from "./routes/audio.ts";
import { registerMemesRoutes } from "./routes/memes.ts";
import { registerIdeasRoutes } from "./routes/ideas.ts";
import { registerSzzRoutes } from "./routes/szz.ts";
import { registerCircleEditorRoutes } from "./routes/circle-editor.ts";
import { registerSignalsRoutes } from "./routes/signals.ts";

const base = loadBaseConfig();
const db = openDb(base.dbPath);
const embeddedGenQueueRunner = process.env.GEN_QUEUE_RUNNER !== "0" && process.env.GEN_QUEUE_RUNNER !== "external";
attachGenQueueDb(db.db, { recoverRunning: embeddedGenQueueRunner });
try {
  const synced = syncContentLibraryIndex(db.db);
  process.env.CONTENT_LIBRARY_SQLITE = "1";
  process.env.CONTENT_LIBRARY_DB = base.dbPath;
  console.log(`[content] SQLite library index synced: ${synced.decks} decks, ${synced.items} items.`);
} catch (err) {
  console.warn("[content] SQLite library index sync failed; falling back to JSON files.", err);
}

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
const superAdminBootstrap = ensureSuperAdminBootstrap(db);
if (superAdminBootstrap.status === "promoted_flagged")
  console.log(`[auth] Promoted flagged super admin "${superAdminBootstrap.user.username}" to role "admin".`);
if (superAdminBootstrap.status === "bootstrapped")
  console.log(`[auth] Marked bootstrap super admin "${superAdminBootstrap.user.username}".`);
if (superAdminBootstrap.status === "missing")
  console.warn(`[auth] No super admin found (${superAdminBootstrap.reason}) — set is_super_admin=1 on exactly one admin user.`);

// ---- One-time migrations: all pre-existing data belongs to the first admin ----
const firstAdmin = db.getSuperAdminUser() ?? db.listUsers().find((u) => u.role === "admin") ?? db.listUsers()[0] ?? null;
if (firstAdmin) {
  db.assignOrphanAccounts(firstAdmin.id); // channels with no owner → admin
  // Seed the admin's first Google key from the legacy global client-secret file so already-connected
  // channels keep working (their refresh tokens were minted with that client_id). ONE-TIME, gated on a
  // persisted flag (not the live key count) so that once the admin deletes that key it is NOT recreated
  // on the next restart. The per-user legacy column is migrated into oauth_clients in openDb.
  if (db.getSetting("legacyGlobalKeySeeded") !== "1") {
    try {
      const p = credsPath();
      if (credsFileExists(p) && db.countOAuthClients(firstAdmin.id) === 0) {
        const json = readFileSync(p, "utf8");
        const meta = parseCredMeta(json);
        db.addOAuthClient(firstAdmin.id, { json, clientId: meta.clientId, projectId: meta.projectId });
      }
    } catch {
      /* no global file — admin uploads his own key in Settings */
    }
    db.setSetting("legacyGlobalKeySeeded", "1");
  }
}

// Self-heal used-anecdote marks PER OWNER (every saved library video is a used anecdote).
// At boot the pack files cannot change yet; cache them only for this repair pass. Without this,
// a large library repeatedly reads and parses the same multi-megabyte JSON pack for every video.
const startupPackCache = new Map<string, ReturnType<typeof getPack>>();
for (const acc of db.listAccounts()) {
  if (acc.userId == null) continue;
  const ownerIsSuperAdmin = isSuperAdminUser(db.getUserById(acc.userId));
  for (const v of db.listVideos(acc.id)) {
    if (isPackDeckId(v.deck)) {
      const cacheKey = `${acc.userId}:${ownerIsSuperAdmin ? "super" : "user"}:${v.deck}`;
      let pack = startupPackCache.get(cacheKey);
      if (pack === undefined) {
        pack = getPack(v.deck.slice("pack:".length), acc.userId, ownerIsSuperAdmin);
        startupPackCache.set(cacheKey, pack);
      }
      if (markPackLibraryVideoUsed(db, acc.userId, acc.id, v.deck, v, ownerIsSuperAdmin, pack)) continue;
    }
    db.markAnecdoteUsed(acc.userId, anecdoteKey(v.text));
  }
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

// ---- Legacy built-in avatar set. Channel display avatars come from YouTube thumbnails. ----
const AVATAR_DIR = resolve(process.cwd(), "assets/avatars");
function listAvatarFiles(): string[] {
  try {
    return readdirSync(AVATAR_DIR).filter((f) => /\.(png|jpe?g|webp|svg)$/i.test(f)).sort();
  } catch {
    return [];
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

// Per-channel keys: each channel acts on YouTube with the SPECIFIC uploaded key it was connected with
// (its refresh token's client_id must match). Full per-user isolation — nobody inherits anyone else's
// key. The admin's first key is seeded once from the legacy global file in the migration above.
function accountCreds(account: Account): ClientCreds | null {
  const json = db.oauthClientSecretForAccount(account);
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
  await app.register(fastifyStatic, {
    root: resolve(WEB_DIST, "assets"),
    prefix: "/assets/",
    decorateReply: false,
    maxAge: "1y",
    immutable: true,
  });
  await app.register(fastifyStatic, { root: WEB_DIST, prefix: "/", decorateReply: false });
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0] ?? req.url;
    const isRetiredStandalonePage =
      path === "/game" ||
      path.startsWith("/game/") ||
      path === "/cars1" ||
      path.startsWith("/cars1/") ||
      path === "/cars2" ||
      path.startsWith("/cars2/");
    if (isRetiredStandalonePage) return reply.code(404).send({ error: "not found" });
    const isAudioLabRoute = path === "/audio" || path.startsWith("/audio/avatar") || path.startsWith("/audio/characters");
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      !req.url.startsWith("/api/") &&
      !req.url.startsWith("/creator") &&
      !req.url.startsWith("/files/") &&
      (!req.url.startsWith("/audio/") || isAudioLabRoute) &&
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

// Gate the whole API behind a session. Exceptions: health, the login endpoint, and the YouTube
// OAuth callback (Google redirects the browser there). Static /files & /audio are not under /api/.
const PUBLIC_API = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/telegram/info", // pre-login: is Telegram offered here + bot @username
  "/api/auth/telegram/register/start", // signup via bot: mint a /start deep-link token
  "/api/auth/telegram/register/status", // signup via bot: poll until the user pressed Start
  "/api/auth/telegram/login/start", // login via bot: mint a /start deep-link token
  "/api/auth/telegram/login/status", // login via bot: poll until the user pressed Start
  "/api/telegram/webhook", // Telegram pushes bot updates (/start) here
  "/api/tg/auth", // Telegram Mini App: validates signed initData before issuing a session
  "/api/tg/preferences", // Telegram Mini App: save settings by signed initData when cookies are unavailable
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

// ---- Build the shared foundation singletons ONCE, then thread them into every route module ----
const auth = makeAuthSession(db);
const deckAccess = makeDeckAccess(db, { isAdminReq: auth.isAdminReq, isSuperAdminReq: auth.isSuperAdminReq });
const notifier = makeNotifier(db); // SINGLE SSE hub — its emit/notify fns go to notifications + stats + admin
const buildLibraryVideo = makeBuildLibraryVideo({
  db,
  outputDir: base.outputDir,
  builtinDeckVisibleForUser: deckAccess.builtinDeckVisibleForUser,
}); // SINGLE implementation — videos routes AND the gen-queue worker call this one.

// Failure side-effects for refreshAccountStats() — replays exactly what the inline /api/stats/refresh
// used to do per channel: server log + error_log row + a notification for the channel's owner. Shared
// by the HTTP refresh route and the Telegram stats bot so both behave identically.
const statsRefreshHooks: RefreshHooks = {
  onAnalyticsError: (a, err, msg) => {
    app.log.error({ err: String(err), accountId: a.id }, "youtube analytics refresh failed");
    db.addError({
      source: "server",
      message: "YouTube Analytics: " + msg,
      detail: (err as Error)?.stack ?? null,
      context: `analytics refresh account=${a.id}`,
      userId: a.userId ?? null,
    });
    notifier.notifyYouTubeAnalyticsIssue(a, err, msg);
  },
  onStatsError: (a, err, msg) => {
    app.log.error({ err: String(err), accountId: a.id }, "stats refresh failed");
    db.addError({
      source: "server",
      message: "Статистика: " + msg,
      detail: (err as Error)?.stack ?? null,
      context: `stats refresh account=${a.id}`,
      userId: a.userId ?? null,
    });
    notifier.notifyStatsRefreshIssue(a, err, msg);
  },
};

const deps = makeRouteDeps({
  db,
  auth,
  deckAccess,
  notifier,
  buildLibraryVideo,
  statsRefreshHooks,
  outputDir: base.outputDir,
  redirectUri: REDIRECT_URI,
  webOrigin: WEB_ORIGIN,
  accountCreds,
  listAvatarFiles,
});

// ---- Register every route module (composition only — handlers live in routes/) ----
// Self-service password change (logic in a separate file → minimal footprint in this shared module).
registerPasswordRoutes(app, db);
registerPsychCardsRoutes(app, db);
registerPacksRoutes(app, db);
// Telegram login + account binding + bot-delivered password recovery (public routes whitelisted above)
// + the in-bot channel-statistics menu (mirrors the website's Statistics tab; reuses refreshAccountStats).
registerTelegramRoutes(app, db, {
  setSessionCookie,
  accountCreds,
  redirectUri: REDIRECT_URI,
  analyticsRange: (days) => youtubeAnalyticsRange(new Date(), days),
  summarizeStored: (accountId, from, to) => summarizeStoredAnalytics(db, accountId, from, to),
  formatStatsError: ytErrorMessage,
  refreshHooks: statsRefreshHooks,
});
registerAuthRoutes(app, db, deps);
registerFilesRoutes(app, db, deps);
registerSettingsKeysRoutes(app, db, { ...deps, chromePath: base.chromePath });
registerAdminRoutes(app, db, deps);
registerAccountsRoutes(app, db, deps);
registerStatsRoutes(app, db, deps);
registerSignalsRoutes(app, db, deps);
registerNotificationsRoutes(app, db, deps);
registerYouTubeOAuthRoutes(app, db, deps);
registerVideosRoutes(app, db, deps);
registerGenQueueRoutes(app, db, deps);
registerStudioGalleryRoutes(app, db, deps);
registerClipDemosRoutes(app, db, deps);
registerContentCatalogRoutes(app, db, deps);
registerQueueRoutes(app, db, deps);
registerAccountReadinessRoutes(app, db, deps);
registerSuperAdminChannelBlockRoutes(app, db, deps);
registerExamplesRoutes(app, db, deps);
registerAudioRoutes(app, db, deps);
registerMemesRoutes(app, deps);
registerIdeasRoutes(app, db, deps);
registerSzzRoutes(app, { db });
registerCircleEditorRoutes(app, db);

app
  .listen({ port: base.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Shorts Factory API on :${base.port}`);
    const scheduler = startScheduler({
      db,
      outputDir: resolve(process.cwd(), base.outputDir),
      credsForAccount: (account) => accountCreds(account),
      redirectUri: REDIRECT_URI,
      log: (m) => app.log.info(m),
      notifier, // alert the channel owner (inbox + Telegram) when a token dies mid-schedule
    });
    const telegramDigestScheduler = startTelegramDigestScheduler({
      db,
      log: (m) => app.log.info(m),
    });
    const geminiTtsLocalJobs = startGeminiTtsLocalJobRunner({
      log: (m) => app.log.info(m),
    });
    app.log.info(`[gemini-tts-local] очередь готова: ${geminiTtsLocalJobs.directories.inbox}`);
    metrics.startSampler(resolve(process.cwd(), base.outputDir));

    // ---- Graceful shutdown: drain in-flight render/upload, then close cleanly (SIGTERM/SIGINT) ----
    // So a restart never interrupts a render mid-flight (no orphan scratch files / no double-post).
    let shuttingDown = false;
    const onSignal = async (sig: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`[shutdown] получен ${sig}`);
      try {
        await gracefulShutdown({
          log: (m) => app.log.info("[shutdown] " + m),
          stopScheduler: () => {
            scheduler.stop();
            telegramDigestScheduler.stop();
            geminiTtsLocalJobs.stop();
          },
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
