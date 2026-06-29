import test from "node:test";
import assert from "node:assert/strict";

import { deckCards } from "./library.ts";

test("super-admin joke decks filter protected-class race slurs from generation pools", () => {
  const checkedDecks = ["en", "it", "pt"];
  const risky = /nigg|negress|nonspara|homens muito negros/i;

  for (const deckId of checkedDecks) {
    const hits = deckCards(deckId)
      .filter((card) => risky.test(`${card.title || ""}\n${card.text || ""}`))
      .map((card) => `${deckId}:${card.id}:${card.title}`);
    assert.deepEqual(hits, []);
  }
});
