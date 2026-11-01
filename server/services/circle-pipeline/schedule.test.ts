import { test } from "node:test";
import assert from "node:assert/strict";
import { circleDay, circleGenerationStarted, circlePublicationSlot, claimCircleSlot, type CircleScheduleEntry } from "./schedule.ts";

test("claims two different slots per Moscow day", () => {
  const entries: CircleScheduleEntry[] = [];
  const now = Date.parse("2026-11-01T22:00:00Z");
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

test("uses Moscow dates independent of Prague daylight saving", () => {
  assert.equal(circleDay(Date.parse("2026-03-29T20:59:59Z")), "2026-03-29");
  assert.equal(circleDay(Date.parse("2026-03-29T21:00:00Z")), "2026-03-30");
  assert.equal(circleDay(Date.parse("2026-10-25T21:00:00Z")), "2026-10-26");
});

test("starts at 01:00 Moscow and posts at 10:00 and 18:00 Moscow", () => {
  for (const day of ["2026-07-01", "2026-11-02"]) {
    const midnight = Date.parse(`${day}T00:00:00Z`);
    assert.equal(circleGenerationStarted(midnight - 2 * 3600000 - 1), false);
    assert.equal(circleGenerationStarted(midnight - 2 * 3600000), true);
    assert.equal(circlePublicationSlot(midnight + 7 * 3600000), 0);
    assert.equal(circlePublicationSlot(midnight + 15 * 3600000), 1);
    assert.equal(circlePublicationSlot(midnight + 15 * 3600000 + 5 * 60000), null);
  }
});
