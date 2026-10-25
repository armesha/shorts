import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  cleanSponsorWords,
  cuttingSourceRanges,
  fetchSponsorBlock,
  normalizeSponsorSegments,
  sponsorTimeline,
} from "./video-cutting-sponsorblock.ts";
import { CutRequestSchema } from "./video-cutting-plan.ts";
import {
  renderCuttingPart,
  runCuttingProcess,
  VideoCuttingService,
  type ProcessRunner,
} from "./video-cutting.ts";

const entry = (
  start: number,
  end: number,
  extra: Record<string, unknown> = {},
) => ({
  category: "sponsor",
  actionType: "skip",
  segment: [start, end],
  videoDuration: 10,
  ...extra,
});
async function temporary() {
  const base = resolve(process.cwd(), "tmp/video-cutting-sponsorblock");
  await mkdir(base, { recursive: true });
  return mkdtemp(resolve(base, "run-"));
}

test("only current sponsor skips are merged and clamped to the actual video", () => {
  const result = normalizeSponsorSegments(
    [
      entry(4, 6),
      entry(2, 5),
      entry(-1, 1),
      entry(9, 12),
      entry(6, 8, { category: "intro" }),
      entry(6, 8, { actionType: "mute" }),
      entry(6, 8, { videoDuration: 100 }),
      entry(8, 7),
      entry(0, 1, { segment: ["1", 2] }),
    ],
    10,
  );
  assert.deepEqual(result.segments, [
    { start: 0, end: 1 },
    { start: 2, end: 6 },
    { start: 9, end: 10 },
  ]);
  assert.equal(result.removedSeconds, 6);
  assert.equal(result.cleanDuration, 4);
  assert.equal(result.ignoredStale, 1);
  assert.equal(normalizeSponsorSegments([], 10).status, "not_found");
  assert.equal(
    CutRequestSchema.parse({
      url: "https://youtu.be/iJH6dAG9NVk",
      mode: "auto",
    }).sponsorBlock,
    true,
  );
});
test("subtitle and clip times share a cleaned timeline with ads at the beginning, middle and end", () => {
  const timeline = sponsorTimeline(10, [
    { start: 0, end: 1 },
    { start: 3, end: 5 },
    { start: 9, end: 10 },
  ]);
  assert.deepEqual(timeline, [
    { start: 1, end: 3, cleanStart: 0, cleanEnd: 2 },
    { start: 5, end: 9, cleanStart: 2, cleanEnd: 6 },
  ]);
  assert.deepEqual(
    cleanSponsorWords(
      [
        { start: 1.25, end: 1.75, text: "FIRST" },
        { start: 2.75, end: 3.25, text: "CROSSING" },
        { start: 4, end: 4.5, text: "AD" },
        { start: 5, end: 5.5, text: "SECOND" },
        { start: 8.5, end: 9, text: "LAST" },
      ],
      timeline,
    ),
    [
      { start: 0.25, end: 0.75, text: "FIRST" },
      { start: 2, end: 2.5, text: "SECOND" },
      { start: 5.5, end: 6, text: "LAST" },
    ],
  );
  assert.deepEqual(cuttingSourceRanges(1.5, 3, timeline), [
    { start: 2.5, end: 3 },
    { start: 5, end: 6 },
  ]);
});
test("SponsorBlock distinguishes no matches, API failures and cancellation", async (context) => {
  let lastUrl = "";
  const fake = context.mock.method(globalThis, "fetch", async (input: any) => {
    lastUrl = String(input);
    return new Response(
      JSON.stringify([
        { videoID: "other-video", segments: [entry(0, 10)] },
        { videoID: "iJH6dAG9NVk", segments: [entry(2, 3)] },
      ]),
      { status: 200 },
    );
  });
  const signal = new AbortController().signal;
  assert.equal(
    (await fetchSponsorBlock("iJH6dAG9NVk", 10, signal)).removedSeconds,
    1,
  );
  const url = new URL(lastUrl);
  assert.match(url.pathname, /\/api\/skipSegments\/[a-f0-9]{4}$/);
  assert.deepEqual(JSON.parse(url.searchParams.get("categories")!), [
    "sponsor",
  ]);
  fake.mock.mockImplementation(async () => new Response(null, { status: 404 }));
  assert.equal(
    (await fetchSponsorBlock("iJH6dAG9NVk", 10, signal)).status,
    "not_found",
  );
  fake.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(
    () => fetchSponsorBlock("iJH6dAG9NVk", 10, signal),
    /Не удалось проверить SponsorBlock/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => fetchSponsorBlock("iJH6dAG9NVk", 10, controller.signal),
    { name: "AbortError" },
  );
});

async function sourceFixture(path: string) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=blue:s=320x180:r=30:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=red:s=320x180:r=30:d=1",
      "-f",
      "lavfi",
      "-i",
      "color=green:s=320x180:r=30:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:duration=1",
      "-filter_complex_threads",
      "1",
      "-filter_complex",
      "[0:v][3:a][1:v][4:a][2:v][5:a]concat=n=3:v=1:a=1[v][a]",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      path,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
}
test(
  "a part crossing an ad removes both its red frames and its audio",
  { timeout: 60_000 },
  async () => {
    const root = await temporary();
    const source = resolve(root, "source.mp4"),
      output = resolve(root, "clean.mp4");
    try {
      await sourceFixture(source);
      const timeline = sponsorTimeline(3, [{ start: 1, end: 2 }]);
      await renderCuttingPart({
        source,
        output,
        dir: root,
        part: {
          number: 1,
          start: 0,
          end: 2,
          title: "Test",
          reason: "Two scenes",
        },
        words: [],
        subtitles: false,
        timeline,
      });
      for (const [position, channel] of [
        [0.5, 2],
        [1.5, 1],
      ]) {
        const pixels = spawnSync("ffmpeg", [
          "-v",
          "error",
          "-ss",
          String(position),
          "-i",
          output,
          "-vf",
          "crop=2:2:500:900",
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          "-",
        ]);
        assert.equal(pixels.status, 0);
        assert.ok(pixels.stdout[channel] > 80);
        assert.ok(pixels.stdout[0] < 40, "Red sponsor frames were removed");
      }
      for (const [position, expected] of [
        [0.2, 440],
        [1.2, 660],
      ]) {
        const pcm = spawnSync("ffmpeg", [
          "-v",
          "error",
          "-ss",
          String(position),
          "-i",
          output,
          "-t",
          "0.5",
          "-vn",
          "-ac",
          "1",
          "-ar",
          "8000",
          "-f",
          "s16le",
          "-",
        ]);
        assert.equal(pcm.status, 0);
        let crossings = 0;
        for (let i = 2; i < pcm.stdout.length; i += 2)
          if (
            pcm.stdout.readInt16LE(i - 2) <= 0 &&
            pcm.stdout.readInt16LE(i) > 0
          )
            crossings++;
        const frequency = crossings / (pcm.stdout.length / 2 / 8000);
        assert.ok(
          Math.abs(frequency - expected) < 12,
          `Expected ${expected} Hz, got ${frequency}`,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
test(
  "background planning receives only cleaned speech and stores original ranges",
  { timeout: 60_000 },
  async () => {
    const root = await temporary(),
      fixture = resolve(root, "fixture.mp4");
    await sourceFixture(fixture);
    let checked = false;
    const run: ProcessRunner = async (bin, args, options) => {
      if (bin.includes("yt-dlp")) {
        if (args.includes("--dump-single-json"))
          return JSON.stringify({
            title: "Test",
            duration: 3,
            automatic_captions: { ru: [{}] },
          });
        if (args.includes("--skip-download"))
          await writeFile(
            resolve(options.cwd, "source.ru.vtt"),
            "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nПервая тема\n\n00:00:01.000 --> 00:00:02.000\nРЕКЛАМА\n\n00:00:02.000 --> 00:00:03.000\nВторая тема",
          );
        else await copyFile(fixture, resolve(options.cwd, "source.mp4"));
        return "";
      }
      if (bin === "codex" || bin.endsWith("/codex")) {
        assert.ok(!options.stdin!.includes("РЕКЛАМА"));
        assert.ok(options.stdin!.includes("2.000 seconds"));
        checked = true;
        await writeFile(
          resolve(options.cwd, "plan-result.json"),
          JSON.stringify({
            parts: [
              { start: 0, end: 1, title: "One", reason: "One" },
              { start: 1, end: 2, title: "Two", reason: "Two" },
            ],
          }),
        );
        return "";
      }
      return runCuttingProcess(bin, args, options);
    };
    const service = new VideoCuttingService({
      root: resolve(root, "jobs"),
      outputDir: resolve(root, "output"),
      run,
      sponsorLookup: async (_id, duration) =>
        normalizeSponsorSegments(
          [entry(1, 2, { videoDuration: duration })],
          duration,
        ),
    });
    try {
      const job = await service.create(7, {
        url: "https://youtu.be/iJH6dAG9NVk",
        mode: "manual",
        count: 2,
      });
      let current = await service.get(7, job.id);
      for (
        let i = 0;
        i < 400 && current && !["failed", "completed"].includes(current.status);
        i++
      ) {
        await delay(25);
        current = await service.get(7, job.id);
      }
      assert.equal(current?.status, "completed", current?.error);
      assert.ok(checked);
      assert.equal(current?.originalDuration, 3);
      assert.equal(current?.duration, 2);
      assert.equal(current?.sponsorBlock?.removedSeconds, 1);
      assert.deepEqual(
        current?.clips.map((clip) => clip.sourceRanges),
        [[{ start: 0, end: 1 }], [{ start: 2, end: 3 }]],
      );
    } finally {
      await service.close();
      await delay(10);
      await rm(root, { recursive: true, force: true });
    }
  },
);
