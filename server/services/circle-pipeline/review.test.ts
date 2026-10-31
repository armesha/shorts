import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reviewCircleEvidence } from "./review.ts";

test("reviews every batch with the requested model and retains the strictest decision", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-review-"));
  try {
    const batches: number[] = [];
    const result = await reviewCircleEvidence({ directory: dir, frames: Array.from({ length: 21 }, (_, i) => join(dir, `${i}.jpg`)),
      transcript: "тест", audioPresent: true,
      run: async (_bin, args, options) => {
        assert.equal(args[args.indexOf("--model") + 1], "gpt-6.1-terra");
        assert.ok(args.includes('model_reasoning_effort="medium"'));
        assert.ok(options.stdin?.includes("тест"));
        assert.ok(options.stdin?.includes("Остальные кадры проверяются отдельно"));
        batches.push(args.filter(arg => arg === "--image").length);
        await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({
          verdict: batches.length === 2 ? "borderline" : "accept", reasons: batches.length === 2 ? ["uncertain"] : [],
        }));
        return "";
      } });
    assert.deepEqual(batches, [10, 10, 1]);
    assert.equal(result.verdict, "borderline");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("missing transcript or malformed review cannot pass", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-review-"));
  try {
    await assert.rejects(reviewCircleEvidence({ directory: dir, frames: ["x"], transcript: "", audioPresent: true }), /transcription/);
    await assert.rejects(reviewCircleEvidence({ directory: dir, frames: ["x"], transcript: "", audioPresent: false,
      run: async (_bin, args) => { await writeFile(args[args.indexOf("--output-last-message") + 1], "{}"); return ""; } }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
