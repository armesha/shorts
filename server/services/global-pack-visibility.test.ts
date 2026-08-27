import assert from "node:assert/strict";
import test from "node:test";

import { DECKS } from "../../src/anecdotes/decks.ts";
import { openDb } from "../db.ts";
import {
  isBuiltInDeckGloballyVisible,
  isCustomPackGloballyVisible,
} from "./global-pack-visibility.ts";

test("global pack visibility hides unused non-joke custom packs", () => {
  const db = openDb(":memory:");
  try {
    assert.equal(isCustomPackGloballyVisible(db, { id: "facts-ru", name: "Facts RU", templateType: "facts" }), false);
  } finally {
    db.db.close();
  }
});

test("global pack visibility keeps unused joke or meme custom packs", () => {
  const db = openDb(":memory:");
  try {
    assert.equal(isCustomPackGloballyVisible(db, { id: "chistes-es-long", name: "Chistes ES Long", templateType: "custom" }), true);
    assert.equal(isCustomPackGloballyVisible(db, { id: "new-memes-ru", name: "Новые мемы", templateType: "memes" }), true);
    assert.equal(isCustomPackGloballyVisible(db, { id: "anecdotes-en", name: "Anecdotes EN", templateType: "custom" }), true);
  } finally {
    db.db.close();
  }
});

test("global pack visibility keeps custom packs used by any channel", () => {
  const db = openDb(":memory:");
  try {
    db.createAccount({
      userId: 1,
      lang: "ru",
      channelLang: "ru",
      sourceDecks: ["pack:facts-ru"],
      schedule: ["12:00"],
    });
    assert.equal(isCustomPackGloballyVisible(db, { id: "facts-ru", name: "Facts RU", templateType: "facts" }), true);
  } finally {
    db.db.close();
  }
});

test("global pack visibility counts slot-only and lang-fallback channel usage", () => {
  const db = openDb(":memory:");
  try {
    const slotDeck = DECKS.find((deck) => deck.id === "fact-en");
    const fallbackDeck = DECKS.find((deck) => deck.id === "fact-de");
    assert.ok(slotDeck);
    assert.ok(fallbackDeck);

    const slotAccount = db.createAccount({
      userId: 1,
      lang: "ru",
      channelLang: "ru",
      sourceDecks: ["ru"],
      schedule: ["12:00"],
    });
    db.updateAccount(slotAccount.id, { slotDecks: { "12:00": "fact-en" } });
    const fallbackAccount = db.createAccount({
      userId: 1,
      lang: "fact-de",
      channelLang: "de",
      sourceDecks: ["fact-de"],
      schedule: ["14:00"],
    });
    db.db.prepare("UPDATE accounts SET source_decks = ? WHERE id = ?").run("[]", fallbackAccount.id);

    assert.equal(isBuiltInDeckGloballyVisible(db, slotDeck), true);
    assert.equal(isBuiltInDeckGloballyVisible(db, fallbackDeck), true);
  } finally {
    db.db.close();
  }
});

test("retired visual-riddles deck is absent from the active registry", () => {
  assert.equal(DECKS.some((deck) => deck.id === "visual-riddles"), false);
});

test("global pack visibility applies the same used-or-exception rule to built-in decks", () => {
  const db = openDb(":memory:");
  try {
    const fact = DECKS.find((deck) => deck.id === "fact-en");
    const memes = DECKS.find((deck) => deck.id === "memes-ru");
    assert.ok(fact);
    assert.ok(memes);
    assert.equal(isBuiltInDeckGloballyVisible(db, fact), false);
    assert.equal(isBuiltInDeckGloballyVisible(db, memes), true);

    db.createAccount({
      userId: 1,
      lang: "fact-en",
      channelLang: "en",
      sourceDecks: ["fact-en"],
      schedule: ["12:00"],
    });
    assert.equal(isBuiltInDeckGloballyVisible(db, fact), true);
  } finally {
    db.db.close();
  }
});
