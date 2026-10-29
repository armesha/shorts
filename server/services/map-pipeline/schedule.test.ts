import { test } from "node:test";
import assert from "node:assert/strict";
import { createCampaign, claimDay, recoverCampaign, DAY_MS, CAMPAIGN_DAYS } from "./schedule.ts";

test("campaign expires exactly after twenty days and never catches up missed days", () => {
  const start = Date.UTC(2026, 9, 28, 12);
  const campaign = createCampaign(1, start);
  assert.equal(claimDay(campaign, start - 1), null);
  const first = claimDay(campaign, start)!;
  assert.equal(first.day, 0);
  first.state = "ready";
  assert.equal(claimDay(campaign, start + 1), null);
  assert.equal(claimDay(campaign, start + 12 * DAY_MS)!.day, 12);
  recoverCampaign(campaign, start + 12 * DAY_MS + 1);
  assert.equal(claimDay(campaign, start + 12 * DAY_MS + 2), null);
  assert.equal(claimDay(campaign, start + CAMPAIGN_DAYS * DAY_MS), null);
  assert.equal(campaign.runs.length, 2);
});

test("restart preserves deadline, interrupted day, and explicit stop", () => {
  const start = Date.UTC(2026, 9, 28);
  const saved = createCampaign(2, start);
  claimDay(saved, start);
  const restored = JSON.parse(JSON.stringify(saved));
  recoverCampaign(restored, start + 1);
  assert.equal(restored.endsAt, saved.endsAt);
  assert.equal(restored.runs[0].state, "interrupted");
  assert.equal(claimDay(restored, start + 2), null);
  restored.stoppedAt = new Date(start + 3).toISOString();
  assert.equal(claimDay(restored, start + DAY_MS), null);
});

test("parallel work and corrupted deadlines fail closed", () => {
  const start = Date.UTC(2026, 9, 28);
  const campaign = createCampaign(1, start);
  claimDay(campaign, start);
  assert.equal(claimDay(campaign, start + DAY_MS), null);
  campaign.endsAt = new Date(start + 31 * DAY_MS).toISOString();
  assert.throws(() => claimDay(campaign, start + 1), /Invalid saved campaign/);
});

test("an explicit deadline includes November 19 in Prague and excludes November 20", () => {
  const campaign = createCampaign(1, Date.parse("2026-10-29T12:28:52.583Z"));
  campaign.endsAt = "2026-11-19T23:00:00.000Z";
  const last = claimDay(campaign, Date.parse("2026-11-19T22:59:59.999Z"));
  assert.ok(last);
  last.state = "ready";
  assert.equal(claimDay(campaign, Date.parse("2026-11-19T23:00:00.000Z")), null);
});
