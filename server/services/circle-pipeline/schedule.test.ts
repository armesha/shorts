import { test } from "node:test";
import assert from "node:assert/strict";
import { circleDay, claimCircleSlot, type CircleScheduleEntry } from "./schedule.ts";

test("claims at most two distinct slots per local calendar day", () => {
  const entries: CircleScheduleEntry[] = [];
  const now = Date.parse("2026-10-31T12:00:00Z");
  const first = claimCircleSlot(entries, now)!;
  assert.equal(first.slot, 0);
  assert.equal(claimCircleSlot(entries, now), null);
  first.state = "ready";
  const second = claimCircleSlot(entries, now)!;
  assert.equal(second.slot, 1);
  second.state = "failed";
  assert.equal(claimCircleSlot(entries, now), second);
  second.state = "ready";
  assert.equal(claimCircleSlot(entries, now), null);
  assert.equal(claimCircleSlot(entries, now + 86400000)!.slot, 0);
});

test("uses Prague midnight across summer and winter time changes", () => {
  assert.equal(circleDay(Date.parse("2026-03-29T21:59:59Z")), "2026-03-29");
  assert.equal(circleDay(Date.parse("2026-03-29T22:00:00Z")), "2026-03-30");
  assert.equal(circleDay(Date.parse("2026-10-25T22:59:59Z")), "2026-10-25");
  assert.equal(circleDay(Date.parse("2026-10-25T23:00:00Z")), "2026-10-26");
});
