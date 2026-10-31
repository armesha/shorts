import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processCircleCandidate } from "./process.ts";

test("only an accepted transcript and visual review can reach rendering", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-process-"));
  try {
    let renders = 0;
    const deps = {
      prepare: async () => ({ duration: 2, frames: ["frame.jpg"], audio: "audio.wav" }),
      transcribe: async () => ({ text: "hello", language: "ru" }),
      review: async () => ({ verdict: "borderline" as const, reasons: ["uncertain"] }),
      render: async (_source: string, target: string) => { renders++; await writeFile(target, "video"); },
      validate: async () => {},
    };
    const rejected = await processCircleCandidate({ source: "in.mp4", directory: join(dir, "a"), messageId: 123 }, deps);
    assert.equal(rejected.verdict, "borderline");
    assert.equal(renders, 0);
    const accepted = await processCircleCandidate({ source: "in.mp4", directory: join(dir, "b"), messageId: 124 },
      { ...deps, review: async () => ({ verdict: "accept", reasons: [] }) });
    assert.equal(renders, 1);
    assert.equal(await readFile(accepted.video!, "utf8"), "video");
    const review = JSON.parse(await readFile(join(dir, "b", "review.json"), "utf8"));
    assert.equal(review.source, "https://t.me/kruglyashiki/124");
    await assert.rejects(processCircleCandidate({ source: "in.mp4", directory: join(dir, "c"), messageId: 125 },
      { ...deps, review: async () => ({ verdict: "accept", reasons: [] }), validate: async () => { throw new Error("invalid video"); } }));
    await assert.rejects(readFile(join(dir, "c", "video.mp4")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
