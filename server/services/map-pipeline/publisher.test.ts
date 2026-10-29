import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../db.ts";
import { MapPipelineService } from "./service.ts";
import { MapPublisher, mapLibraryOwners } from "./publisher.ts";

async function fixture(confirmed = true, throwAfterSubmit = false) {
  const root = await mkdtemp(join(tmpdir(), "map-publish-"));
  const db = openDb(":memory:");
  const owner = db.createUser({ username: "owner", passHash: "test" });
  const viewer = db.createUser({ username: "viewer", passHash: "test" });
  const outsider = db.createUser({ username: "outsider", passHash: "test" });
  const account = db.createAccount({ userId: owner.id, platform: "tiktok", schedule: [], sourceDecks: [] });
  db.db.prepare("INSERT INTO social_channel_connections(account_id,user_id,platform,status) VALUES(?,?,'tiktok','connected')").run(account.id, owner.id);
  db.shareAccountReadOnly(owner.id, account.id, viewer.id);
  let now = Date.UTC(2026, 9, 29, 12); let uploads = 0;
  let confirmation = confirmed;
  const pipeline = new MapPipelineService({ root: join(root, "state"), source: root, now: () => now,
    readOwners: id => mapLibraryOwners(db, id), generate: async (job, directory) => {
      await writeFile(join(directory, "video.mp4"), "synthetic-video");
      await writeFile(join(directory, "voice.wav"), "synthetic-voice");
      await writeFile(join(directory, "metadata.json"), JSON.stringify({ source: "https://api.worldbank.org/v2/", metric: { year: 2023 } }));
      return { seconds: 90, idea: { themeId: job.id, title: "Тест", hook: "Тест", reason: "Тест" } };
    } });
  const delivery = { publishMapFile: async (_uid: number, _account: number, _file: string, caption: string, submit: () => void) => {
    uploads++; assert.ok(caption.includes("Kevin MacLeod")); submit(); if (throwAfterSubmit) throw Error("Uncertain result"); return `https://www.tiktok.com/@test/video/${uploads}`;
  }, confirmMapPublication: async () => confirmation };
  const publisher = new MapPublisher(db, pipeline, delivery, { now: () => now });
  publisher.configure(owner.id, account.id, true);
  await pipeline.samples(owner.id);
  for (let i = 0; i < 2; i++) { await pipeline.tick(); await pipeline.idle(); }
  await pipeline.begin(owner.id);
  return { root, db, owner, viewer, outsider, account, pipeline, publisher, delivery,
    uploads: () => uploads, confirm: () => { confirmation = true; }, advance: (days = 1) => { now += days * 86400000; },
    close: async () => { await publisher.close(); await pipeline.close(); db.db.close(); await rm(root, { recursive: true, force: true }); } };
}

test("one confirmed publication per day is shared and removes only its own local files", async () => {
  const f = await fixture();
  try {
    const before = await f.pipeline.list(f.owner.id);
    await f.publisher.tick(); await f.publisher.tick();
    assert.equal(f.uploads(), 1);
    const shared = await f.pipeline.list(f.viewer.id);
    const post = shared.jobs.find(j => j.status === "published")!;
    assert.ok(post.publication?.cleanedAt); assert.ok(post.publication?.url);
    await assert.rejects(stat(f.pipeline.directory(post)), { code: "ENOENT" });
    const unposted = before.jobs.find(j => j.id !== post.id)!;
    assert.ok(await stat(join(f.pipeline.directory(unposted), "video.mp4")));
    assert.equal((await f.pipeline.list(f.outsider.id)).jobs.length, 0);
    assert.ok(f.db.listVisibleAccountsByUser(f.viewer.id).some(a => a.id === f.account.id));
    assert.equal(f.db.listAccountsByUser(f.viewer.id).length, 0);
    assert.equal(f.db.listHistoryByUser(f.viewer.id)[0].platformUrl, post.publication!.url);
    assert.equal(f.db.listAccountsByUser(f.outsider.id).length, 0);
    f.advance(); await f.publisher.tick();
    assert.equal(f.uploads(), 2);
  } finally { await f.close(); }
});

test("an accepted upload without visible publication retains media and is never resent", async () => {
  const f = await fixture(false);
  try {
    await f.publisher.tick(); await f.publisher.tick();
    assert.equal(f.uploads(), 1);
    const pending = (await f.pipeline.list(f.owner.id)).jobs.find(j => j.publication)!;
    assert.equal(pending.status, "ready"); assert.ok(await stat(join(f.pipeline.directory(pending), "video.mp4")));
    f.confirm(); await f.publisher.tick();
    assert.equal(f.uploads(), 1);
    assert.equal((await f.pipeline.list(f.owner.id)).jobs.find(j => j.id === pending.id)!.status, "published");
    await assert.rejects(stat(f.pipeline.directory(pending)), { code: "ENOENT" });
  } finally { await f.close(); }
});

test("the next daily post waits twenty-four hours after confirmation, not upload start", async () => {
  const f = await fixture();
  try {
    await f.publisher.tick();
    f.db.db.prepare("UPDATE map_publications SET created_at='2026-10-29T11:00:00.000Z' WHERE account_id=?").run(f.account.id);
    f.advance(23.5 / 24); await f.publisher.tick(); assert.equal(f.uploads(), 1);
    f.advance(0.5 / 24); await f.publisher.tick(); assert.equal(f.uploads(), 2);
  } finally { await f.close(); }
});

test("uncertain clicks keep all local files and prevent automatic repeat after restart", async () => {
  const f = await fixture(true, true);
  try {
    await f.publisher.tick();
    f.advance(); await f.publisher.tick();
    assert.equal(f.uploads(), 1);
    const job = (await f.pipeline.list(f.owner.id)).jobs.find(j => j.publication)!;
    assert.equal(job.publication!.state, "needs_review");
    assert.ok(await stat(join(f.pipeline.directory(job), "video.mp4")));
    const restarted = new MapPublisher(f.db, f.pipeline, f.delivery);
    await restarted.start(); await restarted.close();
    assert.equal(f.uploads(), 1);
    await assert.rejects(f.pipeline.removePublishedMedia(f.owner.id, job.id));
  } finally { await f.close(); }
});
