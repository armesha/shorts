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

const base = loadBaseConfig();
const db = openDb(base.dbPath);

// Self-heal used-anecdote marks: every saved library video IS a used anecdote, so backfill its
// key on boot. Idempotent (ON CONFLICT DO NOTHING) — keeps picks from ever repeating even if the
// marks table was cleared or predates this feature.
for (const acc of db.listAccounts()) {
  for (const v of db.listVideos(acc.id)) db.markAnecdoteUsed(anecdoteKey(v.text));
}

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
  return buildLibraryVideo({
    accountId: body.accountId,
    text: body.text,
    title: body.title,
    bg: body.bg,
    music: body.music,
    deck: body.deck,
  });
});

// Batch: generate N random UNUSED anecdotes straight into a channel's library.
app.post("/api/videos/batch", async (req, reply) => {
  const body = (req.body as { accountId?: number; count?: number; bg?: string; music?: string; deck?: string }) ?? {};
  if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
  const deckId = getDeck(body.deck).id;
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
