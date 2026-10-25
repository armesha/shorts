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
import { makeRouteDeps } from "../../routes/deps.ts";
import { makeAuthSession } from "../../infra/auth-session.ts";

const cookies = (id = "123") => [
  { name: "sessionid", value: `synthetic-${id}`, domain: ".instagram.com" },
  { name: "ds_user_id", value: id, domain: ".instagram.com" },
  { name: "other", value: "discard", domain: ".evil.test" },
];
const profileBrowser: SocialBrowser = {
  verify: async (_platform, cookies) => {
    const id = cookies.find((c) => c.name === "ds_user_id")!.value;
    return { handle: `sample${id}`, userId: id };
  },
  publish: async (_p, _c, profile) =>
    `https://www.instagram.com/reel/${profile.userId}/`,
};
function fixture(browser: SocialBrowser = profileBrowser) {
  const db = openDb(":memory:");
  const dir = mkdtempSync(join(tmpdir(), "shorts-social-"));
  const service = createSocialService(db, join(dir, "private"), dir, browser);
  const owner = db.createUser({ username: "owner", passHash: "x" });
  const stranger = db.createUser({ username: "stranger", passHash: "x" });
  const one = db.createAccount({
    userId: owner.id,
    platform: "instagram",
    channelName: "first",
    lang: "en",
  });
  const two = db.createAccount({
    userId: owner.id,
    platform: "instagram",
    channelName: "second",
    lang: "en",
  });
  function video(accountId: number, name: string) {
    writeFileSync(join(dir, `${name}.mp4`), "synthetic-media");
    return db.createVideo({
      accountId,
      title: name,
      text: "",
      bg: "",
      music: "",
      deck: "en",
      videoRel: `${name}.mp4`,
      imageRel: null,
    });
  }
  return {
    db,
    dir,
    service,
    owner,
    stranger,
    one,
    two,
    video,
    close: () => {
      db.db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("cookie formats filter unrelated domains and expired authentication", () => {
  assert.equal(
    normalizeSocialCookies(JSON.stringify({ cookies: cookies() }), "instagram")
      .length,
    2,
  );
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
  assert.equal(
    normalizeSocialCookies("sessionid=synthetic; ds_user_id=123", "instagram")
      .length,
    2,
  );
});

test("channel cookie routes isolate two Instagram accounts and never expose sessions", async () => {
  const f = fixture();
  const app = Fastify();
  try {
    app.addHook("onRequest", async (req) => {
      (req as { userId?: number }).userId = Number(
        req.headers["x-test-user"] || 0,
      );
    });
    registerSocialRoutes(app, f.service);
    assert.equal(
      (await app.inject({ url: `/api/accounts/${f.one.id}/social` }))
        .statusCode,
      401,
    );
    const request = (
      id: number,
      body: unknown,
      who = f.owner.id,
      origin?: string,
    ) =>
      app.inject({
        method: "POST",
        url: `/api/accounts/${id}/social/cookies`,
        headers: { "x-test-user": String(who), ...(origin ? { origin } : {}) },
        payload: { cookies: body },
      });
    assert.equal(
      (await request(f.one.id, cookies(), f.owner.id, "https://evil.test"))
        .statusCode,
      403,
    );
    assert.equal(
      (await request(f.one.id, cookies(), f.stranger.id)).statusCode,
      404,
    );
    const imported = await request(f.one.id, cookies());
    assert.equal(imported.statusCode, 200);
    assert.equal(imported.body.includes("synthetic-123"), false);
    assert.equal(imported.json().connection.status, "unchecked");
    await request(f.two.id, JSON.stringify(cookies("456")));
    await f.service.verifyForAccount(f.owner.id, f.one.id);
    await f.service.verifyForAccount(f.owner.id, f.two.id);
    assert.equal(
      f.service.listForAccount(f.owner.id, f.one.id).handle,
      "sample123",
    );
    assert.equal(
      f.service.listForAccount(f.owner.id, f.two.id).handle,
      "sample456",
    );
    assert.equal(f.db.getAccount(f.two.id)?.status, "connected");
    assert.equal(f.db.getAccount(f.two.id)?.socialHandle, "sample456");
    assert.equal(
      statSync(
        join(
          f.dir,
          "private",
          "sessions",
          `${f.owner.id}-account-${f.one.id}.json`,
        ),
      ).mode & 0o777,
      0o600,
    );
    assert.throws(() => f.service.listForAccount(f.stranger.id, f.one.id));
    assert.throws(
      () => f.service.importCookies(f.owner.id, "instagram", cookies()),
      /общем списке/,
    );
  } finally {
    await app.close();
    f.close();
  }
});

test("jobs belong to channel libraries, reserve videos, and persist shared history", async () => {
  const sent: string[] = [];
  const f = fixture({
    ...profileBrowser,
    publish: async (_p, _c, profile) => {
      sent.push(profile.userId);
      return `https://www.instagram.com/reel/${profile.userId}/`;
    },
  });
  try {
    for (const [account, id] of [
      [f.one, "123"],
      [f.two, "456"],
    ] as const) {
      f.service.importForAccount(f.owner.id, account.id, cookies(id));
      await f.service.verifyForAccount(f.owner.id, account.id);
    }
    const first = f.video(f.one.id, "first"),
      second = f.video(f.two.id, "second");
    assert.throws(
      () =>
        f.service.enqueueForAccount(
          f.owner.id,
          f.one.id,
          second.id,
          "",
          new Date().toISOString(),
        ),
      /библиотеке/,
    );
    assert.throws(() =>
      f.service.enqueueForAccount(
        f.stranger.id,
        f.one.id,
        first.id,
        "",
        new Date().toISOString(),
      ),
    );
    const [job] = f.service.enqueueForAccount(
      f.owner.id,
      f.one.id,
      first.id,
      "caption",
      new Date().toISOString(),
    );
    f.service.enqueueForAccount(
      f.owner.id,
      f.two.id,
      second.id,
      "second",
      new Date().toISOString(),
    );
    assert.equal(f.db.getVideo(first.id)?.postCount, 1);
    assert.equal(f.service.jobsForAccount(f.owner.id, f.one.id).length, 1);
    assert.equal(f.service.jobsForAccount(f.owner.id, f.two.id).length, 1);
    assert.throws(() =>
      f.service.enqueueForAccount(
        f.owner.id,
        f.one.id,
        first.id,
        "",
        new Date().toISOString(),
      ),
    );
    rmSync(join(f.dir, "second.mp4"));
    f.service.disconnectForAccount(f.owner.id, f.one.id);
    assert.equal(f.db.getVideo(first.id)?.postCount, 0);
    assert.equal(f.db.getVideo(second.id)?.postCount, 1);
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.one.id)[0].state,
      "cancelled",
    );
    assert.equal(
      existsSync(join(f.dir, "private", "media", `${job.id}.mp4`)),
      false,
    );
    assert.equal(
      f.service.listForAccount(f.owner.id, f.two.id).status,
      "connected",
    );
    await f.service.tick();
    assert.deepEqual(sent, ["456"]);
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.two.id)[0].state,
      "published",
    );
    const history = f.db.listHistoryFiltered({ accountId: f.two.id });
    assert.equal(history.length, 1);
    assert.equal(history[0].platform, "instagram");
    assert.equal(history[0].platformUrl, "https://www.instagram.com/reel/456/");
    assert.equal(f.db.getVideo(second.id), null);
  } finally {
    f.close();
  }
});

test("uncertain submissions hold the video claim until explicit owner review", async () => {
  let sends = 0;
  const f = fixture({
    ...profileBrowser,
    publish: async (_p, _c, _profile, _file, _caption, submit) => {
      sends++;
      submit();
      throw new Error("synthetic timeout");
    },
  });
  try {
    f.service.importForAccount(f.owner.id, f.one.id, cookies());
    await f.service.verifyForAccount(f.owner.id, f.one.id);
    const video = f.video(f.one.id, "review");
    const [job] = f.service.enqueueForAccount(
      f.owner.id,
      f.one.id,
      video.id,
      "",
      new Date().toISOString(),
    );
    await f.service.tick();
    await f.service.tick();
    assert.equal(sends, 1);
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.one.id)[0].state,
      "needs_review",
    );
    assert.equal(f.db.getVideo(video.id)?.postCount, 1);
    assert.throws(() => f.service.confirmNotPublished(f.stranger.id, job.id));
    f.service.confirmNotPublished(f.owner.id, job.id);
    assert.equal(f.db.getVideo(video.id)?.postCount, 0);
    assert.equal(
      f.db.listHistoryFiltered({ accountId: f.one.id })[0].status,
      "needs_review",
    );
  } finally {
    f.close();
  }
});

test("replacing one account cookies cancels only that account and restart never resends", async () => {
  const f = fixture();
  try {
    for (const a of [f.one, f.two]) {
      f.service.importForAccount(f.owner.id, a.id, cookies());
      await f.service.verifyForAccount(f.owner.id, a.id);
    }
    const first = f.video(f.one.id, "first"),
      second = f.video(f.two.id, "second");
    f.service.enqueueForAccount(
      f.owner.id,
      f.one.id,
      first.id,
      "",
      new Date(Date.now() + 60000).toISOString(),
    );
    f.service.enqueueForAccount(
      f.owner.id,
      f.two.id,
      second.id,
      "",
      new Date(Date.now() + 60000).toISOString(),
    );
    f.service.importForAccount(f.owner.id, f.one.id, cookies("789"));
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.one.id)[0].state,
      "cancelled",
    );
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.two.id)[0].state,
      "pending",
    );
    f.db.db
      .prepare("UPDATE social_jobs SET state='uploading' WHERE account_id=?")
      .run(f.two.id);
    const runner = f.service.start();
    runner.stop();
    await runner.drain();
    assert.equal(
      f.service.jobsForAccount(f.owner.id, f.two.id)[0].state,
      "needs_review",
    );
    assert.equal(f.db.getVideo(second.id)?.postCount, 1);
  } finally {
    f.close();
  }
});

test("legacy sessions migrate idempotently without changing another channel video claim", async () => {
  const f = fixture();
  try {
    const youtube = f.db.createAccount({
      userId: f.owner.id,
      platform: "youtube",
      lang: "en",
    });
    const video = f.video(youtube.id, "legacy");
    f.db.claimVideoForPost(video.id);
    f.db.db
      .prepare(
        "INSERT INTO social_connections(user_id,platform,status,handle,profile_id) VALUES (?,'instagram','connected','legacy','123')",
      )
      .run(f.stranger.id);
    const legacyPath = join(
      f.dir,
      "private",
      "sessions",
      `${f.stranger.id}-instagram.json`,
    );
    writeFileSync(legacyPath, JSON.stringify(cookies()), { mode: 0o600 });
    const info = f.db.db
      .prepare(
        "INSERT INTO social_jobs(user_id,platform,video_id,title,caption,run_at,state) VALUES (?,'instagram',?,'old','','2099-01-01T12:00:00.000Z','pending')",
      )
      .run(f.stranger.id, video.id);
    writeFileSync(
      join(f.dir, "private", "media", `${info.lastInsertRowid}.mp4`),
      "legacy-snapshot",
    );
    f.service.migrateLegacyConnections();
    f.service.migrateLegacyConnections();
    const migrated = f.db.listAccountsByUser(f.stranger.id);
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].platform, "instagram");
    assert.equal(existsSync(legacyPath), false);
    assert.equal(
      existsSync(
        join(
          f.dir,
          "private",
          "sessions",
          `${f.stranger.id}-account-${migrated[0].id}.json`,
        ),
      ),
      true,
    );
    assert.equal(
      f.service.jobsForAccount(f.stranger.id, migrated[0].id).length,
      1,
    );
    f.service.disconnectForAccount(f.stranger.id, migrated[0].id);
    assert.equal(f.db.getVideo(video.id)?.postCount, 1);
  } finally {
    f.close();
  }
});

test("social channels apply their daily cap independently without a Google key", async () => {
  const f = fixture();
  try {
    for (const a of [f.one, f.two]) {
      f.service.importForAccount(f.owner.id, a.id, cookies());
      await f.service.verifyForAccount(f.owner.id, a.id);
    }
    const when = new Date(Date.now() + 86400000).toISOString();
    for (let i = 0; i < 5; i++) {
      const v = f.video(f.one.id, `daily-${i}`);
      f.service.enqueueForAccount(f.owner.id, f.one.id, v.id, "", when);
    }
    const extra = f.video(f.one.id, "extra");
    assert.throws(
      () =>
        f.service.enqueueForAccount(f.owner.id, f.one.id, extra.id, "", when),
      /публикаций/,
    );
    assert.equal(f.db.getVideo(extra.id)?.postCount, 0);
    const other = f.video(f.two.id, "other");
    assert.equal(
      f.service.enqueueForAccount(f.owner.id, f.two.id, other.id, "", when)
        .length,
      1,
    );
  } finally {
    f.close();
  }
});

test("infinite social libraries recycle only confirmed posts and allow the next turn", async () => {
  const f = fixture();
  try {
    f.db.setFeature(f.owner.id, "infinite-packs", true);
    f.service.importForAccount(f.owner.id, f.one.id, cookies());
    await f.service.verifyForAccount(f.owner.id, f.one.id);
    const video = f.video(f.one.id, "recycle");
    f.service.enqueueForAccount(
      f.owner.id,
      f.one.id,
      video.id,
      "",
      new Date().toISOString(),
    );
    await f.service.tick();
    assert.equal(f.db.getVideo(video.id)?.postCount, 0);
    assert.equal(existsSync(join(f.dir, "recycle.mp4")), true);
    assert.equal(f.service.hasPendingVideo(f.one.id, video.id), false);
    f.service.enqueueForAccount(
      f.owner.id,
      f.one.id,
      video.id,
      "",
      new Date().toISOString(),
    );
    await f.service.tick();
    assert.equal(
      f.service
        .jobsForAccount(f.owner.id, f.one.id)
        .filter((j) => j.state === "published").length,
      2,
    );
  } finally {
    f.close();
  }
});

test("channel routes reuse shared owner and main-superadmin authorization", async () => {
  const f = fixture(),
    app = Fastify();
  try {
    const superAdmin = f.db.createUser({
      username: "main-admin",
      passHash: "x",
      role: "admin",
      isSuperAdmin: true,
    });
    const ordinaryAdmin = f.db.createUser({
      username: "ordinary-admin",
      passHash: "x",
      role: "admin",
    });
    const deps = makeRouteDeps({
      db: f.db,
      auth: makeAuthSession(f.db),
      deckAccess: {} as never,
      notifier: {} as never,
      buildLibraryVideo: (() => null) as never,
      statsRefreshHooks: {} as never,
      outputDir: f.dir,
      redirectUri: "",
      webOrigin: "",
      accountCreds: () => null,
      listAvatarFiles: () => [],
    });
    app.addHook("onRequest", async (req) => {
      (req as { userId?: number }).userId = Number(
        req.headers["x-test-user"] || 0,
      );
    });
    registerSocialRoutes(app, f.service, deps);
    const request = (who: number) =>
      app.inject({
        method: "POST",
        url: `/api/accounts/${f.one.id}/social/cookies`,
        headers: { "x-test-user": String(who) },
        payload: { cookies: cookies() },
      });
    assert.equal((await request(ordinaryAdmin.id)).statusCode, 404);
    const imported = await request(superAdmin.id);
    assert.equal(imported.statusCode, 200);
    assert.equal(imported.json().connection.accountId, f.one.id);
    assert.equal(
      existsSync(
        join(
          f.dir,
          "private",
          "sessions",
          `${f.owner.id}-account-${f.one.id}.json`,
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        join(
          f.dir,
          "private",
          "sessions",
          `${superAdmin.id}-account-${f.one.id}.json`,
        ),
      ),
      false,
    );
    assert.equal(f.service.jobs(superAdmin.id).length, 0);
  } finally {
    await app.close();
    f.close();
  }
});
