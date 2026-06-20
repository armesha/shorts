import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_DAILY_SCHEDULE_CAP, USER_DAILY_SCHEDULE_CAP, dailyScheduleLimitError } from "./account-limits.ts";

test("allows up to 20 scheduled videos on one channel", () => {
  assert.equal(ACCOUNT_DAILY_SCHEDULE_CAP, 20);
  assert.equal(dailyScheduleLimitError(20, 0), null);
  assert.equal(dailyScheduleLimitError(20, 72), null);
});

test("keeps the aggregate user schedule cap separate", () => {
  assert.equal(USER_DAILY_SCHEDULE_CAP, 92);
  assert.equal(dailyScheduleLimitError(2, 90), null);
});

test("rejects more than 20 scheduled videos on one channel", () => {
  assert.match(dailyScheduleLimitError(21, 0) ?? "", /Максимум 20 видео/);
});

test("rejects more than 92 scheduled videos across user channels", () => {
  assert.match(dailyScheduleLimitError(3, 90) ?? "", /Лимит 92 публикаций/);
  assert.match(dailyScheduleLimitError(3, 90) ?? "", /доступно 2/);
});
