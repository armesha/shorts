import { test } from "node:test";
import assert from "node:assert/strict";
import { getDeck } from "./decks.ts";
import { videoTags } from "./video-tags.ts";

test("videoTags creates varied RU joke tags with topic hints", () => {
  const first = videoTags(getDeck("ru"), "Муж купил телефон", "Жена просит пароль от телефона");
  const second = videoTags(getDeck("ru"), "Кот на кухне", "Кот спрятал суп на кухне");

  assert.ok(first.includes("анекдоты"));
  assert.ok(first.includes("семейный юмор"));
  assert.ok(first.includes("технологии"));
  assert.notDeepEqual(first, second);
  assert.ok(first.length <= 12);
  assert.ok(first.join(",").length <= 480);
});

test("videoTags localizes synthetic meme and custom joke pack tags", () => {
  const meme = videoTags(getDeck("pack:new-memes-de-superadmin"), "Chef im Büro", "Wenn der Chef das WLAN kaputt macht");
  const jokes = videoTags(getDeck("pack:dowcipy-pl-mit"), "Żona i mąż", "Krótki dowcip rodzinny");

  assert.ok(meme.includes("Memes"));
  assert.ok(meme.includes("Bürohumor"));
  assert.ok(jokes.includes("dowcipy"));
  assert.ok(jokes.includes("humor rodzinny"));
});

test("videoTags localizes new Romanian, Czech and Dutch meme packs", () => {
  const ro = videoTags(getDeck("pack:new-memes-ro-superadmin"), "Șeful la birou", "Pisica a cumpărat un telefon nou");
  const cs = videoTags(getDeck("pack:new-memes-cs-superadmin"), "Šéf v kanceláři", "Kočka zapomněla heslo");
  const nl = videoTags(getDeck("pack:new-memes-nl-superadmin"), "Baas op kantoor", "De kat kocht een nieuwe telefoon");

  assert.ok(ro.includes("umor de birou"));
  assert.ok(ro.includes("animale"));
  assert.ok(cs.includes("kancelářský humor"));
  assert.ok(cs.includes("technologie"));
  assert.ok(nl.includes("kantoorhumor"));
  assert.ok(nl.includes("tech humor"));
  assert.ok(nl.includes("dieren"));
});

test("videoTags falls back to deck tags for non joke/meme decks", () => {
  assert.deepEqual(videoTags(getDeck("fact-en"), "Fact", "Space"), getDeck("fact-en").tags);
});
