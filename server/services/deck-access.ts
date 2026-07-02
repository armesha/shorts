// Deck/pack permission + visibility cluster, moved VERBATIM from index.ts. These decide which built-in
// decks and custom packs a user may see/use/source, validate channel source-decks (incl. the
// «язык пака ≠ язык канала» guard), and count a user's unused-card pool. index.ts builds ONE instance
// via makeDeckAccess(db, { isAdminReq }) and injects it into every route module that gated on these.
import type { Db, Account } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { DECKS, isPackDeckId, deckLang } from "../../src/anecdotes/decks.ts";
import { getPack } from "../../src/packs/store.ts";
import { isForbiddenSuperAdminSourceDeck } from "./super-admin-optical-decks.ts";
import {
  availableUnusedByDeck,
  availableUnusedForDecks,
  type DeckAvailabilityContext,
} from "./deck-availability.ts";

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
  availableUnusedByDeck: (ownerId: number, deckIds: string[], ctx?: DeckAvailabilityContext) => Map<string, number>;
  availableUnusedForDecks: (ownerId: number, deckIds: string[], ctx?: DeckAvailabilityContext) => number;
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
    const user = db.getUserById(userId);
    if (isSuperAdminUser(user) && isForbiddenSuperAdminSourceDeck(deck.id)) return false;
    // Админ видит ВСЁ (вкл. admin-only) по умолчанию, КРОМЕ того, что он скрыл лично у себя
    // (тот же per-user hidden-набор, что и у юзеров — он опционален и легко снимается в матрице
    // Админки). Это только ВИДИМОСТЬ (списки/пикеры): право генерить у админа остаётся (deckAllowed),
    // поэтому уже настроенный автопостинг канала не ломается.
    if (user?.role === "admin") return !db.isDeckHiddenFor(userId, deck.id);
    if (deck.adminOnly && deck.longVideo) return isGrantableBuiltinDeck(deck) && db.isLongVideoDeckGrantedFor(userId, deck.id);
    if (deck.adminOnly) return isGrantableBuiltinDeck(deck) && db.isDeckGrantedFor(userId, deck.id);
    return !db.isDeckHiddenFor(userId, deck.id);
  }

    // True if the user may use a deck (pack): admins always; custom packs by owner/grant;
    // grantable admin-only built-ins by explicit admin grant; normal built-ins unless hidden.
    function deckAllowed(req: unknown, deckId: string): boolean {
      const user = db.getUserById(uid(req));
      if (isSuperAdminUser(user) && isForbiddenSuperAdminSourceDeck(deckId)) return false;
      // Кастомные паки: доступ по владению/гранту (getPack применяет canAccess), а не по hidden.
      if (isPackDeckId(deckId)) return getPack(deckId.slice(5), uid(req), isSuperAdminReq(req)) !== null;
      if (isAdminReq(req)) return true;
      const deck = DECKS.find((d) => d.id === deckId);
      return !!deck && builtinDeckVisibleForUser(uid(req), deck);
    }

  // Same as deckAllowed but keyed by a bare userId (no req) — used by the file streamer's authz gate,
  // which only has the session {id, role}, not a Fastify request.
    function deckAllowedForUser(userId: number, deckId: string): boolean {
      const user = db.getUserById(userId);
      if (isSuperAdminUser(user) && isForbiddenSuperAdminSourceDeck(deckId)) return false;
      if (isPackDeckId(deckId)) {
        return getPack(deckId.slice(5), userId, isSuperAdminUser(user)) !== null;
      }
      const deck = DECKS.find((d) => d.id === deckId);
      return !!deck && builtinDeckVisibleForUser(userId, deck);
  }

  function cleanDeckIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
  }

  function accountSourceDecks(account: Account): string[] {
    const ownerIsSuperAdmin = isSuperAdminUser(account.userId != null ? db.getUserById(account.userId) : null);
    const ids = account.sourceDecks?.length ? account.sourceDecks : [account.lang];
    return [
      ...new Set(
        ids
          .map((x) => String(x || "").trim())
          .filter((deckId) => deckId && !DECKS.find((deck) => deck.id === deckId)?.longVideo)
          .filter((deckId) => !ownerIsSuperAdmin || !isForbiddenSuperAdminSourceDeck(deckId)),
      ),
    ];
  }

  // How many UNUSED cards the content owner still has across the given decks/packs (free pool).
  // Built-in decks are counted by DISTINCT item_key so aggregate decks plus legacy split decks do not
  // inflate the same quote/card pool.
  function availableUnusedByDeckForOwner(ownerId: number, deckIds: string[], ctx?: DeckAvailabilityContext): Map<string, number> {
    return availableUnusedByDeck(db, ownerId, deckIds, ctx);
  }

  function availableUnusedForDecksForOwner(ownerId: number, deckIds: string[], ctx?: DeckAvailabilityContext): number {
    return availableUnusedForDecks(db, ownerId, deckIds, ctx);
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
    if (DECKS.find((deck) => deck.id === deckId)?.longVideo)
      return "Длинные видео не ставятся в расписание — включите их отдельной галочкой и добавляйте в библиотеку вручную.";
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
    availableUnusedByDeck: availableUnusedByDeckForOwner,
    availableUnusedForDecks: availableUnusedForDecksForOwner,
    deckExists,
    deckContentLang,
    validateAccountSourceDeck,
    resolveAccountSourceDeck,
    visibleDecksForUser,
  };
}
