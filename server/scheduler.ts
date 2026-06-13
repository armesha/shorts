import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import cron from "node-cron";
import type { Db, Video } from "./db.ts";
import { getDeck, ytMeta } from "../src/anecdotes/decks.ts";
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

        // Post-once queue: a pinned video (if still present & unposted), else the next unposted
        // library video. Each posts ONCE then is removed — no rotation, no auto-generation.
        const pinnedId = acc.slotVideos?.[hhmm];
        const pinned = pinnedId ? opts.db.getVideo(pinnedId) : null;
        const lib =
          (pinned && pinned.postCount === 0 ? pinned : null) ?? opts.db.nextUnpostedVideo(acc.id);
        if (!lib) {
          opts.log(`[sched] account ${acc.id}: library empty — nothing to post`);
          continue;
        }
        const meta = ytMeta(getDeck(lib.deck), lib.title, lib.text);
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
