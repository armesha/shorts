import assert from "node:assert/strict";
import test from "node:test";
import { cutsFromSilence, extendEndToSilence, snapSectionEndsToAudio } from "./video-cutting-audio.ts";

test("a sound after the last word keeps the clip open until the audio goes quiet", async () => {
  assert.equal(extendEndToSilence(10, [0.05], 20), 10);
  assert.equal(extendEndToSilence(10, [1.5], 20), 11.7);
  assert.equal(extendEndToSilence(10, [], 14), 14);
  let calls = 0;
  const snapped = await snapSectionEndsToAudio(
    [{ start: 0, end: 10 }, { start: 40, end: 50 }],
    60,
    async () => (++calls === 1 ? "silence_start: 2.0" : "silence_start: 0.1"),
  );
  assert.equal(snapped[0].end, 12.2);
  assert.equal(snapped[1].start, 40);
  assert.equal(snapped[1].end, 50);
  const pieces = cutsFromSilence(600, [140, 300, 455], 3, 5);
  assert.ok(pieces.length >= 3 && pieces.length <= 5);
  assert.equal(pieces[0].start, 0);
  assert.equal(pieces.at(-1)?.end, 600);
  assert.ok(pieces.some((piece) => piece.end === 140 || piece.end === 300 || piece.end === 455));
});
