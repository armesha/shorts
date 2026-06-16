// Unit tests for the pure pack-validation logic (no IO, no Chrome): deriveRules + validateBatch.
// These gate what a user can add to a custom pack, so a regression here lets through cards that
// later clip or crash the renderer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveRules, validateBatch, type PackTemplate } from "./store.ts";

const tpl: PackTemplate = {
  canvas: { w: 1080, h: 1920 },
  elements: [
    { type: "killbox", role: "title", minChars: 3, maxChars: 40 },
    // list killbox with maxChars:0 → max derived from geometry via estimateCapacity (must be > 0)
    { type: "killbox", role: "items", bullet: true, minChars: 5, maxChars: 0, w: 800, h: 600, fitMin: 30, padX: 20, padY: 20, font: { lineHeight: 1.3 } },
    { type: "image", role: "bg" }, // not a killbox → ignored
    { type: "killbox" }, // killbox without role → ignored
  ],
};

test("deriveRules: only killboxes with a role become rules", () => {
  const rules = deriveRules(tpl);
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[0], { role: "title", list: false, min: 3, max: 40 });
  assert.equal(rules[1].role, "items");
  assert.equal(rules[1].list, true);
  assert.equal(rules[1].min, 5);
  assert.ok(rules[1].max > 0, "maxChars:0 → derived capacity must be positive");
});

test("deriveRules: empty/missing template → no rules", () => {
  assert.deepEqual(deriveRules({ canvas: { w: 1, h: 1 }, elements: [] }), []);
  assert.deepEqual(deriveRules(undefined as unknown as PackTemplate), []);
});

const rules = [
  { role: "title", list: false, min: 3, max: 10 },
  { role: "pts", list: true, min: 2, max: 20 },
];

test("validateBatch: valid card passes", () => {
  const r = validateBatch([{ title: "Hi there", pts: ["ab", "cd"] }], rules);
  assert.equal(r.parsed, 1);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.cards, [{ title: "Hi there", pts: ["ab", "cd"] }]);
});

test("validateBatch: non-object entry is rejected", () => {
  const r = validateBatch([5], rules);
  assert.equal(r.cards.length, 0);
  assert.match(r.errors[0].messages[0], /JSON-объектом/);
});

test("validateBatch: missing role reported", () => {
  const r = validateBatch([{ title: "Hello" }], rules);
  assert.equal(r.cards.length, 0);
  assert.ok(r.errors[0].messages.some((m) => /нет поля «pts»/.test(m)));
});

test("validateBatch: wrong shape (array for string role, string for list role)", () => {
  const arrForStr = validateBatch([{ title: ["ab", "cd"], pts: ["x", "y"] }], rules);
  assert.ok(arrForStr.errors[0].messages.some((m) => /должно быть строкой/.test(m)));
  const strForList = validateBatch([{ title: "hello", pts: "abcd" }], rules);
  assert.ok(strForList.errors[0].messages.some((m) => /массивом строк/.test(m)));
});

test("validateBatch: length bounds (list value length = sum of items)", () => {
  const tooShort = validateBatch([{ title: "hi", pts: ["ab", "cd"] }], rules);
  assert.ok(tooShort.errors[0].messages.some((m) => /слишком коротко/.test(m)));
  const tooLong = validateBatch([{ title: "hello", pts: ["aaaaaaaaaa", "bbbbbbbbbbb"] }], rules);
  assert.ok(tooLong.errors[0].messages.some((m) => /слишком длинно/.test(m)));
});

test("validateBatch: accepts a JSON string and wraps a single object", () => {
  const r = validateBatch('{ "title": "Hi there", "pts": ["ab", "cd"] }', rules);
  assert.equal(r.parsed, 1);
  assert.equal(r.cards.length, 1);
});

test("validateBatch: malformed JSON string throws", () => {
  assert.throws(() => validateBatch("{ not json", rules), SyntaxError);
});
