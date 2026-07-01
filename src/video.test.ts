import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { getDeck } from "./anecdotes/decks.ts";
import { listAudio, resolveAudio } from "./video.ts";

test("resolveAudio: joke decks use the joke audio pool unless explicitly silent", () => {
  const auto = resolveAudio(undefined, { audioProfile: "jokes" });
  assert.match(auto.music, /^anekdoty\//);
  assert.ok(auto.audioPath, "expected an audio path");
  assert.ok(existsSync(auto.audioPath));

  const silent = resolveAudio("none", { audioProfile: "jokes" });
  assert.equal(silent.music, "none");
  assert.equal(silent.audioPath, null);

  const explicitTrack = listAudio()[0];
  if (explicitTrack) {
    const explicit = resolveAudio(explicitTrack, { audioProfile: "jokes" });
    assert.equal(explicit.music, explicitTrack);
    assert.ok(explicit.audioPath, "expected the explicit audio path");
    assert.ok(existsSync(explicit.audioPath));
  }
});

test("resolveAudio: religious fact decks use melodic audio, not ambient/drone beds", () => {
  const islamic = resolveAudio(undefined, getDeck("islamic-facts-ar"));
  assert.doesNotMatch(islamic.music, /^(islamic|christian|illusions-3d|illusions-en)\//);
  assert.ok(islamic.audioPath, "expected an audio path");
  assert.ok(existsSync(islamic.audioPath));

  const christian = resolveAudio(undefined, getDeck("christian-facts-en"));
  assert.doesNotMatch(christian.music, /^(islamic|christian|illusions-3d|illusions-en)\//);
  assert.ok(christian.audioPath, "expected an audio path");
  assert.ok(existsSync(christian.audioPath));
});

test("listAudio excludes reserved deck-specific audio pools", () => {
  const tracks = listAudio();
  assert.ok(!tracks.some((track) => /^anekdoty\//.test(track)), "joke tracks should stay out of the generic pool");
  assert.ok(!tracks.some((track) => /^memes\//.test(track)), "meme tracks should stay out of the generic pool");
  assert.ok(!tracks.some((track) => /^(islamic|christian|illusions-3d|illusions-en)\//.test(track)), "non-music beds should stay out of the generic pool");
});
