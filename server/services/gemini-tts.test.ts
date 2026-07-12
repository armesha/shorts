import test from "node:test";
import assert from "node:assert/strict";

import { buildGeminiTtsPrompt, pcmToWav } from "./gemini-tts.ts";

test("buildGeminiTtsPrompt keeps transcript language and director settings", () => {
  const prompt = buildGeminiTtsPrompt({
    text: "[laughs] Привет",
    language: "ru",
    voice: "Puck",
    style: "саркастично",
    pace: "быстро",
    accent: "московский русский",
    scene: "студия Shorts",
    energy: 4,
  });

  assert.match(prompt, /Language: Russian/);
  assert.match(prompt, /do not translate/i);
  assert.match(prompt, /Voice: Puck/);
  assert.match(prompt, /Energy: 4\/5/);
  assert.match(prompt, /\[laughs\] Привет/);
});

test("pcmToWav wraps raw 24kHz mono PCM in a playable RIFF header", () => {
  const pcm = Buffer.alloc(48_000);
  const wav = pcmToWav(pcm, { sampleRate: 24_000, channels: 1, sampleWidthBytes: 2 });

  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.readUInt32LE(24), 24_000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), pcm.length);
  assert.equal(wav.length, 44 + pcm.length);
});

test("buildGeminiTtsPrompt adds bounded individual meme direction without rewriting text", () => {
  const prompt = buildGeminiTtsPrompt({
    text: "Сначала всё было нормально. А потом пришёл кот.",
    language: "ru",
    voice: "Puck",
    autoMemeDirection: true,
  });

  assert.match(prompt, /INDIVIDUAL MEME DIRECTION/);
  assert.match(prompt, /Use at most two compatible reactions/);
  assert.match(prompt, /Do not force laughter/);
  assert.match(prompt, /Never add, remove, paraphrase, repeat, or comment/);
  assert.match(prompt, /Сначала всё было нормально\. А потом пришёл кот\./);
});
