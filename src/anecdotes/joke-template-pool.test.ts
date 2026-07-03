import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  JOKE_ANIMATED_TEMPLATES,
  isJokeAnimatedVariant,
  jokeAnimatedTemplateForVariant,
} from "./joke-animated-templates.ts";
import {
  allowedCustomJokePackTemplateIndexes,
  customPackTemplateMarker,
  isAllowedCustomJokePackTemplate,
  isAllowedRussianJokeBackground,
  listAllowedRussianJokeBackgrounds,
  parseCustomPackTemplateMarker,
  resolveAllowedCustomJokePackTemplateIndex,
} from "./joke-template-pool.ts";

test("blocked Russian joke backgrounds are excluded from the shared pool", () => {
  assert.equal(isAllowedRussianJokeBackground("russian_banya.jpg"), false);
  assert.equal(isAllowedRussianJokeBackground("russian_market_stall.jpg"), true);
  assert.deepEqual(
    listAllowedRussianJokeBackgrounds([
      "russian_apartment_hallway.jpg",
      "russian_market_stall.jpg",
      "russian_train_compartment.jpg",
    ]),
    ["russian_market_stall.jpg"],
  );
});

test("chistes public-domain pack keeps only the approved anecdote template", () => {
  assert.deepEqual(allowedCustomJokePackTemplateIndexes("chistes-es-public-domain", 32), [4]);
  assert.equal(isAllowedCustomJokePackTemplate("chistes-es-public-domain", 4), true);
  assert.equal(isAllowedCustomJokePackTemplate("chistes-es-public-domain", 5), false);
  assert.equal(resolveAllowedCustomJokePackTemplateIndex("chistes-es-public-domain", 31, 32), 4);
});

test("unrestricted custom joke packs keep their round-robin template choice", () => {
  assert.equal(resolveAllowedCustomJokePackTemplateIndex("other-pack", 7, 5), 2);
  assert.equal(isAllowedCustomJokePackTemplate("other-pack", 99), true);
});

test("custom pack template markers round-trip through video bg metadata", () => {
  const bg = customPackTemplateMarker("chistes-es-public-domain", 4);
  assert.equal(bg, "pack-template:chistes-es-public-domain:4");
  assert.deepEqual(parseCustomPackTemplateMarker(bg), { packId: "chistes-es-public-domain", templateIndex: 4 });
  assert.equal(parseCustomPackTemplateMarker("repeat-pack:abc"), null);
});

test("animated joke templates define the ten creator gif variants", () => {
  assert.equal(JOKE_ANIMATED_TEMPLATES.length, 10);
  for (const template of JOKE_ANIMATED_TEMPLATES) {
    assert.equal(isJokeAnimatedVariant(template.variant), true);
    assert.deepEqual(jokeAnimatedTemplateForVariant(template.variant), template);
    assert.match(template.gif, /\.gif$/);
    assert.equal(existsSync(resolve(process.cwd(), "assets/creator/motion", template.gif)), true);
  }
});
