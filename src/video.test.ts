import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { getDeck } from "./anecdotes/decks.ts";
import { listAudio, resolveAudio } from "./video.ts";

test("resolveAudio: lifehack decks use their own audio pool unless explicitly silent", () => {
  const auto = resolveAudio(undefined, { lifehack: true });
  assert.match(auto.music, /^lifehacks\//);
  assert.ok(auto.audioPath, "expected an audio path");
  assert.ok(existsSync(auto.audioPath));

  const silent = resolveAudio("none", { lifehack: true });
  assert.equal(silent.music, "none");
  assert.equal(silent.audioPath, null);
});

test("resolveAudio: joke decks use the joke audio pool unless explicitly silent", () => {
  const auto = resolveAudio(undefined, { audioProfile: "jokes" });
  assert.match(auto.music, /^anekdoty\//);
  assert.ok(auto.audioPath, "expected an audio path");
  assert.ok(existsSync(auto.audioPath));

  const silent = resolveAudio("none", { audioProfile: "jokes" });
  assert.equal(silent.music, "none");
  assert.equal(silent.audioPath, null);
});

test("resolveAudio: religious fact decks use themed audio pools", () => {
  const islamic = resolveAudio(undefined, getDeck("islamic-facts-ar"));
  assert.match(islamic.music, /^islamic\//);
  assert.ok(islamic.audioPath, "expected an Islamic audio path");
  assert.ok(existsSync(islamic.audioPath));

  const christian = resolveAudio(undefined, getDeck("christian-facts-en"));
  assert.match(christian.music, /^christian\//);
  assert.ok(christian.audioPath, "expected a Christian audio path");
  assert.ok(existsSync(christian.audioPath));
});

test("listAudio excludes reserved deck-specific audio pools", () => {
  const tracks = listAudio();
  assert.ok(!tracks.some((track) => /^anekdoty\//.test(track)), "joke tracks should stay out of the generic pool");
  assert.ok(!tracks.some((track) => /^memes\//.test(track)), "meme tracks should stay out of the generic pool");
  assert.ok(!tracks.some((track) => /^lifehacks\//.test(track)), "lifehack tracks should stay out of the generic pool");
});
