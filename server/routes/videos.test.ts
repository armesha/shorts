import test from "node:test";
import assert from "node:assert/strict";
import { SUPER_ADMIN_USERNAME } from "../auth.ts";
import { openDb } from "../db.ts";
import { makeDeckAccess } from "../services/deck-access.ts";
import { MANUAL_VIDEO_DECK } from "../services/manual-videos.ts";
import { canPostVideoDeckForAccount } from "./videos.ts";

const deps = {
  isAdminReq: () => true,
  isSuperAdminReq: () => true,
};

test("post-now source guard rejects removed visual/optical decks for armen even if stored on an old channel", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: SUPER_ADMIN_USERNAME, passHash: "x", role: "admin" });
  const access = makeDeckAccess(db, deps);
  const account = db.createAccount({
    userId: armen.id,
    channelName: "Old armen channel",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en"],
    longVideoDecks: ["long-christian-en"],
  });

  const selectedSources = access.accountSourceDecks(account);

  assert.deepEqual(selectedSources, ["en"]);
  assert.equal(canPostVideoDeckForAccount("en", account, selectedSources), true);
  assert.equal(canPostVideoDeckForAccount(MANUAL_VIDEO_DECK, account, selectedSources), true);
  assert.equal(canPostVideoDeckForAccount("long-christian-en", account, selectedSources), true);
  assert.equal(canPostVideoDeckForAccount("illusions-en", account, selectedSources), false);
});
