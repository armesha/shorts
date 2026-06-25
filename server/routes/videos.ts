// Video library: list/save/delete + batch-generate into a channel's library + manual «Опубликовать»
// (post-now). Handlers moved VERBATIM from index.ts. buildLibraryVideo is the SHARED implementation
// (injected via deps) used here and in the gen-queue worker — preserving the card-claim/no-double-spend
// and no-double-upload guarantees.
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import type { Db } from "../db.ts";
import { DECKS, getDeck, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { ytMeta } from "../../src/anecdotes/yt-meta.ts";
import { randomAnecdote, firstAnecdote, anecdoteKey } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import { pickUnusedPackCard, pickFixedPackCard, buildPackLibraryVideo } from "../services/pack-gen.ts";
import { buildFactLibraryVideo } from "../services/fact-gen.ts";
import { addLongVideoToLibrary, LongVideoLibraryError } from "../services/long-video-library.ts";
import { uploadShort, isYtAuthError, ytErrorReason } from "../services/youtube.ts";
import { ytErrorMessage } from "../services/youtube-errors.ts";
import {
  MANUAL_VIDEO_DECK,
  MAX_MANUAL_VIDEO_UPLOAD_BYTES,
  getManualVideoLimits,
  saveManualVideoUpload,
  type ManualVideoUploadInput,
} from "../services/manual-videos.ts";
import * as metrics from "../infra/metrics.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import { USER_DAILY_SCHEDULE_CAP } from "../infra/account-limits.ts";
import { uid } from "../infra/auth-session.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import type { RouteDeps, LimitedReplyish } from "./deps.ts";

const BATCH_VIDEO_LIMIT = { limit: 2, windowMs: 30 * 60 * 1000 };
const LONG_VIDEO_LIBRARY_LIMIT = { limit: 4, windowMs: 60 * 60 * 1000 };
const NORMAL_BATCH_VIDEO_CAP = 5;
const POST_NOW_LIMIT = { limit: 15, windowMs: 10 * 60 * 1000 }; // burst guard on manual «Опубликовать»
const MANUAL_VIDEO_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

export function registerVideosRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const {
    accessibleAccount,
    accountOwnerId,
    rejectIfNotConnected,
    buildLibraryVideo,
    accountCreds,
    enforceGenerationWindow,
    runHeavyGenerationLimited,
    redirectUri,
    outputDir,
  } = deps;
  const { isAdminReq } = deps.auth;
  const { deckAllowed, resolveAccountSourceDeck, accountSourceDecks, deckContentLang } = deps.deckAccess;
  const REDIRECT_URI = redirectUri;

  // ---- Video library (save / list / delete / post-now) ----
  app.get("/api/videos", async (req, reply) => {
    const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
    if (!accountId) return [];
    if (!accessibleAccount(req, reply, accountId)) return;
    return db.listVideos(accountId);
  });

  app.post("/api/videos", async (req, reply) => {
    const body = (req.body as { accountId?: number; text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
    if (!body.accountId || !body.text) return reply.code(400).send({ error: "accountId и text обязательны" });
    const acc = accessibleAccount(req, reply, body.accountId);
    if (!acc) return;
    if (rejectIfNotConnected(reply, acc)) return;
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
    const v = await buildLibraryVideo({
      userId: ownerId,
      accountId: body.accountId,
      text: body.text,
      title: body.title,
      bg: body.bg,
      music: body.music,
      deck: channelDeck.id, // forced to the channel's language
    });
    if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
      db.markAnecdoteUsed(ownerId, anecdoteKey(body.text)); // explicit single save → mark used (idempotent)
    }
    return v;
  });

  app.post(
    "/api/videos/upload",
    { bodyLimit: MAX_MANUAL_VIDEO_UPLOAD_BYTES },
    async (req, reply) => {
      const body = (req.body as ManualVideoUploadInput & { accountId?: number }) ?? {};
      if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
      const acc = accessibleAccount(req, reply, body.accountId);
      if (!acc) return;
      if (rejectIfNotConnected(reply, acc)) return;
      const manualLimits = getManualVideoLimits(db);
      if (!isAdminReq(req)) {
        const rl = checkRateLimit(`user:${uid(req)}:manual-video-upload`, {
          limit: manualLimits.uploadsPerHour,
          windowMs: MANUAL_VIDEO_UPLOAD_WINDOW_MS,
        });
        if (!rl.ok) {
          reply.header("Retry-After", String(Math.max(1, Math.ceil((rl.retryAfterMs ?? 1_000) / 1000))));
          return reply.code(429).send({ error: "Слишком много загрузок видео — подождите немного." });
        }
      }
      try {
        const saved = await saveManualVideoUpload(outputDir, body, manualLimits);
        return db.createVideo({
          accountId: body.accountId,
          title: saved.title,
          text: saved.text,
          bg: "manual",
          music: "none",
          deck: MANUAL_VIDEO_DECK,
          videoRel: saved.videoRel,
          imageRel: null,
        });
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : "Не удалось загрузить видео" });
      }
    },
  );

  app.get("/api/videos/manual-limits", async () => getManualVideoLimits(db));

  // Add one ready long-video compilation to a channel library. Long videos are never scheduler sources:
  // the user selects enabled long-video packs per channel, copies a ready MP4 here, then publishes manually.
  app.post("/api/videos/long", async (req, reply) => {
    const body = (req.body as { accountId?: number; deck?: string }) ?? {};
    if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
    const accountId = body.accountId;
    const deckId = String(body.deck || "").trim();
    if (!deckId) return reply.code(400).send({ error: "deck обязателен" });
    const acc = accessibleAccount(req, reply, accountId);
    if (!acc) return;
    if (rejectIfNotConnected(reply, acc)) return;
    if (!enforceGenerationWindow(req, reply as LimitedReplyish, "videos-long", LONG_VIDEO_LIBRARY_LIMIT)) return;
    return runHeavyGenerationLimited(req, reply as LimitedReplyish, "videos-long", async () => {
      try {
        return await addLongVideoToLibrary({
          db,
          account: acc,
          deckId,
          ownerId: accountOwnerId(req, acc),
          deckAllowed: (id) => deckAllowed(req, id),
          deckContentLang: (id) => deckContentLang(req, id),
        });
      } catch (e) {
        if (e instanceof LongVideoLibraryError) return reply.code(e.statusCode).send({ error: e.message });
        throw e;
      }
    });
  });

  // Batch: generate N random UNUSED anecdotes straight into a channel's library.
  app.post("/api/videos/batch", async (req, reply) => {
    const body = (req.body as { accountId?: number; count?: number; bg?: string; music?: string; deck?: string }) ?? {};
    if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
    const accountId = body.accountId;
    const acc = accessibleAccount(req, reply, accountId);
    if (!acc) return;
    if (rejectIfNotConnected(reply, acc)) return;
    if (!enforceGenerationWindow(req, reply as LimitedReplyish, "videos-batch", BATCH_VIDEO_LIMIT)) return;
    return runHeavyGenerationLimited(req, reply as LimitedReplyish, "videos-batch", async () => {
      const ownerId = accountOwnerId(req, acc);
      const requested = Math.max(1, Math.min(isAdminReq(req) ? 25 : NORMAL_BATCH_VIDEO_CAP, Number(body.count) || 5));
      const seen = new Set<string>(db.usedAnecdoteKeys(ownerId)); // exclude owner-used + dedupe batch
      const infinite = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
      const created: unknown[] = [];
      const sourceDeckId = resolveAccountSourceDeck(req, reply, acc, body.deck);
      if (!sourceDeckId) return;
      // Пак-канал (язык = "pack:<id>"): случайные неиспользованные карточки пака → рендер мостом.
      if (isPackDeckId(sourceDeckId)) {
        if (!deckAllowed(req, sourceDeckId)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
        const pack = getPack(sourceDeckId.slice(5), ownerId, isAdminReq(req));
        if (!pack) return reply.code(404).send({ error: "Пак не найден." });
        if (!pack.templates.length) return reply.code(400).send({ error: "У пака нет шаблона." });
        while (created.length < requested) {
          const picked = infinite ? pickFixedPackCard(pack) : pickUnusedPackCard(pack, seen);
          if (!picked) break;
          if (!infinite) {
            seen.add(picked.key);
            if (!db.claimAnecdote(ownerId, picked.key)) continue; // a concurrent run already took this card
          }
          try {
            created.push(
              await buildPackLibraryVideo({ db, userId: ownerId, accountId, pack, picked, music: body.music || undefined }),
            );
          } catch (e) {
            if (!infinite) db.releaseAnecdote(ownerId, picked.key); // render failed → return the card to the pool
            throw e;
          }
        }
        return { created, requested, made: created.length, exhausted: created.length < requested };
      }
      const channelDeck = DECKS.find((d) => d.id === sourceDeckId);
      if (!channelDeck)
        return reply.code(400).send({ error: `У канала язык «${sourceDeckId}» без пака — смените язык канала.` });
      if (!deckAllowed(req, channelDeck.id))
        return reply.code(403).send({ error: "Этот пак вам недоступен." });
      const deckId = channelDeck.id; // FORCE the channel's language — no cross-language mixing
      while (created.length < requested) {
        const a = infinite ? firstAnecdote(deckId) : randomAnecdote(deckId, seen);
        if (!a) break; // no unused anecdotes left
        const key = anecdoteKey(a.text);
        if (!infinite) {
          seen.add(key);
          if (!db.claimAnecdote(ownerId, key)) continue; // a concurrent run already took this card
        }
        try {
          if (channelDeck.preFact) {
            // Pre-built fact videos: copy the chosen mp4 into the library (no rendering).
            created.push(await buildFactLibraryVideo({ db, userId: ownerId, accountId, deckId, picked: a }));
          } else {
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
        } catch (e) {
          if (!infinite) db.releaseAnecdote(ownerId, key); // render failed → return the card to the pool
          throw e;
        }
      }
      return { created, requested, made: created.length, exhausted: created.length < requested };
    });
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
    // Токен в БД есть, но помечен мёртвым (auth_error) → не пытаемся выкладывать (был бы 500 каждый раз):
    // канал «отвалился» от YouTube, просим переподключить. setYouTube при переподключении чистит флаг.
    if (acc.authError) return reply.code(400).send({ error: "Канал нужно переподключить к YouTube — прежний доступ больше не действует." });
    const creds = accountCreds(acc);
    if (!creds) return reply.code(400).send({ error: "Google-ключ канала не найден — переподключите канал в Настройках" });
    // HARD source guard: never post a video whose deck is not selected for this channel.
    if (v.deck !== MANUAL_VIDEO_DECK && !accountSourceDecks(acc).includes(v.deck) && !(acc.longVideoDecks ?? []).includes(v.deck))
      return reply.code(400).send({ error: `Пак ролика (${v.deck}) не выбран у канала — не выложено.` });
    // Burst guard (non-admin): manual posting must not be scriptable into a quota-burning loop.
    if (!isAdminReq(req)) {
      const rl = checkRateLimit(`user:${uid(req)}:post-now:window`, POST_NOW_LIMIT);
      if (!rl.ok) {
        reply.header("Retry-After", String(Math.max(1, Math.ceil((rl.retryAfterMs ?? 1_000) / 1000))));
        return reply.code(429).send({ error: "Слишком частые публикации — подождите немного." });
      }
    }
    // Daily per-Google-key upload cap (counts REAL uploads, not planned slots): post-now shares the
    // scheduler's budget so it can't blow the Cloud project's YouTube quota for co-bound channels.
    if (acc.oauthClientId != null && db.uploadsTodayForKey(acc.oauthClientId) >= USER_DAILY_SCHEDULE_CAP)
      return reply
        .code(429)
        .send({ error: `Достигнут дневной лимит ${USER_DAILY_SCHEDULE_CAP} публикаций на этот Google-ключ — попробуйте позже.` });
    // Atomic claim: flip this unposted video to in-flight so a double-click (or the scheduler) can't post it twice.
    if (!db.claimVideoForPost(v.id))
      return reply.code(409).send({ error: "Этот ролик уже публикуется или опубликован — обновите список." });
    // Optional publishAt (RFC3339) → scheduled (private until then); empty → publish now.
    const publishAt = ((req.body as { publishAt?: string })?.publishAt || "").trim() || null;
    try {
      const meta = ytMeta(getDeck(v.deck), v.title, v.text);
      const youtubeId = await metrics.track("upload", () =>
        uploadShort(creds, REDIRECT_URI, token, {
          videoPath: resolve(process.cwd(), outputDir, v.videoRel),
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
        deck: v.deck,
      });
      if (youtubeId) {
        db.clearAuthError(v.accountId); // token works → drop any stale "needs reconnect" flag
        // posted once → remove from the library (files + row) so it never reposts
        for (const rel of [v.videoRel, v.imageRel]) {
          if (rel) {
            try {
              unlinkSync(resolve(process.cwd(), outputDir, rel));
            } catch {
              /* already gone */
            }
          }
        }
        db.deleteVideo(v.id);
      } else {
        db.releaseVideoPost(v.id); // YouTube returned no id → un-claim so it can be retried later
      }
      return {
        ok: true,
        youtubeId,
        url: youtubeId ? `https://youtu.be/${youtubeId}` : null,
        scheduled: !!publishAt,
        removed: !!youtubeId,
      };
    } catch (err) {
      db.releaseVideoPost(v.id); // upload threw → un-claim so the video stays postable
      app.log.error(err);
      // Dead/revoked token → flag the channel so /channels shows "needs reconnect", not just history.
      if (isYtAuthError(err)) db.markAuthError(v.accountId, ytErrorReason(err), new Date().toISOString());
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
}
