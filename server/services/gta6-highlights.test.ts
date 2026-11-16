import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { assertChunkMinutes, assertLivePage, followGta6Live, liveChannelKey, recordLiveChunk, renderGta6Clip, runGta6Highlights, sourcePlansFromInputs } from "./gta6-highlights-media.ts";
import {
  GTA6_BANNER_ROBOT,
  GTA6_BANNER_SIM,
  GTA6_BANNER_TELEGRAM,
  GTA6_BOTTOM_UI_TOP,
  GTA6_HEIGHT,
  GTA6_RIGHT_COLUMN_LEFT,
  GTA6_WIDTH,
  baseGta6Lexicon,
  calibrateGta6,
  classifySpeech,
  createGta6Cursor,
  gta6Banners,
  gta6VideoFilter,
  highlightsFromChunks,
  type Gta6Chunk,
  type Gta6Label,
} from "./gta6-highlights.ts";

const PARAPHRASE = "ну это же дебютный показ шестой части";
const FALSE_FRIEND = "первый взгляд на гта 6 но это старый фейк";

test("ru and en reaction classes are kept and chatter or ads are dropped", () => {
  const lexicon = baseGta6Lexicon();
  const expected = [
    ["Это первый взгляд на гта 6", "first_look"],
    ["This is my first look at GTA 6", "first_look"],
    ["Впервые вижу гта шесть", "first_look"],
    ["Какая графика в гта 6", "graphics"],
    ["The graphics in GTA 6 are wild", "graphics"],
    ["The visuals in GTA VI are unreal", "graphics"],
    ["Смотри какая одежда в гта 6", "clothing"],
    ["Look at the clothes in GTA 6", "clothing"],
    ["That outfit in GTA6 is new", "clothing"],
  ] as const;
  for (const [text, name] of expected) assert.equal(classifySpeech(text, lexicon)?.class, name, text);
  for (const text of [
    "привет чат как настроение",
    "what should we eat after the stream",
    "гта 6 выйдет позже",
    "какая графика у этой карты",
    "промокод GTA6 и первый взгляд уже в описании",
    "subscribe and check the graphics in GTA 6",
    "подписывайся это первый взгляд на гта 6",
  ]) assert.equal(classifySpeech(text, lexicon), null, text);
});

test("calibration accepts a paraphrase, rejects a false friend, and repeats", () => {
  const base = baseGta6Lexicon();
  assert.equal(classifySpeech(PARAPHRASE, base), null);
  assert.equal(classifySpeech(FALSE_FRIEND, base)?.class, "first_look");
  const labels: Gta6Label[] = [
    { text: FALSE_FRIEND, accept: false, class: "first_look" },
    { text: PARAPHRASE, accept: true, class: "first_look" },
  ];
  const once = calibrateGta6(labels);
  const twice = calibrateGta6([...labels].reverse());
  const layered = calibrateGta6(labels, once);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, layered);
  assert.equal(classifySpeech(PARAPHRASE, once)?.class, "first_look");
  assert.equal(classifySpeech(FALSE_FRIEND, once), null);
  assert.equal(classifySpeech("Какая графика в гта 6", once)?.class, "graphics");
  assert.equal(classifySpeech("Это первый взгляд на гта 6", once)?.class, "first_look");
});

test("a closed chunk emits its highlight before a later chunk exists", () => {
  const early: Gta6Chunk = {
    sourceId: "ru-en",
    index: 0,
    closed: true,
    segments: [
      { start: 12.2, end: 15.4, text: "Вот это первый взгляд на гта 6" },
      { start: 16, end: 18, text: "привет чат как настроение" },
    ],
  };
  const cursor = createGta6Cursor();
  const first = cursor.push(early);
  assert.equal(first.length, 1);
  const hit = first[0]!;
  assert.equal(hit.class, "first_look");
  assert.ok(hit.start <= hit.triggerStart && hit.end >= hit.triggerEnd);
  assert.equal(hit.start, Math.floor(hit.start));
  assert.equal(hit.end, Math.ceil(hit.end));
  assert.ok(hit.end < 30);
  assert.deepEqual(cursor.push(early), []);
  assert.deepEqual(cursor.push({
    sourceId: "ru-en",
    index: 1,
    closed: false,
    segments: [{ start: 40, end: 42, text: "The graphics in GTA 6 are wild" }],
  }), []);
  const again = highlightsFromChunks([early]);
  const repeated = highlightsFromChunks([early]);
  assert.deepEqual(again, repeated);
  assert.equal(again[0]?.class, hit.class);
  assert.equal(again[0]?.start, hit.start);
  assert.equal(again[0]?.end, hit.end);
  const withContext = highlightsFromChunks([{
    sourceId: "ru-en",
    index: 0,
    closed: true,
    segments: [
      { start: 0.2, end: 1.4, text: "мы сейчас в гта 6" },
      { start: 2, end: 3.5, text: "какая графика" },
    ],
  }]);
  assert.equal(withContext.length, 1);
  assert.equal(withContext[0]?.class, "graphics");
  assert.ok(withContext[0]!.start <= withContext[0]!.triggerStart);
  assert.ok(withContext[0]!.end >= withContext[0]!.triggerEnd);
});

test("runner cuts a closed chunk before it reads the next one", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-runner-"));
  const calls: string[] = [];
  const labels: Gta6Label[] = [
    { text: PARAPHRASE, accept: true, class: "first_look" },
    { text: FALSE_FRIEND, accept: false, class: "first_look" },
  ];
  const run = () => runGta6Highlights({
    sources: [{ sourceId: "live", chunks: ["chunk-a.wav", "chunk-b.wav"] }],
    outDir: root,
    labels,
    transcribe: async (file) => {
      calls.push(`transcribe:${file}`);
      if (file === "chunk-a.wav") {
        return {
          language: "ru",
          segments: [
            { start: 0.4, end: 1.6, text: FALSE_FRIEND },
            { start: 3, end: 5, text: PARAPHRASE },
            { start: 6, end: 7, text: "привет чат как настроение" },
          ],
        };
      }
      return { language: "en", segments: [{ start: 1, end: 2.2, text: "The graphics in GTA 6 are wild" }] };
    },
    probe: async (file) => {
      calls.push(`probe:${file}`);
      return 10;
    },
    render: async (input) => {
      calls.push(`render:${input.highlight.class}:${input.highlight.start}:${input.highlight.end}`);
      return { filter: gta6VideoFilter(input.start, input.end, input.telegram) };
    },
  });
  try {
    const first = await run();
    const mark = [...calls];
    const second = await run();
    assert.equal(first.published, false);
    assert.equal(second.published, false);
    const early = first.sources[0]!.highlights.filter((hit) => hit.triggerStart < 10);
    assert.equal(early.length, 1);
    assert.equal(early[0]?.class, "first_look");
    assert.equal(early[0]?.text, PARAPHRASE);
    assert.ok(early[0]!.start <= early[0]!.triggerStart && early[0]!.end >= early[0]!.triggerEnd);
    assert.match(early[0]!.filter, new RegExp(GTA6_BANNER_SIM));
    assert.match(early[0]!.filter, new RegExp(GTA6_BANNER_ROBOT));
    assert.doesNotMatch(early[0]!.filter, new RegExp(GTA6_BANNER_TELEGRAM));
    const renderAt = mark.findIndex((call) => call.startsWith("render:first_look"));
    const nextRead = mark.findIndex((call) => call === "transcribe:chunk-b.wav");
    assert.ok(renderAt >= 0 && nextRead > renderAt);
    const bounds = (report: typeof first) => report.sources[0]!.highlights.map((hit) => [hit.class, hit.start, hit.end, hit.triggerStart, hit.triggerEnd]);
    assert.deepEqual(bounds(first), bounds(second));
    assert.equal(JSON.stringify(first).includes("tiktok.com"), false);
    assert.equal(JSON.stringify(first).includes("youtube.com"), false);
    assert.equal(JSON.stringify(first).includes("instagram.com"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("banners stay out of the bottom band and the right rail", () => {
  const plain = gta6Banners(false).map((banner) => banner.text);
  const extra = gta6Banners(true).map((banner) => banner.text);
  assert.deepEqual(plain, [GTA6_BANNER_SIM, GTA6_BANNER_ROBOT]);
  assert.deepEqual(extra, [GTA6_BANNER_SIM, GTA6_BANNER_ROBOT, GTA6_BANNER_TELEGRAM]);
  for (const banner of gta6Banners(true)) {
    assert.ok(banner.y + banner.fontSize + 40 < GTA6_BOTTOM_UI_TOP);
    assert.ok(banner.x + banner.text.length * banner.fontSize * 0.7 + 40 < GTA6_RIGHT_COLUMN_LEFT);
  }
  const off = gta6VideoFilter(1, 4, false);
  const on = gta6VideoFilter(1, 4, true);
  assert.match(off, new RegExp(GTA6_BANNER_SIM));
  assert.match(off, new RegExp(GTA6_BANNER_ROBOT));
  assert.doesNotMatch(off, new RegExp(GTA6_BANNER_TELEGRAM));
  assert.match(on, new RegExp(GTA6_BANNER_TELEGRAM));
});

test("rendered clip is 1080x1920, covers the trigger, and shows only the requested banners", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-render-"));
  const source = resolve(root, "source.mp4");
  const plain = resolve(root, "plain.mp4");
  const extra = resolve(root, "extra.mp4");
  const frame = resolve(root, "frame.png");
  try {
    const made = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=0x224466:s=640x360:r=30:d=8",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
      "-t", "8", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac",
      source,
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);
    const hits = highlightsFromChunks([{
      sourceId: "fixture",
      index: 0,
      closed: true,
      segments: [{ start: 2.2, end: 3.4, text: "This is my first look at GTA 6" }],
    }]);
    assert.equal(hits.length, 1);
    const hit = hits[0]!;
    assert.ok(hit.start <= hit.triggerStart && hit.end >= hit.triggerEnd);
    assert.ok(hit.end - hit.start < 8);
    const rendered = await renderGta6Clip({ source, output: plain, start: hit.start, end: hit.end, telegram: false, sourceDuration: 8 });
    assert.equal(rendered.width, GTA6_WIDTH);
    assert.equal(rendered.height, GTA6_HEIGHT);
    assert.ok(rendered.duration < 7);
    assert.ok(rendered.duration + 0.15 >= hit.triggerEnd - hit.triggerStart);
    assert.match(rendered.filter, new RegExp(GTA6_BANNER_SIM));
    assert.match(rendered.filter, new RegExp(GTA6_BANNER_ROBOT));
    assert.doesNotMatch(rendered.filter, new RegExp(GTA6_BANNER_TELEGRAM));
    const withTelegram = await renderGta6Clip({ source, output: extra, start: hit.start, end: hit.end, telegram: true, sourceDuration: 8 });
    assert.match(withTelegram.filter, new RegExp(GTA6_BANNER_TELEGRAM));
    const shot = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.4", "-i", plain, "-frames:v", "1", frame,
    ], { encoding: "utf8" });
    assert.equal(shot.status, 0, shot.stderr);
    const raw = spawnSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", frame, "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ], { maxBuffer: 12 * 1024 * 1024 });
    assert.equal(raw.status, 0, raw.stderr.toString());
    const pixels = raw.stdout;
    assert.equal(pixels.length, GTA6_WIDTH * GTA6_HEIGHT * 3);
    const white = (x: number, y: number, width: number, height: number) => {
      let count = 0;
      for (let row = y; row < y + height; row += 1) {
        for (let col = x; col < x + width; col += 1) {
          const offset = (row * GTA6_WIDTH + col) * 3;
          if (pixels[offset]! > 210 && pixels[offset + 1]! > 210 && pixels[offset + 2]! > 210) count += 1;
        }
      }
      return count;
    };
    assert.ok(white(48, 96, 560, 100) > 30);
    assert.ok(white(48, 220, 620, 100) > 30);
    assert.equal(white(0, 1600, GTA6_WIDTH, 280), 0);
    assert.equal(white(920, 0, 160, GTA6_HEIGHT), 0);
    const readBanner = (video: string, png: string) => {
      const still = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.4", "-i", video, "-frames:v", "1", png,
      ], { encoding: "utf8" });
      assert.equal(still.status, 0, still.stderr);
      const lines = [
        "crop=700:130:40:80,scale=1400:260:flags=neighbor",
        "crop=820:150:40:200,scale=1640:300:flags=neighbor",
        "crop=640:150:40:320,scale=1280:300:flags=neighbor",
      ];
      return lines.map((filter, index) => {
        const band = png.replace(/\.png$/u, `-line-${index}.png`);
        const cropped = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", png, "-vf", filter, band], { encoding: "utf8" });
        assert.equal(cropped.status, 0, cropped.stderr);
        const ocr = spawnSync("tesseract", [band, "stdout", "-l", "rus", "--psm", "7"], { encoding: "utf8" });
        assert.equal(ocr.status, 0, ocr.stderr);
        return ocr.stdout.toLowerCase().replace(/ё/gu, "е");
      }).join("\n");
    };
    const read = readBanner(plain, frame);
    assert.match(read, /симка/);
    assert.match(read, /впн/);
    assert.match(read, /шортробот/);
    assert.doesNotMatch(read, /тг канал/);
    const extraRead = readBanner(extra, resolve(root, "extra.png"));
    assert.match(extraRead, /симка/);
    assert.match(extraRead, /шортробот/);
    assert.match(extraRead, /тг канал/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("repeated local filenames stay separate sources", () => {
  const plans = sourcePlansFromInputs(["/streams/ru/live.mp4", "/streams/en/live.mp4"]);
  assert.equal(plans.length, 2);
  assert.notEqual(plans[0]?.sourceId, plans[1]?.sourceId);
  assert.deepEqual(plans[0]?.chunks, ["/streams/ru/live.mp4"]);
  assert.deepEqual(plans[1]?.chunks, ["/streams/en/live.mp4"]);
});

test("live pages are youtube or twitch https links and chunks are 10 to 15 minutes", () => {
  assert.equal(assertLivePage("https://www.twitch.tv/example").hostname, "www.twitch.tv");
  assert.equal(assertLivePage("https://youtu.be/abcdefghijk").hostname, "youtu.be");
  assert.equal(liveChannelKey("https://www.twitch.tv/Example").key, "twitch:example");
  assert.equal(liveChannelKey("https://player.twitch.tv/?channel=Example").url, "https://www.twitch.tv/example");
  assert.equal(liveChannelKey("https://www.youtube.com/watch?v=abcdefghijk").key, liveChannelKey("https://www.youtube.com/live/abcdefghijk").key);
  assert.equal(liveChannelKey("https://www.youtube.com/@NASA/live").label, "youtube.com/@nasa");
  assert.throws(() => liveChannelKey("https://www.twitch.tv/directory"));
  assert.throws(() => liveChannelKey("https://www.youtube.com/feed/subscriptions"));
  assert.equal(assertChunkMinutes(10), 10);
  assert.equal(assertChunkMinutes(15), 15);
  for (const raw of ["http://www.twitch.tv/example", "https://example.com/live", "file:///tmp/a.mp4", "not a url"]) {
    assert.throws(() => assertLivePage(raw));
  }
  assert.throws(() => assertChunkMinutes(9));
  assert.throws(() => assertChunkMinutes(16));
});

test("live follow cuts a closed chunk while the next one records, then deletes only the raw chunk", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-live-"));
  const events: string[] = [];
  try {
    const report = await followGta6Live({
      url: "https://www.twitch.tv/example",
      outDir: root,
      minutes: 12,
      record: async ({ file, seconds }) => {
        assert.equal(seconds, 720);
        const number = events.filter((event) => event.startsWith("record:")).length + 1;
        events.push(`record:${number}`);
        await writeFile(file, `raw-${number}`);
        return { ended: number >= 2 };
      },
      processChunk: async ({ file, index, sourceId }) => {
        events.push(`process:${index}`);
        if (index === 0) assert.ok(events.includes("record:2"));
        await mkdir(resolve(root, "clips"), { recursive: true });
        await writeFile(resolve(root, "clips", `${sourceId}.mp4`), "clip");
        return {
          published: false,
          sources: [{ sourceId, chunks: [file], duration: 720, language: "ru", segments: [], highlights: [] }],
        };
      },
    });
    assert.deepEqual(events, ["record:1", "record:2", "process:0", "process:1"]);
    assert.equal(report.published, false);
    assert.equal(report.sources.length, 2);
    await assert.rejects(access(resolve(root, "incoming", "chunk-0.mkv")));
    await assert.rejects(access(resolve(root, "incoming", "chunk-1.mkv")));
    assert.equal(await readFile(resolve(root, "clips", "live-1.mp4"), "utf8"), "clip");
    assert.equal(await readFile(resolve(root, "clips", "live-2.mp4"), "utf8"), "clip");
    const saved = JSON.parse(await readFile(resolve(root, "report.json"), "utf8")) as { published: boolean; sources: unknown[] };
    assert.equal(saved.published, false);
    assert.equal(saved.sources.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed cut keeps the raw chunk", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-live-fail-"));
  try {
    await assert.rejects(() => followGta6Live({
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      outDir: root,
      record: async ({ file }) => {
        await writeFile(file, "raw");
        return { ended: true };
      },
      processChunk: async () => { throw new Error("сбой нарезки"); },
    }), /сбой нарезки/);
    assert.equal(await readFile(resolve(root, "incoming", "chunk-0.mkv"), "utf8"), "raw");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live recorder copies a bounded stream and treats a short file as the end", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-live-rec-"));
  const file = resolve(root, "chunk.mkv");
  const calls: string[][] = [];
  const run = async (_bin: string, args: string[]) => {
    calls.push(args);
    if (args.includes("--dump-single-json")) return { stdout: JSON.stringify({ is_live: true, live_status: "is_live" }), stderr: "" };
    await writeFile(file, Buffer.alloc(5000));
    return { stdout: "", stderr: "" };
  };
  try {
  for (const url of ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.twitch.tv/example"]) {
    calls.length = 0;
    const ended = await recordLiveChunk({ url, file, seconds: 600, run, probe: async () => 90 });
    assert.equal(ended.ended, true);
    assert.equal(ended.empty, false);
    const download = calls.find((args) => args.includes("--downloader"));
    assert.ok(download);
    assert.ok(download.includes("m3u8:ffmpeg"));
    assert.ok(download.includes("--no-live-from-start"));
    assert.match(download.find((arg) => arg.startsWith("ffmpeg:")) || "", /-t 600/);
    assert.match(download.find((arg) => arg.startsWith("ffmpeg:")) || "", /-c copy/);
    assert.ok(download.includes(liveChannelKey(url).url));
    assert.equal(download.includes("https://video.example/v"), false);
  }
  await assert.rejects(() => recordLiveChunk({
    url: "https://www.twitch.tv/example",
    file,
    seconds: 600,
    run: async (_bin, args) => {
      assert.ok(args.includes("--dump-single-json"));
      return { stdout: JSON.stringify({ is_live: false, live_status: "was_live" }), stderr: "" };
    },
  }), /нет прямого эфира/);
  await assert.rejects(() => recordLiveChunk({
    url: "https://www.twitch.tv/example",
    file,
    seconds: 600,
    run: async () => { throw new Error("yt-dlp завершился с кодом 1: The channel is not currently live"); },
  }), /нет прямого эфира/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("highlight modules do not import publishers", async () => {
  for (const file of [
    resolve("server/services/gta6-highlights.ts"),
    resolve("server/services/gta6-highlights-media.ts"),
    resolve("server/services/gta6-highlights.test.ts"),
    resolve("scripts/gta6-highlights.ts"),
    resolve("scripts/gta6-transcribe.py"),
  ]) {
    const source = await readFile(file, "utf8");
    for (const line of source.split("\n")) {
      if (!/^\s*import\b/.test(line) && !/\brequire\(/.test(line)) continue;
      assert.equal(/social-publisher|youtube|tiktok|instagram/i.test(line), false, `${file}: ${line}`);
    }
  }
});
