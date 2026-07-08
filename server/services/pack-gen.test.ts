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
  isNewMemePack,
  packMotionOverlayForCard,
} from "./pack-gen.ts";
import type { Pack } from "../../src/packs/store.ts";

function demoPack(): Pack {
  return {
    id: "demo-pack",
    owners: [1],
    createdBy: 1,
    name: "Demo",
    lang: "en",
    templates: [{
      canvas: { w: 1080, h: 1920, bg: "#fff" },
      elements: [
        { type: "killbox", role: "title" },
        { type: "killbox", role: "body" },
      ],
    }],
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

test("per-account auto-expire availability treats existing library videos as used cards", () => {
  const pack = { ...demoPack(), autoExpireMode: "per_account" as const };
  const firstKey = packCardKey(pack.cards[0].values);
  const secondKey = packCardKey(pack.cards[1].values);
  const thirdKey = packCardKey(pack.cards[2].values);
  const used = new Set([packCardClaimKey(pack, 10, firstKey)]);

  assert.equal(
    availablePackCardsForAccount(pack, 10, used, [
      { bg: "", title: "Card 1", text: "Card 1\n\nBody 1" },
      { bg: `repeat-pack:${thirdKey}`, title: "legacy", text: "legacy" },
    ]),
    pack.cards.length - 3,
  );
  assert.equal(availablePackCardsForAccount(pack, 20, used, [{ bg: "", title: "Card 1", text: "Card 1\n\nBody 1" }]), pack.cards.length - 1);
  assert.equal(secondKey, packCardKey(pack.cards[1].values));
});

test("new meme packs receive one lower safe-area creator motion overlay", () => {
  const regular = demoPack();
  assert.equal(isNewMemePack(regular), false);
  assert.equal(packMotionOverlayForCard(regular, "regular-seed"), null);

  const memePack = {
    ...regular,
    id: "new-memes-ro-superadmin",
    name: "Meme noi",
    templateType: "memes",
  } satisfies Pack;
  const motion = packMotionOverlayForCard(memePack, "meme-seed", 180);

  assert.equal(isNewMemePack(memePack), true);
  assert.ok(motion);
  assert.equal(motion.width, 92);
  assert.equal(motion.height, 92);
  assert.match(motion.y, /^main_h-overlay_h-(16|24)$/);
  assert.ok(
    [
      "64",
      "198",
      "(main_w-overlay_w)/2",
      "main_w-overlay_w-198",
      "main_w-overlay_w-64",
    ].includes(motion.x),
  );
  assert.match(motion.path, /assets\/creator\/motion\/.+\.gif$/);
});
