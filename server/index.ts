import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { basename, resolve } from "node:path";
import { unlinkSync } from "node:fs";
import {
  loadBaseConfig,
  resolveClientSecretFile,
  credsFileExists,
  DEFAULT_CLIENT_SECRET_FILE,
} from "./config.ts";
import { openDb, type Account } from "./db.ts";
import { randomAnecdote, libraryStats, anecdoteKey } from "../src/anecdotes/library.ts";
import { DECKS, getDeck, ytMeta, pickGenericTitle } from "../src/anecdotes/decks.ts";
import { renderAnecdote, listBackgrounds } from "../src/anecdotes/render.ts";
import { assembleStillVideo, listAudio, audioPathFor } from "../src/video.ts";
import { buildAuthUrl, exchangeAndGetChannel, uploadShort } from "./youtube.ts";
import { startScheduler } from "./scheduler.ts";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  SESSION_TTL_DAYS,
} from "./auth.ts";

const base = loadBaseConfig();
const db = openDb(base.dbPath);

// Self-heal used-anecdote marks: every saved library video IS a used anecdote, so backfill its
// key on boot. Idempotent (ON CONFLICT DO NOTHING) — keeps picks from ever repeating even if the
// marks table was cleared or predates this feature.
for (const acc of db.listAccounts()) {
  for (const v of db.listVideos(acc.id)) db.markAnecdoteUsed(anecdoteKey(v.text));
}

// Ensure seed users exist (idempotent — creates each only if missing, never clobbers a password).
// Admin-creates-users model; a proper UI lands in Phase 2. Creds live in .env (gitignored).
function ensureUser(username: string, password: string, role: string) {
  const u = username.trim();
  if (!u || !password) return;
  if (db.getUserByUsername(u)) return; // already exists — leave its stored password untouched
  db.createUser({ username: u, passHash: hashPassword(password), role });
  console.log(`[auth] Seeded ${role} "${u}".`);
}
ensureUser(process.env.ADMIN_USERNAME ?? "", process.env.ADMIN_PASSWORD ?? "", "admin");
// Extra non-admin users: SEED_USERS="name:pass,name2:pass2" (passwords must not contain ',' or ':').
for (const entry of (process.env.SEED_USERS ?? "").split(",")) {
  const t = entry.trim();
  const idx = t.indexOf(":");
  if (idx > 0) ensureUser(t.slice(0, idx), t.slice(idx + 1), "user");
}
if (db.countUsers() === 0)
  console.warn("[auth] No users seeded — set ADMIN_USERNAME/ADMIN_PASSWORD in .env, then restart.");

const credsPath = (): string => resolveClientSecretFile(db.getSetting("googleClientSecretFile"));
const REDIRECT_URI =
  process.env.GOOGLE_OAUTH_REDIRECT ?? `http://localhost:${process.env.PORT ?? 8080}/api/youtube/callback`;
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// FAIL FAST: the app won't start if the client-secret file is missing.
if (!credsFileExists(credsPath())) {
  throw new Error(
    `Google client-secret file not found:\n  ${credsPath()}\n` +
      `The app requires this file to start. Set a valid path (Settings page, env GOOGLE_CLIENT_SECRET_FILE, or server/config.ts).`,
  );
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, { root: resolve(process.cwd(), base.outputDir), prefix: "/files/" });
await app.register(fastifyStatic, { root: resolve(process.cwd(), "assets/audio"), prefix: "/audio/", decorateReply: false });

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
  const uid = (req as { userId?: number }).userId;
  const user = uid ? db.getUserById(uid) : null;
  if (!user) return reply.code(401).send({ error: "Не авторизован" });
  return { id: user.id, username: user.username, role: user.role };
});

app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

app.get("/api/config", async () => ({
  credsConfigured: credsFileExists(credsPath()),
  credsFile: basename(credsPath()),
  chromePath: base.chromePath,
  llm: "claude-code-headless",
}));

// ---- Settings (editable client-secret path) ----
app.get("/api/settings", async () => {
  const path = credsPath();
  return {
    googleClientSecretFile: path,
    exists: credsFileExists(path),
    isDefault: path === DEFAULT_CLIENT_SECRET_FILE,
  };
});

app.put("/api/settings", async (req, reply) => {
  const body = (req.body as { googleClientSecretFile?: string }) ?? {};
  const path = (body.googleClientSecretFile ?? "").trim();
  if (!path) return reply.code(400).send({ error: "Путь не указан" });
  if (!credsFileExists(path)) return reply.code(400).send({ error: "Файл по этому пути не найден" });
  db.setSetting("googleClientSecretFile", path);
  return { googleClientSecretFile: path, exists: true, isDefault: path === DEFAULT_CLIENT_SECRET_FILE };
});

// ---- Accounts (SQLite-backed) ----
app.get("/api/accounts", async () => db.listAccounts());
app.get("/api/accounts/:id", async (req, reply) => {
  const a = db.getAccount(Number((req.params as { id: string }).id));
  if (!a) return reply.code(404).send({ error: "not found" });
  return a;
});
app.post("/api/accounts", async (req) => db.createAccount((req.body as Partial<Account>) ?? {}));
app.put("/api/accounts/:id", async (req, reply) => {
  const a = db.updateAccount(Number((req.params as { id: string }).id), (req.body as Partial<Account>) ?? {});
  if (!a) return reply.code(404).send({ error: "not found" });
  return a;
});
app.delete("/api/accounts/:id", async (req) => {
  db.deleteAccount(Number((req.params as { id: string }).id));
  return { ok: true };
});

app.get("/api/history", async () => db.listHistory());

// ---- YouTube OAuth (connect a channel) ----
app.get("/api/youtube/auth-url", async (req, reply) => {
  const accountId = String((req.query as { accountId?: string }).accountId ?? "");
  if (!accountId) return reply.code(400).send({ error: "accountId required" });
  return { url: buildAuthUrl(credsPath(), REDIRECT_URI, accountId) };
});

app.get("/api/youtube/callback", async (req, reply) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) return reply.code(400).send("Missing code/state");
  try {
    const r = await exchangeAndGetChannel(credsPath(), REDIRECT_URI, code);
    db.setYouTube(Number(state), r);
    return reply.redirect(`${WEB_ORIGIN}/accounts/${state}?connected=1`);
  } catch (err) {
    app.log.error(err);
    return reply.redirect(`${WEB_ORIGIN}/accounts/${state}?error=1`);
  }
});

// ---- Video library (save / list / delete / post-now) ----
app.get("/api/videos", async (req) => {
  const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
  return accountId ? db.listVideos(accountId) : [];
});

// Render + assemble one library video, persist it, and mark the anecdote used (no repeats).
// music: explicit track name | "none" = silent | empty/undefined = random track per video.
async function buildLibraryVideo(input: {
  accountId: number;
  text: string;
  title?: string;
  bg?: string;
  music?: string;
  deck?: string;
}) {
  const deck = getDeck(input.deck);
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
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const imgRel = `library/vid-${stamp}.png`;
  const vidRel = `library/vid-${stamp}.mp4`;
  const r = await renderAnecdote(
    { title, text: input.text, channel: deck.name, bg: input.bg },
    resolve(process.cwd(), base.outputDir, imgRel),
  );
  await assembleStillVideo(
    resolve(process.cwd(), base.outputDir, imgRel),
    resolve(process.cwd(), base.outputDir, vidRel),
    { durationSec: 6, audioPath },
  );
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
  db.markAnecdoteUsed(anecdoteKey(input.text)); // never reuse this anecdote
  return v;
}

app.post("/api/videos", async (req, reply) => {
  const body = (req.body as { accountId?: number; text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
  if (!body.accountId || !body.text) return reply.code(400).send({ error: "accountId и text обязательны" });
  const acc = db.getAccount(body.accountId);
  if (!acc) return reply.code(404).send({ error: "Канал не найден" });
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  if ((body.deck || channelDeck.id) !== channelDeck.id)
    return reply.code(400).send({ error: `Язык ролика не совпадает с языком канала (${channelDeck.name}) — не сохранено.` });
  return buildLibraryVideo({
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
  const acc = db.getAccount(body.accountId);
  if (!acc) return reply.code(404).send({ error: "Канал не найден" });
  const channelDeck = DECKS.find((d) => d.id === acc.lang);
  if (!channelDeck)
    return reply.code(400).send({ error: `У канала язык «${acc.lang}» без пака — смените язык канала.` });
  const deckId = channelDeck.id; // FORCE the channel's language — no cross-language mixing
  const requested = Math.max(1, Math.min(20, Number(body.count) || 5));
  const seen = new Set<string>(db.usedAnecdoteKeys()); // exclude already-used + dedupe within this batch
  const created: unknown[] = [];
  for (let i = 0; i < requested; i++) {
    const a = randomAnecdote(deckId, seen);
    if (!a) break; // no unused anecdotes left
    seen.add(anecdoteKey(a.text));
    created.push(
      await buildLibraryVideo({
        accountId: body.accountId,
        text: a.text,
        title: a.title,
        bg: body.bg, // undefined → random background per video
        music: body.music || undefined, // empty/undefined → random track per video
        deck: deckId,
      }),
    );
  }
  return { created, requested, made: created.length, exhausted: created.length < requested };
});

app.delete("/api/videos/:id", async (req) => {
  db.deleteVideo(Number((req.params as { id: string }).id));
  return { ok: true };
});

app.post("/api/videos/:id/post-now", async (req, reply) => {
  const v = db.getVideo(Number((req.params as { id: string }).id));
  if (!v) return reply.code(404).send({ error: "not found" });
  const token = db.getRefreshToken(v.accountId);
  if (!token) return reply.code(400).send({ error: "Канал не подключён к YouTube" });
  // HARD language guard: never post a video whose language differs from the channel's.
  const pacc = db.getAccount(v.accountId);
  if (pacc && DECKS.some((d) => d.id === pacc.lang) && v.deck !== pacc.lang)
    return reply.code(400).send({ error: `Язык ролика (${v.deck}) ≠ язык канала (${pacc.lang}) — не выложено.` });
  // Optional publishAt (RFC3339) → scheduled (private until then); empty → publish now.
  const publishAt = ((req.body as { publishAt?: string })?.publishAt || "").trim() || null;
  try {
    const meta = ytMeta(getDeck(v.deck), v.title, v.text);
    const youtubeId = await uploadShort(credsPath(), REDIRECT_URI, token, {
      videoPath: resolve(process.cwd(), base.outputDir, v.videoRel),
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      publishAt,
    });
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
    return reply.code(500).send({ error: "Ошибка загрузки: " + String(err).slice(0, 200) });
  }
});

// ---- Generators / Studio ----
app.get("/api/generators", async () => {
  const used = db.usedAnecdoteKeys();
  return DECKS.map((d) => {
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
});

let previewCounter = 0;
app.post("/api/generate/anecdote", async (req) => {
  const body = (req.body as { text?: string; title?: string; bg?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  let text = body.text;
  let title = body.title;
  if (!text) {
    const a = randomAnecdote(deck.id, db.usedAnecdoteKeys());
    if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
    text = a.text;
    title = a.title || undefined;
    db.markAnecdoteUsed(anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот из пула
  }
  if (!title) title = pickGenericTitle(deck);

  previewCounter++;
  const rel = `preview/anek-${Date.now()}-${previewCounter}.png`;
  const out = resolve(process.cwd(), base.outputDir, rel);
  const r = await renderAnecdote({ title, text, channel: deck.name, bg: body.bg }, out);
  return { imageUrl: `/files/${rel}`, title, text, chars: text.length, bg: r.bg, fontPx: r.fontPx };
});

app.get("/api/backgrounds", async () => listBackgrounds());
app.get("/api/music", async () => listAudio());

let videoCounter = 0;
app.post("/api/generate/anecdote-video", async (req) => {
  const body = (req.body as { text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
  const deck = getDeck(body.deck);
  let text = body.text;
  let title = body.title;
  if (!text) {
    const a = randomAnecdote(deck.id, db.usedAnecdoteKeys());
    if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
    text = a.text;
    title = a.title || undefined;
    db.markAnecdoteUsed(anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот из пула
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

  videoCounter++;
  const stamp = `${Date.now()}-${videoCounter}`;
  const imgRel = `preview/anek-${stamp}.png`;
  const vidRel = `preview/anek-${stamp}.mp4`;
  const imgOut = resolve(process.cwd(), base.outputDir, imgRel);
  const vidOut = resolve(process.cwd(), base.outputDir, vidRel);
  const r = await renderAnecdote({ title, text, channel: deck.name, bg: body.bg }, imgOut);
  await assembleStillVideo(imgOut, vidOut, { durationSec: 6, audioPath });
  return { videoUrl: `/files/${vidRel}`, imageUrl: `/files/${imgRel}`, title, text, chars: text.length, bg: r.bg, music };
});

app
  .listen({ port: base.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`Shorts Factory API on :${base.port}`);
    startScheduler({
      db,
      outputDir: resolve(process.cwd(), base.outputDir),
      credsPath,
      redirectUri: REDIRECT_URI,
      log: (m) => app.log.info(m),
    });
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
