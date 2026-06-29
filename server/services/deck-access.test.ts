import test from "node:test";
import assert from "node:assert/strict";

import { SUPER_ADMIN_USERNAME } from "../auth.ts";
import { openDb } from "../db.ts";
import { makeDeckAccess } from "./deck-access.ts";

const deps = {
  isAdminReq: () => false,
  isSuperAdminReq: () => false,
};

test("accountSourceDecks hides removed optical decks only for the super admin owner", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: SUPER_ADMIN_USERNAME, passHash: "x", role: "admin" });
  const user = db.createUser({ username: "regular", passHash: "x", role: "user" });
  const access = makeDeckAccess(db, deps);

  const armenAccount = db.createAccount({
    userId: armen.id,
    channelName: "armen",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en", "visual-riddles-en", "illusions-3d-en"],
  });
  const regularAccount = db.createAccount({
    userId: user.id,
    channelName: "regular",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en", "visual-riddles-en", "illusions-3d-en"],
  });

  assert.deepEqual(access.accountSourceDecks(armenAccount), ["en"]);
  assert.deepEqual(access.accountSourceDecks(regularAccount), ["en", "illusions-en", "visual-riddles-en", "illusions-3d-en"]);
});
