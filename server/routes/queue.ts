import type { FastifyInstance } from "fastify";

import { DECKS, isPackDeckId, MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";
import { getPack } from "../../src/packs/store.ts";
import { isSuperAdminUser } from "../auth.ts";
import type { Account, Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import { listStatuses as listGenStatuses } from "../services/gen-queue.ts";
import { publicGenWorkerStatus } from "../services/gen-worker-heartbeat.ts";
import type { RouteDeps } from "./deps.ts";

type QueueQuery = { scope?: string };
const genQueueRunnerMode = (): "embedded" | "external" =>
  process.env.GEN_QUEUE_RUNNER === "0" || process.env.GEN_QUEUE_RUNNER === "external" ? "external" : "embedded";

function deckName(db: Db, ownerId: number | null | undefined, deckId: string | null | undefined): string | null {
  const id = String(deckId || "").trim();
  if (!id) return null;
  if (id === MANUAL_VIDEO_DECK) return "Manual videos";
  if (isPackDeckId(id)) {
    const owner = ownerId ? db.getUserById(ownerId) : null;
    return getPack(id.slice(5), ownerId ?? 0, isSuperAdminUser(owner))?.name ?? id;
  }
  return DECKS.find((deck) => deck.id === id)?.name ?? id;
}

function deckCounts(rows: { deck: string; count: number }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.deck] = (counts[row.deck] ?? 0) + row.count;
  return counts;
}

function scheduledCountsByDeck(account: Account, deps: RouteDeps): Record<string, number> {
  const sources = deps.deckAccess.accountSourceDecks(account);
  const counts: Record<string, number> = Object.fromEntries(sources.map((deckId) => [deckId, 0]));
  for (const [index, time] of (account.schedule ?? []).entries()) {
    const explicit = account.slotDecks?.[time];
    const deckId = explicit && sources.includes(explicit) ? explicit : sources[index % Math.max(1, sources.length)] || account.lang;
    if (deckId) counts[deckId] = (counts[deckId] ?? 0) + 1;
  }
  return counts;
}

function runwayDays(_byDeck: Record<string, number>, _scheduledByDeck: Record<string, number>, queued: number, postsPerDay: number): number | null {
  if (postsPerDay <= 0) return null;
  // Scheduler falls back to another source deck when a slot's pinned deck is empty.
  // The queue runway should reflect actual posting continuity, while per-deck shortages
  // remain visible through byDeck/scheduledByDeck.
  return queued / postsPerDay;
}

function nextSlots(db: Db, accounts: Account[], deps: RouteDeps, limit = 40) {
  const now = new Date();
  const horizonMs = 48 * 60 * 60 * 1000;
  const slots: {
    accountId: number;
    channelName: string;
    time: string;
    at: string;
    deck: string | null;
    deckName: string | null;
  }[] = [];

  for (const account of accounts) {
    const sources = deps.deckAccess.accountSourceDecks(account);
    for (const time of account.schedule ?? []) {
      const [hh, mm] = String(time).split(":").map((x) => Number(x));
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      for (let day = 0; day < 3; day++) {
        const at = new Date(now);
        at.setDate(now.getDate() + day);
        at.setHours(hh, mm, 0, 0);
        const delta = at.getTime() - now.getTime();
        if (delta <= 0 || delta > horizonMs) continue;
        const explicit = account.slotDecks?.[time];
        const deck = explicit && sources.includes(explicit) ? explicit : sources[0] ?? account.lang ?? null;
        slots.push({
          accountId: account.id,
          channelName: account.channelName,
          time,
          at: at.toISOString(),
          deck,
          deckName: deckName(db, account.userId, deck),
        });
      }
    }
  }

  return slots.sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}

export function registerQueueRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/queue", async (req, reply) => {
    // Очередь — только для админов (и главного админа): регулярным пользователям недоступна.
    if (!deps.auth.requireAdmin(req, reply)) return;
    const query = (req.query ?? {}) as QueueQuery;
    const userId = uid(req);
    const all = query.scope === "all" && deps.auth.isAdminReq(req);
    const accounts = all ? db.listAccounts() : db.listAccountsByUser(userId);
    const visibleAccountIds = new Set(accounts.map((account) => account.id));
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const userById = new Map(db.listUsers().map((user) => [user.id, user]));
    const countsByAccount = new Map<number, { deck: string; count: number }[]>();
    for (const row of db.videoCountsByAccount(accounts.map((account) => account.id))) {
      const list = countsByAccount.get(row.accountId) ?? [];
      list.push({ deck: row.deck, count: row.count });
      countsByAccount.set(row.accountId, list);
    }

    const generationJobs = listGenStatuses(all ? undefined : userId)
      .filter((job) => visibleAccountIds.has(job.accountId))
      .map((job) => {
        const account = accountById.get(job.accountId);
        const owner = job.userId != null ? userById.get(job.userId) : null;
        return {
          ...job,
          channelName: account?.channelName ?? `#${job.accountId}`,
          ownerUsername: owner?.username ?? null,
        };
      });

    const channelQueues = accounts.map((account) => {
      const byDeck = deckCounts(countsByAccount.get(account.id) ?? []);
      const deckIds = [
        ...new Set([
          ...Object.keys(byDeck),
          ...deps.deckAccess.accountSourceDecks(account),
          ...Object.keys(scheduledCountsByDeck(account, deps)),
        ]),
      ];
      const sourceDecks = deps.deckAccess.accountSourceDecks(account);
      const sourceSet = new Set(sourceDecks);
      const queued = sourceDecks.length
        ? Object.entries(byDeck).reduce((sum, [deckId, n]) => (sourceSet.has(deckId) ? sum + n : sum), 0)
        : Object.values(byDeck).reduce((sum, n) => sum + n, 0);
      const postsPerDay = account.schedule?.length ?? 0;
      const scheduledByDeck = scheduledCountsByDeck(account, deps);
      return {
        accountId: account.id,
        channelName: account.channelName,
        ownerUsername: account.userId ? userById.get(account.userId)?.username ?? null : null,
        connected: account.status === "connected",
        enabled: account.enabled,
        schedule: account.schedule ?? [],
        sourceDecks,
        byDeck,
        deckNames: Object.fromEntries(deckIds.map((deckId) => [deckId, deckName(db, account.userId, deckId) ?? deckId])),
        scheduledByDeck,
        queued,
        postsPerDay,
        runwayDays: runwayDays(byDeck, scheduledByDeck, queued, postsPerDay),
      };
    });

    return {
      worker: publicGenWorkerStatus(db, { mode: genQueueRunnerMode() }),
      generationJobs,
      channelQueues,
      upcomingSlots: nextSlots(db, accounts, deps),
    };
  });
}
