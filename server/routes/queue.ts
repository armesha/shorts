import type { FastifyInstance } from "fastify";

import type { Account, Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import { listStatuses as listGenStatuses } from "../services/gen-queue.ts";
import type { RouteDeps } from "./deps.ts";

type QueueQuery = { scope?: string };

function deckCounts(db: Db, account: Account): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const video of db.listVideos(account.id)) counts[video.deck] = (counts[video.deck] ?? 0) + 1;
  return counts;
}

function scheduledCountsByDeck(account: Account, deps: RouteDeps): Record<string, number> {
  const sources = deps.deckAccess.accountSourceDecks(account);
  const counts: Record<string, number> = Object.fromEntries(sources.map((deckId) => [deckId, 0]));
  for (const [index, time] of (account.schedule ?? []).entries()) {
    const explicit = account.slotDecks?.[time];
    const deckId = explicit || sources[index % Math.max(1, sources.length)] || account.lang;
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

function nextSlots(accounts: Account[], deps: RouteDeps, limit = 40) {
  const now = new Date();
  const horizonMs = 48 * 60 * 60 * 1000;
  const slots: {
    accountId: number;
    channelName: string;
    time: string;
    at: string;
    deck: string | null;
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
        slots.push({
          accountId: account.id,
          channelName: account.channelName,
          time,
          at: at.toISOString(),
          deck: account.slotDecks?.[time] ?? sources[0] ?? account.lang ?? null,
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

    const generationJobs = listGenStatuses(all ? undefined : userId)
      .filter((job) => visibleAccountIds.has(job.accountId))
      .map((job) => {
        const account = accountById.get(job.accountId);
        const owner = job.userId != null ? db.getUserById(job.userId) : null;
        return {
          ...job,
          channelName: account?.channelName ?? `#${job.accountId}`,
          ownerUsername: owner?.username ?? null,
        };
      });

    const channelQueues = accounts.map((account) => {
      const byDeck = deckCounts(db, account);
      const queued = Object.values(byDeck).reduce((sum, n) => sum + n, 0);
      const postsPerDay = account.schedule?.length ?? 0;
      const scheduledByDeck = scheduledCountsByDeck(account, deps);
      return {
        accountId: account.id,
        channelName: account.channelName,
        ownerUsername: account.userId ? db.getUserById(account.userId)?.username ?? null : null,
        connected: account.status === "connected",
        enabled: account.enabled,
        schedule: account.schedule ?? [],
        sourceDecks: deps.deckAccess.accountSourceDecks(account),
        byDeck,
        scheduledByDeck,
        queued,
        postsPerDay,
        runwayDays: runwayDays(byDeck, scheduledByDeck, queued, postsPerDay),
      };
    });

    return {
      generationJobs,
      channelQueues,
      upcomingSlots: nextSlots(accounts, deps),
    };
  });
}
