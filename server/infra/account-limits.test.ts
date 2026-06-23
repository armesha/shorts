import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCOUNT_DAILY_SCHEDULE_CAP,
  ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP,
  USER_ACCOUNT_DAILY_SCHEDULE_CAP,
  USER_DAILY_SCHEDULE_CAP,
  accountDailyScheduleCap,
  dailyScheduleLimitError,
} from "./account-limits.ts";

test("per-channel cap depends on owner role: admin 20, everyone else 18", () => {
  assert.equal(ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP, 20);
  assert.equal(USER_ACCOUNT_DAILY_SCHEDULE_CAP, 18);
  assert.equal(ACCOUNT_DAILY_SCHEDULE_CAP, 20); // back-compat alias = admin ceiling
  assert.equal(accountDailyScheduleCap(true), 20);
  assert.equal(accountDailyScheduleCap(false), 18);
});

test("admin owner may schedule up to 20 videos on one channel", () => {
  assert.equal(dailyScheduleLimitError(20, 0, true), null);
  assert.equal(dailyScheduleLimitError(20, 72, true), null);
  assert.match(dailyScheduleLimitError(21, 0, true) ?? "", /Максимум 20 видео/);
});

test("non-admin owner is capped at 18 videos on one channel", () => {
  assert.equal(dailyScheduleLimitError(18, 0, false), null);
  assert.match(dailyScheduleLimitError(19, 0, false) ?? "", /Максимум 18 видео/);
  assert.match(dailyScheduleLimitError(20, 0, false) ?? "", /Максимум 18 видео/);
});

test("keeps the aggregate per-Google-key cap separate (role-agnostic)", () => {
  assert.equal(USER_DAILY_SCHEDULE_CAP, 92);
  assert.equal(dailyScheduleLimitError(2, 90, true), null);
  assert.equal(dailyScheduleLimitError(2, 90, false), null);
});

test("rejects more than 92 scheduled videos across one Google key", () => {
  assert.match(dailyScheduleLimitError(3, 90, true) ?? "", /Лимит 92 публикаций/);
  assert.match(dailyScheduleLimitError(3, 90, true) ?? "", /доступно 2/);
});
