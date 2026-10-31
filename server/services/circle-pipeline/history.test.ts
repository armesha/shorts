import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CircleHistory } from "./history.ts";

test("completed reviews are durable, unique, and scoped to their owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-history-"));
  try {
    const history = new CircleHistory(dir);
    const entry = { ownerId: 1, messageId: 42, verdict: "reject" as const, checkedAt: new Date().toISOString() };
    const writes = await Promise.allSettled([history.record(entry), history.record(entry)]);
    assert.equal(writes.filter(item => item.status === "fulfilled").length, 1);
    const restored = new CircleHistory(dir);
    assert.deepEqual(await restored.excluded(1), [42]);
    assert.deepEqual(await restored.excluded(2), []);
    assert.equal((await restored.flagged(1))[0].messageId, 42);
    assert.deepEqual(await restored.flagged(2), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
