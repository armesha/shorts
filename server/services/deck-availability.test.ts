import test from "node:test";
import assert from "node:assert/strict";

import { openDb } from "../db.ts";
import { availableUnusedByDeck, availableUnusedForDecks, createDeckAvailabilityContext } from "./deck-availability.ts";

function addContentItem(db: ReturnType<typeof openDb>, deckId: string, itemIndex: number, itemKey: string) {
  db.db
    .prepare(
      `INSERT INTO content_items (deck_id, item_index, item_key, title, text, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(deckId, itemIndex, itemKey, itemKey, itemKey, "{}");
}

test("availableUnusedForDecks counts overlapping builtin item keys once", () => {
  const db = openDb(":memory:");
  const owner = db.createUser({ username: "availability", passHash: "x" });
  addContentItem(db, "deck-a", 0, "k1");
  addContentItem(db, "deck-a", 1, "k2");
  addContentItem(db, "deck-b", 0, "k2");
  addContentItem(db, "deck-b", 1, "k3");

  const ctx = createDeckAvailabilityContext();
  const byDeck = availableUnusedByDeck(db, owner.id, ["deck-a", "deck-b"], ctx);
  assert.equal(byDeck.get("deck-a"), 2);
  assert.equal(byDeck.get("deck-b"), 2);
  assert.equal(availableUnusedForDecks(db, owner.id, ["deck-a", "deck-b"], ctx), 3);

  db.markAnecdoteUsed(owner.id, "k2");
  const afterUse = createDeckAvailabilityContext();
  assert.equal(availableUnusedForDecks(db, owner.id, ["deck-a", "deck-b"], afterUse), 2);
});
