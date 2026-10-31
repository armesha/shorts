import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mapBannerFilter, rawMapFingerprint } from "./render.ts";
import { mapSubtitles } from "./theme.ts";
import { METRICS } from "./sources.ts";

test("looping banner ends when the map video ends", async () => {
  const dir = await mkdtemp(join(tmpdir(), "map-banner-"));
  try {
    const subs = join(dir, "subs.ass");
    await writeFile(subs, mapSubtitles({ themeId: "forest", title: "Вопрос?", hook: "Вопрос?", reason: "Тест" }, METRICS[0], 1));
    const result = spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=s=64x64:r=10:d=1", "-f", "lavfi", "-i", "anullsrc", "-f", "lavfi", "-i", "color=red:s=20x20:r=10", "-filter_complex", mapBannerFilter(subs, dir, "", "format=rgba"), "-map", "[out]", "-f", "null", "-"], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("raw render fingerprint changes with scene or map data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "map-scene-"));
  try {
    const index = join(dir, "index.html");
    await writeFile(index, "scene one");
    const first = await rawMapFingerprint({ id: "test", value: 1 }, dir);
    assert.equal(await rawMapFingerprint({ id: "test", value: 1 }, dir), first);
    assert.notEqual(await rawMapFingerprint({ id: "test", value: 2 }, dir), first);
    await writeFile(index, "scene two");
    assert.notEqual(await rawMapFingerprint({ id: "test", value: 1 }, dir), first);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
