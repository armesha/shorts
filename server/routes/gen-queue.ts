// Global generation queue: ONE video at a time across ALL users (bounds server load). Registers the
// queue worker (initGenQueue) + the enqueue/status/cancel routes. Worker + handlers moved VERBATIM from
// index.ts. The worker uses the SHARED buildLibraryVideo (injected via deps) so claim/spend guarantees
// match the sync batch path.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { DECKS, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { randomAnecdote, anecdoteKey } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import { pickUnusedPackCard, buildPackLibraryVideo } from "../services/pack-gen.ts";
import { buildFactLibraryVideo } from "../services/fact-gen.ts";
import {
  initGenQueue,
  enqueue as genEnqueue,
  jobStatus as genJobStatus,
  cancelJob as genCancelJob,
  queuedRemainingForUser as genQueuedRemainingForUser,
  queuedRemainingForOwnerDecks as genQueuedRemainingForOwnerDecks,
} from "../services/gen-queue.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

const USER_GEN_QUEUE_CAP = 100;

export function registerGenQueueRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { accessibleAccount, accountOwnerId, buildLibraryVideo } = deps;
  const { builtinDeckVisibleForUser, accountSourceDecks, cleanDeckIds, validateAccountSourceDeck, availableUnusedForDecks } =
    deps.deckAccess;

  // ---- Global generation queue: ONE video at a time across ALL users → bounds server load ----
  // Worker = make ONE random unused video for the job's channel (a single batch step).
  initGenQueue(async (job) => {
    const acc = db.getAccount(job.accountId);
    if (!acc) throw new Error("Канал не найден");
    const ownerId = job.ownerUserId ?? job.userId;
    const seen = new Set<string>(db.usedAnecdoteKeys(ownerId)); // skip owner's already-used cards
    const sources = job.deckIds?.length ? job.deckIds : accountSourceDecks(acc);
    // Each candidate is CLAIMED (db.claimAnecdote) before its render so a concurrent run (another job,
    // the sync batch, or a co-owner) can't build the same card twice; a lost claim → re-pick; a render
    // failure → release the claim so the card returns to the pool.
    const generateFromSource = async (sourceDeck: string): Promise<"made" | "exhausted"> => {
      // Пак-канал: одна случайная неиспользованная карточка пака → видео в библиотеку.
      if (isPackDeckId(sourceDeck)) {
        const pack = getPack(sourceDeck.slice(5), ownerId, isSuperAdminUser(db.getUserById(ownerId)));
        if (!pack || !pack.templates.length) throw new Error(`Пак «${sourceDeck}» не найден или без шаблона`);
        for (;;) {
          const picked = pickUnusedPackCard(pack, seen);
          if (!picked) return "exhausted";
          seen.add(picked.key);
          if (!db.claimAnecdote(ownerId, picked.key)) continue; // taken by a concurrent run → pick another
          try {
            await buildPackLibraryVideo({ db, userId: ownerId, accountId: job.accountId, pack, picked });
            return "made";
          } catch (e) {
            db.releaseAnecdote(ownerId, picked.key);
            throw e;
          }
        }
      }
      const channelDeck = DECKS.find((d) => d.id === sourceDeck);
      if (!channelDeck) throw new Error(`У канала язык «${sourceDeck}» без пака`);
      if (db.getUserById(ownerId)?.role !== "admin" && !builtinDeckVisibleForUser(ownerId, channelDeck))
        throw new Error("Этот пак вам недоступен");
      for (;;) {
        const a = randomAnecdote(channelDeck.id, seen);
        if (!a) return "exhausted"; // deck has no unused cards left
        const key = anecdoteKey(a.text);
        seen.add(key);
        if (!db.claimAnecdote(ownerId, key)) continue; // taken by a concurrent run → pick another
        try {
          if (channelDeck.preFact) {
            await buildFactLibraryVideo({ db, userId: ownerId, accountId: job.accountId, deckId: channelDeck.id, picked: a });
          } else {
            await buildLibraryVideo({
              userId: ownerId,
              accountId: job.accountId,
              text: a.text,
              title: a.title,
              deck: channelDeck.id,
              profession: a.profession,
            });
          }
          return "made";
        } catch (e) {
          db.releaseAnecdote(ownerId, key);
          throw e;
        }
      }
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
    let total = Math.max(1, Math.min(perRequestCap, Math.floor(Number(body.count) || 1)));
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
    // Never queue more videos than the owner has FREE (unused) cards: a job can only build a video
    // from an unused card, so any surplus would silently no-op ("exhausted"). Subtract cards already
    // claimed by the owner's in-flight jobs on these same decks so back-to-back batches can't
    // over-commit the pool. Applies to everyone (incl. admins) — this is accuracy, not a quota.
    const free = Math.max(
      0,
      availableUnusedForDecks(ownerId, deckIds) - genQueuedRemainingForOwnerDecks(ownerId, deckIds),
    );
    if (free <= 0)
      return reply.code(400).send({
        error:
          "Свободных карточек не осталось — все карточки выбранного контента уже использованы или стоят в очереди. Дождитесь окончания текущей генерации или сбросьте использованные карточки.",
      });
    total = Math.min(total, free);
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
}
