import assert from "node:assert/strict";
import test from "node:test";
import type { Account, Db, Video } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import {
  BLOCKS,
  accountBelongsToBlock,
  addableLanguageDefsForBlock,
  blockDefaultSourcesForDb,
  planChannelBlockNormalize,
  normalizeSourceWeightSettings,
  sourceGapsForScheduledDecks,
  thematicBlockSlotDecksForAccount,
  visibleLanguageDefsForAccounts,
} from "./super-admin-channel-blocks.ts";
import { openDb } from "../db.ts";

const FOREIGN_EN_SOURCES = [
  "pack:new-memes-en-superadmin",
];

function account(id: number): Account {
  return {
    id,
    userId: 1,
    channelName: `Channel ${id}`,
    lang: "en",
    sourceDecks: FOREIGN_EN_SOURCES,
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

test("RU meme channel uses a dedicated 50/50 static and voiced publication block", () => {
  const voicedBlock = BLOCKS.find((block) => block.id === "voiced_memes_ru");
  const staticBlock = BLOCKS.find((block) => block.id === "quotes");
  assert.ok(voicedBlock);
  assert.ok(staticBlock);
  assert.equal(voicedBlock.allowAccountCreation, false);
  assert.deepEqual(blockDefaultSourcesForDb(db(), voicedBlock.id, "ru"), [
    "pack:new-memes-ru-superadmin",
    "voiced-memes-ru",
  ]);

  const voicedAccount = {
    ...account(7),
    lang: "voiced-memes-ru",
    channelLang: "ru",
    sourceDecks: ["pack:new-memes-ru-superadmin", "voiced-memes-ru"],
  };
  const staticAccount = {
    ...account(65),
    lang: "pack:new-memes-de-superadmin",
    channelLang: "de",
    sourceDecks: ["pack:new-memes-de-superadmin"],
  };

  assert.equal(accountBelongsToBlock(deps(), voicedBlock, voicedAccount), true);
  assert.equal(accountBelongsToBlock(deps(), staticBlock, voicedAccount), false);
  assert.equal(accountBelongsToBlock(deps(), voicedBlock, staticAccount), false);
  assert.equal(accountBelongsToBlock(deps(), staticBlock, staticAccount), true);

  const schedule = ["08:14", "11:12", "17:09", "17:20", "18:03", "18:36", "19:01", "19:26", "19:55", "20:35", "20:59", "21:24"];
  const slots = thematicBlockSlotDecksForAccount(db(), deps(), voicedAccount, schedule, voicedAccount.sourceDecks);
  assert.ok(slots);
  assert.equal(Object.values(slots).filter((deck) => deck === "pack:new-memes-ru-superadmin").length, 6);
  assert.equal(Object.values(slots).filter((deck) => deck === "voiced-memes-ru").length, 6);
});

test("RU meme slider weights immediately produce a matching slot mix", () => {
  const voicedAccount = {
    ...account(7),
    lang: "voiced-memes-ru",
    channelLang: "ru",
    sourceDecks: ["pack:new-memes-ru-superadmin", "voiced-memes-ru"],
  };
  const weightedDb = {
    ...db(),
    getSetting: () => JSON.stringify({ static_memes: 18, voiced_memes: 2 }),
  } as Db;
  const schedule = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
  const slots = thematicBlockSlotDecksForAccount(weightedDb, deps(), voicedAccount, schedule, voicedAccount.sourceDecks);

  assert.ok(slots);
  assert.equal(Object.values(slots).filter((deck) => deck === "pack:new-memes-ru-superadmin").length, 11);
  assert.equal(Object.values(slots).filter((deck) => deck === "voiced-memes-ru").length, 1);
});

test("static meme block exposes only the current localized meme pack", () => {
  const dbMock = db();
  const expected: Record<string, string[]> = {
    ar: ["pack:new-memes-ar-superadmin"],
    ru: ["pack:new-memes-ru-superadmin"],
    en: ["pack:new-memes-en-superadmin"],
    de: ["pack:new-memes-de-superadmin"],
    it: ["pack:new-memes-it-superadmin"],
    es: ["pack:new-memes-es-superadmin"],
    pl: ["pack:new-memes-pl-superadmin"],
    fr: ["pack:new-memes-fr-superadmin"],
    pt: ["pack:new-memes-pt-superadmin"],
    ro: ["pack:new-memes-ro-superadmin"],
    cs: ["pack:new-memes-cs-superadmin"],
    nl: ["pack:new-memes-nl-superadmin"],
  };
  for (const [lang, sources] of Object.entries(expected)) {
    assert.deepEqual(blockDefaultSourcesForDb(dbMock, "quotes", lang), sources);
  }
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "russian", "ru"), expected.ru);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "religion", "ar"), expected.ar);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "islam", "ar"), expected.ar);
  assert.deepEqual(blockDefaultSourcesForDb(dbMock, "christianity", "en"), expected.en);
  assert.ok(blockDefaultSourcesForDb(dbMock, "religion", "ar").every((source) => !source.includes("islam")));
  assert.ok(blockDefaultSourcesForDb(dbMock, "christianity", "en").every((source) => !source.includes("christian")));
  assert.equal(BLOCKS.some((block) => block.id === "russian"), false);
  assert.equal(BLOCKS.some((block) => block.id === "religion"), false);
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
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "pl"), ["pack:new-memes-pl-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "ro"), ["pack:new-memes-ro-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "cs"), ["pack:new-memes-cs-superadmin"]);
  assert.deepEqual(blockDefaultSourcesForDb(db(), "quotes", "nl"), ["pack:new-memes-nl-superadmin"]);
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
  assert.deepEqual(normalized, { memes: 2 });
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.religion.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.jokes_memes.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.riddles_illusions.sourceWeights"), null);
  assert.equal(dbStore.getSetting("superAdmin.channelBlock.russian.sourceWeights"), null);
  dbStore.db.close();
});
