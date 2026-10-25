import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  activeCuttingJobs,
  assertNoActiveCuttingJobs,
} from "./cutting-restart-guard.mjs";

test("restart guard blocks an active render and permits completed jobs", () => {
  const parent = resolve("tmp/restart-guard-tests");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(resolve(parent, "run-"));
  const dir = resolve(
    root,
    "data/video-cutting/u2/12345678-1234-1234-1234-123456789012",
  );
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(
      resolve(dir, "job.json"),
      JSON.stringify({ status: "rendering", progress: 61, clips: [{}] }),
    );
    assert.equal(activeCuttingJobs(root)[0].readyClips, 1);
    assert.throws(() => assertNoActiveCuttingJobs(root), /Restart blocked/);
    for (const status of ["completed", "failed", "cancelled"]) {
      writeFileSync(resolve(dir, "job.json"), JSON.stringify({ status }));
      assert.doesNotThrow(() => assertNoActiveCuttingJobs(root));
    }
    writeFileSync(resolve(dir, "job.json"), "{");
    assert.throws(() => assertNoActiveCuttingJobs(root), /Cannot verify/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
