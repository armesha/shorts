import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  circleSourceStatsForUser,
  listAvailableCircleSourcesForUser,
  pickCircleSourceForUser,
  releaseCircleSourceForUser,
} from "./circle-source-library.ts";

async function sourceRoot(names: string[]): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "shorts-circle-sources-"));
  await mkdir(resolve(root, "downloads"), { recursive: true });
  for (const name of names) await writeFile(resolve(root, "downloads", name), name);
  return root;
}

test("circle sources are consumed once and do not restart after exhaustion", async () => {
  const names = ["circle-u7-a.mp4", "circle-u7-b.mp4", "circle-u7-c.mp4"];
  const root = await sourceRoot(names);
  try {
    assert.deepEqual(circleSourceStatsForUser(7, root), { total: 3, used: 0, available: 3 });
    const picked = await Promise.all([
      pickCircleSourceForUser(7, root),
      pickCircleSourceForUser(7, root),
      pickCircleSourceForUser(7, root),
    ]);
    assert.deepEqual([...new Set(picked)].sort(), names);
    assert.deepEqual(circleSourceStatsForUser(7, root), { total: 3, used: 3, available: 0 });
    assert.deepEqual(listAvailableCircleSourcesForUser(7, root), []);
    assert.equal(await pickCircleSourceForUser(7, root), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy rotation state is migrated without making generated sources free again", async () => {
  const names = ["circle-u7-a.mp4", "circle-u7-b.mp4", "circle-u7-c.mp4"];
  const root = await sourceRoot(names);
  try {
    await mkdir(resolve(root, ".runtime"), { recursive: true });
    await writeFile(
      resolve(root, ".runtime/source-rotation-u7.json"),
      `${JSON.stringify({ remaining: [names[2]], last: names[1] }, null, 2)}\n`,
    );

    assert.deepEqual(circleSourceStatsForUser(7, root), { total: 3, used: 2, available: 1 });
    assert.deepEqual(listAvailableCircleSourcesForUser(7, root), [names[2]]);
    assert.equal(await pickCircleSourceForUser(7, root), names[2]);
    assert.equal(await pickCircleSourceForUser(7, root), null);

    const stored = JSON.parse(
      await readFile(resolve(root, ".runtime/source-rotation-u7.json"), "utf8"),
    ) as { used?: string[] };
    assert.deepEqual([...(stored.used ?? [])].sort(), names);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed render can return a claimed circle source to the free pool", async () => {
  const names = ["circle-u7-a.mp4"];
  const root = await sourceRoot(names);
  try {
    assert.equal(await pickCircleSourceForUser(7, root), names[0]);
    assert.deepEqual(circleSourceStatsForUser(7, root), { total: 1, used: 1, available: 0 });
    await releaseCircleSourceForUser(7, names[0], root);
    assert.deepEqual(circleSourceStatsForUser(7, root), { total: 1, used: 0, available: 1 });
    assert.equal(await pickCircleSourceForUser(7, root), names[0]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
