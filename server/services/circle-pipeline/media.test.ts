import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareCircleEvidence, validateRenderedCircle } from "./media.ts";

test("extracts timestamp-ordered frames and speech-ready audio from real video", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-evidence-"));
  try {
    const source = join(dir, "source.mp4");
    execFileSync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
      "color=c=red:s=96x96:r=10:d=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
      "-c:v", "mpeg4", "-c:a", "aac", "-shortest", source]);
    const evidence = await prepareCircleEvidence(source, join(dir, "review"));
    assert.equal(evidence.frames.length, 3);
    assert.ok(evidence.frames[0].endsWith("0001.jpg"));
    assert.ok(evidence.audio);
    assert.ok((await stat(evidence.audio)).size > 1000);
    await assert.rejects(validateRenderedCircle(source, 3, true), /verification/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("rejects invalid source instead of declaring it safe", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-invalid-"));
  try { await assert.rejects(prepareCircleEvidence(join(dir, "missing.mp4"), join(dir, "review"))); }
  finally { await rm(dir, { recursive: true, force: true }); }
});
