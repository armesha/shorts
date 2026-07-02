import type { Db } from "../db.ts";
import { isSuperAdminUser } from "../auth.ts";
import { DECKS, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { firstAnecdote, packItemKey, randomAnecdote } from "../../src/anecdotes/library.ts";
import { getPack } from "../../src/packs/store.ts";
import {
  buildPackLibraryVideo,
  isLeastPostedRepeatPack,
  isPerAccountAutoExpirePack,
  packCardClaimKey,
  pickFixedPackCard,
  pickLeastPostedPackCard,
  pickUnusedPackCard,
  usedPackCardKeysForAccountIncludingLibrary,
} from "./pack-gen.ts";
import { removeAutoExpiredDeckFromAccount } from "./auto-expire-packs.ts";
import { buildFactLibraryVideo } from "./fact-gen.ts";
import { INFINITE_PACKS_FEATURE } from "./infinite-packs.ts";
import { channelLibraryVideoCap, isMgsUser } from "../infra/account-limits.ts";
import type { GenWorker, Job } from "./gen-queue.ts";
import type { DeckAccess } from "./deck-access.ts";
import type { BuildLibraryVideo } from "./library-build.ts";

export function makeGenQueueWorker(
  db: Db,
  deps: {
    deckAccess: Pick<DeckAccess, "accountSourceDecks" | "builtinDeckVisibleForUser">;
    buildLibraryVideo: BuildLibraryVideo;
  },
): GenWorker {
  const { accountSourceDecks, builtinDeckVisibleForUser } = deps.deckAccess;
  const { buildLibraryVideo } = deps;

  return async (job: Job) => {
    const acc = db.getAccount(job.accountId);
    if (!acc) throw new Error("Канал не найден");
    const ownerId = job.ownerUserId ?? job.userId;
    const owner = db.getUserById(ownerId);
    const libraryCap = channelLibraryVideoCap(owner?.role === "admin", isMgsUser(owner));
    const seen = new Set<string>(db.usedAnecdoteKeys(ownerId));
    const infinite = db.hasFeature(ownerId, INFINITE_PACKS_FEATURE);
    const sources = job.deckIds?.length ? job.deckIds : accountSourceDecks(acc);
    const pickSeed = (sourceDeck: string, offset = 0) => `${job.accountId}|${sourceDeck}|${job.id}|${job.done}|${offset}`;

    const generateFromSource = async (sourceDeck: string): Promise<"made" | "exhausted"> => {
      if (isPackDeckId(sourceDeck)) {
        const pack = getPack(sourceDeck.slice(5), ownerId, isSuperAdminUser(db.getUserById(ownerId)));
        if (!pack || !pack.templates.length) throw new Error(`Пак «${sourceDeck}» не найден или без шаблона`);
        let attempts = 0;
        for (;;) {
          const perAccountAutoExpire = isPerAccountAutoExpirePack(pack);
          const packSeen = perAccountAutoExpire
            ? usedPackCardKeysForAccountIncludingLibrary(
                pack,
                job.accountId,
                seen,
                db.listVideos(job.accountId).filter((video) => video.deck === sourceDeck),
              )
            : seen;
          const canUseInfinite = infinite && !perAccountAutoExpire;
          const picked = isLeastPostedRepeatPack(pack)
            ? pickLeastPostedPackCard(db, job.accountId, pack, pickSeed(sourceDeck, attempts++))
            : canUseInfinite
              ? pickFixedPackCard(pack)
              : pickUnusedPackCard(pack, packSeen, pickSeed(sourceDeck, attempts++));
          if (!picked) {
            if (perAccountAutoExpire) removeAutoExpiredDeckFromAccount(db, acc, sourceDeck);
            return "exhausted";
          }
          const claimKey = packCardClaimKey(pack, job.accountId, picked.key);
          if (!canUseInfinite && !isLeastPostedRepeatPack(pack)) {
            seen.add(claimKey);
            packSeen.add(picked.key);
            if (!db.claimAnecdote(ownerId, claimKey)) continue;
          }
          try {
            await buildPackLibraryVideo({ db, userId: ownerId, accountId: job.accountId, pack, picked });
            return "made";
          } catch (e) {
            if (!canUseInfinite && !isLeastPostedRepeatPack(pack)) db.releaseAnecdote(ownerId, claimKey);
            throw e;
          }
        }
      }

      const channelDeck = DECKS.find((d) => d.id === sourceDeck);
      if (!channelDeck) throw new Error(`У канала язык «${sourceDeck}» без пака`);
      if (db.getUserById(ownerId)?.role !== "admin" && !builtinDeckVisibleForUser(ownerId, channelDeck))
        throw new Error("Этот пак вам недоступен");
      let attempts = 0;
      for (;;) {
        const picked = infinite
          ? firstAnecdote(channelDeck.id)
          : randomAnecdote(channelDeck.id, seen, pickSeed(channelDeck.id, attempts++));
        if (!picked) return "exhausted";
        const key = packItemKey(picked);
        if (!infinite) {
          seen.add(key);
          if (!db.claimAnecdote(ownerId, key)) continue;
        }
        try {
          if (channelDeck.preFact) {
            await buildFactLibraryVideo({ db, userId: ownerId, accountId: job.accountId, deckId: channelDeck.id, picked });
          } else {
            await buildLibraryVideo({
              userId: ownerId,
              accountId: job.accountId,
              text: picked.text,
              title: picked.title,
              deck: channelDeck.id,
              profession: picked.profession,
              item: picked,
            });
          }
          return "made";
        } catch (e) {
          if (!infinite) db.releaseAnecdote(ownerId, key);
          throw e;
        }
      }
    };

    const libraryReservation =
      libraryCap == null
        ? null
        : db.reserveLibrarySlots(job.accountId, libraryCap, 1, { excludeGenerationJobId: job.id });
    if (libraryReservation && !libraryReservation.ok) return "exhausted";
    try {
      for (let offset = 0; offset < Math.max(1, sources.length); offset++) {
        const sourceDeck = sources[(job.done + offset) % Math.max(1, sources.length)] || acc.lang;
        const result = await generateFromSource(sourceDeck);
        if (result === "made") return "made";
      }
      return "exhausted";
    } finally {
      if (libraryReservation?.ok) db.releaseLibraryReservation(libraryReservation.token);
    }
  };
}
