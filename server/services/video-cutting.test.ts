import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
  CUTTING_MODEL,
  CutRequestSchema,
  cuttingAss,
  normalizeVideoUrl,
  parseVideoVtt,
  validateCutPlan,
} from "./video-cutting-plan.ts";
import {
  localPlannerArgs,
  probeCuttingMedia,
  renderCuttingPart,
  runCuttingProcess,
  russianSubtitleLanguage,
  takePrefetchedSource,
  waitForPrefetchedSource,
  VideoCuttingService,
  type ProcessRunner,
} from "./video-cutting.ts";
import type { Db } from "../db.ts";
import type { CircleAdvertiser } from "./circle-advertisers.ts";
import { overlayExistingCuttingBanner } from "./cutting-banner.ts";

async function temporary() {
  const parent = resolve(process.cwd(), "tmp/video-cutting-tests");
  await mkdir(parent, { recursive: true });
  return mkdtemp(resolve(parent, "run-"));
}
const request = () =>
  CutRequestSchema.parse({
    url: "https://youtu.be/iJH6dAG9NVk",
    mode: "manual",
    count: 2,
    sponsorBlock: false,
  });

test("video links are canonicalized and cannot address local or arbitrary hosts", () => {
  assert.equal(
    normalizeVideoUrl("https://youtu.be/iJH6dAG9NVk?si=123"),
    "https://www.youtube.com/watch?v=iJH6dAG9NVk",
  );
  assert.equal(
    normalizeVideoUrl("https://www.youtube.com/shorts/iJH6dAG9NVk"),
    "https://www.youtube.com/watch?v=iJH6dAG9NVk",
  );
  for (const url of [
    "http://127.0.0.1/a",
    "https://youtube.com.attacker.test/watch?v=iJH6dAG9NVk",
    "file:///etc/passwd",
    "https://youtube.com:8080/watch?v=iJH6dAG9NVk",
    "https://youtube.com/playlist?list=123",
    "https://user:pass@youtube.com/watch?v=iJH6dAG9NVk",
  ])
    assert.throws(() => normalizeVideoUrl(url));
});
test("only Russian caption tracks are selected", () => {
  assert.equal(russianSubtitleLanguage({ subtitles: { en: [{}] } }), undefined);
  assert.equal(russianSubtitleLanguage({ automatic_captions: { ru: [{}], "ru-orig": [{}] } }), "ru-orig");
  assert.equal(russianSubtitleLanguage({ subtitles: { ru: [{}] } }), "ru");
  assert.equal(russianSubtitleLanguage({ subtitles: { ru: [] }, automatic_captions: { ru: [{}] } }), "ru");
});
test("only a completed prefetch for the exact video is consumed", async () => {
  const root = await temporary();
  const cache = resolve(root, "prefetch", "iJH6dAG9NVk");
  const destination = resolve(root, "source.mp4");
  try {
    await mkdir(cache, { recursive: true });
    await writeFile(resolve(cache, "source.mp4"), "video");
    assert.equal(await takePrefetchedSource(root, "iJH6dAG9NVk", destination), false);
    await writeFile(resolve(cache, "ready.json"), JSON.stringify({ id: "other" }));
    await assert.rejects(takePrefetchedSource(root, "iJH6dAG9NVk", destination));
    await writeFile(resolve(cache, "ready.json"), JSON.stringify({ id: "iJH6dAG9NVk" }));
    assert.equal(await takePrefetchedSource(root, "iJH6dAG9NVk", destination), true);
    assert.equal(await readFile(destination, "utf8"), "video");
    assert.equal(await takePrefetchedSource(root, "iJH6dAG9NVk", destination), false);
    await writeFile(resolve(cache, "source.mp4"), "another video");
    await writeFile(resolve(cache, "ready.json"), JSON.stringify({ id: "iJH6dAG9NVk" }));
    await writeFile(resolve(cache, "pending.json"), JSON.stringify({ id: "iJH6dAG9NVk", pid: 999999 }));
    assert.equal(await waitForPrefetchedSource(root, "iJH6dAG9NVk", resolve(root, "second.mp4"), new AbortController().signal), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("manual counts, full coverage and ordered semantic plans are enforced", () => {
  assert.equal(
    CutRequestSchema.safeParse({
      url: "https://youtu.be/iJH6dAG9NVk",
      mode: "manual",
    }).success,
    false,
  );
  assert.equal(
    CutRequestSchema.safeParse({
      url: "https://youtu.be/iJH6dAG9NVk",
      mode: "auto",
    }).success,
    true,
  );
  const raw = {
    parts: [
      {
        start: 0,
        end: 7,
        title: "Первая тема",
        reason: "Завершена первая тема.",
      },
      {
        start: 7,
        end: 12,
        title: "Вторая тема",
        reason: "Начинается вторая тема.",
      },
    ],
  };
  assert.equal(validateCutPlan(raw, 12, request())[1].start, 7);
  assert.throws(() => validateCutPlan(raw, 12, { ...request(), count: 3 }));
  assert.throws(() =>
    validateCutPlan(
      { ...raw, parts: [raw.parts[0], { ...raw.parts[1], start: 8 }] },
      12,
      request(),
    ),
  );
  assert.throws(() => validateCutPlan(raw, 15, request()));
});
test("rolling captions retain first words and discard repeats and music markers", () => {
  const vtt =
    "WEBVTT\n\n00:00:00.000 --> 00:00:01.990 align:start\n \nПервое<00:00:01.000><c> слово</c>\n\n00:00:01.990 --> 00:00:02.000\nПервое слово\n \n\n00:00:02.000 --> 00:00:03.000\nПервое слово\n[музыка]\n";
  assert.deepEqual(
    parseVideoVtt(vtt).map((w) => w.text),
    ["Первое", "слово"],
  );
  assert.deepEqual(
    parseVideoVtt(
      "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nПервая строка\nВторая строка",
    ).map((w) => w.text),
    ["Первая", "строка", "Вторая", "строка"],
  );
  const ass = cuttingAss([{ start: 10, end: 11, text: "тест{\\pos(1,1)}" }], {
    number: 1,
    start: 10,
    end: 12,
    title: "Тест",
    reason: "Тест",
  });
  assert.ok(!ass.includes("{\\pos(1,1)}"));
  assert.match(ass, /0:00:00.00,0:00:00.70/);
});
test("local planner uses the requested model, reasoning and a read-only session", () => {
  const args = localPlannerArgs("/job");
  assert.equal(args[args.indexOf("--model") + 1], CUTTING_MODEL);
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.ok(args.includes("read-only"));
  assert.ok(args.includes("shell_tool"));
  assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
});
test("durable jobs isolate owners, block duplicates and cancel work", async () => {
  const root = await temporary();
  let started = false;
  const service = new VideoCuttingService({
    root,
    outputDir: root,
    execute: async (_job, signal) => {
      started = true;
      await new Promise<void>((_ok, reject) =>
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
    },
  });
  try {
    const job = await service.create(7, request());
    for (let i = 0; i < 100 && !started; i++) await delay(5);
    assert.equal(started, true);
    assert.equal(await service.get(8, job.id), null);
    assert.deepEqual(await service.list(8), []);
    await assert.rejects(() => service.create(7, request()), /текущей/);
    assert.equal(await service.cancel(8, job.id), null);
    assert.equal((await service.cancel(7, job.id))?.status, "cancelled");
    await delay(15);
    const restored = new VideoCuttingService({ root, outputDir: root });
    assert.equal((await restored.get(7, job.id))?.status, "cancelled");
    await restored.close();
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("unfinished jobs are marked interrupted after a server restart", async () => {
  const root = await temporary();
  const id = "12345678-1234-1234-1234-123456789012";
  await mkdir(resolve(root, "u7", id), { recursive: true });
  await writeFile(
    resolve(root, "u7", id, "job.json"),
    JSON.stringify({
      id,
      userId: 7,
      input: request(),
      status: "analyzing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clips: [],
      stage: "analysis",
      progress: 35,
    }),
  );
  const service = new VideoCuttingService({ root, outputDir: root });
  try {
    assert.equal((await service.get(7, id))?.status, "failed");
  } finally {
    await service.close();
    await rm(root, { recursive: true, force: true });
  }
});
test(
  "renderer preserves audio, repeats a short banner and produces a validated vertical clip",
  { timeout: 60_000 },
  async () => {
    const root = await temporary();
    const source = resolve(root, "source.mp4");
    const banner = resolve(root, "banner.png");
    const output = resolve(root, "final.mp4");
    try {
      let result = spawnSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=blue:s=320x180:r=25:d=2",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:duration=2",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-shortest",
          source,
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      result = spawnSync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=red:s=300x80",
          "-frames:v",
          "1",
          "-threads",
          "1",
          banner,
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      const part = {
        number: 1,
        start: 0.2,
        end: 1.2,
        title: "Тест",
        reason: "Тестовая сцена.",
      };
      const item = {
        id: "test",
        fullFrame: false,
        transparent: true,
      } as CircleAdvertiser;
      await renderCuttingPart({
        source,
        output,
        dir: root,
        part,
        words: [{ start: 0.3, end: 0.8, text: "Пример" }],
        subtitles: true,
        banner: { item, file: banner },
      });
      const info = await probeCuttingMedia(output);
      assert.equal(info.audio, true);
      assert.equal(info.width, 1080);
      assert.equal(info.height, 1920);
      assert.equal(info.fps, "30/1");
      assert.ok(Math.abs(info.duration - 1) < 0.1);
      const pixels = spawnSync("ffmpeg", [
        "-v",
        "error",
        "-ss",
        "0.9",
        "-i",
        output,
        "-vf",
        "crop=2:2:540:1500",
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]);
      assert.equal(pixels.status, 0);
      assert.ok(
        pixels.stdout[0] > 200 && pixels.stdout[2] < 40,
        "Banner remains red near the end of the clip",
      );
      assert.ok((await readFile(output)).includes(Buffer.from("moov")));
      const rebuild = { file: output, banner: { item, file: banner }, bannerHash: "fixture-hash", run: runCuttingProcess };
      assert.equal(await overlayExistingCuttingBanner(rebuild), "rebuilt");
      assert.equal(await overlayExistingCuttingBanner(rebuild), "already");
      assert.equal((await probeCuttingMedia(output)).audio, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "a background job joins acquisition, planning, real encoding and gallery persistence",
  { timeout: 60_000 },
  async () => {
    const root = await temporary();
    const fixture = resolve(root, "fixture.mp4");
    const gallery: unknown[] = [];
    const generated = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=blue:s=320x180:r=25:d=3",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=3",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-shortest",
        fixture,
      ],
      { encoding: "utf8" },
    );
    assert.equal(generated.status, 0, generated.stderr);
    const run: ProcessRunner = async (bin, args, options) => {
      if (bin.includes("yt-dlp")) {
        if (args.includes("--dump-single-json"))
          return JSON.stringify({
            title: "Две тестовые сцены",
            duration: 3,
            automatic_captions: { ru: [{}] },
          });
        if (args.includes("--skip-download"))
          await writeFile(
            resolve(options.cwd, "source.ru.vtt"),
            "WEBVTT\n\n00:00:00.000 --> 00:00:01.500\nПервая сцена\n\n00:00:01.500 --> 00:00:03.000\nВторая сцена",
          );
        else await copyFile(fixture, resolve(options.cwd, "source.mp4"));
        return "";
      }
      if (bin === "codex" || bin.endsWith("/codex")) {
        assert.ok(args.includes("gpt-6.1-sol"));
        assert.ok(args.includes('model_reasoning_effort="medium"'));
        await writeFile(
          resolve(options.cwd, "plan-result.json"),
          JSON.stringify({
            parts: [
              {
                start: 0,
                end: 1.5,
                title: "Первая сцена",
                reason: "Первая тема закончена.",
              },
              {
                start: 1.5,
                end: 3,
                title: "Вторая сцена",
                reason: "Новая тема.",
              },
            ],
          }),
        );
        return '{"type":"thread.started","thread_id":"test-session"}\n';
      }
      return runCuttingProcess(bin, args, options);
    };
    const service = new VideoCuttingService({
      root: resolve(root, "jobs"),
      outputDir: resolve(root, "output"),
      run,
      db: {
        createCreatorGalleryItem: (input: unknown) => gallery.push(input),
      } as unknown as Db,
    });
    try {
      const job = await service.create(7, request());
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
      assert.equal(current?.clips.length, 2);
      assert.equal(gallery.length, 2);
      assert.equal(current?.plan?.[1].start, 1.5);
      assert.equal(await service.get(8, job.id), null);
    } finally {
      await service.close();
      await delay(10);
      await rm(root, { recursive: true, force: true });
    }
  },
);
