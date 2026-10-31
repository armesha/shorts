import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribeCircle } from "./transcribe.ts";

test("transcribes segments and fails closed on uncertain or missing speech", async () => {
  const result = await transcribeCircle("audio.wav", { run: async () => JSON.stringify({ language: "ru",
    languageProbability: 0.98, segments: [{ start: 0, end: 1, text: "Привет.",
      averageLogProbability: -0.3, noSpeechProbability: 0.01 }] }) });
  assert.equal(result.text, "Привет.");
  await assert.rejects(transcribeCircle("audio.wav", { run: async () => JSON.stringify({ language: "ru",
    languageProbability: 0.2, segments: [] }) }), /reliably/);
  await assert.rejects(transcribeCircle("audio.wav", { run: async () => JSON.stringify({ language: "ru",
    languageProbability: 0.98, segments: [{ start: 0, end: 1, text: "Неясно", averageLogProbability: -1.5,
      noSpeechProbability: 0.01 }] }) }), /reliably/);
  await assert.rejects(transcribeCircle("audio.wav", { run: async () => JSON.stringify({ language: "en",
    languageProbability: 0.98, segments: [{ start: 0, end: 1, text: "I", averageLogProbability: -0.3,
      noSpeechProbability: 0.01 }] }) }), /reliably/);
});
