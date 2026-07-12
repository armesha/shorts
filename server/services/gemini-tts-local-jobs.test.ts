import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { startGeminiTtsLocalJobRunner } from "./gemini-tts-local-jobs.ts";

test("local Gemini TTS runner turns a job file into a WAV without exposing credentials", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-tts-job-"));
  const runner = startGeminiTtsLocalJobRunner({
    rootDir: root,
    intervalMs: 60_000,
    generate: async (input) => ({
      model: "test",
      voice: input.voice,
      language: input.language,
      languageLabel: "Русский",
      transcript: input.text,
      mimeType: "audio/wav",
      audioDataUrl: `data:audio/wav;base64,${Buffer.from("RIFFtest").toString("base64")}`,
      durationSec: 1.25,
      inputChars: input.text.length,
      prompt: "",
    }),
  });
  try {
    writeFileSync(
      resolve(runner.directories.inbox, "001-vitek.json"),
      JSON.stringify({ id: "vitek-reaction", text: "Тест", language: "ru", voice: "Gacrux" }),
    );
    assert.equal(await runner.runOnce(), true);
    assert.equal(readFileSync(resolve(runner.directories.done, "vitek-reaction.wav"), "utf8"), "RIFFtest");
    const status = JSON.parse(readFileSync(resolve(runner.directories.done, "vitek-reaction.json"), "utf8"));
    assert.deepEqual(status, {
      id: "vitek-reaction",
      status: "completed",
      audioFile: "vitek-reaction.wav",
      durationSec: 1.25,
      voice: "Gacrux",
      language: "ru",
      completedAt: status.completedAt,
    });
  } finally {
    runner.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
