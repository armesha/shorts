import test from "node:test";
import assert from "node:assert/strict";

import { registeredUserDefaultGrantIds } from "./default-user-decks.ts";

test("registered user defaults include Russian joke packs only", () => {
  const defaults = registeredUserDefaultGrantIds();

  assert.deepEqual(defaults.deckIds, []);
  assert.ok(defaults.longVideoDeckIds.includes("long-anecdotes-ru"));
  assert.ok(defaults.longVideoDeckIds.includes("long-anecdotes-soul-ru"));
  assert.ok(defaults.packDeckIds.includes("pack:mgs-ru-shutki-eigen"));
  assert.ok(defaults.packDeckIds.includes("pack:анекдоты-ру-впн-mqe5ovw1"));

  assert.equal(defaults.packDeckIds.includes("pack:new-memes-ru-superadmin"), false);
  assert.equal(defaults.packDeckIds.includes("pack:static-facts-ru-superadmin"), false);
  assert.equal(defaults.packDeckIds.includes("pack:chistes-es-public-domain"), false);
});
