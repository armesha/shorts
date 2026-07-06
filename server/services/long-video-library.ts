import { DECKS } from "../../src/anecdotes/decks.ts";
import { firstAnecdote, randomAnecdote, packItemKey } from "../../src/anecdotes/library.ts";
import type { Account, Db, Video } from "../db.ts";
import { buildFactLibraryVideo } from "./fact-gen.ts";
import { INFINITE_PACKS_FEATURE } from "./infinite-packs.ts";

export class LongVideoLibraryError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "LongVideoLibraryError";
    this.statusCode = statusCode;
  }
}

export async function addLongVideoToLibrary(input: {
  db: Db;
  account: Account;
  deckId: string;
  ownerId: number;
  deckAllowed: (deckId: string) => boolean;
  deckContentLang: (deckId: string) => string;
  allowDisconnected?: boolean;
}): Promise<Video> {
  const { db, account, deckId, ownerId, deckAllowed, deckContentLang, allowDisconnected = false } = input;
  const deck = DECKS.find((d) => d.id === deckId);
  if (!deck || !deck.preFact || !deck.longVideo) throw new LongVideoLibraryError(400, "Это не long-video пак.");
  if (account.status !== "connected" && !allowDisconnected)
    throw new LongVideoLibraryError(400, "Сначала подключите канал к YouTube — до подключения нельзя готовить видео в очередь.");
  if (!deckAllowed(deckId)) throw new LongVideoLibraryError(403, "Этот long-video пак вам недоступен.");
  if (!(account.longVideoDecks ?? []).includes(deckId))
    throw new LongVideoLibraryError(400, "Этот long-video пак не включён у канала — поставьте галочку и сохраните.");

  const contentLang = deckContentLang(deckId);
  if (account.channelLang && contentLang && contentLang !== account.channelLang) {
    throw new LongVideoLibraryError(
      400,
      `Язык long-video пака (${contentLang.toUpperCase()}) ≠ язык канала (${account.channelLang.toUpperCase()}) — выровняй их.`,
    );
  }

  const infinite = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
  const seen = new Set<string>(db.usedAnecdoteKeys(ownerId));
  const picked = infinite ? firstAnecdote(deckId) : randomAnecdote(deckId, seen);
  if (!picked) throw new LongVideoLibraryError(409, "В этом long-video паке не осталось новых видео для библиотеки.");
  const key = packItemKey(picked);
  if (!infinite && !db.claimAnecdote(ownerId, key))
    throw new LongVideoLibraryError(409, "Это длинное видео уже забрано другим запуском — обновите страницу.");
  try {
    return await buildFactLibraryVideo({ db, userId: ownerId, accountId: account.id, deckId, picked });
  } catch (e) {
    if (!infinite) db.releaseAnecdote(ownerId, key);
    throw e;
  }
}
