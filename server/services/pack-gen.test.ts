import test from "node:test";
import assert from "node:assert/strict";
import { packCardKey, pickFixedPackCard, pickUnusedPackCard } from "./pack-gen.ts";
import type { Pack } from "../../src/packs/store.ts";

const pack: Pack = {
  id: "demo",
  owners: [1],
  createdBy: 1,
  name: "Demo",
  lang: "ru",
  templates: [
    {
      canvas: { w: 1080, h: 1920 },
      elements: [{ type: "killbox", role: "title" }],
    },
  ],
  cards: [
    { values: { title: "first" }, addedAt: "2026-01-01T00:00:00.000Z" },
    { values: { title: "second" }, addedAt: "2026-01-01T00:00:00.000Z" },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  grants: [],
};

test("pickFixedPackCard returns the first card even when normal unused picking is exhausted", () => {
  const used = new Set(pack.cards.map((card) => packCardKey(card.values)));
  assert.equal(pickUnusedPackCard(pack, used), null);

  const fixed = pickFixedPackCard(pack);
  assert.ok(fixed);
  assert.equal(fixed.idx, 0);
  assert.deepEqual(fixed.values, { title: "first" });
});
