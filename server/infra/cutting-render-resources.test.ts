import test from "node:test";
import assert from "node:assert/strict";
import { cuttingRenderCommand, cuttingRenderCpuSet } from "./cutting-render-resources.ts";

test("cutting renders use at most two allowed CPUs, including restricted cpusets", () => {
  assert.equal(cuttingRenderCpuSet("0-7"), "6,7");
  assert.equal(cuttingRenderCpuSet("1,3,5,7"), "7");
  assert.equal(cuttingRenderCpuSet("4"), "4");
  assert.throws(() => cuttingRenderCpuSet("bad"));
});

test("only ffmpeg is wrapped with the render limit", () => {
  const normal = cuttingRenderCommand("yt-dlp", ["--version"]);
  assert.equal(normal.bin, "yt-dlp");
  if (process.platform === "linux") {
    const render = cuttingRenderCommand("ffmpeg", ["-version"]);
    assert.notEqual(render.bin, "ffmpeg");
    assert.ok(render.args.includes("ffmpeg"));
    assert.ok(render.args.includes("-c"));
  }
});
