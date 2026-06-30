import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import cron from "node-cron";
import type { Account, Db, Video } from "../db.ts";
import { DECKS, MANUAL_VIDEO_DECK, getDeck, isPackDeckId } from "../../src/anecdotes/decks.ts";
import { ytMeta } from "../../src/anecdotes/yt-meta.ts";
import { uploadShort, ytErrorReason, isYtAuthError, type ClientCreds } from "../services/youtube.ts";
import type { Notifier } from "../services/notify-stream.ts";
import { INFINITE_PACKS_FEATURE } from "../services/infinite-packs.ts";
import {
  RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS,
  isForbiddenSuperAdminSourceDeck,
} from "../services/super-admin-optical-decks.ts";
import { cleanupDrainedAutoExpireDecksForAccount } from "../services/auto-expire-packs.ts";
import { markPackLibraryVideoUsed } from "../services/pack-gen.ts";
import { googleKeyDailyScheduleCap } from "./account-limits.ts";
import { isSuperAdminUser } from "../auth.ts";
import * as metrics from "./metrics.ts";

/** Delete a posted video's rendered files (best-effort). */
function removeVideoFiles(outputDir: string, v: Video): void {
  for (const rel of [v.videoRel, v.imageRel]) {
    if (rel) {
      try {
        unlinkSync(resolve(outputDir, rel));
      } catch {
        /* already gone */
      }
    }
  }
}

function isLongVideoDeckId(deckId: string): boolean {
  return !!DECKS.find((deck) => deck.id === deckId)?.longVideo;
}

function isSchedulerSourceDeck(deckId: string): boolean {
  if (isLongVideoDeckId(deckId)) return false;
  return DECKS.some((deck) => deck.id === deckId) || isPackDeckId(deckId);
}

function uniqueDecks(deckIds: string[]): string[] {
  return [...new Set(deckIds.map((deckId) => String(deckId || "").trim()).filter(Boolean))];
}

function stableHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const RETIRED_LIBRARY_ROTATION_RATES = new Map(
  [...RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS].map((deckId) => [deckId, 0.1]),
);

function retiredLibraryDecksForSlot(acc: Account, hhmm: string, day: string, slotDeck: string | undefined): string[] {
  if (slotDeck === MANUAL_VIDEO_DECK) return [];
  return [...RETIRED_LIBRARY_ROTATION_RATES.entries()]
    .filter(([deckId, rate]) => {
      if (rate <= 0) return false;
      if (rate >= 1) return true;
      const bucket = stableHash(`${day}|${hhmm}|account:${acc.id}|retired-library:${deckId}`) % 1000;
      return bucket < Math.round(rate * 1000);
    })
    .map(([deckId]) => deckId);
}

type ScheduledVideoSelectionDb = Pick<Db, "getUserById" | "getVideo" | "nextUnpostedVideoForDecks">;

export type ScheduledVideoSelection = {
  video: Video | null;
  checkedDecks: string[];
  slotDeck: string | undefined;
  fallback: boolean;
};

export function selectScheduledVideoForSlot(
  db: ScheduledVideoSelectionDb,
  acc: Account,
  hhmm: string,
  day: string,
): ScheduledVideoSelection {
  const owner = acc.userId != null ? db.getUserById(acc.userId) : null;
  const ownerIsSuperAdmin = isSuperAdminUser(owner);
  const sources = uniqueDecks(
    (acc.sourceDecks?.length ? acc.sourceDecks : [acc.lang])
      .filter(isSchedulerSourceDeck)
      .filter((deckId) => !ownerIsSuperAdmin || !isForbiddenSuperAdminSourceDeck(deckId)),
  );
  const slotDeck = acc.slotDecks?.[hhmm];
  const allowedDecks =
    slotDeck === MANUAL_VIDEO_DECK
      ? [MANUAL_VIDEO_DECK]
      : slotDeck && sources.includes(slotDeck)
        ? [slotDeck]
        : [...sources, MANUAL_VIDEO_DECK];
  const fallbackDecks =
    slotDeck && slotDeck !== MANUAL_VIDEO_DECK && sources.includes(slotDeck)
      ? uniqueDecks([...sources.filter((deckId) => deckId !== slotDeck), MANUAL_VIDEO_DECK])
      : [];
  const slotSeed = `${day}|${hhmm}|account:${acc.id}|decks:${allowedDecks.join(",")}`;
  const pinnedId = acc.slotVideos?.[hhmm];
  const pinned = pinnedId ? db.getVideo(pinnedId) : null;
  const retiredDecks = ownerIsSuperAdmin ? retiredLibraryDecksForSlot(acc, hhmm, day, slotDeck) : [];
  let video = pinned && pinned.postCount === 0 && allowedDecks.includes(pinned.deck) ? pinned : null;
  if (!video && retiredDecks.length) {
    video = db.nextUnpostedVideoForDecks(acc.id, retiredDecks, `${slotSeed}|retired-library`);
  }
  video ??= db.nextUnpostedVideoForDecks(acc.id, allowedDecks, slotSeed);
  let fallback = false;
  if (!video && fallbackDecks.length) {
    video = db.nextUnpostedVideoForDecks(acc.id, fallbackDecks, `${slotSeed}|fallback`);
    fallback = !!video;
  }
  return { video, checkedDecks: uniqueDecks([...retiredDecks, ...allowedDecks, ...fallbackDecks]), slotDeck, fallback };
}

export interface SchedulerOpts {
  db: Db;
  outputDir: string;
  /** Resolve the OAuth client creds the channel is BOUND to (per-channel key it was connected with). */
  credsForAccount: (account: Account) => ClientCreds | null;
  redirectUri: string;
  log: (msg: string) => void;
  /** Shared SSE/Telegram notifier — used to alert the owner when a channel's token dies mid-schedule. */
  notifier: Notifier;
}

/**
 * Per-minute scheduler. For each ENABLED + CONNECTED account whose schedule contains the
 * current HH:MM, it posts the NEXT unposted library video ONCE with the OWNER's Google key,
 * then removes it (no rotation, no auto-generation). Empty library → nothing is posted.
 */
export function startScheduler(opts: SchedulerOpts) {
  const fired = new Set<string>(); // accountId|HH:MM|YYYY-MM-DD — prevents double-firing

  const task = cron.schedule("* * * * *", async () => {
    metrics.noteSchedulerTick(); // heartbeat: proves the per-minute cron is alive
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5);
    const day = now.toISOString().slice(0, 10);

    for (const acc of opts.db.listAccounts()) {
      if (!acc.enabled) continue;
      const token = opts.db.getRefreshToken(acc.id);
      if (!token) continue; // channel not connected
      if (!acc.schedule.includes(hhmm)) continue;

      const key = `${acc.id}|${hhmm}|${day}`;
      if (fired.has(key)) continue;
      fired.add(key);

      // Канал помечен «нужно переподключить» (мёртвый/отозванный токен) → не пытаемся выкладывать:
      // иначе каждый слот падал бы с auth-ошибкой и спамил историю «ошибка автозагрузки». Токен в БД
      // ещё есть (поэтому проверки `!token` мало), но он недействителен. Переподключение чистит
      // auth_error (setYouTube) → автопостинг сам возобновится.
      if (acc.authError) {
        opts.log(`[sched] account ${acc.id} (${acc.channelName}): помечен «нужно переподключить» — пропуск`);
        continue;
      }

      let claimedVideoId: number | null = null; // set once we atomically claim a video → release on error
      try {
        opts.log(`[sched] account ${acc.id} (${acc.channelName}) firing at ${hhmm}`);

        // Post-once queue: a pinned video (legacy, if present and still valid), else the next
        // unposted video from the slot's selected pack. If that selected pack is empty, fall back to
        // the channel's other selected packs so one dry source does not block the whole schedule.
        const selection = selectScheduledVideoForSlot(opts.db, acc, hhmm, day);
        const lib = selection.video;
        if (selection.fallback && lib)
          opts.log(
            `[sched] account ${acc.id}: пак слота «${selection.slotDeck}» пуст — взял ролик из «${lib.deck}»`,
          );
        if (!lib) {
          opts.log(`[sched] account ${acc.id}: нет роликов в библиотеке для паков «${selection.checkedDecks.join(", ")}» — нечего постить`);
          continue;
        }
        // Each channel posts with the SPECIFIC Google key it was connected with (per-channel binding).
        const creds = opts.credsForAccount(acc);
        if (!creds) {
          opts.log(`[sched] account ${acc.id}: нет Google-ключа у канала — пропуск`);
          continue;
        }
        // Daily per-Google-key upload cap (REAL uploads) — shared with manual post-now so the two
        // together can't blow the Cloud project's YouTube quota for channels on the same key.
        const keyCap = googleKeyDailyScheduleCap(isSuperAdminUser(acc.userId != null ? opts.db.getUserById(acc.userId) : null));
        if (acc.oauthClientId != null && opts.db.uploadsTodayForKey(acc.oauthClientId) >= keyCap) {
          opts.log(`[sched] account ${acc.id}: дневной лимит ${keyCap} на Google-ключ достигнут — пропуск`);
          continue;
        }
        // Atomic claim: flip this unposted video to in-flight so post-now or another tick can't double-post it.
        if (!opts.db.claimVideoForPost(lib.id)) {
          opts.log(`[sched] account ${acc.id}: видео ${lib.id} уже публикуется/опубликовано — пропуск`);
          continue;
        }
        claimedVideoId = lib.id;
        const meta = ytMeta(getDeck(lib.deck), lib.title, lib.text);
        const videoId = await metrics.track("upload", () =>
          uploadShort(creds, opts.redirectUri, token, {
            videoPath: resolve(opts.outputDir, lib.videoRel),
            title: meta.title,
            description: meta.description,
            tags: meta.tags,
          }),
        );
        opts.db.addHistory({
          accountId: acc.id,
          title: meta.title,
          status: videoId ? "published" : "failed",
          youtubeId: videoId,
          videoPath: lib.videoRel,
          publishedAt: new Date().toISOString(),
          error: videoId ? null : "YouTube не вернул id ролика — загрузка не удалась.",
          deck: lib.deck,
        });
        if (videoId) {
          metrics.notePost(); // last successful auto-post timestamp
          opts.db.clearAuthError(acc.id); // token works → drop any stale "needs reconnect" flag
          // «Бесконечный пак» (infinite-packs у владельца канала): НЕ удаляем ролик, а возвращаем его в
          // очередь (рецикл по кругу) — реальные ~50 роликов канала крутятся бесконечно. Иначе обычное
          // поведение: выложили один раз → удалили из библиотеки, чтобы не повторять.
          const recycle = acc.userId != null && opts.db.hasFeature(acc.userId, INFINITE_PACKS_FEATURE);
          if (recycle) {
            opts.db.recycleVideoForRepost(lib.id);
            opts.log(`[sched] account ${acc.id} uploaded ${videoId} — recycled (бесконечный пак)`);
          } else {
            // posted once → remove from the library so it never reposts
            if (acc.userId != null && isPackDeckId(lib.deck))
              markPackLibraryVideoUsed(opts.db, acc.userId, acc.id, lib.deck, lib, isSuperAdminUser(opts.db.getUserById(acc.userId)));
            removeVideoFiles(opts.outputDir, lib);
            opts.db.deleteVideo(lib.id);
            const expired = cleanupDrainedAutoExpireDecksForAccount(opts.db, acc);
            if (expired.removedDecks.length)
              opts.log(`[sched] account ${acc.id}: removed drained auto-expire sources ${expired.removedDecks.join(", ")}`);
            opts.log(`[sched] account ${acc.id} uploaded ${videoId} — removed from library`);
          }
        } else {
          opts.db.releaseVideoPost(lib.id); // no id → un-claim so it stays postable next time
          opts.log(`[sched] account ${acc.id}: upload returned no id, keeping video`);
        }
      } catch (err) {
        if (claimedVideoId != null) opts.db.releaseVideoPost(claimedVideoId); // un-claim on upload error
        const reason = ytErrorReason(err);
        // Dead/revoked token → flag the channel so /channels shows "needs reconnect" (not just a history line).
        // On the first failure (healthy→broken edge) alert the owner once: inbox + Telegram DM if linked.
        if (isYtAuthError(err) && opts.db.markAuthError(acc.id, reason, new Date().toISOString()))
          void opts.notifier.notifyChannelDisconnected(acc, reason);
        opts.db.addHistory({
          accountId: acc.id,
          title: "ошибка автозагрузки",
          status: "failed",
          error: reason,
        });
        opts.log(`[sched] account ${acc.id} FAILED: ${String(err)}`);
      }
    }
  });

  opts.log("[sched] scheduler started — checking every minute");
  // Returned so graceful shutdown can stop firing new posts before draining.
  return { stop: () => task.stop() };
}
