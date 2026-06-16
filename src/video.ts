import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const AUDIO_DIR = resolve(process.cwd(), "assets/audio");
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"]);
// Reserved deck-specific audio subfolders kept OUT of the general (instrumental) pool.
// Islamic videos use a nature-ambient track; Christian videos use a sacred organ/choir pad —
// each its own bed, never the shared instrumental music.
const ISLAMIC_SUBDIR = "islamic";
const CHRISTIAN_SUBDIR = "christian";
const isIslamicTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(ISLAMIC_SUBDIR + "/");
const isChristianTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(CHRISTIAN_SUBDIR + "/");
const isReservedTrack = (f: string) => isIslamicTrack(f) || isChristianTrack(f);

/** Pick a random royalty-free track from assets/audio, or null if the folder is empty. */
/** List available audio tracks (relative names under assets/audio). */
export function listAudio(): string[] {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()) && !isReservedTrack(f))
    .sort();
}

/** Pick a random nature-ambient track for the Islamic deck (relative name under assets/audio), or null. */
export function pickIslamicAudio(): string | null {
  const dir = resolve(AUDIO_DIR, ISLAMIC_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${ISLAMIC_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Pick a random sacred organ/choir pad for the Christian deck (relative name under assets/audio), or null. */
export function pickChristianAudio(): string | null {
  const dir = resolve(AUDIO_DIR, CHRISTIAN_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${CHRISTIAN_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Resolve a relative track name (from listAudio) to an absolute path. */
export function audioPathFor(name: string): string {
  return resolve(AUDIO_DIR, name);
}

/** Minimal deck shape needed to pick deck-specific audio (avoids coupling video.ts to decks.ts). */
export interface AudioDeckHint {
  islamic?: boolean;
  christian?: boolean;
}

/**
 * Resolve which audio a video should use, from the user's `music` choice + (optionally) its deck.
 * Single source of truth — previously copy-pasted into buildLibraryVideo, the anecdote-video handler,
 * pack-gen and packs-routes (and the islamic/christian override was duplicated verbatim in two of them).
 *  - music === "none"        → silent (audioPath null)
 *  - music === explicit name → that track
 *  - music empty/undefined   → a random instrumental track (or silent if the pool is empty)
 * Deck overrides (skipped when music is explicitly "none"): islamic → nature ambient, christian → sacred pad.
 * Returns the resolved track name (to store on the videos row) + absolute audio path (null = silent).
 */
export function resolveAudio(
  music: string | undefined,
  deck?: AudioDeckHint,
): { music: string; audioPath: string | null } {
  let m = music;
  let audioPath: string | null;
  if (m === "none") audioPath = null;
  else if (m) audioPath = audioPathFor(m);
  else {
    const tracks = listAudio();
    if (tracks.length) {
      m = tracks[Math.floor(Math.random() * tracks.length)];
      audioPath = audioPathFor(m);
    } else {
      m = "none";
      audioPath = null;
    }
  }
  // Islamic deck → nature ambient; Christian deck → sacred organ/choir pad. Explicit "none" stays silent.
  if (deck?.islamic && m !== "none") {
    const amb = pickIslamicAudio();
    if (amb) {
      m = amb;
      audioPath = audioPathFor(amb);
    }
  }
  if (deck?.christian && m !== "none") {
    const pad = pickChristianAudio();
    if (pad) {
      m = pad;
      audioPath = audioPathFor(pad);
    }
  }
  return { music: m ?? "none", audioPath };
}

export async function pickAudio(): Promise<string | null> {
  if (!existsSync(AUDIO_DIR)) return null;
  const all = await readdir(AUDIO_DIR, { recursive: true });
  const files = all
    .map((f) => f.toString())
    .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()) && !isReservedTrack(f));
  if (files.length === 0) return null;
  return resolve(AUDIO_DIR, files[Math.floor(Math.random() * files.length)]);
}

export interface VideoOptions {
  /** Clip length in seconds (spec: 5–6). */
  durationSec?: number;
  /** Explicit audio path; undefined = auto-pick from assets/audio; null = force silent. */
  audioPath?: string | null;
}

/**
 * Assemble a YouTube-ready vertical Short from a single still image (+ optional audio):
 * 1080x1920, H.264 High/yuv420p, 30fps, AAC 48kHz stereo, +faststart. Short tracks loop.
 */
export async function assembleStillVideo(
  imagePath: string,
  outPath: string,
  opts: VideoOptions = {},
): Promise<string> {
  const dur = opts.durationSec ?? 6;
  const audio = opts.audioPath === undefined ? await pickAudio() : opts.audioPath;
  await mkdir(dirname(outPath), { recursive: true });

  const vf =
    "scale=1080:1920:force_original_aspect_ratio=decrease," +
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1";

  const args: string[] = ["-y", "-loop", "1", "-framerate", "30", "-i", imagePath];

  if (audio) {
    args.push("-stream_loop", "-1", "-i", audio); // loop short tracks to fill duration
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }

  args.push(
    "-t", String(dur),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-tune", "stillimage",
    "-vf", vf,
  );

  if (audio) {
    const fadeStart = Math.max(0, dur - 1);
    // volume=0.5 → music sits quietly under the (silent) video; fade out at the end.
    args.push("-af", `volume=0.5,afade=t=out:st=${fadeStart}:d=1,aresample=48000`);
  }

  args.push(
    "-c:a", "aac",
    "-b:a", audio ? "192k" : "128k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    outPath,
  );

  await pexec(FFMPEG, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  return outPath;
}
