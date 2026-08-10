import test from "node:test";
import assert from "node:assert/strict";
import { SUPER_ADMIN_USERNAME } from "../auth.ts";
import { openDb } from "../db.ts";
import { makeDeckAccess } from "../services/deck-access.ts";
import { CIRCLE_DECK_ID, circleTemplateDeckId } from "../services/circle-templates.ts";
import { MANUAL_VIDEO_DECK } from "../services/manual-videos.ts";
import { canPostVideoDeckForAccount, canPrepareLibraryForAccount, visibleLibraryDeckIds } from "./videos.ts";

const deps = {
  isAdminReq: () => true,
  isSuperAdminReq: () => true,
};

test("post-now source guard rejects removed/retired decks for armen even if stored on an old channel", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: SUPER_ADMIN_USERNAME, passHash: "x", role: "admin", isSuperAdmin: true });
  const access = makeDeckAccess(db, deps);
  const account = db.createAccount({
    userId: armen.id,
    channelName: "Old armen channel",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en", "illusions-en", "pack:motivation-en-superadmin"],
  });

  const selectedSources = access.accountSourceDecks(account);

  assert.deepEqual(selectedSources, ["en"]);
  assert.equal(canPostVideoDeckForAccount("en", selectedSources), true);
  assert.equal(canPostVideoDeckForAccount(MANUAL_VIDEO_DECK, selectedSources), true);
  assert.equal(canPostVideoDeckForAccount("illusions-en", selectedSources), false);
  assert.equal(canPostVideoDeckForAccount("pack:motivation-en-superadmin", selectedSources), false);
});

test("video library visibility excludes globally hidden unused pack rows", () => {
  const db = openDb(":memory:");
  try {
    const account = db.createAccount({
      userId: 1,
      channelName: "Library visibility",
      lang: "ru",
      channelLang: "ru",
      sourceDecks: ["ru"],
      schedule: ["12:00"],
    });
    const hidden = db.createVideo({
      accountId: account.id,
      title: "Hidden",
      text: "Hidden",
      bg: "",
      music: "",
      deck: "fact-en",
      videoRel: "library/hidden.mp4",
      imageRel: "library/hidden.png",
    });
    const visible = db.createVideo({
      accountId: account.id,
      title: "Visible",
      text: "Visible",
      bg: "",
      music: "",
      deck: "ru",
      videoRel: "library/visible.mp4",
      imageRel: "library/visible.png",
    });
    const circle = db.createVideo({
      accountId: account.id,
      title: "Circle",
      text: "Circle",
      bg: "",
      music: "",
      deck: circleTemplateDeckId("test-template"),
      videoRel: "library/circle.mp4",
      imageRel: null,
    });

    const deckIds = visibleLibraryDeckIds(db);

    assert.equal(deckIds.has(MANUAL_VIDEO_DECK), true);
    assert.equal(deckIds.has(CIRCLE_DECK_ID), true);
    assert.equal(deckIds.has(circleTemplateDeckId("test-template")), true);
    assert.equal(deckIds.has("ru"), true);
    assert.equal(deckIds.has("fact-en"), false);
    assert.deepEqual(
      db.listVideos(account.id).filter((video) => deckIds.has(video.deck)).map((video) => video.id),
      [circle.id, visible.id],
    );
    assert.equal(db.listVideos(account.id).some((video) => video.id === hidden.id), true);
  } finally {
    db.db.close();
  }
});

test("super-admin can prepare a disconnected channel library without enabling publishing", () => {
  assert.equal(canPrepareLibraryForAccount({ status: "connected" }, false), true);
  assert.equal(canPrepareLibraryForAccount({ status: "draft" }, false), false);
  assert.equal(canPrepareLibraryForAccount({ status: "draft" }, true), true);
});
