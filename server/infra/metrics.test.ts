import { test } from "node:test";
import assert from "node:assert/strict";
import * as metrics from "./metrics.ts";

test("track increments active during run, decrements after", async () => {
  assert.equal(metrics.activeCounts().render, 0);
  let mid = -1;
  await metrics.track("render", async () => {
    mid = metrics.activeCounts().render;
  });
  assert.equal(mid, 1);
  assert.equal(metrics.activeCounts().render, 0);
});

test("track decrements even when the task throws", async () => {
  await assert.rejects(
    metrics.track("upload", async () => {
      throw new Error("boom");
    }),
  );
  assert.equal(metrics.activeCounts().upload, 0);
});

test("concurrent tasks of the same kind are counted", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const p1 = metrics.track("render", () => gate);
  const p2 = metrics.track("render", () => gate);
  assert.equal(metrics.activeCounts().render, 2); // both incremented synchronously
  release();
  await Promise.all([p1, p2]);
  assert.equal(metrics.activeCounts().render, 0);
});

test("snapshot exposes live fields, history array and active counters", () => {
  const s = metrics.snapshot();
  assert.equal(typeof s.now.uptimeSec, "number");
  assert.ok(s.now.memTotalMb > 0);
  assert.ok(Array.isArray(s.now.loadavg) && s.now.loadavg.length === 3);
  assert.equal(typeof s.now.cpuPct, "number");
  assert.ok(s.now.cpuPct >= 0 && s.now.cpuPct <= 100);
  assert.ok(s.hardware);
  assert.ok("tempC" in s.hardware);
  assert.ok("fanRpm" in s.hardware);
  assert.ok(Array.isArray(s.hardware.sensors));
  assert.ok(Array.isArray(s.history));
  assert.deepEqual(Object.keys(s.active).sort(), ["render", "upload"]);
});

test("scheduler heartbeat records timestamps", () => {
  metrics.noteSchedulerTick();
  metrics.notePost();
  const s = metrics.snapshot();
  assert.equal(typeof s.scheduler.lastTickAt, "number");
  assert.equal(typeof s.scheduler.lastPostAt, "number");
});

test("startSampler is idempotent and does not throw", () => {
  metrics.startSampler(process.cwd());
  metrics.startSampler(process.cwd());
  assert.ok(Array.isArray(metrics.snapshot().history));
});
