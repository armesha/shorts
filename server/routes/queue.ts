import type { FastifyInstance } from "fastify";

import { DECKS, isPackDeckId, MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";
import { listPackVisibilitySummaries } from "../../src/packs/store.ts";
import { isSuperAdminUser } from "../auth.ts";
import type { Account, Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import { listStatuses as listGenStatuses } from "../services/gen-queue.ts";
import { publicGenWorkerStatus } from "../services/gen-worker-heartbeat.ts";
import { isForbiddenSuperAdminSourceDeck } from "../services/super-admin-optical-decks.ts";
import { nextLocalTimeAt } from "../services/timezone.ts";
import type { RouteDeps } from "./deps.ts";
import { visibleLibraryDeckIds } from "./videos.ts";

type QueueQuery = { scope?: string };
const QUEUE_OVERVIEW_TTL_MS = 15_000;
const queueOverviewCache = new Map<string, { expiresAt: number; value: unknown }>();

const genQueueRunnerMode = (): "embedded" | "external" =>
  process.env.GEN_QUEUE_RUNNER === "0" || process.env.GEN_QUEUE_RUNNER === "external" ? "external" : "embedded";

function deckName(deckId: string | null | undefined, packNames: Map<string, string>): string | null {
  const id = String(deckId || "").trim();
  if (!id) return null;
  if (id === MANUAL_VIDEO_DECK) return "Manual videos";
  if (isPackDeckId(id)) {
    return packNames.get(id.slice(5)) ?? id;
  }
  return DECKS.find((deck) => deck.id === id)?.name ?? id;
}

function deckCounts(rows: { deck: string; count: number }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.deck] = (counts[row.deck] ?? 0) + row.count;
  return counts;
}

function scheduledCountsByDeck(account: Account, sources: string[]): Record<string, number> {
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

function queueSourceDecks(
  account: Account,
  userById: Map<number, { timezone?: string; isSuperAdmin?: boolean }>,
  globallyVisibleDeckIds: Set<string>,
): string[] {
  const ownerIsSuperAdmin = account.userId != null && !!userById.get(account.userId)?.isSuperAdmin;
  const ids = account.sourceDecks?.length ? account.sourceDecks : [account.lang];
  return [
    ...new Set(
      ids
        .map((x) => String(x || "").trim())
        .filter((deckId) => deckId && !DECKS.find((deck) => deck.id === deckId)?.longVideo)
        .filter((deckId) => globallyVisibleDeckIds.has(deckId))
        .filter((deckId) => !ownerIsSuperAdmin || !isForbiddenSuperAdminSourceDeck(deckId)),
    ),
  ];
}

function nextSlots(
  accounts: Account[],
  userById: Map<number, { timezone?: string }>,
  sourceDecksByAccount: Map<number, string[]>,
  packNames: Map<string, string>,
  limit = 40,
) {
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
    const sources = sourceDecksByAccount.get(account.id) ?? [];
    for (const time of account.schedule ?? []) {
      const at = nextLocalTimeAt(String(time), account.userId ? userById.get(account.userId)?.timezone || account.timezone : account.timezone, now);
      if (!at) continue;
      const delta = new Date(at).getTime() - now.getTime();
      if (delta <= 0 || delta > horizonMs) continue;
      const explicit = account.slotDecks?.[time];
      const deck = explicit && sources.includes(explicit) ? explicit : sources[0] ?? account.lang ?? null;
      slots.push({
        accountId: account.id,
        channelName: account.channelName,
        time,
        at,
        deck,
        deckName: deckName(deck, packNames),
      });
    }
  }

  return slots.sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
}

function cachedQueueOverview(key: string, build: () => unknown): unknown {
  const now = Date.now();
  const cached = queueOverviewCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = build();
  queueOverviewCache.set(key, { value, expiresAt: now + QUEUE_OVERVIEW_TTL_MS });
  return value;
}

export function registerQueueRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/queue", async (req, reply) => {
    // Очередь — read-only visual surface for admins/moderators; mutating queue controls stay
    // checked in their own routes.
    if (!deps.auth.requireAdminLike(req, reply)) return;
    const query = (req.query ?? {}) as QueueQuery;
    const userId = uid(req);
    const all = query.scope === "all" && deps.auth.isAdminLikeReq(req);
    return cachedQueueOverview(`queue:${all ? "all" : userId}`, () => {
      const accounts = all ? db.listAccounts() : db.listAccountsByUser(userId);
      const visibleAccountIds = new Set(accounts.map((account) => account.id));
      const accountById = new Map(accounts.map((account) => [account.id, account]));
      const userById = new Map(db.listUsers().map((user) => [user.id, user]));
      const countsByAccount = new Map<number, { deck: string; count: number }[]>();
      const visibleVideoDeckIds = visibleLibraryDeckIds(db);
      const sourceDecksByAccount = new Map(
        accounts.map((account) => [account.id, queueSourceDecks(account, userById, visibleVideoDeckIds)]),
      );
      const packNames = new Map(listPackVisibilitySummaries().map((pack) => [pack.id, pack.name]));
      for (const row of db.videoCountsByAccount(accounts.map((account) => account.id))) {
        if (!visibleVideoDeckIds.has(row.deck)) continue;
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
        const sourceDecks = sourceDecksByAccount.get(account.id) ?? [];
        const scheduledByDeck = scheduledCountsByDeck(account, sourceDecks);
        const deckIds = [...new Set([...Object.keys(byDeck), ...sourceDecks, ...Object.keys(scheduledByDeck)])];
        const sourceSet = new Set(sourceDecks);
        const queued = sourceDecks.length
          ? Object.entries(byDeck).reduce((sum, [deckId, n]) => (sourceSet.has(deckId) ? sum + n : sum), 0)
          : Object.values(byDeck).reduce((sum, n) => sum + n, 0);
        const postsPerDay = account.schedule?.length ?? 0;
        return {
          accountId: account.id,
          channelName: account.channelName,
          ownerUsername: account.userId ? userById.get(account.userId)?.username ?? null : null,
          connected: account.status === "connected",
          enabled: account.enabled,
          schedule: account.schedule ?? [],
          sourceDecks,
          byDeck,
          deckNames: Object.fromEntries(deckIds.map((deckId) => [deckId, deckName(deckId, packNames) ?? deckId])),
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
        upcomingSlots: nextSlots(accounts, userById, sourceDecksByAccount, packNames),
      };
    });
  });
}
