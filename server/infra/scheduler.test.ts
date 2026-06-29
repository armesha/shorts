import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db.ts";
import { selectScheduledVideoForSlot } from "./scheduler.ts";

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
