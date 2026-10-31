import { test } from "node:test";
import assert from "node:assert/strict";
import { mapNarration, displayNumber } from "./narration.ts";
import { METRICS } from "./sources.ts";

test("only the title question is spoken", () => {
  const idea = { themeId: "forest", title: "Лес занимает больше 30 процентов?", hook: "Другая фраза", reason: "Сравнение" };
  assert.equal(mapNarration(idea, METRICS.find(m => m.id === "forest")!), idea.title);
});

test("numbers stay free of printed units and match the spoken scale", () => {
  assert.equal(displayNumber(25.5, METRICS[0]), "25,5");
  assert.equal(displayNumber(12_500_000, METRICS.find(m => m.id === "population")!), "12,5");
  assert.equal(displayNumber(45_000, METRICS.find(m => m.id === "gdp-person")!), "45");
  assert.notEqual(displayNumber(800, METRICS.find(m => m.id === "population")!), "0");
  for (const metric of METRICS) assert.match(displayNumber(12345, metric), /^[\d\s,.-]+$/);
});
