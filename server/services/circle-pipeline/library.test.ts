import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CircleLibrary } from "./library.ts";

test("durably reserves two distinct slots and isolates owners", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-library-"));
  try {
    const now = Date.parse("2026-10-31T12:00:00Z");
    const library = new CircleLibrary(dir);
    const claims = await Promise.all([library.claim(1, now), library.claim(1, now)]);
    const first = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1);
    await library.update(1, first.id, "running");
    await assert.rejects(library.update(2, first.id, "ready", { messageId: 1 }));
    await library.update(1, first.id, "ready", { messageId: 1 });
    const second = (await library.claim(1, now))!;
    assert.equal(second.slot, 1);
    const restored = new CircleLibrary(dir);
    assert.equal((await restored.list(1)).find(j => j.id === second.id)?.state, "failed");
    assert.equal((await restored.list(2)).length, 0);
    assert.equal((await restored.claim(1, now))?.id, second.id);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
