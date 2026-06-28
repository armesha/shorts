// Global generation queue API. In embedded mode this route also starts the queue worker; in external
// worker mode it only writes/reads SQLite-backed jobs and the standalone worker process renders them.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { isPackDeckId } from "../../src/anecdotes/decks.ts";
import { getPack } from "../../src/packs/store.ts";
import {
  isLeastPostedRepeatPack,
  isPerAccountAutoExpirePack,
  availablePackCardsForAccount,
} from "../services/pack-gen.ts";
import {
  initGenQueue,
  enqueue as genEnqueue,
  jobStatus as genJobStatus,
  listStatuses as genListStatuses,
  cancelJob as genCancelJob,
  queuedRemainingForUser as genQueuedRemainingForUser,
  queuedRemainingForOwnerDecks as genQueuedRemainingForOwnerDecks,
  queuedRemainingForAccountDecks as genQueuedRemainingForAccountDecks,
} from "../services/gen-queue.ts";
import { makeGenQueueWorker } from "../services/gen-queue-worker.ts";
import { uid } from "../infra/auth-session.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import type { RouteDeps } from "./deps.ts";
import { thematicBlockDeckSequenceForGeneration } from "./super-admin-channel-blocks.ts";

const USER_GEN_QUEUE_CAP = 100;

export function registerGenQueueRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { accessibleAccount, accountOwnerId } = deps;
  const { accountSourceDecks, cleanDeckIds, validateAccountSourceDeck, availableUnusedForDecks } = deps.deckAccess;

  if (process.env.GEN_QUEUE_RUNNER !== "0" && process.env.GEN_QUEUE_RUNNER !== "external") {
    initGenQueue(makeGenQueueWorker(db, deps));
  }

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
    let deckIds = requestedDecks.length ? requestedDecks : [acc.lang];
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
    if (!db.hasFeature(ownerId, INFINITE_PACKS_FEATURE)) {
      const ownerIsSuperAdmin = isSuperAdminUser(db.getUserById(ownerId));
      const perAccountPackIds = deckIds.filter((deckId) => {
        if (!isPackDeckId(deckId)) return false;
        const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
        return !!pack && isPerAccountAutoExpirePack(pack);
      });
      const repeatPackIds = deckIds.filter((deckId) => {
        if (!isPackDeckId(deckId)) return false;
        const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
        return !!pack && isLeastPostedRepeatPack(pack);
      });
      const sharedDeckIds = deckIds.filter((deckId) => !perAccountPackIds.includes(deckId) && !repeatPackIds.includes(deckId));
      let free = 0;
      if (repeatPackIds.length) free = Number.MAX_SAFE_INTEGER;
      if (sharedDeckIds.length) {
        free += Math.max(
          0,
          availableUnusedForDecks(ownerId, sharedDeckIds) - genQueuedRemainingForOwnerDecks(ownerId, sharedDeckIds),
        );
      }
      if (perAccountPackIds.length) {
        const usedKeys = new Set<string>(db.usedAnecdoteKeys(ownerId));
        for (const deckId of perAccountPackIds) {
          const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
          if (!pack) continue;
          free += Math.max(
            0,
            availablePackCardsForAccount(pack, body.accountId, usedKeys) - genQueuedRemainingForAccountDecks(body.accountId, [deckId]),
          );
        }
      }
      if (free <= 0)
        return reply.code(400).send({
          error:
            "Свободных карточек не осталось — все карточки выбранного контента уже использованы или стоят в очереди. Дождитесь окончания текущей генерации или сбросьте использованные карточки.",
        });
      total = Math.min(total, free);
    }
    const mixedDeckIds = thematicBlockDeckSequenceForGeneration(db, deps, ownerId, acc, deckIds, total);
    if (mixedDeckIds) {
      if (!mixedDeckIds.length)
        return reply.code(400).send({
          error:
            "Свободных карточек для нужной пропорции блока не осталось — добейте конкретный пак или измените микс источников.",
        });
      deckIds = mixedDeckIds;
      total = Math.min(total, mixedDeckIds.length);
    }
    const job = genEnqueue(uid(req), body.accountId, total, ownerId, deckIds);
    return { jobId: job.id, total: job.total };
  });

  app.get("/api/gen-queue", async (req) => {
    const scope = String(((req.query ?? {}) as { scope?: string }).scope ?? "");
    const all = scope === "all" && db.getUserById(uid(req))?.role === "admin";
    return {
      jobs: genListStatuses(all ? undefined : uid(req)).map((job) => ({
        id: job.id,
        userId: job.userId,
        ownerUserId: job.ownerUserId,
        accountId: job.accountId,
        deckIds: job.deckIds ?? [],
        total: job.total,
        done: job.done,
        state: job.state,
        ahead: job.ahead,
        position: job.position,
        error: job.error ?? null,
        createdAt: job.createdAt,
        endedAt: job.endedAt ?? null,
      })),
    };
  });

  // Poll one job's progress + position in the queue.
  app.get("/api/gen-queue/:id", async (req, reply) => {
    const st = genJobStatus((req.params as { id: string }).id);
    if (!st || st.userId !== uid(req)) return reply.code(404).send({ error: "Задача не найдена" });
    return {
      id: st.id,
      accountId: st.accountId,
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
    const isAdmin = db.getUserById(uid(req))?.role === "admin";
    return { ok: genCancelJob((req.params as { id: string }).id, uid(req), isAdmin) };
  });
}
