import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import cron from "node-cron";
import type { Db, Video } from "./db.ts";
import { DECKS, ytMeta } from "../src/anecdotes/decks.ts";
import { uploadShort, type ClientCreds } from "./youtube.ts";
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
  /** Resolve the OAuth client creds for a channel's OWNER (per-user keys). */
  credsForUser: (userId: number) => ClientCreds | null;
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

      try {
        opts.log(`[sched] account ${acc.id} (${acc.channelName}) firing at ${hhmm}`);

        // HARD language guard: a channel only ever posts videos in its OWN content language.
        const channelDeck = DECKS.find((d) => d.id === acc.lang);
        if (!channelDeck) {
          opts.log(`[sched] account ${acc.id}: язык «${acc.lang}» без пака — пропуск`);
          continue;
        }
        // Post-once queue: a pinned video (if present, unposted & same language), else the next
        // unposted video IN THE CHANNEL'S LANGUAGE. Each posts ONCE then is removed.
        const pinnedId = acc.slotVideos?.[hhmm];
        const pinned = pinnedId ? opts.db.getVideo(pinnedId) : null;
        const lib =
          (pinned && pinned.postCount === 0 && pinned.deck === channelDeck.id ? pinned : null) ??
          opts.db.nextUnpostedVideo(acc.id, channelDeck.id);
        if (!lib) {
          opts.log(`[sched] account ${acc.id}: нет роликов на языке «${channelDeck.id}» — нечего постить`);
          continue;
        }
        // Each channel posts with its OWNER's Google key (per-user isolation).
        const creds = acc.userId != null ? opts.credsForUser(acc.userId) : null;
        if (!creds) {
          opts.log(`[sched] account ${acc.id}: у владельца нет Google-ключа — пропуск`);
          continue;
        }
        const meta = ytMeta(channelDeck, lib.title, lib.text);
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
        });
        if (videoId) {
          metrics.notePost(); // last successful auto-post timestamp
          // posted once → remove from the library so it never reposts
          removeVideoFiles(opts.outputDir, lib);
          opts.db.deleteVideo(lib.id);
          opts.log(`[sched] account ${acc.id} uploaded ${videoId} — removed from library`);
        } else {
          opts.log(`[sched] account ${acc.id}: upload returned no id, keeping video`);
        }
      } catch (err) {
        opts.db.addHistory({ accountId: acc.id, title: "ошибка автозагрузки", status: "failed" });
        opts.log(`[sched] account ${acc.id} FAILED: ${String(err)}`);
      }
    }
  });

  opts.log("[sched] scheduler started — checking every minute");
  // Returned so graceful shutdown can stop firing new posts before draining.
  return { stop: () => task.stop() };
}
