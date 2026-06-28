import assert from "node:assert/strict";
import test from "node:test";
import type { Account, Db, Video } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import { thematicBlockDeckSequenceForGeneration } from "./super-admin-channel-blocks.ts";

const FOREIGN_EN_SOURCES = [
  "pack:static-facts-en-superadmin",
  "fact-en",
  "visual-riddles-en",
  "illusions-3d-en",
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

function deps(): RouteDeps {
  return {
    deckAccess: {
      accountSourceDecks: (a: Account) => a.sourceDecks,
      availableUnusedForDecks: () => 999,
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
