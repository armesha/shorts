import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, GeneratedShortSchema } from "./llm.ts";

test("extractJson: plain object", () => {
  assert.equal(extractJson('{"a":1}'), '{"a":1}');
});

test("extractJson: strips markdown code fences", () => {
  const raw = '```json\n{"a":1,"b":2}\n```';
  assert.deepEqual(JSON.parse(extractJson(raw)), { a: 1, b: 2 });
});

test("extractJson: ignores prose around the object", () => {
  const raw = 'Here is your JSON:\n{"title":"x","facts":["y"]}\nHope it helps!';
  assert.deepEqual(JSON.parse(extractJson(raw)), { title: "x", facts: ["y"] });
});

test("extractJson: handles nested braces and braces inside strings", () => {
  const raw = '{"a":{"b":2},"c":"a } not the end {"}';
  assert.deepEqual(JSON.parse(extractJson(raw)), { a: { b: 2 }, c: "a } not the end {" });
});

test("extractJson: throws when no object present", () => {
  assert.throws(() => extractJson("no json here"));
});

test("GeneratedShortSchema: accepts a valid short and fills defaults", () => {
  const parsed = GeneratedShortSchema.parse({
    title: "6 Facts",
    facts: ["one", "two", "three", "four", "five", "six"],
    video: { title: "Six facts" },
  });
  assert.equal(parsed.facts.length, 6);
  assert.deepEqual(parsed.video.tags, []);
  assert.equal(parsed.video.description, "");
});

test("GeneratedShortSchema: rejects too few facts", () => {
  assert.throws(() =>
    GeneratedShortSchema.parse({
      title: "x",
      facts: ["a", "b"],
      video: { title: "t" },
    }),
  );
});
