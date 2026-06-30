import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db.ts";
import { selectScheduledVideoForSlot } from "./scheduler.ts";
import { MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";

test("scheduler falls back to other channel sources when the slot deck is empty", () => {
  const db = openDb(":memory:");
  const account = db.createAccount({
    channelName: "Fallback channel",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["fact-en", "en"],
    schedule: ["12:00"],
  });
  const updated = db.updateAccount(account.id, { slotDecks: { "12:00": "fact-en" } });
  assert.ok(updated);
  const ready = db.createVideo({
    accountId: account.id,
    title: "ready joke",
    text: "text",
    bg: "",
    music: "",
    deck: "en",
    videoRel: "ready.mp4",
    imageRel: null,
  });

  const selection = selectScheduledVideoForSlot(db, updated, "12:00", "2026-06-29");

  assert.equal(selection.fallback, true);
  assert.equal(selection.slotDeck, "fact-en");
  assert.equal(selection.video?.id, ready.id);
  assert.equal(selection.video?.deck, "en");
  assert.ok(selection.checkedDecks.includes("fact-en"));
  assert.ok(selection.checkedDecks.includes("en"));
});

test("super-admin scheduler can rarely consume retired soviet poster library videos without source binding", () => {
  const db = openDb(":memory:");
  const admin = db.createUser({ username: "armen", passHash: "x", role: "admin", isSuperAdmin: true });
  const account = db.createAccount({
    userId: admin.id,
    channelName: "RU",
    lang: "ru",
    channelLang: "ru",
    sourceDecks: ["ru"],
    schedule: ["12:00"],
  });
  db.createVideo({
    accountId: account.id,
    title: "regular",
    text: "text",
    bg: "",
    music: "",
    deck: "ru",
    videoRel: "regular.mp4",
    imageRel: null,
  });
  db.createVideo({
    accountId: account.id,
    title: "poster",
    text: "text",
    bg: "",
    music: "",
    deck: "pack:soviet-posters-ru",
    videoRel: "poster.mp4",
    imageRel: null,
  });

  let posterSelections = 0;
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    const selection = selectScheduledVideoForSlot(db, account, `${hh}:${mm}`, "2026-06-30");
    if (selection.video?.deck === "pack:soviet-posters-ru") posterSelections += 1;
  }

  assert.ok(posterSelections >= 90 && posterSelections <= 190, `poster selections: ${posterSelections}`);
});

test("super-admin scheduler can rarely consume retired foreign motivation library videos without source binding", () => {
  const db = openDb(":memory:");
  const admin = db.createUser({ username: "armen", passHash: "x", role: "admin", isSuperAdmin: true });
  const account = db.createAccount({
    userId: admin.id,
    channelName: "EN",
    lang: "en",
    channelLang: "en",
    sourceDecks: ["en"],
    schedule: ["12:00"],
  });
  db.createVideo({
    accountId: account.id,
    title: "regular",
    text: "text",
    bg: "",
    music: "",
    deck: "en",
    videoRel: "regular.mp4",
    imageRel: null,
  });
  db.createVideo({
    accountId: account.id,
    title: "motivation",
    text: "text",
    bg: "",
    music: "",
    deck: "pack:motivation-en-superadmin",
    videoRel: "motivation.mp4",
    imageRel: null,
  });

  let motivationSelections = 0;
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const hh = String(Math.floor(minute / 60)).padStart(2, "0");
    const mm = String(minute % 60).padStart(2, "0");
    const selection = selectScheduledVideoForSlot(db, account, `${hh}:${mm}`, "2026-06-30");
    if (selection.video?.deck === "pack:motivation-en-superadmin") motivationSelections += 1;
  }

  assert.ok(motivationSelections >= 90 && motivationSelections <= 190, `motivation selections: ${motivationSelections}`);
});

test("retired library rotation does not override manual slots", () => {
  const db = openDb(":memory:");
  const admin = db.createUser({ username: "armen", passHash: "x", role: "admin", isSuperAdmin: true });
  const account = db.createAccount({
    userId: admin.id,
    channelName: "RU",
    lang: "ru",
    channelLang: "ru",
    sourceDecks: ["ru"],
    schedule: ["12:00"],
  });
  const updated = db.updateAccount(account.id, { slotDecks: { "12:00": MANUAL_VIDEO_DECK } });
  assert.ok(updated);
  db.createVideo({
    accountId: account.id,
    title: "poster",
    text: "text",
    bg: "",
    music: "",
    deck: "pack:soviet-posters-ru",
    videoRel: "poster.mp4",
    imageRel: null,
  });

  const selection = selectScheduledVideoForSlot(db, updated, "12:00", "2026-06-30");

  assert.equal(selection.video, null);
  assert.deepEqual(selection.checkedDecks, [MANUAL_VIDEO_DECK]);
});
