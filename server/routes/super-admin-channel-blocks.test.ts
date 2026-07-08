import assert from "node:assert/strict";
import test from "node:test";
import type { Account, Db, Video } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import {
  BLOCKS,
  addableLanguageDefsForBlock,
  blockDefaultSourcesForDb,
  planChannelBlockNormalize,
  normalizeSourceWeightSettings,
  sourceGapsForScheduledDecks,
  thematicBlockDeckSequenceForGeneration,
  thematicBlockSlotDecksForAccount,
  visibleLanguageDefsForAccounts,
} from "./super-admin-channel-blocks.ts";
import { openDb } from "../db.ts";

const FOREIGN_EN_SOURCES = [
  "en",
  "pack:new-memes-en-superadmin",
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
    timezone: "Europe/Prague",
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

function video(id: number, accountId: number, deck: string): Video {
  return {
    id,
    accountId,
    title: `Video ${id}`,
    text: "",
    bg: "",
    music: "",
    deck,
    videoRel: "",
    imageRel: null,
    tags: [],
    postCount: 0,
    lastPostedAt: null,
    createdAt: "",
  };
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

test("single block has localized joke and meme sources and retires armen's fact, quote and psychology videos", () => {
  const dbMock = db();
  const expected: Record<string, string[]> = {
    ar: ["ar", "pack:new-memes-ar-superadmin"],
    ru: ["ru", "pack:new-memes-ru-superadmin"],
    en: ["en", "pack:new-memes-en-superadmin"],
    de: ["de", "pack:new-memes-de-superadmin"],
    it: ["it", "pack:new-memes-it-superadmin"],
    es: ["pack:chistes-es-public-domain", "pack:new-memes-es-superadmin"],
    pl: ["pack:dowcipy-pl-mit", "pack:new-memes-pl-superadmin"],
    fr: ["fr", "pack:new-memes-fr-superadmin"],
    pt: ["pt", "pack:new-memes-pt-superadmin"],
    ro: ["ro", "pack:new-memes-ro-superadmin"],
    cs: ["cs", "pack:new-memes-cs-superadmin"],
    nl: ["nl", "pack:new-memes-nl-superadmin"],
  };
  for (const [lang, sources] of Object.entries(expected)) {
    assert.deepEqual(blockDefaultSourcesForDb(dbMock, "quotes", lang), sources);
  }
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "russian", "ru"), expected.ru);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "religion", "ar"), expected.ar);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "islam", "ar"), expected.ar);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "christianity", "en"), expected.en);
  assert.equal(BLOCKS.some((block) => block.id === "russian"), false);
  assert.equal(BLOCKS.some((block) => block.id === "religion"), false);
});

test("legacy religion aliases do not expose religious sources", () => {
  const dbMock = db();

  const sources = blockDefaultSourcesForDb(dbMock, "religion", "ar");
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "islam", "ar"), sources);
  assert.deepEqual(sources, ["ar", "pack:new-memes-ar-superadmin"]);
  assert.equal(sources.includes("islamic"), false);
  assert.equal(sources.includes("islamic-quotes-ar"), false);
  assert.equal(sources.includes("islamic-facts-ar"), false);
  assert.equal(blockDefaultSourcesForDb(dbMock, "christianity", "en").includes("christian"), false);
  assert.equal(blockDefaultSourcesForDb(dbMock, "christianity", "en").includes("prayers-en"), false);
});

test("thematic block generation skips exhausted sources and retired packs", () => {
  const sources = [...FOREIGN_EN_SOURCES, "visual-riddles-en", "illusions-en", "pack:motivation-en-superadmin"];
  const acc = { ...account(303), sourceDecks: sources };
  const sequence = thematicBlockDeckSequenceForGeneration(
    db(),
    deps({ "illusions-en": 0 }),
    1,
    acc,
    sources,
    20,
  );

  assert.ok(sequence);
  assert.equal(sequence.length, 20);
  assert.ok(!sequence.includes("visual-riddles-en"));
  assert.ok(!sequence.includes("illusions-en"));
  assert.ok(!sequence.includes("pack:motivation-en-superadmin"));
  assert.ok(sequence.every((deckId) => FOREIGN_EN_SOURCES.includes(deckId)));
});

test("thematic block schedule falls back when one source has no ready or free cards", () => {
  const acc = {
    ...account(313),
    schedule: ["00:00", "03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "21:00"],
  };
  const slotDecks = thematicBlockSlotDecksForAccount(db(), deps({ en: 0 }), acc, acc.schedule, FOREIGN_EN_SOURCES);

  assert.ok(slotDecks);
  assert.equal(Object.keys(slotDecks).length, acc.schedule.length);
  assert.ok(!Object.values(slotDecks).includes("en"));
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

test("block top-up fills source gaps even when total channel runway is already enough", () => {
  const acc = {
    ...account(405),
    sourceDecks: ["alpha", "beta"],
    channelLang: "en",
    schedule: ["00:00", "06:00", "12:00", "18:00"],
    slotDecks: {
      "00:00": "alpha",
      "06:00": "beta",
      "12:00": "alpha",
      "18:00": "beta",
    },
  };
  const block = {
    id: "test",
    title: "Test",
    description: "",
    rules: [],
    accountIds: [acc.id],
    sourceGroups: [
      { id: "alpha", title: "Alpha", defaultWeight: 1, sources: { en: ["alpha"] } },
      { id: "beta", title: "Beta", defaultWeight: 1, sources: { en: ["beta"] } },
    ],
  } satisfies Parameters<typeof planChannelBlockNormalize>[0]["block"];
  const dbMock = {
    ...db(),
    listVideos: (accountId: number) => [
      video(1, accountId, "beta"),
      video(2, accountId, "beta"),
      video(3, accountId, "beta"),
      video(4, accountId, "beta"),
    ],
  } as unknown as Db;

  const plan = planChannelBlockNormalize({
    db: dbMock,
    deps: deps({ alpha: 20, beta: 20 }),
    block,
    blockId: block.id,
    accounts: [acc],
    sourceWeights: { alpha: 1, beta: 10 },
    requestedTargetRunwayDays: 1,
    fallbackOwnerId: 1,
  });

  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0]?.total, 2);
  assert.deepEqual(plan.jobs[0]?.deckIds, ["alpha", "alpha"]);
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

test("visible thematic languages follow armen's actual channel languages", () => {
  const langs = visibleLanguageDefsForAccounts([
    { ...account(1), channelLang: "ru", lang: "ru" },
    { ...account(2), channelLang: "de", lang: "de" },
    { ...account(3), channelLang: "pt", lang: "pt" },
  ]).map((lang) => lang.code);

  assert.deepEqual(langs, ["ru", "de", "pt"]);
  assert.ok(!langs.includes("hi"));
  assert.ok(!langs.includes("id"));
});

test("prepared block languages are addable before a first channel exists", () => {
  const langs = addableLanguageDefsForBlock(db(), "quotes", []).map((lang) => lang.code);

  assert.ok(langs.includes("pl"));
  assert.ok(langs.includes("ja"));
  assert.ok(langs.includes("ro"));
  assert.ok(langs.includes("cs"));
  assert.ok(langs.includes("nl"));
  assert.ok(!langs.includes("hi"));
  assert.ok(!langs.includes("id"));
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "pl"), ["pack:dowcipy-pl-mit", "pack:new-memes-pl-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "ro"), ["ro", "pack:new-memes-ro-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "cs"), ["cs", "pack:new-memes-cs-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "nl"), ["nl", "pack:new-memes-nl-superadmin"]);
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
      motivation: 1,
      jokes: 6,
      memes: 2,
    }),
  );
  dbStore.setSetting(
    "superAdmin.channelBlock.russian.sourceWeights",
    JSON.stringify({
      jokes: 7,
      fact_video: 1,
      video_quotes: 2,
      static_quotes: 3,
      memes: 2,
      psychology: 2,
    }),
  );
  dbStore.setSetting(
    "superAdmin.channelBlock.religion.sourceWeights",
    JSON.stringify({
      islam: 3,
      islamic_quotes: 1,
      islamic_facts: 1,
      kjv_bible: 2,
      christian_prayers: 1,
      christian_quotes: 1,
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
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "static_facts"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "fact_video"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "video_quotes"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "static_quotes"), false);
  assert.equal(normalized.jokes, 6);
  assert.equal(normalized.memes, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "psychology"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "motivation"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "visual_riddles"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "mind_flip"), false);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.religion.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.jokes_memes.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.riddles_illusions.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.russian.sourceWeights"), null);
  dbStore.db.close();
});
