import test from "node:test";
import assert from "node:assert/strict";
import {
  availablePackCardsForAccount,
  packCardClaimKey,
  pickFixedPackCard,
  pickLeastPostedPackCard,
  pickUnusedPackCard,
  usedPackCardKeysForAccount,
  packCardKey,
} from "./pack-gen.ts";
import type { Pack } from "../../src/packs/store.ts";

function demoPack(): Pack {
  return {
    id: "demo-pack",
    owners: [1],
    createdBy: 1,
    name: "Demo",
    lang: "en",
    templates: [{ canvas: { w: 1080, h: 1920, bg: "#fff" }, elements: [] }],
    cards: Array.from({ length: 24 }, (_, index) => ({
      values: { title: `Card ${index}`, body: `Body ${index}` },
      addedAt: new Date(0).toISOString(),
    })),
    createdAt: new Date(0).toISOString(),
    grants: [],
  };
}

test("pickUnusedPackCard: seeded pick spreads identical pack queues by channel seed", () => {
  const pack = demoPack();
  const picked = new Set(
    Array.from({ length: 30 }, (_, index) => pickUnusedPackCard(pack, new Set(), `account:${index}|slot:09:00`)?.key).filter(
      Boolean,
    ),
  );
  assert.ok(picked.size > 1, "different channel seeds should not collapse to the same pack card");
});

test("pickUnusedPackCard: same seed is stable and honors used claims", () => {
  const pack = demoPack();
  const first = pickUnusedPackCard(pack, new Set(), "account:1|slot:09:00");
  const again = pickUnusedPackCard(pack, new Set(), "account:1|slot:09:00");
  assert.equal(again?.key, first?.key, "same seed keeps a stable lane");

  const used = new Set(first ? [first.key] : []);
  const next = pickUnusedPackCard(pack, used, "account:1|slot:09:00");
  assert.notEqual(next?.key, first?.key, "claimed card is skipped");
  assert.equal(next?.key, packCardKey(next?.values ?? {}), "returned key matches the card values");
});

test("pickFixedPackCard returns the first card even when normal unused picking is exhausted", () => {
  const pack = demoPack();
  const used = new Set(pack.cards.map((card) => packCardKey(card.values)));
  assert.equal(pickUnusedPackCard(pack, used), null);

  const fixed = pickFixedPackCard(pack);
  assert.ok(fixed);
  assert.equal(fixed.idx, 0);
  assert.deepEqual(fixed.values, { title: "Card 0", body: "Body 0" });
});

test("pickLeastPostedPackCard prefers the least rendered card for the account", () => {
  const pack = demoPack();
  const firstKey = packCardKey(pack.cards[0].values);
  const secondKey = packCardKey(pack.cards[1].values);
  const db = {
    db: {
      prepare() {
        return {
          all() {
            return [
              { bg: `repeat-pack:${firstKey}`, n: 5 },
              { bg: `repeat-pack:${secondKey}`, n: 1 },
            ];
          },
        };
      },
    },
  };

  const picked = pickLeastPostedPackCard(db as never, 7, pack, "stable");
  assert.ok(picked);
  assert.notEqual(picked.key, firstKey);
});

test("per-account auto-expire packs scope used cards by channel", () => {
  const pack = { ...demoPack(), autoExpireMode: "per_account" as const };
  const firstKey = packCardKey(pack.cards[0].values);
  const secondKey = packCardKey(pack.cards[1].values);
  const used = new Set([
    packCardClaimKey(pack, 10, firstKey),
    packCardClaimKey(pack, 10, secondKey),
    packCardClaimKey(pack, 20, secondKey),
  ]);

  assert.deepEqual(usedPackCardKeysForAccount(pack, 10, used), new Set([firstKey, secondKey]));
  assert.deepEqual(usedPackCardKeysForAccount(pack, 20, used), new Set([secondKey]));
  assert.equal(availablePackCardsForAccount(pack, 10, used), pack.cards.length - 2);
  assert.equal(availablePackCardsForAccount(pack, 20, used), pack.cards.length - 1);
});
