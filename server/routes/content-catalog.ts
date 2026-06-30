import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Account, Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";
import { MANUAL_VIDEO_DECK, deckLang, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { libraryStats } from "../../src/anecdotes/library.ts";
import { listPacks } from "../../src/packs/store.ts";
import { INFINITE_PACKS_FEATURE, infiniteCounts } from "../services/infinite-packs.ts";

type CatalogKind = "builtin" | "custom_pack" | "manual" | "clip_demo";

type CatalogAccount = {
  id: number;
  channelName: string;
  enabled: boolean;
  connected: boolean;
};

type CatalogItem = {
  id: string;
  kind: CatalogKind;
  title: string;
  lang: string | null;
  total: number | null;
  available: number | null;
  queued: number;
  demoCount: number;
  usedByAccounts: CatalogAccount[];
};

type ManifestPack = { id: string; title?: string; lang?: string; items?: unknown[] };

function queuedByDeck(accounts: Account[], db: Db): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db.videoCountsByAccount(accounts.map((account) => account.id))) {
    counts.set(row.deck, (counts.get(row.deck) ?? 0) + row.count);
  }
  return counts;
}

function accountsUsingDeck(accounts: Account[], deps: RouteDeps, deckId: string): CatalogAccount[] {
  return accounts
    .filter((account) => {
      if (deps.deckAccess.accountSourceDecks(account).includes(deckId)) return true;
      return Object.values(account.slotDecks ?? {}).includes(deckId);
    })
    .map((account) => ({
      id: account.id,
      channelName: account.channelName,
      enabled: account.enabled,
      connected: account.status === "connected",
    }));
}

function clipDemoCounts(req: unknown, deps: RouteDeps): Map<string, { count: number; title: string; lang: string | null }> {
  const file = resolve(process.cwd(), deps.outputDir, "admin-demos/manifest.json");
  const counts = new Map<string, { count: number; title: string; lang: string | null }>();
  if (!existsSync(file)) return counts;
  let packs: ManifestPack[] = [];
  try {
    packs = (JSON.parse(readFileSync(file, "utf8")).packs as ManifestPack[]) ?? [];
  } catch {
    return counts;
  }
  for (const pack of packs) {
    const items = Array.isArray(pack.items) ? pack.items.length : 0;
    if (items <= 0 || !deps.deckAccess.deckAllowed(req, pack.id)) continue;
    counts.set(pack.id, { count: items, title: pack.title || pack.id, lang: pack.lang ?? null });
  }
  return counts;
}

export function registerContentCatalogRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/content-catalog", async (req) => {
    const userId = uid(req);
    const isSuperAdmin = deps.auth.isSuperAdminReq(req);
    const accounts = isSuperAdmin ? db.listAccounts() : db.listAccountsByUser(userId);
    const queued = queuedByDeck(accounts, db);
    const usedKeys = db.usedAnecdoteKeys(userId);
    const infinite = db.hasFeature(userId, INFINITE_PACKS_FEATURE);
    const demos = clipDemoCounts(req, deps);
    const items: CatalogItem[] = [];
    const seen = new Set<string>();

    for (const deck of deps.deckAccess.visibleDecksForUser(userId)) {
      const stats = libraryStats(deck.id, usedKeys);
      const counts = infinite ? infiniteCounts(stats.total) : stats;
      const demo = demos.get(deck.id);
      items.push({
        id: deck.id,
        kind: "builtin",
        title: deck.name,
        lang: deckLang(deck.id) || null,
        total: counts.total,
        available: counts.available,
        queued: queued.get(deck.id) ?? 0,
        demoCount: demo?.count ?? 0,
        usedByAccounts: accountsUsingDeck(accounts, deps, deck.id),
      });
      seen.add(deck.id);
    }

    for (const pack of listPacks(userId, isSuperAdmin)) {
      const p = pack as typeof pack & {
        id: string;
        title?: string;
        name?: string;
        lang?: string;
        count?: number;
        cardCount?: number;
        cards?: unknown[] | number;
      };
      const deckId = isPackDeckId(p.id) ? p.id : `pack:${p.id}`;
      const total = Number(p.cardCount ?? p.count ?? (Array.isArray(p.cards) ? p.cards.length : p.cards) ?? 0) || 0;
      const demo = demos.get(deckId);
      items.push({
        id: deckId,
        kind: "custom_pack",
        title: p.title || p.name || p.id,
        lang: p.lang || null,
        total,
        available: deps.deckAccess.availableUnusedForDecks(userId, [deckId]),
        queued: queued.get(deckId) ?? 0,
        demoCount: demo?.count ?? 0,
        usedByAccounts: accountsUsingDeck(accounts, deps, deckId),
      });
      seen.add(deckId);
    }

    items.push({
      id: MANUAL_VIDEO_DECK,
      kind: "manual",
      title: "Manual videos",
      lang: null,
      total: null,
      available: null,
      queued: queued.get(MANUAL_VIDEO_DECK) ?? 0,
      demoCount: 0,
      usedByAccounts: accountsUsingDeck(accounts, deps, MANUAL_VIDEO_DECK),
    });
    seen.add(MANUAL_VIDEO_DECK);

    for (const [deckId, demo] of demos) {
      if (seen.has(deckId)) continue;
      items.push({
        id: deckId,
        kind: "clip_demo",
        title: demo.title,
        lang: demo.lang,
        total: demo.count,
        available: demo.count,
        queued: queued.get(deckId) ?? 0,
        demoCount: demo.count,
        usedByAccounts: accountsUsingDeck(accounts, deps, deckId),
      });
    }

    const rank: Record<CatalogKind, number> = { builtin: 0, custom_pack: 1, manual: 2, clip_demo: 3 };
    items.sort((a, b) => rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
    return { items };
  });
}
