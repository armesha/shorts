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

function packHits(file: string, risky: RegExp): string[] {
  const pack = JSON.parse(readFileSync(file, "utf8")) as { cards?: { values?: unknown }[]; name?: string };
  return (pack.cards ?? [])
    .map((card, index) => ({ index, text: flattenText(card.values) }))
    .filter((card) => risky.test(card.text))
    .map((card) => `${file}:${card.index}`);
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

  const customPacks = [
    "data/packs/chistes-es-public-domain.json",
    "data/packs/motivation-de-superadmin.json",
    "data/packs/motivation-en-superadmin.json",
    "data/packs/motivation-ru-superadmin.json",
    "data/packs/new-memes-de-superadmin.json",
    "data/packs/new-memes-en-superadmin.json",
    "data/packs/new-memes-es-superadmin.json",
    "data/packs/new-memes-fr-superadmin.json",
    "data/packs/new-memes-it-superadmin.json",
    "data/packs/new-memes-pt-superadmin.json",
    "data/packs/psychology-de-superadmin.json",
    "data/packs/psychology-ru-superadmin.json",
    "data/packs/soviet-posters-ru.json",
    "data/packs/static-facts-de-superadmin.json",
    "data/packs/static-facts-en-superadmin.json",
    "data/packs/static-facts-es-superadmin.json",
    "data/packs/static-facts-ru-superadmin.json",
  ];
  const customHits = customPacks.flatMap((file) => packHits(file, risky));
  assert.deepEqual(customHits, []);
});
