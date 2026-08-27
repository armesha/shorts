import test from "node:test";
import assert from "node:assert/strict";

import { SUPER_ADMIN_USERNAME } from "../auth.ts";
import { openDb } from "../db.ts";
import { makeDeckAccess } from "./deck-access.ts";

const deps = {
  isAdminReq: () => false,
  isSuperAdminReq: () => false,
};

test("accountSourceDecks drops retired decks for everyone and forbidden source decks for the super admin owner", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: SUPER_ADMIN_USERNAME, passHash: "x", role: "admin", isSuperAdmin: true });
  const user = db.createUser({ username: "regular", passHash: "x", role: "user" });
  const access = makeDeckAccess(db, deps);

  const armenAccount = db.createAccount({
    userId: armen.id,
    channelName: "armen",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en", "visual-riddles-en", "illusions-3d-en", "memes-en", "pack:motivation-en-superadmin"],
  });
  const regularAccount = db.createAccount({
    userId: user.id,
    channelName: "regular",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en", "visual-riddles-en", "illusions-3d-en", "memes-en", "pack:motivation-en-superadmin"],
  });

  assert.deepEqual(access.accountSourceDecks(armenAccount), ["en"]);
  assert.deepEqual(access.accountSourceDecks(regularAccount), ["en", "memes-en"]);
});

test("exclusive built-in deck is accessible only to its username, even against admin bypass", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x", role: "admin", isSuperAdmin: true });
  const otherAdmin = db.createUser({ username: "other-admin", passHash: "x", role: "admin" });
  const regular = db.createUser({ username: "regular", passHash: "x", role: "user" });
  const access = makeDeckAccess(db, {
    isAdminReq: (req) => db.getUserById((req as { userId: number }).userId)?.role === "admin",
    isSuperAdminReq: (req) => db.getUserById((req as { userId: number }).userId)?.isSuperAdmin === true,
  });
  const deck = access.visibleDecksForUser(armen.id).find((item) => item.id === "voiced-memes-ru");

  assert.ok(deck);
  assert.equal(access.deckAllowed({ userId: armen.id }, "voiced-memes-ru"), true);
  assert.equal(access.deckAllowedForUser(armen.id, "voiced-memes-ru"), true);
  assert.equal(access.deckExists({ userId: armen.id }, "voiced-memes-ru"), true);

  for (const user of [otherAdmin, regular]) {
    assert.equal(access.builtinDeckVisibleForUser(user.id, deck), false);
    assert.equal(access.deckAllowed({ userId: user.id }, "voiced-memes-ru"), false);
    assert.equal(access.deckAllowedForUser(user.id, "voiced-memes-ru"), false);
    assert.equal(access.deckExists({ userId: user.id }, "voiced-memes-ru"), false);
    assert.equal(access.visibleDecksForUser(user.id).some((item) => item.id === "voiced-memes-ru"), false);
  }

  const otherAdminAccount = db.createAccount({
    userId: otherAdmin.id,
    channelName: "other-admin",
    lang: "ru",
    channelLang: "ru",
    sourceDecks: ["ru", "voiced-memes-ru"],
  });
  assert.deepEqual(access.accountSourceDecks(otherAdminAccount), ["ru"]);
});
