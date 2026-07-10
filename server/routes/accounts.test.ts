import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Account } from "../db.ts";
import { openDb } from "../db.ts";
import { makeAuthSession } from "../infra/auth-session.ts";
import { makeRouteDeps } from "./deps.ts";
import { registerAccountsRoutes } from "./accounts.ts";
import type { DeckAccess } from "../services/deck-access.ts";

const EN_MIX = ["en", "pack:new-memes-en-superadmin"];

function testDeckAccess(): DeckAccess {
  return {
    cleanDeckIds: (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))] : [],
    accountSourceDecks: (account: Account) => account.sourceDecks?.length ? account.sourceDecks : [account.lang].filter(Boolean),
    validateAccountSourceDeck: () => null,
    deckContentLang: () => "en",
    deckExists: () => true,
    deckAllowed: () => true,
    availableUnusedForDecks: () => 999,
  } as unknown as DeckAccess;
}

test("accounts update preserves explicit slot deck assignments for thematic blocks", async () => {
  const db = openDb(":memory:");
  const app = Fastify();
  try {
    const user = db.createUser({ username: "slot-owner", passHash: "x", role: "admin" });
    const account = db.createAccount({
      userId: user.id,
      channelName: "Slot Preserve",
      lang: "en",
      sourceDecks: EN_MIX,
      channelLang: "en",
      schedule: ["18:00", "19:00"],
      slotDecks: { "18:00": "en", "19:00": "en" },
      status: "connected",
    });
    const auth = makeAuthSession(db);
    const deps = makeRouteDeps({
      db,
      auth,
      deckAccess: testDeckAccess(),
      notifier: {} as never,
      buildLibraryVideo: (() => null) as never,
      statsRefreshHooks: {} as never,
      outputDir: "",
      redirectUri: "",
      webOrigin: "",
      accountCreds: () => null,
      listAvatarFiles: () => [],
    });
    app.addHook("preHandler", async (req) => {
      (req as { userId?: number }).userId = user.id;
    });
    registerAccountsRoutes(app, db, deps);
    await app.ready();

    const res = await app.inject({
      method: "PUT",
      url: `/api/accounts/${account.id}`,
      payload: {
        channelName: account.channelName,
        lang: "en",
        sourceDecks: EN_MIX,
        channelLang: "en",
        schedule: ["18:00", "19:00"],
        slotVideos: {},
        slotDecks: { "18:00": "pack:new-memes-en-superadmin", "19:00": "en" },
      },
    });

    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(res.json<Account>().slotDecks, { "18:00": "pack:new-memes-en-superadmin", "19:00": "en" });
    assert.deepEqual(db.getAccount(account.id)?.slotDecks, { "18:00": "pack:new-memes-en-superadmin", "19:00": "en" });
  } finally {
    await app.close();
    db.db.close();
  }
});
