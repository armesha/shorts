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

test("new account starts without an implicit German content pack", async () => {
  const db = openDb(":memory:");
  const app = Fastify();
  try {
    const user = db.createUser({ username: "draft-owner", passHash: "x", role: "admin" });
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

    const draftResponse = await app.inject({
      method: "POST",
      url: "/api/accounts",
      payload: { timezone: "Europe/Prague" },
    });
    assert.equal(draftResponse.statusCode, 200, draftResponse.body);
    const draft = draftResponse.json<Account>();
    assert.equal(draft.lang, "");
    assert.equal(draft.channelLang, "");
    assert.deepEqual(draft.sourceDecks, []);
    const rawDraft = db.db.prepare("SELECT source_decks FROM accounts WHERE id = ?").get(draft.id) as { source_decks: string };
    assert.equal(rawDraft.source_decks, "[]");

    const explicitResponse = await app.inject({
      method: "POST",
      url: "/api/accounts",
      payload: { lang: "en", channelLang: "en" },
    });
    assert.equal(explicitResponse.statusCode, 200, explicitResponse.body);
    const explicit = explicitResponse.json<Account>();
    assert.equal(explicit.lang, "en");
    assert.equal(explicit.channelLang, "en");
    assert.deepEqual(explicit.sourceDecks, ["en"]);

    const clearedResponse = await app.inject({
      method: "PUT",
      url: `/api/accounts/${explicit.id}`,
      payload: { lang: "en", channelLang: "en", sourceDecks: [] },
    });
    assert.equal(clearedResponse.statusCode, 200, clearedResponse.body);
    const cleared = clearedResponse.json<Account>();
    assert.equal(cleared.lang, "");
    assert.equal(cleared.channelLang, "en");
    assert.deepEqual(cleared.sourceDecks, []);
    assert.deepEqual(cleared.slotDecks, {});
  } finally {
    await app.close();
    db.db.close();
  }
});

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
