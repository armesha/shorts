import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CircleLibrary } from "./library.ts";
import { CircleHistory } from "./history.ts";
import { CircleRunner } from "./runner.ts";
import { UnreliableCircleSpeechError } from "./transcribe.ts";

test("skips uncertain speech, stores approved output and never reuses reviewed messages", async () => {
  const root = await mkdtemp(join(tmpdir(), "circle-runner-"));
  try {
    const library = new CircleLibrary(join(root, "library"));
    const history = new CircleHistory(join(root, "history"));
    const runner = new CircleRunner(library, history, {
      fetch: async input => {
        const id = [9, 8, 7].find(value => !input.exclude.includes(value));
        return id ? { items: [{ id, date: new Date().toISOString(), file: "source.mp4" }], nextBefore: id } : { items: [], nextBefore: 0 };
      },
      process: async input => {
        if (input.messageId === 9) throw new UnreliableCircleSpeechError("uncertain speech");
        await mkdir(input.directory, { recursive: true });
        const video = join(input.directory, "video.mp4");
        await writeFile(video, "approved");
        return { verdict: "accept", video };
      },
    });
    const now = Date.parse("2026-10-31T12:00:00Z");
    assert.equal(await runner.runOnce(1, now), true);
    assert.equal(await runner.runOnce(1, now), true);
    assert.equal(await runner.runOnce(1, now), false);
    const jobs = await library.list(1);
    assert.deepEqual(jobs.map(job => job.messageId), [7, 8]);
    assert.equal(await readFile(join(library.directory(jobs[0]), "video.mp4"), "utf8"), "approved");
    assert.deepEqual(await history.excluded(1), [9, 8, 7]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
