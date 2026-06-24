import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { resolveAudio } from "./video.ts";

test("resolveAudio: lifehack decks use their own audio pool unless explicitly silent", () => {
  const auto = resolveAudio(undefined, { lifehack: true });
  assert.match(auto.music, /^lifehacks\//);
  assert.ok(auto.audioPath, "expected an audio path");
  assert.ok(existsSync(auto.audioPath));

  const silent = resolveAudio("none", { lifehack: true });
  assert.equal(silent.music, "none");
  assert.equal(silent.audioPath, null);
});
