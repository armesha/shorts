import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import { renderCircleVideo } from "./circle-video-renderer.ts";

test("built-in circle renderer produces a vertical MP4 with circle audio", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-circle-render-"));
  const previous = process.env.TG_CIRCLES_DIR;
  process.env.TG_CIRCLES_DIR = root;
  try {
    assert.ok(ffmpegPath);
    const source = resolve(root, "source.mp4");
    const gameplay = resolve(root, "gameplay.mp4");
    const output = resolve(root, "output", "render.mp4");

    const sourceResult = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=red:s=320x320:r=30:d=0.7",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=0.7",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", source,
    ], { encoding: "utf8" });
    assert.equal(sourceResult.status, 0, sourceResult.stderr);

    const gameplayResult = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=1.2",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      gameplay,
    ], { encoding: "utf8" });
    assert.equal(gameplayResult.status, 0, gameplayResult.stderr);

    const rendered = await renderCircleVideo({
      sourceFile: source,
      gameplayFile: gameplay,
      outputFile: output,
      durationOverrideSec: 0.45,
      encoderPreset: "ultrafast",
      layout: {
        circle: { x: 130, y: 300, size: 820 },
        puzzle: { x: 90, y: 92, width: 900, labelSize: 30, puzzleSize: 68, gap: 14 },
        banner: { x: 90, y: 830, width: 900, height: 260, startSeconds: 0, repeatEverySeconds: 0 },
      },
    });
    assert.equal(existsSync(output), true);
    assert.equal(rendered.file, output);
    assert.match(rendered.puzzle, /= \?$/);

    const inspected = spawnSync(ffmpegPath, [
      "-hide_banner", "-i", output,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
    ], { encoding: "utf8" });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.match(inspected.stderr, /1080x1920/);
    assert.match(inspected.stderr, /\bAudio:\s/);
  } finally {
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
