import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import cron from "node-cron";
import type { Db, Video } from "./db.ts";
import { DECKS, ytMeta } from "../src/anecdotes/decks.ts";
import { uploadShort } from "./youtube.ts";

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
  credsPath: () => string;
  redirectUri: string;
  log: (msg: string) => void;
}

/**
 * Per-minute scheduler. For each ENABLED + CONNECTED account whose schedule contains the
 * current HH:MM, it posts the NEXT unposted library video ONCE, then removes it (no rotation,
 * no auto-generation). Empty library → nothing is posted. Safe by default.
 */
export function startScheduler(opts: SchedulerOpts) {
  const fired = new Set<string>(); // accountId|HH:MM|YYYY-MM-DD — prevents double-firing

  cron.schedule("* * * * *", async () => {
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

        // HARD language guard: a channel only ever posts videos in its OWN content language
        // (acc.lang) — a Russian video can never go to an Italian/German channel, etc.
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
        const meta = ytMeta(channelDeck, lib.title, lib.text);
        const videoId = await uploadShort(opts.credsPath(), opts.redirectUri, token, {
          videoPath: resolve(opts.outputDir, lib.videoRel),
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
        });
        opts.db.addHistory({
          accountId: acc.id,
          title: meta.title,
          status: videoId ? "published" : "failed",
          youtubeId: videoId,
          videoPath: lib.videoRel,
          publishedAt: new Date().toISOString(),
        });
        if (videoId) {
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
}
