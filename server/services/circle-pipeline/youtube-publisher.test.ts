import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../db.ts";
import type { CirclePipelineService } from "./service.ts";
import { CircleYouTubePublisher } from "./youtube-publisher.ts";

test("YouTube circle delivery keeps one durable receipt and does not retry an uncertain submission", async () => {
  const root = mkdtempSync(join(tmpdir(), "circle-youtube-")), db = openDb(":memory:");
  try {
    const owner = db.createUser({ username: "owner", passHash: "x", role: "admin" });
    const account = db.createAccount({ userId: owner.id, platform: "youtube" });
    const stranger = db.createUser({ username: "stranger", passHash: "x" });
    const source = join(root, "source"); mkdirSync(source); writeFileSync(join(source, "video.mp4"), "video");
    const job = { id: "approved", ownerId: owner.id, day: "2026-11-01", slot: 0, state: "ready", messageId: 42 };
    const pipeline = { status: async () => ({ enabled: true, jobs: [job] }), library: { directory: () => source } } as unknown as CirclePipelineService;
    let uploads = 0;
    const browser = { verify: async () => ({ channelId: `UC${"a".repeat(22)}` }),
      publish: async (_c: unknown, _id: string, _file: string, _title: string, _desc: string, submit: () => void) => {
        uploads++; submit(); throw new Error("unknown result");
      } };
    const privateDir = join(root, "private");
    const service = new CircleYouTubePublisher(db, pipeline, browser, privateDir, { now: () => Date.parse("2026-11-01T15:00:00Z") });
    const cookies = [{ name: "LOGIN_INFO", value: "synthetic", domain: ".youtube.com", secure: true }];
    assert.throws(() => service.importCookies(stranger.id, account.id, cookies));
    assert.equal(service.importCookies(owner.id, account.id, cookies).status, "unchecked");
    assert.equal(statSync(join(privateDir, `${owner.id}-account-${account.id}.json`)).mode & 0o777, 0o600);
    assert.equal((await service.verify(owner.id, account.id)).status, "connected");
    service.configure(owner.id, account.id);
    await service.tick(); await service.tick();
    assert.equal(uploads, 1);
    const row = db.db.prepare("SELECT state,submitted_at FROM circle_youtube_publications").get();
    assert.equal(row?.state, "needs_review"); assert.ok(row?.submitted_at);
    assert.equal(service.disconnect(owner.id, account.id).status, "disconnected");
    assert.equal(existsSync(join(privateDir, `${owner.id}-account-${account.id}.json`)), false);
    assert.equal(service.status(owner.id, account.id).enabled, false);
    await service.close();
  } finally { db.db.close(); rmSync(root, { recursive: true, force: true }); }
});
