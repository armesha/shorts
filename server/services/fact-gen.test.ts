import assert from "node:assert/strict";
import test from "node:test";
import { localizedFactVoiceForDeck } from "./fact-gen.ts";

test("final voiced meme videos are copied without TTS localization", () => {
  assert.equal(localizedFactVoiceForDeck("voiced-memes-ru"), undefined);
});

test("localized fact decks still select their configured voice", () => {
  assert.equal(localizedFactVoiceForDeck("fact-ru"), "ru-RU-SvetlanaNeural");
  assert.equal(localizedFactVoiceForDeck("fact-en"), undefined);
});
