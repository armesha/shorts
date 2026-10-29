import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNarration, displayNumber } from "./narration.ts";
import { METRICS } from "./sources.ts";

test("forest narration explains the denominator, percentages and an example in spoken words", () => {
  const text = mapNarration({ themeId: "forest", title: "Леса", hook: "Сколько лесов в странах?", reason: "Сравнение" }, METRICS.find(m => m.id === "forest")!);
  assert.ok(text.includes("площади суши"));
  assert.ok(text.includes("проценты"));
  assert.ok(text.includes("половину"));
  assert.ok(text.includes("2023"));
  assert.ok(!text.includes("%"));
  assert.ok(text.split(/\s+/).length > 30);
});

test("numbers stay free of printed units and match the spoken scale", () => {
  assert.equal(displayNumber(25.5, METRICS[0]), "25,5");
  assert.equal(displayNumber(12_500_000, METRICS.find(m => m.id === "population")!), "12,5");
  assert.equal(displayNumber(45_000, METRICS.find(m => m.id === "gdp-person")!), "45");
  assert.notEqual(displayNumber(800, METRICS.find(m => m.id === "population")!), "0");
  for (const metric of METRICS) assert.match(displayNumber(12345, metric), /^[\d\s,.-]+$/);
});
