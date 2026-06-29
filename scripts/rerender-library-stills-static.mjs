import { existsSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DB_PATH = resolve(ROOT, "data/app.db");
const OUTPUT_DIR = resolve(ROOT, "data/output");
const OUTPUT_PREFIX = `${OUTPUT_DIR}/`;
const AUDIO_DIR = resolve(ROOT, "assets/audio");
const FALLBACK_AUDIO = resolve(AUDIO_DIR, "long-videos/fats-waller-swingin-the-operas-1939.opus");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";
const VIDEO_PRESET = process.env.VIDEO_PRESET || "veryfast";
const APPLY = process.argv.includes("--apply");
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.CONCURRENCY || 2) || 2));
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(0, Number(limitArg.slice("--limit=".length)) || 0) : 0;
const offsetArg = process.argv.find((arg) => arg.startsWith("--offset="));
const OFFSET = offsetArg ? Math.max(0, Number(offsetArg.slice("--offset=".length)) || 0) : 0;
const usernameArg = process.argv.find((arg) => arg.startsWith("--username="));
const USERNAME = usernameArg ? usernameArg.slice("--username=".length).trim() : "";
const deckLikeArg = process.argv.find((arg) => arg.startsWith("--deck-like="));
const DECK_LIKE = deckLikeArg ? deckLikeArg.slice("--deck-like=".length).trim() : "";

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
  });
}

function outputPath(rel) {
  const path = resolve(OUTPUT_DIR, rel);
  if (path !== OUTPUT_DIR && path.startsWith(OUTPUT_PREFIX)) return path;
  throw new Error(`Unsafe output path: ${rel}`);
}

async function durationSec(videoPath) {
  try {
    const { stdout } = await run(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
    const n = Number.parseFloat(stdout.trim());
    if (Number.isFinite(n) && n > 0) return Math.max(6, Math.min(14, n));
  } catch {
    // Fall through to the project default.
  }
  return 6;
}

function audioPath(music) {
  if (!music || music === "none") return null;
  const candidate = resolve(AUDIO_DIR, String(music));
  if (candidate.startsWith(`${AUDIO_DIR}/`) && existsSync(candidate)) return candidate;
  return existsSync(FALLBACK_AUDIO) ? FALLBACK_AUDIO : null;
}

async function rebuild(row) {
  const image = outputPath(row.image_rel);
  const video = outputPath(row.video_rel);
  if (!existsSync(image)) return { status: "missing-image", id: row.id };
  if (!existsSync(video)) return { status: "missing-video", id: row.id };

  const dur = await durationSec(video);
  const tmp = resolve(dirname(video), `.${row.id}-${Date.now()}-${process.pid}.static.tmp.mp4`);
  try {
    const audio = audioPath(row.music);
    const args = ["-y", "-loop", "1", "-framerate", "30", "-i", image];
    if (audio) args.push("-stream_loop", "-1", "-i", audio);
    else args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
    args.push(
      "-t",
      String(dur),
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1",
      "-c:v",
      "libx264",
      "-preset",
      VIDEO_PRESET,
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-r",
      "30",
      "-tune",
      "stillimage",
    );
    if (audio) {
      const fadeStart = Math.max(0, dur - 1);
      args.push("-af", `volume=0.5,afade=t=out:st=${fadeStart}:d=1,aresample=48000`);
    }
    args.push("-c:a", "aac", "-b:a", audio ? "192k" : "128k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", tmp);
    await run(FFMPEG, args);
    renameSync(tmp, video);
    return { status: "rebuilt", id: row.id };
  } catch (error) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {}
    return { status: "failed", id: row.id, error: error instanceof Error ? error.message : String(error) };
  }
}

const db = new DatabaseSync(DB_PATH);
db.prepare("PRAGMA busy_timeout = 5000").run();
const where = ["v.image_rel IS NOT NULL", "v.image_rel <> ''", "v.video_rel IS NOT NULL", "v.video_rel <> ''"];
const params = [];
let join = "";
if (USERNAME) {
  join = "JOIN accounts a ON a.id = v.account_id JOIN users u ON u.id = a.user_id";
  where.push("u.username = ?");
  params.push(USERNAME);
}
if (DECK_LIKE) {
  where.push("v.deck LIKE ?");
  params.push(DECK_LIKE);
}
const rows = db
  .prepare(
    `SELECT v.id, v.video_rel, v.image_rel, v.music
       FROM videos v
       ${join}
      WHERE ${where.join(" AND ")}
      ORDER BY v.id`,
  )
  .all(...params);
db.close();

const remaining = OFFSET > 0 ? rows.slice(OFFSET) : rows;
const work = LIMIT > 0 ? remaining.slice(0, LIMIT) : remaining;
console.log(
  `library still videos: ${rows.length}; selected: ${work.length}; offset=${OFFSET}; username=${USERNAME || "*"}; deckLike=${DECK_LIKE || "*"}; apply=${APPLY}; concurrency=${CONCURRENCY}; preset=${VIDEO_PRESET}`,
);
if (!APPLY) process.exit(0);

let cursor = 0;
let rebuilt = 0;
let missingImage = 0;
let missingVideo = 0;
let failed = 0;
const failures = [];

async function worker() {
  for (;;) {
    const row = work[cursor++];
    if (!row) return;
    const result = await rebuild(row);
    if (result.status === "rebuilt") rebuilt++;
    else if (result.status === "missing-image") missingImage++;
    else if (result.status === "missing-video") missingVideo++;
    else {
      failed++;
      failures.push(result);
    }
    const done = rebuilt + missingImage + missingVideo + failed;
    if (done % 100 === 0 || done === work.length) {
      console.log(`static rerendered ${done}/${work.length} rebuilt=${rebuilt} missingImage=${missingImage} missingVideo=${missingVideo} failed=${failed}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
if (failures.length) {
  console.error(JSON.stringify(failures.slice(0, 20), null, 2));
  process.exitCode = 1;
}
