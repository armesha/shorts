// Unit tests for deck dispatch metadata (pure, no IO): deckLang, getDeck (incl. synthetic pack decks),
// isPackDeckId, ytMeta (the islamic/christian/psych JSON branches + raw fallback + default). ytMeta
// feeds live YouTube uploads, so a regression here ships broken titles/descriptions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deckLang, getDeck, isPackDeckId, pickGenericTitle } from "./decks.ts";
import { ytMeta } from "./yt-meta.ts";

test("deckLang maps built-in decks; '' for packs/unknown", () => {
  assert.equal(deckLang("ru"), "ru");
  assert.equal(deckLang("psych"), "de");
  assert.equal(deckLang("pt"), "pt");
  assert.equal(deckLang("ar"), "ar");
  assert.equal(deckLang("hi"), "hi");
  assert.equal(deckLang("id"), "id");
  assert.equal(deckLang("islamic"), "ar");
  assert.equal(deckLang("islamic-quotes-ar"), "ar");
  assert.equal(deckLang("islamic-facts-ar"), "ar");
  assert.equal(deckLang("christian-quotes-en"), "en");
  assert.equal(deckLang("christian-facts-en"), "en");
  assert.equal(deckLang("quotes-de-1"), "de");
  assert.equal(deckLang("quotes-de-2"), "de");
  assert.equal(deckLang("quotes-de-3"), "de");
  assert.equal(deckLang("quote-video-ru"), "ru");
  assert.equal(deckLang("quote-video-en"), "en");
  assert.equal(deckLang("quote-video-es"), "es");
  assert.equal(deckLang("quote-video-it"), "it");
  assert.equal(deckLang("quote-video-fr"), "fr");
  assert.equal(deckLang("quote-video-pt"), "pt");
  assert.equal(deckLang("quote-video-hi"), "hi");
  assert.equal(deckLang("quote-video-id"), "id");
  assert.equal(deckLang("quote-video-ar"), "ar");
  assert.equal(deckLang("quote-video-de"), "de");
  assert.equal(deckLang("fact-en"), "en");
  assert.equal(deckLang("fact-ru"), "ru");
  assert.equal(deckLang("fact-es"), "es");
  assert.equal(deckLang("fact-de"), "de");
  assert.equal(deckLang("fact-it"), "it");
  assert.equal(deckLang("fact-fr"), "fr");
  assert.equal(deckLang("fact-pt"), "pt");
  assert.equal(deckLang("space-es"), "es");
  assert.equal(deckLang("memes-pt"), "pt");
  assert.equal(deckLang("memes-es"), "es");
  assert.equal(deckLang("memes-hi"), "hi");
  assert.equal(deckLang("memes-id"), "id");
  assert.equal(deckLang("memes-ar"), "ar");
  assert.equal(deckLang("prayers-de"), "de");
  assert.equal(deckLang("prayers-en"), "en");
  assert.equal(deckLang("pack:abc"), "");
  assert.equal(deckLang("does-not-exist"), "");
});

test("isPackDeckId recognizes the pack: prefix", () => {
  assert.equal(isPackDeckId("pack:abc"), true);
  assert.equal(isPackDeckId("ru"), false);
  assert.equal(isPackDeckId(undefined), false);
  assert.equal(isPackDeckId(null), false);
});

test("getDeck: synthetic deck for pack ids, default for unknown", () => {
  const pack = getDeck("pack:xyz");
  assert.equal(pack.id, "pack:xyz");
  assert.equal(pack.name, "Свой пак");
  assert.equal(getDeck(undefined).id, "ru"); // default
  assert.equal(getDeck("nope").id, "ru"); // unknown → default
  assert.equal(getDeck("islamic").islamic, true);
});

test("pickGenericTitle returns one of the deck's titles", () => {
  const deck = getDeck("ru");
  assert.ok(deck.genericTitles.includes(pickGenericTitle(deck)));
});

test("ytMeta islamic: title = reference, body = exact arabic (+ ref) from JSON", () => {
  const card = JSON.stringify({ arabic: "بِسْمِ اللَّهِ", ref: "الفاتحة 1", ref_en: "Al-Fatiha 1" });
  const m = ytMeta(getDeck("islamic"), "ignored-title", card);
  assert.ok(m.title.startsWith("الفاتحة 1"));
  assert.ok(m.title.includes("#shorts"));
  assert.ok(m.description.includes("بِسْمِ اللَّهِ"));
  assert.ok(m.description.includes("الفاتحة 1"));
  assert.ok(m.description.includes("Al-Fatiha 1"));
});

test("ytMeta islamic: non-JSON text falls back to raw", () => {
  const m = ytMeta(getDeck("islamic"), "ref-here", "plain arabic text");
  assert.ok(m.title.startsWith("ref-here"));
  assert.ok(m.description.includes("plain arabic text"));
});

test("ytMeta christian: KJV passage + reference", () => {
  const card = JSON.stringify({ text: "In the beginning God created the heaven and the earth.", ref: "Genesis 1:1" });
  const m = ytMeta(getDeck("christian"), "ignored", card);
  assert.ok(m.title.startsWith("Genesis 1:1"));
  assert.ok(m.description.includes("In the beginning God created"));
  assert.ok(m.description.includes("(KJV)"));
});

test("ytMeta default deck: title + emoji + #shorts, body = text", () => {
  const m = ytMeta(getDeck("ru"), "Заголовок", "тело анекдота");
  assert.ok(m.title.includes("Заголовок"));
  assert.ok(m.title.includes("#shorts"));
  assert.ok(m.description.includes("тело анекдота"));
  assert.ok(Array.isArray(m.tags) && m.tags.length > 0);
});

test("ytMeta removes internal pack/source notes from public descriptions", () => {
  const m = ytMeta(
    getDeck("pack:new-memes-ru-superadmin"),
    "Новые мемы 001",
    [
      "Новые мемы 001",
      "Translated ready-made meme card 001_wzQuht6tOcA from tmp/meme2/translated.",
      "Legacy memes-* decks are not used for armen thematic blocks.",
    ].join("\n\n"),
  );
  assert.ok(m.description.includes("Новые мемы 001"));
  assert.ok(m.description.includes("#shorts"));
  assert.doesNotMatch(m.description, /tmp\/|translated|Legacy memes|pack:new/i);
});
