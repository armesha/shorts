import assert from "node:assert/strict";
import test from "node:test";
import type { Account, Db, Video } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import {
  planChannelBlockNormalize,
  normalizeSourceWeightSettings,
  sourceGapsForScheduledDecks,
  thematicBlockDeckSequenceForGeneration,
  thematicBlockSlotDecksForAccount,
} from "./super-admin-channel-blocks.ts";
import { openDb } from "../db.ts";

const FOREIGN_EN_SOURCES = [
  "pack:static-facts-en-superadmin",
  "fact-en",
  "tips-en",
  "en",
  "pack:new-memes-en-superadmin",
  "quote-video-en",
  "quotes-en",
  "pack:motivation-en-superadmin",
];

function account(id: number): Account {
  return {
    id,
    userId: 1,
    channelName: `Channel ${id}`,
    theme: "",
    lang: "en",
    sourceDecks: FOREIGN_EN_SOURCES,
    longVideoDecks: [],
    channelLang: "en",
    schedule: [],
    template: "",
    status: "connected",
    enabled: true,
    uploadsToday: 0,
    createdAt: "",
    ytChannelTitle: null,
    ytChannelId: null,
    ytChannelAvatar: null,
    slotVideos: {},
    slotDecks: {},
    avatar: null,
    avatarSource: "youtube",
    oauthClientId: null,
    authError: null,
    authFailedAt: null,
  };
}

function deps(availableByDeck: Record<string, number> = {}): RouteDeps {
  return {
    deckAccess: {
      accountSourceDecks: (a: Account) => a.sourceDecks,
      availableUnusedForDecks: (_ownerId: number, deckIds: string[]) =>
        deckIds.reduce((sum, deckId) => sum + (availableByDeck[deckId] ?? 999), 0),
    },
  } as unknown as RouteDeps;
}

function db(): Db {
  return {
    getSetting: () => null,
    hasFeature: () => false,
    listVideos: () => [] as Video[],
  } as unknown as Db;
}

test("thematic block generation keeps source mix stable but varies order per channel", () => {
  const dbMock = db();
  const depsMock = deps();
  const first = thematicBlockDeckSequenceForGeneration(dbMock, depsMock, 1, account(101), FOREIGN_EN_SOURCES, 12);
  const second = thematicBlockDeckSequenceForGeneration(dbMock, depsMock, 1, account(202), FOREIGN_EN_SOURCES, 12);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.length, 12);
  assert.equal(second.length, 12);
  const allowed = new Set(FOREIGN_EN_SOURCES);
  assert.ok(first.every((deckId) => allowed.has(deckId)));
  assert.ok(second.every((deckId) => allowed.has(deckId)));
  assert.notDeepEqual(first, second);
});

test("thematic block generation skips exhausted sources and removed optical packs", () => {
  const sources = [...FOREIGN_EN_SOURCES, "visual-riddles-en", "illusions-en"];
  const acc = { ...account(303), sourceDecks: sources };
  const sequence = thematicBlockDeckSequenceForGeneration(
    db(),
    deps({
      "fact-en": 0,
      "illusions-en": 0,
    }),
    1,
    acc,
    sources,
    20,
  );

  assert.ok(sequence);
  assert.equal(sequence.length, 20);
  assert.ok(!sequence.includes("fact-en"));
  assert.ok(!sequence.includes("visual-riddles-en"));
  assert.ok(!sequence.includes("illusions-en"));
  assert.ok(sequence.every((deckId) => FOREIGN_EN_SOURCES.includes(deckId)));
});

test("thematic block schedule falls back when one source has no ready or free cards", () => {
  const acc = {
    ...account(313),
    schedule: ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"],
  };
  const slotDecks = thematicBlockSlotDecksForAccount(db(), deps({ "fact-en": 0 }), acc, acc.schedule, FOREIGN_EN_SOURCES);

  assert.ok(slotDecks);
  assert.equal(Object.keys(slotDecks).length, acc.schedule.length);
  assert.ok(!Object.values(slotDecks).includes("fact-en"));
  assert.ok(Object.values(slotDecks).every((deckId) => FOREIGN_EN_SOURCES.includes(deckId)));
});

test("block top-up redistributes missing videos away from a depleted source", () => {
  const acc = {
    ...account(404),
    sourceDecks: ["alpha", "beta"],
    channelLang: "en",
    schedule: ["00:00", "12:00"],
    slotDecks: {},
  };
  const block = {
    id: "test",
    title: "Test",
    description: "",
    rules: [],
    accountIds: [acc.id],
    sourceGroups: [
      { id: "alpha", title: "Alpha", defaultWeight: 3, sources: { en: ["alpha"] } },
      { id: "beta", title: "Beta", defaultWeight: 1, sources: { en: ["beta"] } },
    ],
  } satisfies Parameters<typeof planChannelBlockNormalize>[0]["block"];

  const plan = planChannelBlockNormalize({
    db: db(),
    deps: deps({ alpha: 1, beta: 20 }),
    block,
    blockId: block.id,
    accounts: [acc],
    sourceWeights: { alpha: 3, beta: 1 },
    requestedTargetRunwayDays: 2,
    fallbackOwnerId: 1,
  });

  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0]?.total, 4);
  assert.equal(plan.jobs[0]?.deckIds.filter((deckId) => deckId === "alpha").length, 1);
  assert.equal(plan.jobs[0]?.deckIds.filter((deckId) => deckId === "beta").length, 3);
  assert.deepEqual(plan.shortages, []);
});

test("source gap warnings only report scheduled empty or depleted sources", () => {
  const gaps = sourceGapsForScheduledDecks(
    [
      { id: "alpha", name: "Alpha", groupId: "a", groupTitle: "Alpha group", available: 12 },
      { id: "beta", name: "Beta", groupId: "b", groupTitle: "Beta group", available: 0 },
      { id: "gamma", name: "Gamma", groupId: "g", groupTitle: "Gamma group", available: 0 },
    ],
    { alpha: 2, beta: 1, gamma: 0 },
    { alpha: 0, beta: 5, gamma: 0 },
  );

  assert.deepEqual(gaps, [
    {
      deckId: "alpha",
      deckName: "Alpha group",
      groupId: "a",
      groupTitle: "Alpha group",
      queued: 0,
      available: 12,
      postsPerDay: 2,
      reason: "empty_queue",
    },
    {
      deckId: "beta",
      deckName: "Beta group",
      groupId: "b",
      groupTitle: "Beta group",
      queued: 5,
      available: 0,
      postsPerDay: 1,
      reason: "no_free_cards",
    },
  ]);
});

test("source weight settings are canonicalized and stale groups are pruned", () => {
  const dbStore = openDb(":memory:");
  dbStore.setSetting(
    "superAdmin.channelBlock.quotes.sourceWeights",
    JSON.stringify({
      static_facts: 9,
      fact_video: 1,
      visual_riddles: 4,
      mind_flip: 2,
      jokes: 3,
      memes: 2,
    }),
  );
  dbStore.setSetting(
    "superAdmin.channelBlock.jokes_memes.sourceWeights",
    JSON.stringify({
      visual_riddles: 1,
      jokes: 6,
      memes: 3,
    }),
  );
  dbStore.setSetting(
    "superAdmin.channelBlock.riddles_illusions.sourceWeights",
    JSON.stringify({
      visual_riddles: 1,
      mind_flip: 2,
    }),
  );

  normalizeSourceWeightSettings(dbStore);

  const normalized = JSON.parse(dbStore.getSetting("superAdmin.channelBlock.quotes.sourceWeights") ?? "{}") as Record<string, number>;
  assert.equal(normalized.static_facts, 9);
  assert.equal(normalized.jokes, 3);
  assert.equal(normalized.memes, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "visual_riddles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "mind_flip"), false);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.jokes_memes.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.riddles_illusions.sourceWeights"), null);
  dbStore.db.close();
});
