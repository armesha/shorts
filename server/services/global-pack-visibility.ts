import type { Db } from "../db.ts";
import { parseStringArray, parseStringRecord, type Row } from "../db/mappers.ts";
import type { Deck } from "../../src/anecdotes/decks.ts";
import type { Pack, PackSummary } from "../../src/packs/store.ts";

type DbWithHandle = Pick<Db, "db">;
type PackLike = Pick<PackSummary, "id" | "name" | "templateType"> | Pick<Pack, "id" | "name" | "templateType">;

const JOKE_OR_MEME_RE =
  /(анекдот|анекдоты|шутк|юмор|мем|мемы|meme|memes|joke|jokes|anecdote|anecdotes|witz|witze|barzellette|chistes|blague|blagues|piada|piadas|humor|humour|lucu|نوادر|طرائف|ضحك|हास्य|चुटकुले)/i;

const FORCE_HIDDEN_BUILT_IN_DECKS = new Set([
  "visual-riddles",
  "visual-riddles-de",
  "visual-riddles-en",
  "visual-riddles-it",
  "visual-riddles-es",
  "visual-riddles-fr",
  "visual-riddles-pt",
]);

export function deckIdsUsedByAnyChannel(db: DbWithHandle): Set<string> {
  const used = new Set<string>();
  const rows = db.db
    .prepare("SELECT lang, source_decks, slot_decks, long_video_decks FROM accounts")
    .all() as Row[];

  for (const row of rows) {
    const sourceDecks = parseStringArray(row.source_decks, []);
    if (sourceDecks.length) {
      for (const deckId of sourceDecks) used.add(deckId);
    } else if (row.lang) {
      used.add(String(row.lang));
    }

    for (const deckId of parseStringArray(row.long_video_decks, [])) used.add(deckId);

    const slotDecks = parseStringRecord(row.slot_decks);
    for (const deckId of Object.values(slotDecks)) used.add(deckId);
  }

  return used;
}

export function isJokeOrMemeBuiltInDeck(deck: Deck): boolean {
  const text = [
    deck.id,
    deck.name,
    deck.source,
    deck.hashtags,
    ...(deck.tags ?? []),
    ...(deck.genericTitles ?? []),
  ].join(" ");
  return !!deck.meme || deck.audioProfile === "jokes" || JOKE_OR_MEME_RE.test(text);
}

export function isJokeOrMemeCustomPack(pack: PackLike): boolean {
  return JOKE_OR_MEME_RE.test([pack.id, pack.name, pack.templateType ?? ""].join(" "));
}

export function isBuiltInDeckGloballyVisible(db: DbWithHandle, deck: Deck, used = deckIdsUsedByAnyChannel(db)): boolean {
  if (FORCE_HIDDEN_BUILT_IN_DECKS.has(deck.id)) return false;
  return used.has(deck.id) || isJokeOrMemeBuiltInDeck(deck);
}

export function filterGloballyVisibleBuiltInDecks<T extends Deck>(db: DbWithHandle, decks: T[]): T[] {
  const used = deckIdsUsedByAnyChannel(db);
  return decks.filter((deck) => isBuiltInDeckGloballyVisible(db, deck, used));
}

export function isCustomPackGloballyVisible(db: DbWithHandle, pack: PackLike, used = deckIdsUsedByAnyChannel(db)): boolean {
  return used.has(`pack:${pack.id}`) || isJokeOrMemeCustomPack(pack);
}

export function filterGloballyVisibleCustomPacks<T extends PackLike>(db: DbWithHandle, packs: T[]): T[] {
  const used = deckIdsUsedByAnyChannel(db);
  return packs.filter((pack) => isCustomPackGloballyVisible(db, pack, used));
}
