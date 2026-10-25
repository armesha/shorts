import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { openDb, type Account } from "../db.ts";
import { MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";
import { registerAccountReadinessRoutes } from "./account-readiness.ts";
import type { RouteDeps } from "./deps.ts";

test("readiness supports social channels without requesting Google credentials", async () => {
  for (const platform of ["youtube", "instagram", "tiktok"] as const) {
    const db = openDb(":memory:");
    const app = Fastify();
    try {
      const owner = db.createUser({ username: `readiness-${platform}`, passHash: "x" });
      const account: Account = {
        ...db.createAccount({
          userId: owner.id,
          lang: MANUAL_VIDEO_DECK,
          sourceDecks: [MANUAL_VIDEO_DECK],
          channelLang: "en",
          schedule: ["12:00"],
          status: "connected",
        }),
        platform,
      };
      for (let i = 0; i < 3; i += 1) {
        db.createVideo({
          accountId: account.id,
          title: `Ready ${i}`,
          text: "",
          bg: "",
          music: "",
          deck: MANUAL_VIDEO_DECK,
          videoRel: `synthetic-${i}.mp4`,
          imageRel: null,
        });
      }
      const deps = {
        accessibleAccount: () => account,
        accountOwnerId: () => owner.id,
        accountCreds: () => { throw new Error("readiness must not request Google credentials"); },
        deckAccess: {
          accountSourceDecks: () => [MANUAL_VIDEO_DECK],
          availableUnusedByDeck: () => new Map(),
          availableUnusedForDecks: () => 0,
          deckContentLang: () => "en",
        },
      } as unknown as RouteDeps;
      registerAccountReadinessRoutes(app, db, deps);
      const ready = await app.inject({ url: `/api/accounts/${account.id}/readiness` });
      assert.equal(ready.statusCode, 200, ready.body);
      assert.equal(ready.json().platform, platform);
      assert.equal(ready.json().status, "ready");
      assert.deepEqual(ready.json().blockers, []);
      assert.equal(ready.json().queuedVideos, 3);

      account.status = "needs_auth";
      const disconnected = await app.inject({ url: `/api/accounts/${account.id}/readiness` });
      assert.equal(disconnected.statusCode, 200, disconnected.body);
      assert.equal(disconnected.json().status, "blocked");
      assert.deepEqual(disconnected.json().blockers, ["not_connected"]);
      assert.ok(disconnected.json().actions.includes(platform === "youtube" ? "connect_youtube" : "connect_social"));
      if (platform !== "youtube") assert.equal(disconnected.json().actions.includes("connect_youtube"), false);
    } finally {
      await app.close();
      db.db.close();
    }
  }
});
