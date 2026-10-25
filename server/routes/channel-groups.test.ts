import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { registerChannelGroupRoutes } from "./channel-groups.ts";
import { registerAccountsRoutes } from "./accounts.ts";
import { makeAuthSession } from "../infra/auth-session.ts";
import { makeDeckAccess } from "../services/deck-access.ts";
import { makeRouteDeps } from "./deps.ts";

test("channel groups contain several platforms and preserve channels when removed", async () => {
  const db = openDb(":memory:"),
    app = Fastify();
  const owner = db.createUser({ username: "owner", passHash: "test" }),
    other = db.createUser({ username: "other", passHash: "test" });
  const auth = makeAuthSession(db),
    deps = makeRouteDeps({
      db,
      auth,
      deckAccess: makeDeckAccess(db, auth),
      notifier: {} as never,
      buildLibraryVideo: (() => null) as never,
      statsRefreshHooks: {} as never,
      outputDir: "",
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
  registerChannelGroupRoutes(app, db, deps);
  registerAccountsRoutes(app, db, deps);
  const request = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    payload?: unknown,
    uid = owner.id,
  ) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { "x-test-user": String(uid) },
    });
  try {
    const channels = (["youtube", "instagram", "tiktok"] as const).map(
      (platform) =>
        db.createAccount({
          userId: owner.id,
          platform,
          channelName: platform,
          lang: "",
          sourceDecks: [],
          schedule: [],
        }),
    );
    const foreign = db.createAccount({
      userId: other.id,
      lang: "",
      schedule: [],
    });
    const created = await request("POST", "/api/channel-groups", {
      name: "Main",
      accountIds: channels.map((a) => a.id),
    });
    assert.equal(created.statusCode, 200, created.body);
    const group = created.json();
    assert.equal(group.channelCount, 3);
    assert.ok(channels.every((a) => db.getAccount(a.id)?.groupId === group.id));
    const visible = await request("GET", "/api/channel-groups");
    assert.equal(visible.json().length, 1);
    assert.deepEqual(
      (await request("GET", "/api/channel-groups", undefined, other.id)).json(),
      [],
    );
    assert.equal(
      (
        await request(
          "PUT",
          `/api/channel-groups/${group.id}`,
          { name: "Hijacked" },
          other.id,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "DELETE",
          `/api/channel-groups/${group.id}`,
          undefined,
          other.id,
        )
      ).statusCode,
      404,
    );
    const invalid = await request("PUT", `/api/channel-groups/${group.id}`, {
      name: "Invalid",
      accountIds: [channels[0].id, foreign.id],
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(db.getChannelGroup(group.id)?.name, "Main");
    assert.equal(db.getChannelGroup(group.id)?.channelCount, 3);
    assert.equal(
      (await request("POST", "/api/channel-groups", { name: "main" }))
        .statusCode,
      409,
    );
    assert.equal(
      (await request("POST", "/api/channel-groups", { name: "   " }))
        .statusCode,
      400,
    );
    const second = (
      await request("POST", "/api/channel-groups", { name: "Second" })
    ).json();
    const move = await request("PUT", `/api/accounts/${channels[0].id}`, {
      groupId: second.id,
    });
    assert.equal(move.statusCode, 200, move.body);
    assert.equal(move.json().groupId, second.id);
    const foreignGroup = db.createChannelGroup(other.id, "Private");
    assert.equal(
      (
        await request("PUT", `/api/accounts/${channels[0].id}`, {
          groupId: foreignGroup.id,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await request("POST", "/api/accounts", {
          platform: "youtube",
          groupId: foreignGroup.id,
        })
      ).statusCode,
      400,
    );
    const fresh = await request("POST", "/api/accounts", {
      platform: "instagram",
      channelName: "Fourth",
      groupId: second.id,
    });
    assert.equal(fresh.statusCode, 200);
    assert.equal(fresh.json().groupId, second.id);
    const renamed = await request("PUT", `/api/channel-groups/${second.id}`, {
      name: "Renamed",
      accountIds: channels.map((a) => a.id),
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(renamed.json().channelCount, 3);
    assert.equal(db.getAccount(fresh.json().id)?.groupId, null);
    assert.equal(
      (await request("DELETE", `/api/channel-groups/${second.id}`)).statusCode,
      200,
    );
    assert.ok(
      channels.every(
        (a) => db.getAccount(a.id) && db.getAccount(a.id)?.groupId === null,
      ),
    );
    assert.equal(db.listAccountsByUser(owner.id).length, 4);
  } finally {
    await app.close();
    db.db.close();
  }
});
