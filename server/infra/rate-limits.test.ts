import assert from "node:assert/strict";
import test from "node:test";
import {
  RateLimitError,
  activeLimitCount,
  checkRateLimit,
  clearRateLimitStateForTest,
  heavyActiveKey,
  withActiveLimit,
} from "./rate-limits.ts";

test("fixed window allows only the configured number of hits", () => {
  clearRateLimitStateForTest();
  const rule = { limit: 2, windowMs: 1_000 };
  assert.equal(checkRateLimit("u:1:preview", rule, 10_000).ok, true);
  assert.equal(checkRateLimit("u:1:preview", rule, 10_100).ok, true);
  const blocked = checkRateLimit("u:1:preview", rule, 10_200);
  assert.equal(blocked.ok, false);
  assert.ok((blocked.retryAfterMs ?? 0) > 0);
  assert.equal(checkRateLimit("u:1:preview", rule, 11_001).ok, true);
});

test("active limit blocks concurrent heavy work and releases after finish", async () => {
  clearRateLimitStateForTest();
  const key = heavyActiveKey(7, false, "studio-video");
  let release!: () => void;
  const first = withActiveLimit(
    key,
    1,
    () =>
      new Promise<string>((resolve) => {
        release = () => resolve("done");
      }),
  );

  assert.equal(activeLimitCount(key), 1);
  await assert.rejects(() => withActiveLimit(key, 1, async () => "blocked"), RateLimitError);
  release();
  assert.equal(await first, "done");
  assert.equal(activeLimitCount(key), 0);
  assert.equal(await withActiveLimit(key, 1, async () => "next"), "next");
});

test("admin heavy key is shared process-wide", () => {
  assert.equal(heavyActiveKey(1, true, "studio-image"), heavyActiveKey(2, true, "pack-video"));
  assert.equal(heavyActiveKey(1, false, "studio-image"), heavyActiveKey(1, false, "pack-video"));
  assert.notEqual(heavyActiveKey(1, false, "studio-image"), heavyActiveKey(2, false, "studio-image"));
});
