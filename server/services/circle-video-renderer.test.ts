import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import { renderCircleVideo } from "./circle-video-renderer.ts";

function redFrameStats(frame: Buffer): { x: number; y: number; averageRed: number } {
  const width = 1080;
  let pixels = 0;
  let xTotal = 0;
  let yTotal = 0;
  let redTotal = 0;
  for (let offset = 0; offset + 2 < frame.length; offset += 3) {
    const red = frame[offset] || 0;
    const green = frame[offset + 1] || 0;
    const blue = frame[offset + 2] || 0;
    if (red < 10 || red < green * 1.6 || red < blue * 1.6) continue;
    const pixel = offset / 3;
    pixels += 1;
    xTotal += pixel % width;
    yTotal += Math.floor(pixel / width);
    redTotal += red;
  }
  assert.ok(pixels > 100_000, `expected a visible red circle, found ${pixels} red pixels`);
  return {
    x: xTotal / pixels,
    y: yTotal / pixels,
    averageRed: redTotal / pixels,
  };
}

test("built-in circle renderer produces an animated vertical MP4 with circle audio", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-circle-render-"));
  const previous = process.env.TG_CIRCLES_DIR;
  process.env.TG_CIRCLES_DIR = root;
  try {
    const ffmpeg = ffmpegPath;
    assert.ok(ffmpeg);
    const source = resolve(root, "source.mp4");
    const gameplay = resolve(root, "gameplay.mp4");
    const output = resolve(root, "output", "render.mp4");

    const sourceResult = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=red:s=320x320:r=30:d=1.3",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1.3",
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", source,
    ], { encoding: "utf8" });
    assert.equal(sourceResult.status, 0, sourceResult.stderr);

    const gameplayResult = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=360x640:r=30:d=1.8",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      gameplay,
    ], { encoding: "utf8" });
    assert.equal(gameplayResult.status, 0, gameplayResult.stderr);

    const rendered = await renderCircleVideo({
      sourceFile: source,
      gameplayFile: gameplay,
      outputFile: output,
      durationOverrideSec: 1.2,
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

    const inspected = spawnSync(ffmpeg, [
      "-hide_banner", "-i", output,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
    ], { encoding: "utf8" });
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.match(inspected.stderr, /1080x1920/);
    assert.match(inspected.stderr, /\bAudio:\s/);

    const frameAt = (time: number): Buffer => {
      const extracted = spawnSync(ffmpeg, [
        "-hide_banner", "-loglevel", "error",
        "-ss", String(time), "-i", output,
        "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
      ], { maxBuffer: 8 * 1024 * 1024 });
      assert.equal(extracted.status, 0, extracted.stderr.toString());
      return extracted.stdout;
    };
    const early = redFrameStats(frameAt(0.2));
    const late = redFrameStats(frameAt(0.95));
    assert.ok(late.x - early.x > 6, `expected horizontal float, got ${early.x} -> ${late.x}`);
    assert.ok(late.y - early.y > 4, `expected vertical float, got ${early.y} -> ${late.y}`);
    assert.ok(late.averageRed - early.averageRed > 100, "expected a one-second fade-in from black");
  } finally {
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
