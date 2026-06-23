// Deck/pack permission + visibility cluster, moved VERBATIM from index.ts. These decide which built-in
// decks and custom packs a user may see/use/source, validate channel source-decks (incl. the
// «язык пака ≠ язык канала» guard), and count a user's unused-card pool. index.ts builds ONE instance
// via makeDeckAccess(db, { isAdminReq }) and injects it into every route module that gated on these.
import type { Db, Account } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { DECKS, isPackDeckId, deckLang } from "../../src/anecdotes/decks.ts";
import { getPack } from "../../src/packs/store.ts";
import { libraryStats } from "../../src/anecdotes/library.ts";
import { packCardKey } from "./pack-gen.ts";

type Replyish = { code: (n: number) => { send: (b: unknown) => unknown } };
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;

export interface DeckAccess {
  isGrantableBuiltinDeck: (deck: (typeof DECKS)[number]) => boolean;
  isGrantableBuiltinDeckId: (deckId: string) => boolean;
  builtinDeckVisibleForUser: (userId: number, deck: (typeof DECKS)[number]) => boolean;
  deckAllowed: (req: unknown, deckId: string) => boolean;
  deckAllowedForUser: (userId: number, deckId: string) => boolean;
  cleanDeckIds: (ids: unknown) => string[];
  accountSourceDecks: (account: Account) => string[];
  availableUnusedForDecks: (ownerId: number, deckIds: string[]) => number;
  deckExists: (req: unknown, deckId: string) => boolean;
  deckContentLang: (req: unknown, deckId: string) => string;
  validateAccountSourceDeck: (req: unknown, deckId: string, channelLang: string) => string | null;
  resolveAccountSourceDeck: (req: unknown, reply: Replyish, account: Account, requested?: string | null) => string | null;
  visibleDecksForUser: (userId: number) => (typeof DECKS)[number][];
}

export function makeDeckAccess(db: Db, deps: { isAdminReq: (req: unknown) => boolean; isSuperAdminReq: (req: unknown) => boolean }): DeckAccess {
  const { isAdminReq, isSuperAdminReq } = deps;

  function isGrantableBuiltinDeck(deck: (typeof DECKS)[number]): boolean {
    return !!(deck.adminOnly && deck.grantable);
  }

  function isGrantableBuiltinDeckId(deckId: string): boolean {
    const deck = DECKS.find((d) => d.id === deckId);
    return !!deck && isGrantableBuiltinDeck(deck);
  }

  function builtinDeckVisibleForUser(userId: number, deck: (typeof DECKS)[number]): boolean {
    // Админ видит ВСЁ (вкл. admin-only) по умолчанию, КРОМЕ того, что он скрыл лично у себя
    // (тот же per-user hidden-набор, что и у юзеров — он опционален и легко снимается в матрице
    // Админки). Это только ВИДИМОСТЬ (списки/пикеры): право генерить у админа остаётся (deckAllowed),
    // поэтому уже настроенный автопостинг канала не ломается.
    if (db.getUserById(userId)?.role === "admin") return !db.isDeckHiddenFor(userId, deck.id);
    if (deck.adminOnly) return isGrantableBuiltinDeck(deck) && db.isDeckGrantedFor(userId, deck.id);
    return !db.isDeckHiddenFor(userId, deck.id);
  }

    // True if the user may use a deck (pack): admins always; custom packs by owner/grant;
    // grantable admin-only built-ins by explicit admin grant; normal built-ins unless hidden.
    function deckAllowed(req: unknown, deckId: string): boolean {
      // Кастомные паки: доступ по владению/гранту (getPack применяет canAccess), а не по hidden.
      if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), isSuperAdminReq(req)) !== null;
      if (isAdminReq(req)) return true;
      const deck = DECKS.find((d) => d.id === deckId);
      return !!deck && builtinDeckVisibleForUser(uid(req), deck);
    }

  // Same as deckAllowed but keyed by a bare userId (no req) — used by the file streamer's authz gate,
  // which only has the session {id, role}, not a Fastify request.
    function deckAllowedForUser(userId: number, deckId: string): boolean {
      if (isPackDeckId(deckId)) {
        return getPack(deckId.slice(5), userId, isSuperAdminUser(db.getUserById(userId))) !== null;
      }
      const deck = DECKS.find((d) => d.id === deckId);
      return !!deck && builtinDeckVisibleForUser(userId, deck);
  }

  function cleanDeckIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
  }

  function accountSourceDecks(account: Account): string[] {
    const ids = account.sourceDecks?.length ? account.sourceDecks : [account.lang];
    return [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
  }

  // How many UNUSED cards the content owner still has across the given decks/packs (free pool).
  // Cards are unique per deck, so summing across decks never double-counts. Used to keep generation
  // from queueing more videos than there are fresh cards (a job can't make a video from a used card).
  function availableUnusedForDecks(ownerId: number, deckIds: string[]): number {
    const usedKeys = db.usedAnecdoteKeys(ownerId);
      const ownerIsSuperAdmin = isSuperAdminUser(db.getUserById(ownerId));
      let total = 0;
      for (const deckId of deckIds) {
        if (isPackDeckId(deckId)) {
          const pack = getPack(deckId.slice(5), ownerId, ownerIsSuperAdmin);
        if (!pack) continue;
        let used = 0;
        for (const c of pack.cards) if (usedKeys.has(packCardKey(c.values))) used++;
        total += Math.max(0, pack.cards.length - used);
      } else {
        total += libraryStats(deckId, usedKeys).available;
      }
    }
    return total;
  }

    function deckExists(req: unknown, deckId: string): boolean {
      if (DECKS.some((d) => d.id === deckId)) return true;
      return isPackDeckId(deckId) && !!getPack(deckId.slice(5), uid(req), isSuperAdminReq(req));
    }

    function deckContentLang(req: unknown, deckId: string): string {
      if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), isSuperAdminReq(req))?.lang || "";
      return deckLang(deckId);
    }

  function validateAccountSourceDeck(req: unknown, deckId: string, channelLang: string): string | null {
    if (!deckExists(req, deckId)) return `Неизвестный пак «${deckId}».`;
    if (!deckAllowed(req, deckId)) return "Этот пак вам недоступен — нельзя поставить его источником канала.";
    const contentLang = deckContentLang(req, deckId);
    if (channelLang && contentLang && contentLang !== channelLang)
      return `Язык контента (${contentLang.toUpperCase()}) ≠ язык канала (${channelLang.toUpperCase()}) — выровняй их.`;
    return null;
  }

  function resolveAccountSourceDeck(
    req: unknown,
    reply: Replyish,
    account: Account,
    requested?: string | null,
  ): string | null {
    const deckId = String(requested || account.lang || "").trim();
    const sources = accountSourceDecks(account);
    if (!deckId || !sources.includes(deckId)) {
      reply.code(400).send({ error: "Этот пак не выбран источником канала — сначала добавьте его в «Паки канала»." });
      return null;
    }
    const err = validateAccountSourceDeck(req, deckId, account.channelLang);
    if (err) {
      reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
      return null;
    }
    return deckId;
  }

  // Pack overview for the «Паки» tab (any logged-in user): their VISIBLE packs with total/used/remaining/posted.
  // Decks a user may see/use: per-user not hidden AND (admin OR not an admin-only deck).
  function visibleDecksForUser(userId: number) {
    return DECKS.filter((d) => builtinDeckVisibleForUser(userId, d));
  }

  return {
    isGrantableBuiltinDeck,
    isGrantableBuiltinDeckId,
    builtinDeckVisibleForUser,
    deckAllowed,
    deckAllowedForUser,
    cleanDeckIds,
    accountSourceDecks,
    availableUnusedForDecks,
    deckExists,
    deckContentLang,
    validateAccountSourceDeck,
    resolveAccountSourceDeck,
    visibleDecksForUser,
  };
}
