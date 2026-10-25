import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { openDb } from "../../db.ts";
import { normalizeSocialCookies } from "./cookies.ts";
import { createSocialService } from "./store.ts";
import { registerSocialRoutes } from "../../routes/social.ts";
import type { SocialBrowser } from "./browser.ts";
const cookies = [
  { name: "sessionid", value: "synthetic-session", domain: ".instagram.com" },
  { name: "ds_user_id", value: "123", domain: ".instagram.com" },
  { name: "other", value: "discard", domain: ".evil.test" },
];
test("cookie formats filter unrelated domains and expired authentication", () => {
  const parsed = normalizeSocialCookies(
    JSON.stringify({ cookies }),
    "instagram",
  );
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].secure, true);
  assert.throws(() =>
    normalizeSocialCookies(
      [{ name: "sessionid", value: "old", domain: ".tiktok.com", expires: 1 }],
      "tiktok",
    ),
  );
  assert.throws(() =>
    normalizeSocialCookies(
      [{ name: "sessionid", value: "x", domain: ".tiktok.com.evil.test" }],
      "tiktok",
    ),
  );
  const txt =
    "# Netscape HTTP Cookie File\n#HttpOnly_.tiktok.com\tTRUE\t/\tTRUE\t0\tsessionid\tsynthetic";
  assert.equal(normalizeSocialCookies(txt, "tiktok")[0].httpOnly, true);
});
test("social queue isolates owners, hides cookies, snapshots media and never retries uncertain sends", async () => {
  const db = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "shorts-social-"));
  const app = Fastify();
  let sends = 0;
  const browser: SocialBrowser = {
    verify: async () => ({ handle: "test", userId: "123" }),
    publish: async (_p, _c, _profile, _file, _caption, onSubmit) => {
      sends++;
      onSubmit();
      throw new Error("synthetic timeout");
    },
  };
  const service = createSocialService(db, join(dir, "private"), dir, browser);
  try {
    const owner = db.createUser({ username: "owner", passHash: "x" });
    const stranger = db.createUser({ username: "stranger", passHash: "x" });
    const account = db.createAccount({
      userId: owner.id,
      channelName: "test",
      lang: "en",
    });
    writeFileSync(join(dir, "sample.mp4"), "test-media");
    const video = db.createVideo({
      accountId: account.id,
      title: "Test",
      text: "",
      bg: "",
      music: "",
      deck: "en",
      videoRel: "sample.mp4",
      imageRel: null,
    });
    app.addHook("onRequest", async (req) => {
      (req as { userId?: number }).userId = Number(
        req.headers["x-test-user"] || 0,
      );
    });
    registerSocialRoutes(app, service);
    const anon = await app.inject({ url: "/api/social" });
    assert.equal(anon.statusCode, 401);
    const foreign = await app.inject({
      method: "POST",
      url: "/api/social/instagram/cookies",
      headers: { "x-test-user": String(owner.id), origin: "https://evil.test" },
      payload: { cookies },
    });
    assert.equal(foreign.statusCode, 403);
    const imported = await app.inject({
      method: "POST",
      url: "/api/social/instagram/cookies",
      headers: { "x-test-user": String(owner.id) },
      payload: { cookies },
    });
    assert.equal(imported.statusCode, 200);
    assert.equal(imported.body.includes("synthetic-session"), false);
    assert.equal(imported.json().connections[0].status, "unchecked");
    assert.equal(
      statSync(join(dir, "private", "sessions", `${owner.id}-instagram.json`))
        .mode & 0o777,
      0o600,
    );
    await service.verify(owner.id, "instagram");
    assert.throws(() =>
      service.enqueue(
        stranger.id,
        "instagram",
        video.id,
        "x",
        new Date().toISOString(),
      ),
    );
    const jobs = service.enqueue(
      owner.id,
      "instagram",
      video.id,
      "caption",
      new Date().toISOString(),
    );
    assert.equal(
      existsSync(join(dir, "private", "media", `${jobs[0].id}.mp4`)),
      true,
    );
    rmSync(join(dir, "sample.mp4"));
    assert.throws(() =>
      service.enqueue(
        owner.id,
        "instagram",
        video.id,
        "caption",
        new Date().toISOString(),
      ),
    );
    await service.tick();
    assert.equal(sends, 1);
    assert.equal(service.jobs(owner.id)[0].state, "needs_review");
    await service.tick();
    assert.equal(sends, 1);
    assert.deepEqual(service.jobs(stranger.id), []);
    assert.throws(()=>service.confirmNotPublished(stranger.id,jobs[0].id));
    service.confirmNotPublished(owner.id,jobs[0].id);
    assert.equal(service.jobs(owner.id)[0].state,'failed');
    service.disconnect(owner.id, "instagram");
    assert.equal(
      existsSync(
        join(dir, "private", "sessions", `${owner.id}-instagram.json`),
      ),
      false,
    );
  } finally {
    await app.close();
    db.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("replacing cookies cancels pending sends and interrupted sends require review after restart", async () => {
  const db = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "shorts-social-"));
  const browser: SocialBrowser = {
    verify: async () => ({ handle: "test", userId: "123" }),
    publish: async () => {
      throw new Error("must not publish");
    },
  };
  const service = createSocialService(db, join(dir, "private"), dir, browser);
  try {
    const owner = db.createUser({ username: "owner", passHash: "x" });
    const a = db.createAccount({ userId: owner.id, lang: "en" });
    writeFileSync(join(dir, "v.mp4"), "test");
    const v = db.createVideo({
      accountId: a.id,
      title: "test",
      text: "",
      bg: "",
      music: "",
      deck: "en",
      videoRel: "v.mp4",
      imageRel: null,
    });
    service.importCookies(owner.id, "instagram", cookies);
    await service.verify(owner.id, "instagram");
    service.enqueue(
      owner.id,
      "instagram",
      v.id,
      "",
      new Date(Date.now() + 60_000).toISOString(),
    );
    service.importCookies(owner.id, "instagram", cookies);
    assert.equal(service.jobs(owner.id)[0].state, "cancelled");
    await service.verify(owner.id, "instagram");
    service.enqueue(owner.id, "instagram", v.id, "", new Date().toISOString());
    db.db
      .prepare("UPDATE social_jobs SET state='uploading' WHERE state='pending'")
      .run();
    const runner = service.start();
    runner.stop();
    await runner.drain();
    assert.equal(service.jobs(owner.id)[0].state, "needs_review");
  } finally {
    db.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
