import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import cron from "node-cron";
import type { Account, Db, Video } from "./db.ts";
import { DECKS, getDeck, ytMeta, isPackDeckId } from "../src/anecdotes/decks.ts";
import { uploadShort, ytErrorReason, isYtAuthError, type ClientCreds } from "./youtube.ts";
import { USER_DAILY_SCHEDULE_CAP } from "./account-limits.ts";
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

export interface SchedulerOpts {
  db: Db;
  outputDir: string;
  /** Resolve the OAuth client creds the channel is BOUND to (per-channel key it was connected with). */
  credsForAccount: (account: Account) => ClientCreds | null;
  redirectUri: string;
  log: (msg: string) => void;
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

      let claimedVideoId: number | null = null; // set once we atomically claim a video → release on error
      try {
        opts.log(`[sched] account ${acc.id} (${acc.channelName}) firing at ${hhmm}`);

        const sources = (acc.sourceDecks?.length ? acc.sourceDecks : [acc.lang]).filter(
          (d) => DECKS.some((deck) => deck.id === d) || isPackDeckId(d),
        );
        if (!sources.length) {
          opts.log(`[sched] account ${acc.id}: нет выбранных паков — пропуск`);
          continue;
        }
        const slotDeck = acc.slotDecks?.[hhmm];
        const allowedDecks = slotDeck && sources.includes(slotDeck) ? [slotDeck] : sources;
        // Post-once queue: a pinned video (legacy, if present and still valid), else the next
        // unposted video from the slot's selected pack or any selected channel pack.
        const pinnedId = acc.slotVideos?.[hhmm];
        const pinned = pinnedId ? opts.db.getVideo(pinnedId) : null;
        const lib =
          (pinned && pinned.postCount === 0 && allowedDecks.includes(pinned.deck) ? pinned : null) ??
          opts.db.nextUnpostedVideoForDecks(acc.id, allowedDecks);
        if (!lib) {
          opts.log(`[sched] account ${acc.id}: нет роликов в библиотеке для паков «${allowedDecks.join(", ")}» — нечего постить`);
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
        if (acc.oauthClientId != null && opts.db.uploadsTodayForKey(acc.oauthClientId) >= USER_DAILY_SCHEDULE_CAP) {
          opts.log(`[sched] account ${acc.id}: дневной лимит ${USER_DAILY_SCHEDULE_CAP} на Google-ключ достигнут — пропуск`);
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
          // posted once → remove from the library so it never reposts
          removeVideoFiles(opts.outputDir, lib);
          opts.db.deleteVideo(lib.id);
          opts.log(`[sched] account ${acc.id} uploaded ${videoId} — removed from library`);
        } else {
          opts.db.releaseVideoPost(lib.id); // no id → un-claim so it stays postable next time
          opts.log(`[sched] account ${acc.id}: upload returned no id, keeping video`);
        }
      } catch (err) {
        if (claimedVideoId != null) opts.db.releaseVideoPost(claimedVideoId); // un-claim on upload error
        const reason = ytErrorReason(err);
        // Dead/revoked token → flag the channel so /channels shows "needs reconnect" (not just a history line).
        if (isYtAuthError(err)) opts.db.markAuthError(acc.id, reason, new Date().toISOString());
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
