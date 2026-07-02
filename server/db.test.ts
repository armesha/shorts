import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "./db.ts";
import { isSuperAdminUser } from "./auth.ts";

test("super-admin rights are data-driven, not username-driven", () => {
  const db = openDb(":memory:");
  const armen = db.createUser({ username: "armen", passHash: "x", role: "admin" });
  const owner = db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });

  assert.equal(isSuperAdminUser(armen), false, "username alone must not grant super-admin rights");
  assert.equal(isSuperAdminUser(owner), true, "admin with is_super_admin gets super-admin rights");
  assert.equal(isSuperAdminUser({ ...owner, role: "user" }), false, "super-admin flag requires admin role");
  assert.equal(db.getSuperAdminUser()?.id, owner.id);
});

test("users table enforces a single super-admin flag", () => {
  const db = openDb(":memory:");
  db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });

  assert.throws(
    () => db.createUser({ username: "other", passHash: "x", role: "admin", isSuperAdmin: true }),
    /UNIQUE|constraint/i,
  );
});

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

test("uploadsTodayForAccount counts today's real upload attempts for one channel", () => {
  const db = openDb(":memory:");
  const acc = db.createAccount({ userId: 1, channelName: "Daily cap", lang: "en", channelLang: "en" });
  db.addHistory({ accountId: acc.id, title: "published", status: "published" });
  db.addHistory({ accountId: acc.id, title: "scheduled", status: "scheduled" });
  db.addHistory({ accountId: acc.id, title: "failed", status: "failed" });

  assert.equal(db.uploadsTodayForAccount(acc.id), 2);
});

test("uploadsTodayForKey sticks to the upload-time Google key after channel rebind", () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "quota-keys", passHash: "x" });
  const key1 = db.addOAuthClient(user.id, {
    json: JSON.stringify({ installed: { client_id: "cid-1", project_id: "p1" } }),
    clientId: "cid-1",
    projectId: "p1",
  });
  const key2 = db.addOAuthClient(user.id, {
    json: JSON.stringify({ installed: { client_id: "cid-2", project_id: "p2" } }),
    clientId: "cid-2",
    projectId: "p2",
  });
  const acc = db.createAccount({ userId: user.id, channelName: "Rebind", lang: "en", channelLang: "en" });
  db.bindAccountOAuthClient(acc.id, key1.id);
  db.addHistory({ accountId: acc.id, title: "one", status: "published", oauthClientId: key1.id });
  db.bindAccountOAuthClient(acc.id, key2.id);

  assert.equal(db.uploadsTodayForKey(key1.id), 1);
  assert.equal(db.uploadsTodayForKey(key2.id), 0);
});

test("reserveDailyUploadQuota serializes account/key daily caps before history is written", () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "quota", passHash: "x" });
  const key = db.addOAuthClient(user.id, {
    json: JSON.stringify({ installed: { client_id: "cid", project_id: "p" } }),
    clientId: "cid",
    projectId: "p",
  });
  const acc = db.createAccount({ userId: user.id, channelName: "Quota", lang: "en", channelLang: "en" });
  db.bindAccountOAuthClient(acc.id, key.id);
  db.addHistory({ accountId: acc.id, title: "one", status: "published" });

  const first = db.reserveDailyUploadQuota({ accountId: acc.id, oauthClientId: key.id, accountCap: 2, keyCap: 2 });
  assert.equal(first.ok, true);
  const second = db.reserveDailyUploadQuota({ accountId: acc.id, oauthClientId: key.id, accountCap: 2, keyCap: 2 });
  assert.deepEqual(second, { ok: false, scope: "account", cap: 2, used: 2 });
  if (first.ok) db.releaseDailyUploadReservation(first.token);
});

test("reserveLibrarySlots counts existing videos, reservations and generation jobs", () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "library", passHash: "x" });
  const acc = db.createAccount({ userId: user.id, channelName: "Library", lang: "en", channelLang: "en" });
  db.createVideo({ accountId: acc.id, title: "v", text: "x", bg: "", music: "", deck: "en", videoRel: "v.mp4", imageRel: null });
  db.db
    .prepare(
      "INSERT INTO generation_jobs (id,user_id,owner_user_id,account_id,deck_ids,total,done,state,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run("job-1", user.id, user.id, acc.id, "[]", 1, 0, "queued", Date.now());

  const first = db.reserveLibrarySlots(acc.id, 3, 1);
  assert.equal(first.ok, true);
  const second = db.reserveLibrarySlots(acc.id, 3, 1);
  assert.equal(second.ok, false);
  if (first.ok) db.releaseLibraryReservation(first.token);
});

test("listVideosPage paginates, sorts and counts without loading the full library", () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "library-page", passHash: "x" });
  const acc = db.createAccount({ userId: user.id, channelName: "Paged Library", lang: "en", channelLang: "en" });
  db.createVideo({ accountId: acc.id, title: "Gamma", text: "x", bg: "", music: "", deck: "en", videoRel: "1.mp4", imageRel: null });
  db.createVideo({ accountId: acc.id, title: "Long", text: "x", bg: "", music: "", deck: "long-en", videoRel: "2.mp4", imageRel: null });
  db.createVideo({ accountId: acc.id, title: "Alpha", text: "x", bg: "", music: "", deck: "ru", videoRel: "3.mp4", imageRel: null });
  const beta = db.createVideo({ accountId: acc.id, title: "Beta", text: "x", bg: "", music: "", deck: "en", videoRel: "4.mp4", imageRel: null });
  db.createVideo({ accountId: acc.id, title: "Delta", text: "x", bg: "", music: "", deck: "en", videoRel: "5.mp4", imageRel: null });
  db.db.prepare("UPDATE videos SET post_count = 2 WHERE id = ?").run(beta.id);

  assert.equal(db.countVideosByAccount(acc.id), 5);
  assert.equal(db.countVideosByAccountFiltered(acc.id, { excludeDecks: ["long-en"] }), 4);
  assert.equal(db.countVideosByAccountFiltered(acc.id, { excludeDecks: ["long-en"], postCountGt: 1 }), 1);
  assert.deepEqual(db.videoDeckCountsForAccount(acc.id), { en: 3, "long-en": 1, ru: 1 });

  assert.deepEqual(
    db.listVideosPage({ accountId: acc.id, limit: 2, offset: 1, sort: "date", filter: { excludeDecks: ["long-en"] } }).map((v) => v.title),
    ["Beta", "Alpha"],
  );
  assert.deepEqual(
    db.listVideosPage({ accountId: acc.id, limit: 4, offset: 0, sort: "title", filter: { excludeDecks: ["long-en"] } }).map((v) => v.title),
    ["Alpha", "Beta", "Delta", "Gamma"],
  );
  assert.deepEqual(
    db.listVideosPage({ accountId: acc.id, limit: 3, offset: 0, sort: "posts", filter: { excludeDecks: ["long-en"] } }).map((v) => v.title),
    ["Delta", "Alpha", "Gamma"],
  );
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

// markAuthError returns the healthy→broken EDGE so the owner is alerted (inbox + Telegram) exactly once.
test("markAuthError fires only on the healthy→broken edge", () => {
  const db = openDb(":memory:");
  const acc = db.createAccount({ userId: 1, channelName: "Edge", lang: "en", channelLang: "en" });
  db.setYouTube(acc.id, { refreshToken: "tok", channelId: "UCy", channelTitle: "Edge" });

  // First failure on a clean channel → edge (notify).
  assert.equal(db.markAuthError(acc.id, "Доступ отозван", "2026-06-27T10:00:00.000Z"), true);
  // Already broken → no new edge (no re-notify on retries).
  assert.equal(db.markAuthError(acc.id, "Доступ отозван", "2026-06-27T10:01:00.000Z"), false);
  // Reconnect clears the flag → the next failure is a fresh edge again.
  db.clearAuthError(acc.id);
  assert.equal(db.markAuthError(acc.id, "Снова отозван", "2026-06-27T11:00:00.000Z"), true);
  // Unknown channel → never an edge.
  assert.equal(db.markAuthError(999_999, "—", "2026-06-27T11:00:00.000Z"), false);
});
