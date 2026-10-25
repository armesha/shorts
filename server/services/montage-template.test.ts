import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ffmpeg from "ffmpeg-static";
import {
  renderMontageTemplate,
  validateMontageSegments,
} from "./montage-template.ts";

test(
  "montage validates time ranges and joins selected video and original audio",
  { timeout: 60000 },
  async () => {
    assert.throws(() => validateMontageSegments([]));
    assert.throws(() => validateMontageSegments([{ start: 3, end: 2 }]));
    assert.throws(() => validateMontageSegments([{ start: 0, end: 61 }]));
    const root = mkdtempSync(resolve(tmpdir(), "shorts-montage-"));
    const previous = process.env.TG_CIRCLES_DIR;
    process.env.TG_CIRCLES_DIR = root;
    try {
      mkdirSync(resolve(root, "downloads"));
      const source = "circle-u1-fixture.mp4";
      execFileSync(
        ffmpeg!,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=s=320x180:r=30:d=1",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=44100:duration=1",
          "-shortest",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          resolve(root, "downloads", source),
        ],
        { stdio: "pipe" },
      );
      await assert.rejects(() =>
        renderMontageTemplate({
          userId: 2,
          source,
          segments: [{ start: 0, end: 0.3 }],
          outputDir: root,
        }),
      );
      const result = await renderMontageTemplate({
        userId: 1,
        source,
        segments: [
          { start: 0, end: 0.2 },
          { start: 0.5, end: 0.8 },
        ],
        outputDir: root,
      });
      assert.ok(existsSync(resolve(root, result.videoRel)));
      assert.ok(Math.abs(result.durationSec - 0.5) < 0.01);
      let info = "";
      try {
        execFileSync(
          ffmpeg!,
          ["-hide_banner", "-i", resolve(root, result.videoRel)],
          { stdio: "pipe" },
        );
      } catch (error) {
        info = String((error as { stderr?: Buffer }).stderr || "");
      }
      assert.match(info, /1080x1920/);
      assert.match(info, /Audio:/);
      assert.match(info, /h264/);
    } finally {
      if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
      else process.env.TG_CIRCLES_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    }
  },
);
