import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.ts";

// Atomic card claim (H1: anti double-spend). Two concurrent generation paths must not both build
// the same card — the loser of the claim re-picks; a released card becomes claimable again.
test("claimAnecdote: first claim wins, a second loses, release reopens it", () => {
  const db = openDb(":memory:");
  assert.equal(db.claimAnecdote(1, "k1"), true, "first claim succeeds");
  assert.equal(db.claimAnecdote(1, "k1"), false, "second claim of the same user+key loses → no double-spend");
  assert.equal(db.claimAnecdote(2, "k1"), true, "a different user has an independent pool");
  db.releaseAnecdote(1, "k1");
  assert.equal(db.claimAnecdote(1, "k1"), true, "a released card can be claimed again");
});

// Atomic post claim (H2: anti double-post). post-now double-clicks and the scheduler must not
// upload the same library video twice — exactly one caller flips post_count 0→1.
test("claimVideoForPost: at-most-once, release re-enables", () => {
  const db = openDb(":memory:");
  const v = db.createVideo({
    accountId: 1,
    title: "t",
    text: "x",
    bg: "",
    music: "",
    deck: "ru",
    videoRel: "a.mp4",
    imageRel: null,
  });
  assert.equal(db.claimVideoForPost(v.id), true, "first poster wins");
  assert.equal(db.claimVideoForPost(v.id), false, "second poster loses → no double-post");
  assert.equal(db.getVideo(v.id)!.postCount, 1, "claim left exactly one in-flight count");
  db.releaseVideoPost(v.id);
  assert.equal(db.getVideo(v.id)!.postCount, 0, "release clears the in-flight count");
  assert.equal(db.claimVideoForPost(v.id), true, "after release it can be claimed again");
});

test("nextUnpostedVideoForDecks: seeded pick spreads identical queues", () => {
  const db = openDb(":memory:");
  const ids: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    ids.push(
      db.createVideo({
        accountId: 11,
        title: `t${i}`,
        text: `x${i}`,
        bg: "",
        music: "",
        deck: "ru",
        videoRel: `a${i}.mp4`,
        imageRel: null,
      }).id,
    );
  }

  assert.equal(db.nextUnpostedVideoForDecks(11, ["ru"])?.id, ids[0], "unseeded keeps the old FIFO pick");
  assert.equal(
    db.nextUnpostedVideoForDecks(11, ["ru"], "slot-a")?.id,
    db.nextUnpostedVideoForDecks(11, ["ru"], "slot-a")?.id,
    "same seed is stable",
  );

  const picked = new Set(
    Array.from({ length: 50 }, (_, i) => db.nextUnpostedVideoForDecks(11, ["ru"], `slot-${i}`)?.id).filter(Boolean),
  );
  assert.ok(picked.size > 1, "different slot/channel seeds should not collapse to the same FIFO item");
});

// Per-key daily upload counter (H5) — zero when there is no upload history for the key.
test("uploadsTodayForKey: zero without any upload history", () => {
  const db = openDb(":memory:");
  assert.equal(db.uploadsTodayForKey(7), 0);
});

test("account mapper treats auth_error as needing reconnect even when a token exists", () => {
  const db = openDb(":memory:");
  const acc = db.createAccount({ userId: 1, channelName: "Needs reconnect", lang: "en", channelLang: "en" });
  db.setYouTube(acc.id, { refreshToken: "refresh-token", channelId: "UCx", channelTitle: "Needs reconnect" });
  db.markAuthError(acc.id, "Доступ канала отозван", "2026-06-27T10:45:00.000Z");

  const current = db.getAccount(acc.id);
  assert.equal(current?.status, "needs_auth");
  assert.equal(current?.authError, "Доступ канала отозван");
});
