import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_DAILY_SCHEDULE_CAP,
  ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP,
  MGS_ACCOUNT_DAILY_SCHEDULE_CAP,
  MGS_DAILY_SCHEDULE_CAP,
  MGS_LEGACY_USER_ID,
  SUPER_ADMIN_DAILY_SCHEDULE_CAP,
  USER_BATCH_VIDEO_CAP,
  USER_ACCOUNT_DAILY_SCHEDULE_CAP,
  USER_CHANNEL_LIBRARY_CAP,
  USER_DAILY_SCHEDULE_CAP,
  accountDailyScheduleCap,
  channelLibraryLimitError,
  channelLibraryVideoCap,
  dailyScheduleLimitError,
  forbiddenSuperAdminScheduleTimes,
  googleKeyDailyScheduleCap,
  isMgsUser,
  isSuperAdminScheduleTimeAllowed,
} from "./account-limits.ts";

test("per-channel cap depends on owner profile: admin 20, mgs 18, regular user 5", () => {
  assert.equal(ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP, 20);
  assert.equal(MGS_ACCOUNT_DAILY_SCHEDULE_CAP, 18);
  assert.equal(USER_ACCOUNT_DAILY_SCHEDULE_CAP, 5);
  assert.equal(ACCOUNT_DAILY_SCHEDULE_CAP, 20); // back-compat alias = admin ceiling
  assert.equal(accountDailyScheduleCap(true), 20);
  assert.equal(accountDailyScheduleCap(false, true), 18);
  assert.equal(accountDailyScheduleCap(false), 5);
});

test("admin owner may schedule up to 20 videos on one channel", () => {
  assert.equal(dailyScheduleLimitError(20, 0, true), null);
  assert.equal(dailyScheduleLimitError(20, 30, true), null);
  assert.match(dailyScheduleLimitError(21, 0, true) ?? "", /Максимум 20 видео/);
});

test("regular non-admin owner is capped at 5 videos on one channel", () => {
  assert.equal(dailyScheduleLimitError(5, 0, false), null);
  assert.match(dailyScheduleLimitError(6, 0, false) ?? "", /Максимум 5 видео/);
  assert.match(dailyScheduleLimitError(20, 0, false) ?? "", /Максимум 5 видео/);
});

test("mgs keeps the legacy non-admin scheduling profile", () => {
  assert.equal(isMgsUser({ id: MGS_LEGACY_USER_ID, username: "mgs" }), true);
  assert.equal(isMgsUser({ id: MGS_LEGACY_USER_ID, username: "MGS" }), true);
  assert.equal(isMgsUser({ id: MGS_LEGACY_USER_ID + 1, username: "mgs" }), false);
  assert.equal(isMgsUser({ username: "mgs" }), false);
  assert.equal(dailyScheduleLimitError(18, 70, false, false, true), null);
  assert.match(dailyScheduleLimitError(19, 0, false, false, true) ?? "", /Максимум 18 видео/);
  assert.match(dailyScheduleLimitError(3, 90, false, false, true) ?? "", /Лимит 92 публикаций/);
});

test("keeps the aggregate per-Google-key cap separate from per-channel caps", () => {
  assert.equal(USER_DAILY_SCHEDULE_CAP, 50);
  assert.equal(MGS_DAILY_SCHEDULE_CAP, 92);
  assert.equal(SUPER_ADMIN_DAILY_SCHEDULE_CAP, 100);
  assert.equal(googleKeyDailyScheduleCap(false), 50);
  assert.equal(googleKeyDailyScheduleCap(false, true), 92);
  assert.equal(googleKeyDailyScheduleCap(true), 100);
  assert.equal(dailyScheduleLimitError(2, 48, true), null);
  assert.equal(dailyScheduleLimitError(2, 48, false), null);
  assert.equal(dailyScheduleLimitError(10, 90, true, true), null);
});

test("rejects more than 50 scheduled videos across one regular Google key", () => {
  assert.match(dailyScheduleLimitError(3, 48, true) ?? "", /Лимит 50 публикаций/);
  assert.match(dailyScheduleLimitError(3, 48, true) ?? "", /доступно 2/);
});

test("allows super admin up to 100 scheduled videos across one Google key", () => {
  assert.equal(dailyScheduleLimitError(10, 90, true, true), null);
  assert.match(dailyScheduleLimitError(11, 90, true, true) ?? "", /Лимит 100 публикаций/);
  assert.match(dailyScheduleLimitError(11, 90, true, true) ?? "", /доступно 10/);
});

test("regular users can queue 10 videos at once and keep up to 50 videos in a channel library", () => {
  assert.equal(USER_BATCH_VIDEO_CAP, 10);
  assert.equal(USER_CHANNEL_LIBRARY_CAP, 50);
  assert.equal(channelLibraryVideoCap(false), 50);
  assert.equal(channelLibraryVideoCap(false, true), null);
  assert.equal(channelLibraryVideoCap(true), null);
  assert.equal(channelLibraryLimitError(49, 1, false), null);
  assert.match(channelLibraryLimitError(49, 2, false) ?? "", /максимум 50 видео/i);
});

test("super admin schedule window starts at 08:00", () => {
  assert.equal(isSuperAdminScheduleTimeAllowed("07:59"), false);
  assert.equal(isSuperAdminScheduleTimeAllowed("08:00"), true);
  assert.equal(isSuperAdminScheduleTimeAllowed("23:59"), true);
  assert.deepEqual(forbiddenSuperAdminScheduleTimes(["00:00", "07:59", "08:00", "12:00"]), ["00:00", "07:59"]);
});
