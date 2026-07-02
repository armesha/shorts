import type { Db } from "../db.ts";
import { DECKS, deckLang, type Deck } from "../../src/anecdotes/decks.ts";
import { listAllPacks, setGrant, type PackSummary } from "../../src/packs/store.ts";

const RUSSIAN_JOKE_RE = /(анекдот|шутк|shutk|jokes?\b|witze\b|barzellette\b|chistes?\b)/i;

export interface DefaultRegisteredUserGrantIds {
  deckIds: string[];
  longVideoDeckIds: string[];
  packDeckIds: string[];
}

type GrantDb = Pick<
  Db,
  "grantedDecksFor" | "setGrantedDecks" | "grantedLongVideoDecksFor" | "setGrantedLongVideoDecks"
>;

function unique(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

function isRussianJokeDeck(deck: Deck): boolean {
  const text = [
    deck.id,
    deck.name,
    deck.hashtags,
    deck.source,
    ...deck.tags,
    ...deck.genericTitles,
  ].join(" ");
  return deckLang(deck.id) === "ru" && RUSSIAN_JOKE_RE.test(text);
}

export function isDefaultRegisteredUserPack(pack: Pick<PackSummary, "id" | "name" | "lang" | "templateType">): boolean {
  const text = [pack.id, pack.name, pack.templateType ?? ""].join(" ");
  return pack.lang === "ru" && RUSSIAN_JOKE_RE.test(text);
}

export function registeredUserDefaultGrantIds(): DefaultRegisteredUserGrantIds {
  const deckIds: string[] = [];
  const longVideoDeckIds: string[] = [];
  for (const deck of DECKS) {
    if (!deck.adminOnly || !deck.grantable || !isRussianJokeDeck(deck)) continue;
    if (deck.longVideo) longVideoDeckIds.push(deck.id);
    else deckIds.push(deck.id);
  }

  const packDeckIds = listAllPacks()
    .filter(isDefaultRegisteredUserPack)
    .map((pack) => `pack:${pack.id}`);

  return {
    deckIds: unique(deckIds),
    longVideoDeckIds: unique(longVideoDeckIds),
    packDeckIds: unique(packDeckIds),
  };
}

export function grantDefaultRegisteredUserDecks(db: GrantDb, userId: number): DefaultRegisteredUserGrantIds {
  const defaults = registeredUserDefaultGrantIds();
  if (defaults.deckIds.length) {
    db.setGrantedDecks(userId, unique([...db.grantedDecksFor(userId), ...defaults.deckIds]));
  }
  if (defaults.longVideoDeckIds.length) {
    db.setGrantedLongVideoDecks(userId, unique([...db.grantedLongVideoDecksFor(userId), ...defaults.longVideoDeckIds]));
  }

  const packIds = new Set(defaults.packDeckIds.map((id) => id.replace(/^pack:/, "")));
  for (const pack of listAllPacks()) {
    if (!packIds.has(pack.id) || pack.owners.includes(userId)) continue;
    setGrant(pack.id, userId, true);
  }
  return defaults;
}
