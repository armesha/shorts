import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../db.ts";
import { CircleSocialPublisher } from "./social-publisher.ts";
import type { CirclePipelineService } from "./service.ts";

test("queues the same approved circle once per platform and Moscow slot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "circle-social-"));
  const db = openDb(":memory:");
  try {
    const owner = db.createUser({ username: "owner", passHash: "x", role: "admin" });
    const instagram = db.createAccount({ userId: owner.id, platform: "instagram" });
    const tiktok = db.createAccount({ userId: owner.id, platform: "tiktok" });
    db.db.prepare("UPDATE accounts SET status='connected' WHERE id IN (?,?)").run(instagram.id, tiktok.id);
    const social = { enqueueForAccount: (ownerId: number, accountId: number, videoId: number, caption: string, runAt: string) => {
      const account = db.getAccount(accountId)!;
      db.db.prepare("INSERT INTO social_jobs(user_id,account_id,platform,video_id,title,caption,run_at,state) VALUES(?,?,?,?,?,?,?,'pending')")
        .run(ownerId, accountId, account.platform, videoId, "test", caption, runAt);
      return [];
    } };
    db.setSetting("circle.social-publishing.targets", JSON.stringify([
      { ownerId: owner.id, accountId: instagram.id, platform: "instagram", slot: 1 },
      { ownerId: owner.id, accountId: tiktok.id, platform: "tiktok", slot: 2 },
    ]));
    const jobs = [1, 2].map(slot => ({ id: `job-${slot}`, ownerId: owner.id, day: "2026-11-01", slot,
      state: "ready", messageId: slot, createdAt: "2026-11-01T12:00:00.000Z" }));
    for (const job of jobs) { mkdirSync(join(dir, job.id)); writeFileSync(join(dir, job.id, "video.mp4"), `video-${job.slot}`); }
    let enabled = false;
    const pipeline = { status: async () => ({ enabled, jobs }), library: { directory: (job: { id: string }) => join(dir, job.id) } } as unknown as CirclePipelineService;
    let now = Date.parse("2026-11-01T14:59:30Z");
    const publisher = new CircleSocialPublisher(db, pipeline, social, dir, { now: () => now });
    await publisher.tick();
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs").get()!.n, 0);
    now = Date.parse("2026-11-01T15:00:00Z");
    await publisher.tick();
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs").get()!.n, 0);
    enabled = true;
    await publisher.tick();
    await publisher.tick();
    const rows = db.db.prepare("SELECT account_id,video_id,run_at FROM social_jobs ORDER BY account_id").all() as {account_id: number; video_id: number; run_at: string}[];
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].video_id, rows[1].video_id);
    assert.equal(rows[0].run_at, "2026-11-01T15:00:00.000Z");
    assert.equal(readFileSync(join(dir, db.getVideo(rows[0].video_id)!.videoRel), "utf8"), "video-1");
    assert.equal(readFileSync(join(dir, db.getVideo(rows[1].video_id)!.videoRel), "utf8"), "video-1");
    await publisher.close();
    const restored = new CircleSocialPublisher(db, pipeline, social, dir, { now: () => now });
    await restored.tick();
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs").get()!.n, 2);
    now = Date.parse("2026-11-01T15:05:00Z");
    await restored.tick();
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM social_jobs").get()!.n, 2);
    await restored.close();
  } finally { db.db.close(); rmSync(dir, { recursive: true, force: true }); }
});
