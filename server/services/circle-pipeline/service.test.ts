import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CirclePipelineService } from "./service.ts";

test("schedule activation and stopping survive a restart and remain owner scoped", async () => {
  const root = await mkdtemp(join(tmpdir(), "circle-service-"));
  let count = 0;
  const runner = { runOnce: async () => { count++; return false; } };
  try {
    const service = new CirclePipelineService({ root, runner, checkReady: () => true });
    await service.start();
    assert.equal(count, 0);
    await service.enable(1);
    await service.close();
    assert.equal(count, 1);
    const restored = new CirclePipelineService({ root, runner, checkReady: () => true });
    assert.equal((await restored.status(1)).enabled, true);
    assert.equal((await restored.status(2)).enabled, false);
    await assert.rejects(restored.disable(2));
    await restored.disable(1);
    await restored.start();
    await restored.close();
    assert.equal(count, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("schedule cannot start without a configured Telegram source", async () => {
  const root = await mkdtemp(join(tmpdir(), "circle-service-"));
  try {
    const service = new CirclePipelineService({ root, checkReady: () => false });
    await assert.rejects(service.enable(1), /not configured/);
    assert.equal((await service.status(1)).enabled, false);
    await service.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
