import { randomInt } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const INBOX_DIR = resolve(ROOT, "tmp/channel-103-rofls-inbox");
const PLAIN_DIR = resolve(ROOT, "tmp/channel-103-rofls-with-endcard");
const TAGGED_DIR = resolve(ROOT, "tmp/channel-103-rofls-with-endcard-and-tag");
const TAG_FILE = resolve(ROOT, "tmp/shortrobot-tag-preview/tag-clean.png");
const DEFAULT_ENDCARD_DIR =
  "/home/davtian/Documents/tg-videos/exports/shortrobot-endcard-voices-short-v2";
const ENDCARD_DIR = resolve(process.argv[2] || DEFAULT_ENDCARD_DIR);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.SHORTROBOT_RENDER_JOBS || "2", 10));

const PLAIN_STAGE = `${PLAIN_DIR}.v2-stage`;
const TAGGED_STAGE = `${TAGGED_DIR}.v2-stage`;
const PLAIN_BACKUP = `${PLAIN_DIR}.previous`;
const TAGGED_BACKUP = `${TAGGED_DIR}.previous`;
const ASSIGNMENT_FILE = resolve(ROOT, "tmp/shortrobot1-endcard-assignments.json");

for (const required of [INBOX_DIR, ENDCARD_DIR, TAG_FILE, PLAIN_DIR, TAGGED_DIR]) {
  if (!existsSync(required)) throw new Error(`Missing required path: ${required}`);
}
for (const stale of [PLAIN_STAGE, TAGGED_STAGE]) rmSync(stale, { recursive: true, force: true });
for (const backup of [PLAIN_BACKUP, TAGGED_BACKUP]) {
  if (existsSync(backup)) throw new Error(`Backup already exists, inspect it before continuing: ${backup}`);
}
mkdirSync(PLAIN_STAGE, { recursive: true });
mkdirSync(TAGGED_STAGE, { recursive: true });

const sourceFiles = [];
for (const group of readdirSync(INBOX_DIR, { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  const groupDir = join(INBOX_DIR, group.name);
  for (const file of readdirSync(groupDir)) {
    if (file.endsWith(".mp4")) sourceFiles.push(join(groupDir, file));
  }
}
sourceFiles.sort((a, b) => a.localeCompare(b));
if (sourceFiles.length !== 85) throw new Error(`Expected 85 source videos, found ${sourceFiles.length}`);
if (new Set(sourceFiles.map((file) => basename(file))).size !== sourceFiles.length) {
  throw new Error("Source video basenames must be unique");
}

const endcards = readdirSync(ENDCARD_DIR)
  .filter((file) => file.endsWith(".mp4"))
  .sort()
  .map((file) => join(ENDCARD_DIR, file));
if (endcards.length !== 5) throw new Error(`Expected 5 endcards, found ${endcards.length}`);

const shuffledEndcards = Array.from({ length: 17 }, () => endcards).flat();
for (let index = shuffledEndcards.length - 1; index > 0; index -= 1) {
  const swapIndex = randomInt(index + 1);
  [shuffledEndcards[index], shuffledEndcards[swapIndex]] = [shuffledEndcards[swapIndex], shuffledEndcards[index]];
}

const assignments = sourceFiles.map((sourceFile, index) => ({
  sourceFile,
  endcardFile: shuffledEndcards[index],
  outputName: basename(sourceFile),
}));

function render({ sourceFile, endcardFile, outputName }) {
  const plainOutput = join(PLAIN_STAGE, outputName);
  const taggedOutput = join(TAGGED_STAGE, outputName);
  const normalizeVideo =
    "fps=30,scale=1080:1920:force_original_aspect_ratio=decrease," +
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p";
  const graph = [
    `[0:v]${normalizeVideo},setpts=PTS-STARTPTS,split=2[mainplain][maintagbase]`,
    "[2:v]scale=648:-1[tag]",
    "[maintagbase][tag]overlay=x=(W-w)/2:y=1530:shortest=1[taggedmain]",
    "[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,asplit=2[maina1][maina2]",
    `[1:v]${normalizeVideo},trim=duration=3,setpts=PTS-STARTPTS,split=2[endv1][endv2]`,
    "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=3,asetpts=PTS-STARTPTS,asplit=2[enda1][enda2]",
    "[mainplain][maina1][endv1][enda1]concat=n=2:v=1:a=1[plainv][plaina]",
    "[taggedmain][maina2][endv2][enda2]concat=n=2:v=1:a=1[taggedv][taggeda]",
  ].join(";");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceFile,
    "-i",
    endcardFile,
    "-loop",
    "1",
    "-i",
    TAG_FILE,
    "-filter_complex",
    graph,
    "-map",
    "[plainv]",
    "-map",
    "[plaina]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-shortest",
    plainOutput,
    "-map",
    "[taggedv]",
    "-map",
    "[taggeda]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-shortest",
    taggedOutput,
  ];
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg failed for ${outputName}: ${stderr.trim()}`));
    });
  });
}

let cursor = 0;
let completed = 0;
async function worker() {
  while (cursor < assignments.length) {
    const item = assignments[cursor];
    cursor += 1;
    await render(item);
    completed += 1;
    console.log(`[shortrobot1] rendered ${completed}/${assignments.length}: ${item.outputName}`);
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, assignments.length) }, () => worker()));
} catch (error) {
  console.error(error);
  console.error(`Incomplete staging outputs kept for inspection: ${PLAIN_STAGE}, ${TAGGED_STAGE}`);
  process.exitCode = 1;
  throw error;
}

writeFileSync(
  ASSIGNMENT_FILE,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      endcardDirectory: ENDCARD_DIR,
      items: assignments.map((item) => ({
        sourceFile: relative(ROOT, item.sourceFile),
        endcardFile: item.endcardFile,
        outputFile: item.outputName,
      })),
    },
    null,
    2,
  )}\n`,
);

renameSync(PLAIN_DIR, PLAIN_BACKUP);
renameSync(TAGGED_DIR, TAGGED_BACKUP);
renameSync(PLAIN_STAGE, PLAIN_DIR);
renameSync(TAGGED_STAGE, TAGGED_DIR);

console.log(
  JSON.stringify({
    rendered: assignments.length,
    endcards: Object.fromEntries(endcards.map((file) => [basename(file), 17])),
    plainDir: relative(ROOT, PLAIN_DIR),
    taggedDir: relative(ROOT, TAGGED_DIR),
    assignmentFile: relative(ROOT, ASSIGNMENT_FILE),
    backups: [relative(ROOT, PLAIN_BACKUP), relative(ROOT, TAGGED_BACKUP)],
  }),
);
