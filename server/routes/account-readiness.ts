import type { FastifyInstance } from "fastify";

import type { Account, Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import { MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";
import { getReadinessLimits } from "../services/readiness-limits.ts";
import { createDeckAvailabilityContext } from "../services/deck-availability.ts";

type ReadinessLevel = "ready" | "warning" | "blocked";

function nextSlotAt(account: Account): string | null {
  const now = new Date();
  let best: Date | null = null;
  for (const time of account.schedule ?? []) {
    const [hh, mm] = String(time).split(":").map((x) => Number(x));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const at = new Date(now);
    at.setHours(hh, mm, 0, 0);
    if (at <= now) at.setDate(at.getDate() + 1);
    if (!best || at < best) best = at;
  }
  return best ? best.toISOString() : null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function videoCountsByDeck(db: Db, account: Account): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db.videoCountsByAccount([account.id])) counts.set(row.deck, row.count);
  return counts;
}

function scheduledCountsByDeck(account: Account, sourceDecks: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const sources = sourceDecks.length ? sourceDecks : [account.lang].filter(Boolean);
  for (const deckId of sources) counts.set(deckId, 0);

  for (const [index, time] of (account.schedule ?? []).entries()) {
    const explicit = account.slotDecks?.[time];
    const deckId = explicit && sources.includes(explicit) ? explicit : sources[index % Math.max(1, sources.length)] || account.lang;
    if (!deckId) continue;
    counts.set(deckId, (counts.get(deckId) ?? 0) + 1);
  }
  return counts;
}

export function registerAccountReadinessRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/accounts/:id/readiness", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const account = deps.accessibleAccount(req, reply, id);
    if (!account) return;

    const sourceDecks = deps.deckAccess.accountSourceDecks(account);
    const ownerId = deps.accountOwnerId(req, account);
    const readinessLimits = getReadinessLimits(db);
    const postsPerDay = account.schedule?.length ?? 0;
    const queuedByDeck = videoCountsByDeck(db, account);
    const scheduledByDeck = scheduledCountsByDeck(account, sourceDecks);
    const deckIds = unique([
      ...sourceDecks,
      ...Array.from(scheduledByDeck.keys()),
    ].filter(Boolean));
    const availabilityCtx = createDeckAvailabilityContext();
    const cardDeckIds = deckIds.filter((deckId) => deckId !== MANUAL_VIDEO_DECK);
    const availability = deps.deckAccess.availableUnusedByDeck(ownerId, cardDeckIds, availabilityCtx);
    const queuedVideos = deckIds.reduce((sum, deckId) => sum + (queuedByDeck.get(deckId) ?? 0), 0);
    const decks = deckIds.map((deckId) => {
      const queued = queuedByDeck.get(deckId) ?? 0;
      const deckPostsPerDay = scheduledByDeck.get(deckId) ?? 0;
      const deckRunwayDays = deckPostsPerDay > 0 ? queued / deckPostsPerDay : null;
      const available = deckId === MANUAL_VIDEO_DECK ? null : (availability.get(deckId) ?? 0);
      const status =
        deckPostsPerDay <= 0
          ? "idle"
          : queued <= 0
            ? "empty"
            : deckRunwayDays != null && deckRunwayDays < readinessLimits.minRunwayDays
              ? "low"
              : "ok";
      return {
        deckId,
        queued,
        postsPerDay: deckPostsPerDay,
        runwayDays: deckRunwayDays,
        available,
        status,
      };
    });
    // The scheduler first tries the pinned slot deck, then falls back to another ready source deck.
    // Keep per-deck warnings below, but the headline runway is the real continuity of the channel.
    const runwayDays = postsPerDay > 0 ? queuedVideos / postsPerDay : null;
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (account.status !== "connected") blockers.push("not_connected");
    if (account.authError) blockers.push("auth_error");
    if (postsPerDay <= 0) blockers.push("no_schedule");
    if (sourceDecks.length <= 0) blockers.push("no_sources");
    if (queuedVideos <= 0) blockers.push("no_queue");

    for (const deckId of sourceDecks) {
      if (deckId === MANUAL_VIDEO_DECK) continue;
      const contentLang = deps.deckAccess.deckContentLang(req, deckId);
      if (contentLang && account.channelLang && contentLang !== account.channelLang) {
        blockers.push("source_language_mismatch");
        break;
      }
    }

    const cardSourceDecks = sourceDecks.filter((deckId) => deckId !== MANUAL_VIDEO_DECK);
    const availableNow =
      cardSourceDecks.length > 0 ? deps.deckAccess.availableUnusedForDecks(ownerId, cardSourceDecks, availabilityCtx) : 0;
    if (availableNow <= 0 && cardSourceDecks.length > 0) warnings.push("no_fresh_cards");
    if (runwayDays != null && queuedVideos > 0 && runwayDays < readinessLimits.minRunwayDays) warnings.push("low_runway");
    if (decks.some((deck) => deck.postsPerDay > 0 && (deck.status === "low" || deck.status === "empty")))
      warnings.push("low_deck_runway");
    if (!account.enabled) warnings.push("disabled");

    const level: ReadinessLevel = blockers.length ? "blocked" : warnings.length ? "warning" : "ready";
    const actions = unique([
      ...(blockers.includes("not_connected") || blockers.includes("auth_error") ? ["connect_youtube"] : []),
      ...(blockers.includes("no_schedule") ? ["set_schedule"] : []),
      ...(blockers.includes("no_sources") || blockers.includes("source_language_mismatch") ? ["fix_sources"] : []),
      ...(blockers.includes("no_queue") || warnings.includes("low_runway") ? ["generate_or_upload"] : []),
      "open_queue",
    ]);

    return {
      status: level,
      blockers: unique(blockers),
      warnings: unique(warnings),
      actions,
      queuedVideos,
      postsPerDay,
      runwayDays,
      minRunwayDays: readinessLimits.minRunwayDays,
      decks,
      nextSlotAt: nextSlotAt(account),
      sourceDecks,
      availableNow,
    };
  });
}
