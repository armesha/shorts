import assert from "node:assert/strict";
import test from "node:test";
import {
  mfaJsonToRussianLipSync,
  normalizeRussianTranscript,
  phoneToRussianViseme,
} from "./russian-lipsync.ts";

test("normalizeRussianTranscript removes direction tags but keeps Russian speech", () => {
  assert.equal(
    normalizeRussianTranscript("[fast] Алло, здорово! [short pause] Чё делаешь?"),
    "Алло здорово Чё делаешь",
  );
});

test("phoneToRussianViseme maps Russian MFA phones to Oculus mouth shapes", () => {
  const expected = new Map([
    ["sil", "sil"],
    ["ɐ", "aa"],
    ["ʎː", "RR"],
    ["ɵ", "O"],
    ["z̪", "SS"],
    ["dʲ", "DD"],
    ["tɕ", "CH"],
    ["v", "FF"],
    ["mʲ", "PP"],
    ["ɲ", "nn"],
  ]);
  for (const [phone, viseme] of expected) assert.equal(phoneToRussianViseme(phone), viseme, phone);
});

test("mfaJsonToRussianLipSync keeps timing and merges adjacent equal visemes", () => {
  const timeline = mfaJsonToRussianLipSync(
    {
      end: 0.42,
      tiers: {
        phones: {
          entries: [
            [0, 0.03, "sil"],
            [0.03, 0.09, "ɐ"],
            [0.09, 0.16, "a"],
            [0.16, 0.28, "ʎː"],
            [0.28, 0.42, "ɵ"],
          ],
        },
      },
    },
    321.4,
  );

  assert.equal(timeline.durationSec, 0.42);
  assert.equal(timeline.alignmentMs, 321);
  assert.deepEqual(
    timeline.cues.map(({ start, end, viseme }) => ({ start, end, viseme })),
    [
      { start: 0, end: 0.03, viseme: "sil" },
      { start: 0.03, end: 0.16, viseme: "aa" },
      { start: 0.16, end: 0.28, viseme: "RR" },
      { start: 0.28, end: 0.42, viseme: "O" },
    ],
  );
});
