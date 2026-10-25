import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { makeAuthSession } from "../infra/auth-session.ts";
import { startScheduler } from "../infra/scheduler.ts";
import { makeDeckAccess } from "../services/deck-access.ts";
import { makeRouteDeps } from "./deps.ts";
import { registerAccountsRoutes } from "./accounts.ts";
import { registerVideosRoutes } from "./videos.ts";
import type { SocialService } from "../services/social/store.ts";

function setup() {
  const db = openDb(":memory:");
  const user = db.createUser({
    username: "channel-owner",
    passHash: "test",
    timezone: "UTC",
  });
  const auth = makeAuthSession(db);
  const deckAccess = makeDeckAccess(db, auth);
  const deps = makeRouteDeps({
    db,
    auth,
    deckAccess,
    notifier: {} as never,
    buildLibraryVideo: (() => null) as never,
    statsRefreshHooks: {} as never,
    outputDir: "",
    redirectUri: "",
    webOrigin: "",
    accountCreds: () => {
      throw new Error("Google credentials must not be read");
    },
    listAvatarFiles: () => [],
  });
  return { db, user, deps };
}
test("unified channel creation selects immutable platform and preserves YouTube defaults", async () => {
  const { db, user, deps } = setup();
  const app = Fastify();
  const imported = db.createAccount({ userId:user.id,platform:"instagram",socialHandle:"existing-profile",channelName:"Existing profile",schedule:[] });
  assert.equal(imported.socialHandle,"existing-profile");
  try {
    app.addHook("onRequest", async (req) => {
      (req as { userId?: number }).userId = user.id;
    });
    registerAccountsRoutes(app, db, deps);
    const youtube = await app.inject({
      method: "POST",
      url: "/api/accounts",
      payload: { channelName: "YouTube draft" },
    });
    assert.equal(youtube.statusCode, 200);
    assert.equal(youtube.json().platform, "youtube");
    assert.deepEqual(youtube.json().schedule, ["12:00"]);
    for (const platform of ["instagram", "tiktok"]) {
      const created = await app.inject({
        method: "POST",
        url: "/api/accounts",
        payload: { platform, channelName: `${platform} draft` },
      });
      assert.equal(created.statusCode, 200, created.body);
      const account = created.json();
      assert.equal(account.platform, platform);
      assert.equal(account.status, "needs_auth");
      assert.deepEqual(account.schedule, []);
      const changed = await app.inject({
        method: "PUT",
        url: `/api/accounts/${account.id}`,
        payload: { platform: "youtube" },
      });
      assert.equal(changed.statusCode, 400);
    }
    const bad = await app.inject({
      method: "POST",
      url: "/api/accounts",
      payload: { platform: "unknown" },
    });
    assert.equal(bad.statusCode, 400);
  } finally {
    await app.close();
    db.db.close();
  }
});
test("social manual post uses its own queue and records real platform links in shared history", async () => {
  const { db, user, deps } = setup();
  const app = Fastify();
  let queued = 0;
  try {
    const channel = db.createAccount({
      userId: user.id,
      platform: "instagram",
      channelName: "Instagram",
      status: "connected",
      lang: "en",
    });
    const v = db.createVideo({
      accountId: channel.id,
      title: "Manual",
      text: "",
      bg: "",
      music: "",
      deck: "manual",
      videoRel: "v.mp4",
      imageRel: null,
    });
    app.addHook("onRequest", async (req) => {
      (req as { userId?: number }).userId = user.id;
    });
    registerVideosRoutes(app, db, deps, {
      enqueueForAccount: (uid: number, accountId: number, videoId: number) => {
        assert.equal(uid, user.id);
        assert.equal(accountId, channel.id);
        assert.equal(videoId, v.id);
        queued++;
        return [];
      },
    } as unknown as SocialService);
    const sent = await app.inject({
      method: "POST",
      url: `/api/videos/${v.id}/post-now`,
      payload: {},
    });
    assert.equal(sent.statusCode, 200, sent.body);
    assert.equal(sent.json().queued, true);
    assert.equal(sent.json().removed, false);
    assert.equal(sent.json().url, null);
    assert.equal(queued, 1);
    db.addHistory({
      accountId: channel.id,
      title: "Manual",
      status: "published",
      platform: "instagram",
      platformUrl: "https://www.instagram.com/reel/test/",
      publishedAt: new Date().toISOString(),
    });
    const history = db.listHistoryFiltered({ ownerId: user.id });
    assert.equal(history[0].platform, "instagram");
    assert.equal(
      history[0].platformUrl,
      "https://www.instagram.com/reel/test/",
    );
  } finally {
    await app.close();
    db.db.close();
  }
});
test("shared scheduler queues social channels without Google token or credentials and fires once", async () => {
  const { db, user } = setup();
  const channel = db.createAccount({
    userId: user.id,
    platform: "tiktok",
    channelName: "TikTok",
    status: "connected",
    lang: "en",
    timezone: "UTC",
    schedule: ["13:00"],
  });
  const v = db.createVideo({
    accountId: channel.id,
    title: "Scheduled",
    text: "",
    bg: "",
    music: "",
    deck: "manual",
    videoRel: "v.mp4",
    imageRel: null,
  });
  let queued = 0;
  const getToken = db.getRefreshToken;
  db.getRefreshToken = () => {
    throw new Error("Google token must not be read");
  };
  const runner = startScheduler({
    db,
    outputDir: "",
    credsForAccount: () => {
      throw new Error("Google credentials must not be read");
    },
    redirectUri: "",
    log: () => {},
    notifier: {} as never,
    enqueueSocial: (account, video) => {
      assert.equal(account.id, channel.id);
      assert.equal(video.id, v.id);
      assert.ok(db.claimVideoForPost(video.id));
      queued++;
    },
  });
  try {
    await runner.tick(new Date("2026-10-25T13:00:00Z"));
    await runner.tick(new Date("2026-10-25T13:00:00Z"));
    assert.equal(queued, 1);
  } finally {
    runner.stop();
    db.getRefreshToken = getToken;
    db.db.close();
  }
});
