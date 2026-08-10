// Video library: list/save/delete + batch-generate into a channel's library + manual «Опубликовать»
// (post-now). Handlers moved VERBATIM from index.ts. buildLibraryVideo is the SHARED implementation
// (injected via deps) used here and in the gen-queue worker — preserving the card-claim/no-double-spend
// and no-double-upload guarantees.
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import type { Account, Db, Video } from "../db.ts";
import { DECKS, getDeck, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { ytMeta } from "../../src/anecdotes/yt-meta.ts";
import { randomAnecdote, firstAnecdote, anecdoteKey, packItemKey } from "../../src/anecdotes/library.ts";
import { getPack, listPackVisibilitySummaries } from "../../src/packs/store.ts";
import {
  pickUnusedPackCard,
  pickFixedPackCard,
  pickLeastPostedPackCard,
  isLeastPostedRepeatPack,
  isPerAccountAutoExpirePack,
  packCardClaimKey,
  usedPackCardKeysForAccountIncludingLibrary,
  markPackLibraryVideoUsed,
  buildPackLibraryVideo,
} from "../services/pack-gen.ts";
import { cleanupDrainedAutoExpireDecksForAccount, removeAutoExpiredDeckFromAccount } from "../services/auto-expire-packs.ts";
import { buildFactLibraryVideo } from "../services/fact-gen.ts";
import { uploadShort, isYtAuthError, ytErrorReason } from "../services/youtube.ts";
import {
  MANUAL_VIDEO_DECK,
  MAX_MANUAL_VIDEO_UPLOAD_BYTES,
  applyManualVideoAccountDefaults,
  getManualVideoAccountDefaults,
  getManualVideoLimits,
  saveManualVideoUpload,
  type ManualVideoUploadInput,
} from "../services/manual-videos.ts";
import * as metrics from "../infra/metrics.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import {
  USER_BATCH_VIDEO_CAP,
  accountDailyScheduleCap,
  channelLibraryVideoCap,
  googleKeyDailyScheduleCap,
  isMgsUser,
} from "../infra/account-limits.ts";
import { uid } from "../infra/auth-session.ts";
import { isSuperAdminUser } from "../auth.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import { queuedRemainingForAccount as genQueuedRemainingForAccount } from "../services/gen-queue.ts";
import { CIRCLE_DECK_ID, isCircleDeckId } from "../services/circle-templates.ts";
import {
  filterGloballyVisibleBuiltInDecks,
  filterGloballyVisibleCustomPacks,
} from "../services/global-pack-visibility.ts";
import { cachedRead } from "../services/read-cache.ts";
import type { RouteDeps, LimitedReplyish } from "./deps.ts";

const BATCH_VIDEO_LIMIT = { limit: 2, windowMs: 30 * 60 * 1000 };
const POST_NOW_LIMIT = { limit: 15, windowMs: 10 * 60 * 1000 }; // burst guard on manual «Опубликовать»
const MANUAL_VIDEO_UPLOAD_WINDOW_MS = 60 * 60 * 1000;

type PostLibraryVideoSuccess = {
  ok: true;
  youtubeId: string | null;
  url: string | null;
  scheduled: boolean;
  removed: boolean;
};

type PostLibraryVideoFailure = {
  ok: false;
  status: number;
  error: string;
};

type PostLibraryVideoResult = PostLibraryVideoSuccess | PostLibraryVideoFailure;

export function canPostVideoDeckForAccount(videoDeck: string, selectedSourceDecks: string[]): boolean {
  return videoDeck === MANUAL_VIDEO_DECK || selectedSourceDecks.includes(videoDeck);
}

export function visibleLibraryDeckIds(db: Db): Set<string> {
  return cachedRead("visible-library-deck-ids", 30_000, () =>
    new Set([
      MANUAL_VIDEO_DECK,
      CIRCLE_DECK_ID,
      ...db.videoCountsByAccount().map((row) => row.deck).filter(isCircleDeckId),
      ...filterGloballyVisibleBuiltInDecks(db, DECKS).map((deck) => deck.id),
      ...filterGloballyVisibleCustomPacks(db, listPackVisibilitySummaries()).map((pack) => `pack:${pack.id}`),
    ]),
  );
}

export function canPrepareLibraryForAccount(account: Pick<Account, "status">, requesterIsSuperAdmin: boolean): boolean {
  return account.status === "connected" || requesterIsSuperAdmin;
}

export function registerVideosRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const {
    accessibleAccount,
    accountOwnerId,
    visibleAccounts,
    rejectIfNotConnected,
    buildLibraryVideo,
    accountCreds,
    enforceGenerationWindow,
    runHeavyGenerationLimited,
    redirectUri,
    outputDir,
    notifier,
  } = deps;
  const { isAdminReq } = deps.auth;
  const { deckAllowed, resolveAccountSourceDeck, accountSourceDecks } = deps.deckAccess;
  const REDIRECT_URI = redirectUri;
  const rejectIfCannotPrepareLibrary = (req: unknown, reply: LimitedReplyish, acc: Account): boolean => {
    if (canPrepareLibraryForAccount(acc, deps.auth.isSuperAdminReq(req))) return false;
    return rejectIfNotConnected(reply, acc);
  };

  const globalVideoFilter = () => ({ includeDecks: [...visibleLibraryDeckIds(db)] });

  const visibleVideos = (videos: ReturnType<Db["listVideos"]>) => {
    const visibleDecks = visibleLibraryDeckIds(db);
    return videos.filter((video) => visibleDecks.has(video.deck));
  };

  const postLibraryVideoNow = async (
    req: unknown,
    acc: Account,
    v: Video,
    opts: { publishAt?: string | null; rateLimit?: boolean } = {},
  ): Promise<PostLibraryVideoResult> => {
    const token = db.getRefreshToken(v.accountId);
    if (!token) return { ok: false, status: 400, error: "Канал не подключён к YouTube" };
    // Токен в БД есть, но помечен мёртвым (auth_error) → не пытаемся выкладывать (был бы 500 каждый раз):
    // канал «отвалился» от YouTube, просим переподключить. setYouTube при переподключении чистит флаг.
    if (acc.authError)
      return { ok: false, status: 400, error: "Канал нужно переподключить к YouTube — прежний доступ больше не действует." };
    const creds = accountCreds(acc);
    if (!creds) return { ok: false, status: 400, error: "Google-ключ канала не найден — переподключите канал в Настройках" };
    // HARD source guard: never post a video whose deck is not selected for this channel.
    if (!canPostVideoDeckForAccount(v.deck, accountSourceDecks(acc)))
      return { ok: false, status: 400, error: `Пак ролика (${v.deck}) не выбран у канала — не выложено.` };
    // Burst guard (non-admin): manual posting must not be scriptable into a quota-burning loop.
    if (opts.rateLimit !== false && !isAdminReq(req)) {
      const rl = checkRateLimit(`user:${uid(req)}:post-now:window`, POST_NOW_LIMIT);
      if (!rl.ok) return { ok: false, status: 429, error: "Слишком частые публикации — подождите немного." };
    }
    // Daily per-Google-key upload cap (counts REAL uploads, not planned slots): post-now shares the
    // scheduler's budget so it can't blow the Cloud project's YouTube quota for co-bound channels.
    const owner = db.getUserById(accountOwnerId(req, acc));
    const accountCap = accountDailyScheduleCap(owner?.role === "admin", isMgsUser(owner));
    if (db.uploadsTodayForAccount(acc.id) >= accountCap)
      return {
        ok: false,
        status: 429,
        error: `Достигнут дневной лимит ${accountCap} публикаций на этот канал — попробуйте завтра.`,
      };
    const keyCap = googleKeyDailyScheduleCap(isSuperAdminUser(owner), isMgsUser(owner));
    if (acc.oauthClientId != null && db.uploadsTodayForKey(acc.oauthClientId) >= keyCap)
      return {
        ok: false,
        status: 429,
        error: `Достигнут дневной лимит ${keyCap} публикаций на этот Google-ключ — попробуйте позже.`,
      };
    // Atomic claim: flip this unposted video to in-flight so a double-click (or the scheduler) can't post it twice.
    if (!db.claimVideoForPost(v.id))
      return { ok: false, status: 409, error: "Этот ролик уже публикуется или опубликован — обновите список." };
    const uploadReservation = db.reserveDailyUploadQuota({
      accountId: acc.id,
      oauthClientId: acc.oauthClientId,
      accountCap,
      keyCap: acc.oauthClientId != null ? keyCap : null,
    });
    if (!uploadReservation.ok) {
      db.releaseVideoPost(v.id);
      return {
        ok: false,
        status: 429,
        error:
          uploadReservation.scope === "account"
            ? `Достигнут дневной лимит ${uploadReservation.cap} публикаций на этот канал — попробуйте завтра.`
            : `Достигнут дневной лимит ${uploadReservation.cap} публикаций на этот Google-ключ — попробуйте позже.`,
      };
    }
    let uploadReservationToken: string | null = uploadReservation.token;
    const publishAt = (opts.publishAt || "").trim() || null;
    try {
      const meta = ytMeta(getDeck(v.deck), v.title, v.text);
      if (v.tags.length) meta.tags = v.tags; // per-video override from the library editor
      const manualDefaults = v.deck === MANUAL_VIDEO_DECK ? getManualVideoAccountDefaults(db, v.accountId) : null;
      if (manualDefaults?.title) meta.title = manualDefaults.title;
      if (manualDefaults?.description) meta.description = manualDefaults.description;
      if (manualDefaults?.tags.length) meta.tags = manualDefaults.tags;
      const youtubeId = await metrics.track("upload", () =>
        uploadShort(creds, REDIRECT_URI, token, {
          videoPath: resolve(process.cwd(), outputDir, v.videoRel),
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: manualDefaults?.categoryId,
          publishAt,
        }),
      );
      db.addHistory({
        accountId: v.accountId,
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        status: youtubeId ? (publishAt ? "scheduled" : "published") : "failed",
        youtubeId,
        videoPath: v.videoRel,
        publishedAt: publishAt ?? new Date().toISOString(),
        deck: v.deck,
        oauthClientId: acc.oauthClientId,
      });
      db.releaseDailyUploadReservation(uploadReservation.token);
      uploadReservationToken = null;
      if (youtubeId) {
        db.clearAuthError(v.accountId); // token works → drop any stale "needs reconnect" flag
        // posted once → remove from the library (files + row) so it never reposts
        if (isPackDeckId(v.deck)) markPackLibraryVideoUsed(db, accountOwnerId(req, acc), acc.id, v.deck, v, isAdminReq(req));
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
        cleanupDrainedAutoExpireDecksForAccount(db, acc);
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
      if (uploadReservationToken) db.releaseDailyUploadReservation(uploadReservationToken);
      db.releaseVideoPost(v.id); // upload threw → un-claim so the video stays postable
      app.log.error(err);
      // Dead/revoked token → flag the channel so /channels shows "needs reconnect", not just history.
      // First failure (healthy→broken edge) → alert the owner once: inbox + Telegram DM if linked.
      if (isYtAuthError(err)) {
        const freshAccount = db.getAccount(v.accountId);
        const reason = ytErrorReason(err);
        if (db.markAuthError(v.accountId, reason, new Date().toISOString()) && freshAccount)
          void notifier.notifyChannelDisconnected(freshAccount, reason);
      }
      db.addError({
        source: "server",
        message: "Загрузка видео: " + String((err as Error)?.message ?? err),
        detail: (err as Error)?.stack ?? null,
        context: `post-now account=${v.accountId} video=${v.id}`,
        userId: uid(req),
      });
      return { ok: false, status: 500, error: "Ошибка загрузки: " + String(err).slice(0, 200) };
    }
  };

  const channelLibraryCapacity = (req: unknown, acc: Account) => {
    const owner = db.getUserById(accountOwnerId(req, acc));
    const cap = channelLibraryVideoCap(owner?.role === "admin", isMgsUser(owner));
    if (cap == null) return null;
    const current = db.countVideosByAccountFiltered(acc.id, globalVideoFilter());
    const queued = genQueuedRemainingForAccount(acc.id);
    const reserved = db.libraryReservationsForAccount(acc.id);
    const occupied = current + queued + reserved;
    return { cap, current, queued, reserved, occupied, available: Math.max(0, cap - occupied) };
  };

  const sendChannelLibraryLimit = (
    reply: LimitedReplyish,
    details: { cap: number; current: number; queued?: number; reserved?: number; available: number },
  ): void => {
    const queued = (details.queued ?? 0) + (details.reserved ?? 0);
    const queuedText = queued > 0 ? `, ещё ${queued} уже стоит в генерации` : "";
    reply.code(400).send({
      error: `В библиотеке канала максимум ${details.cap} видео. Сейчас ${details.current}${queuedText}, можно добавить ещё ${details.available}.`,
    });
  };

  const reserveChannelLibrarySlots = (
    req: unknown,
    reply: LimitedReplyish,
    acc: Account,
    adding = 1,
  ): { ok: true; token: string | null } | { ok: false } => {
    const capacity = channelLibraryCapacity(req, acc);
    if (!capacity) return { ok: true, token: null };
    if (capacity.occupied + adding > capacity.cap) {
      sendChannelLibraryLimit(reply, capacity);
      return { ok: false };
    }
    const reserved = db.reserveLibrarySlots(acc.id, capacity.cap, adding);
    if (!reserved.ok) {
      sendChannelLibraryLimit(reply, reserved);
      return { ok: false };
    }
    return { ok: true, token: reserved.token };
  };

  const releaseChannelLibraryReservation = (reservation: { ok: true; token: string | null } | null): void => {
    if (reservation?.token) db.releaseLibraryReservation(reservation.token);
  };

  const videoCountRowsForAccounts = (accounts: Account[]) => {
    const rowsByAccount = new Map<number, { accountId: number; total: number; byDeck: Record<string, number> }>(
      accounts.map((account) => [account.id, { accountId: account.id, total: 0, byDeck: {} }]),
    );
    const visibleDecks = visibleLibraryDeckIds(db);
    for (const row of db.videoCountsByAccount(accounts.map((account) => account.id))) {
      if (!visibleDecks.has(row.deck)) continue;
      const entry = rowsByAccount.get(row.accountId);
      if (!entry) continue;
      entry.byDeck[row.deck] = row.count;
      entry.total += row.count;
    }
    return accounts.map((account) => rowsByAccount.get(account.id)!);
  };

  // ---- Video library (save / list / delete / post-now) ----
  app.get("/api/videos/counts", async (req) => {
    const scope = (req.query as { scope?: string } | undefined)?.scope;
    const accounts = visibleAccounts(req, scope);
    return { accounts: videoCountRowsForAccounts(accounts) };
  });

  app.get("/api/videos", async (req, reply) => {
    const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
    if (!accountId) return [];
    if (!accessibleAccount(req, reply, accountId)) return;
    return visibleVideos(db.listVideos(accountId));
  });

  app.get("/api/videos/page", async (req, reply) => {
    const q = (req.query as {
      accountId?: string;
      kind?: string;
      page?: string;
      pageSize?: string;
      sort?: "date" | "title" | "posts";
    }) ?? {};
    const accountId = Number(q.accountId ?? 0);
    if (!accountId) return reply.code(400).send({ error: "accountId обязателен" });
    const acc = accessibleAccount(req, reply, accountId);
    if (!acc) return;
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 6));
    const page = Math.max(1, Number(q.page) || 1);
    const filter = globalVideoFilter();
    const total = db.countVideosByAccountFiltered(accountId, filter);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const clampedPage = Math.min(page, pageCount);
    const items = db.listVideosPage({
      accountId,
      limit: pageSize,
      offset: (clampedPage - 1) * pageSize,
      sort: q.sort === "title" || q.sort === "posts" ? q.sort : "date",
      filter,
    });
    const byDeck = Object.fromEntries(
      Object.entries(db.videoDeckCountsForAccount(accountId)).filter(([deckId]) => visibleLibraryDeckIds(db).has(deckId)),
    );
    return {
      items,
      total,
      page: clampedPage,
      pageSize,
      pageCount,
      byDeck,
      postedTwicePlus: db.countVideosByAccountFiltered(accountId, { ...globalVideoFilter(), postCountGt: 1 }),
      totalAll: db.countVideosByAccountFiltered(accountId, globalVideoFilter()),
    };
  });

  app.post("/api/videos", async (req, reply) => {
    const body = (req.body as { accountId?: number; text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
    if (!body.accountId || !body.text) return reply.code(400).send({ error: "accountId и text обязательны" });
    const acc = accessibleAccount(req, reply, body.accountId);
    if (!acc) return;
    if (rejectIfCannotPrepareLibrary(req, reply as LimitedReplyish, acc)) return;
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
    const reservation = reserveChannelLibrarySlots(req, reply as LimitedReplyish, acc);
    if (!reservation.ok) return;
    try {
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
    } finally {
      releaseChannelLibraryReservation(reservation);
    }
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
      const reservation = reserveChannelLibrarySlots(req, reply as LimitedReplyish, acc);
      if (!reservation.ok) return;
      try {
        const saved = applyManualVideoAccountDefaults(
          await saveManualVideoUpload(outputDir, body, manualLimits),
          getManualVideoAccountDefaults(db, acc.id),
        );
        return db.createVideo({
          accountId: body.accountId,
          title: saved.title,
          text: saved.text,
          bg: "manual",
          music: "none",
          deck: MANUAL_VIDEO_DECK,
          videoRel: saved.videoRel,
          imageRel: null,
          tags: saved.tags,
        });
      } catch (e) {
        return reply.code(400).send({ error: e instanceof Error ? e.message : "Не удалось загрузить видео" });
      } finally {
        releaseChannelLibraryReservation(reservation);
      }
    },
  );

  app.get("/api/videos/manual-limits", async () => getManualVideoLimits(db));

  // Batch: generate N random UNUSED anecdotes straight into a channel's library.
  app.post("/api/videos/batch", async (req, reply) => {
    const body = (req.body as { accountId?: number; count?: number; bg?: string; music?: string; deck?: string }) ?? {};
    if (!body.accountId) return reply.code(400).send({ error: "accountId обязателен" });
    const accountId = body.accountId;
    const acc = accessibleAccount(req, reply, accountId);
    if (!acc) return;
    if (rejectIfCannotPrepareLibrary(req, reply as LimitedReplyish, acc)) return;
    if (!enforceGenerationWindow(req, reply as LimitedReplyish, "videos-batch", BATCH_VIDEO_LIMIT)) return;
    return runHeavyGenerationLimited(req, reply as LimitedReplyish, "videos-batch", async () => {
      const ownerId = accountOwnerId(req, acc);
      const ownerIsMgs = isMgsUser(db.getUserById(ownerId));
      let requested = Math.max(1, Math.min(isAdminReq(req) || ownerIsMgs ? 25 : USER_BATCH_VIDEO_CAP, Number(body.count) || USER_BATCH_VIDEO_CAP));
      const capacity = channelLibraryCapacity(req, acc);
      if (capacity) {
        if (capacity.available <= 0) {
          sendChannelLibraryLimit(reply as LimitedReplyish, capacity);
          return;
        }
        requested = Math.min(requested, capacity.available);
      }
      const seen = new Set<string>(db.usedAnecdoteKeys(ownerId)); // exclude owner-used + dedupe batch
      const infinite = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
      const created: unknown[] = [];
      const sourceDeckId = resolveAccountSourceDeck(req, reply, acc, body.deck);
      if (!sourceDeckId) return;
      const reservation = reserveChannelLibrarySlots(req, reply as LimitedReplyish, acc, requested);
      if (!reservation.ok) return;
      try {
      const batchSeed = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const pickSeed = (sourceDeck: string, offset = 0) => `${accountId}|${sourceDeck}|batch|${batchSeed}|${created.length}|${offset}`;
      // Пак-канал (язык = "pack:<id>"): случайные неиспользованные карточки пака → рендер мостом.
      if (isPackDeckId(sourceDeckId)) {
        if (!deckAllowed(req, sourceDeckId)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
        const pack = getPack(sourceDeckId.slice(5), ownerId, isAdminReq(req));
        if (!pack) return reply.code(404).send({ error: "Пак не найден." });
        if (!pack.templates.length) return reply.code(400).send({ error: "У пака нет шаблона." });
        while (created.length < requested) {
          const perAccountAutoExpire = isPerAccountAutoExpirePack(pack);
          const packSeen = perAccountAutoExpire
            ? usedPackCardKeysForAccountIncludingLibrary(
                pack,
                accountId,
                seen,
                db.listVideos(accountId).filter((video) => video.deck === sourceDeckId),
              )
            : seen;
          const canUseInfinite = infinite && !perAccountAutoExpire;
          const picked = isLeastPostedRepeatPack(pack)
            ? pickLeastPostedPackCard(db, accountId, pack, pickSeed(sourceDeckId))
            : canUseInfinite
              ? pickFixedPackCard(pack)
              : pickUnusedPackCard(pack, packSeen, pickSeed(sourceDeckId));
          if (!picked) {
            if (perAccountAutoExpire) removeAutoExpiredDeckFromAccount(db, acc, sourceDeckId);
            break;
          }
          const claimKey = packCardClaimKey(pack, accountId, picked.key);
          if (!canUseInfinite && !isLeastPostedRepeatPack(pack)) {
            seen.add(claimKey);
            packSeen.add(picked.key);
            if (!db.claimAnecdote(ownerId, claimKey)) continue; // a concurrent run already took this card
          }
          try {
            created.push(
              await buildPackLibraryVideo({ db, userId: ownerId, accountId, pack, picked, music: body.music || undefined }),
            );
          } catch (e) {
            if (!canUseInfinite && !isLeastPostedRepeatPack(pack)) db.releaseAnecdote(ownerId, claimKey); // render failed → return the card to the pool
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
        const a = infinite ? firstAnecdote(deckId) : randomAnecdote(deckId, seen, pickSeed(deckId));
        if (!a) break; // no unused anecdotes left
        const key = packItemKey(a);
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
                profession: a.profession,
                item: a,
              }),
            );
          }
        } catch (e) {
          if (!infinite) db.releaseAnecdote(ownerId, key); // render failed → return the card to the pool
          throw e;
        }
      }
      return { created, requested, made: created.length, exhausted: created.length < requested };
      } finally {
        releaseChannelLibraryReservation(reservation);
      }
    });
  });

  app.post("/api/videos/:id/meta", async (req, reply) => {
    const v = db.getVideo(Number((req.params as { id: string }).id));
    if (!v) return reply.code(404).send({ error: "not found" });
    const acc = accessibleAccount(req, reply, v.accountId);
    if (!acc) return;
    const body = (req.body as { title?: unknown; text?: unknown; tags?: unknown }) ?? {};
    const title = String(body.title ?? "").trim();
    const text = String(body.text ?? "").trim();
    const rawTags = Array.isArray(body.tags) ? body.tags : String(body.tags ?? "").split(",");
    const tags = [...new Set(rawTags.map((tag) => String(tag ?? "").trim().replace(/^#/, "")).filter(Boolean))];
    if (!title) return reply.code(400).send({ error: "Название не может быть пустым." });
    if (title.length > 100) return reply.code(400).send({ error: "Название длиннее 100 символов." });
    if (text.length > 4500) return reply.code(400).send({ error: "Описание длиннее 4500 символов." });
    // YouTube caps the whole tags field at ~500 chars.
    if (tags.join(",").length > 480) return reply.code(400).send({ error: "Теги слишком длинные (лимит YouTube ~500 символов)." });
    return db.updateVideoMeta(v.id, { title, text, tags });
  });

  app.delete("/api/videos/:id", async (req, reply) => {
    const v = db.getVideo(Number((req.params as { id: string }).id));
    if (!v) return reply.code(404).send({ error: "not found" });
    const acc = accessibleAccount(req, reply, v.accountId);
    if (!acc) return;
    const ownerId = accountOwnerId(req, acc);
    if (isPackDeckId(v.deck)) markPackLibraryVideoUsed(db, ownerId, acc.id, v.deck, v, isAdminReq(req));
    db.deleteVideo(v.id);
    cleanupDrainedAutoExpireDecksForAccount(db, acc);
    return { ok: true };
  });

  app.post("/api/videos/post-now/all", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const owner = db.getSuperAdminUser();
    if (!owner) return reply.code(404).send({ error: "Главный админ не найден." });
    const accounts = db.listAccountsByUser(owner.id);
    const items: {
      accountId: number;
      channelName: string;
      videoId?: number;
      title?: string;
      status: "published" | "failed" | "skipped";
      reason?: string;
      youtubeId?: string | null;
      url?: string | null;
    }[] = [];

    for (const acc of accounts) {
      const channelName = acc.ytChannelTitle || acc.channelName;
      if (!acc.enabled) {
        items.push({ accountId: acc.id, channelName, status: "skipped", reason: "Канал выключен." });
        continue;
      }
      const token = db.getRefreshToken(acc.id);
      if (!token) {
        items.push({ accountId: acc.id, channelName, status: "skipped", reason: "Канал не подключён к YouTube." });
        continue;
      }
      if (acc.authError) {
        items.push({ accountId: acc.id, channelName, status: "skipped", reason: "Канал нужно переподключить к YouTube." });
        continue;
      }
      const decks = [...new Set([...accountSourceDecks(acc), MANUAL_VIDEO_DECK].filter(Boolean))];
      const video = db.nextUnpostedVideoForDecks(acc.id, decks, `bulk-post-now:${new Date().toISOString().slice(0, 10)}:${acc.id}`);
      if (!video) {
        items.push({ accountId: acc.id, channelName, status: "skipped", reason: "Нет готового шорта в библиотеке." });
        continue;
      }
      const result = await postLibraryVideoNow(req, acc, video, { rateLimit: false });
      if (result.ok && result.youtubeId) {
        items.push({
          accountId: acc.id,
          channelName,
          videoId: video.id,
          title: video.title,
          status: "published",
          youtubeId: result.youtubeId,
          url: result.url,
        });
      } else if (result.ok) {
        items.push({
          accountId: acc.id,
          channelName,
          videoId: video.id,
          title: video.title,
          status: "failed",
          reason: "YouTube не вернул id ролика.",
          youtubeId: result.youtubeId,
          url: result.url,
        });
      } else {
        items.push({
          accountId: acc.id,
          channelName,
          videoId: video.id,
          title: video.title,
          status: result.status >= 500 ? "failed" : "skipped",
          reason: result.error,
        });
      }
    }

    return {
      ok: true,
      total: items.length,
      attempted: items.filter((item) => item.videoId != null).length,
      published: items.filter((item) => item.status === "published").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      failed: items.filter((item) => item.status === "failed").length,
      items,
    };
  });

  app.post("/api/videos/:id/post-now", async (req, reply) => {
    const v = db.getVideo(Number((req.params as { id: string }).id));
    if (!v) return reply.code(404).send({ error: "not found" });
    const acc = accessibleAccount(req, reply, v.accountId);
    if (!acc) return;
    // Optional publishAt (RFC3339) → scheduled (private until then); empty → publish now.
    const publishAt = ((req.body as { publishAt?: string })?.publishAt || "").trim() || null;
    const result = await postLibraryVideoNow(req, acc, v, { publishAt });
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result;
  });
}
