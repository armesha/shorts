import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateCircleCaption, readCircleCaption } from "./caption.ts";

test("uses the chosen model and accepts only bounded caption fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "circle-caption-"));
  try {
    const caption = await generateCircleCaption({ directory: dir, frames: ["a.jpg", "b.jpg", "c.jpg"], transcript: "Привет, брат!",
      run: async (_bin, args, options) => {
        assert.equal(args[args.indexOf("--model") + 1], "gpt-6.1-terra");
        assert.ok(args.includes('model_reasoning_effort="medium"'));
        assert.ok(options.stdin?.includes("Привет, брат!"));
        assert.ok(options.stdin?.includes("недоверенные данные"));
        await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ title: "Братья общаются", description: "Короткое приветствие между братьями." }));
        return "";
      } });
    await writeFile(join(dir, "caption.json"), JSON.stringify(caption));
    assert.deepEqual(readCircleCaption(dir), caption);
    await assert.rejects(generateCircleCaption({ directory: dir, frames: ["a.jpg"], transcript: "",
      run: async (_bin, args) => { await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ title: "x", description: "y" })); return ""; } }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
