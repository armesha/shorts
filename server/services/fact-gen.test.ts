import assert from "node:assert/strict";
import test from "node:test";
import { localizedFactVoiceForDeck } from "./fact-gen.ts";

test("final prebuilt videos are copied without TTS localization", () => {
  assert.equal(localizedFactVoiceForDeck("voiced-memes-ru"), undefined);
  assert.equal(localizedFactVoiceForDeck("shortrobot1"), undefined);
});

test("localized fact decks still select their configured voice", () => {
  assert.equal(localizedFactVoiceForDeck("fact-ru"), "ru-RU-SvetlanaNeural");
  assert.equal(localizedFactVoiceForDeck("fact-en"), undefined);
});
