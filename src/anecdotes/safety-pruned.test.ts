import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { deckCards } from "./library.ts";

function flattenText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join("\n");
  if (typeof value === "object") return Object.values(value).map(flattenText).join("\n");
  return "";
}

test("super-admin joke decks filter protected-class race slurs from generation pools", () => {
  const builtinJokeDecks = ["ru", "de", "en", "it", "fr", "pt"];
  const risky =
    /\b(nigg(?:er|a|ah)s?|negress|negroes|neger|nègre|négresse|zigeuner|nonspara|чурк\w*|хач\w*|хохл\w*|москал\w*|кацап\w*|жид(?!к)\w*)\b|homens muito negros/iu;

  for (const deckId of builtinJokeDecks) {
    const hits = deckCards(deckId)
      .filter((card) => risky.test(`${card.title || ""}\n${card.text || ""}`))
      .map((card) => `${deckId}:${card.id}:${card.title}`);
    assert.deepEqual(hits, []);
  }

  const spanishPack = JSON.parse(readFileSync("data/packs/chistes-es-public-domain.json", "utf8")) as {
    cards?: { values?: unknown }[];
  };
  const spanishHits = (spanishPack.cards ?? [])
    .map((card, index) => ({ index, text: flattenText(card.values) }))
    .filter((card) => risky.test(card.text))
    .map((card) => `pack:chistes-es-public-domain:${card.index}`);
  assert.deepEqual(spanishHits, []);
});
