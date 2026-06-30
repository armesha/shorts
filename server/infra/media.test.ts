import test from "node:test";
import assert from "node:assert/strict";
import { cardReadable } from "./media.ts";

test("cardReadable excludes internal source/debug roles from public pack text", () => {
  const readable = cardReadable(
    {
      title: "Новые мемы 001",
      source: "Translated ready-made meme card from temp/meme2/translated.",
      debug: "assets/template-packs/new-memes/ru/001.jpg",
    },
    [
      { role: "title", list: false, min: 0, max: 220 },
      { role: "source", list: false, min: 0, max: 1200 },
      { role: "debug", list: false, min: 0, max: 1200 },
    ],
  );

  assert.equal(readable.title, "Новые мемы 001");
  assert.equal(readable.text, "Новые мемы 001");
  assert.doesNotMatch(readable.text, /temp\/|assets\/|Translated ready-made/i);
});
