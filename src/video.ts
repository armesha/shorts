import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve, extname, isAbsolute, relative } from "node:path";
import ffmpegPath from "ffmpeg-static";
import {
  isJokeAnimatedVariant,
  JOKE_ANIMATED_MAX_TEXT_LEN,
  jokeAnimatedTemplateForVariant,
} from "./anecdotes/joke-animated-templates.ts";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const AUDIO_DIR = resolve(process.cwd(), "assets/audio");
const CREATOR_MOTION_DIR = resolve(process.cwd(), "assets/creator/motion");
const CREATOR_JOKE_MOTION_FILES = new Set([
  "reaction-joy.gif",
  "reaction-rofl.gif",
  "reaction-laughing.gif",
  "reaction-grin-sweat.gif",
  "reaction-grin.gif",
  "reaction-smile.gif",
  "reaction-sunglasses.gif",
  "reaction-thinking.gif",
  "reaction-mouth-open.gif",
  "reaction-melting.gif",
  "reaction-mind-blown.gif",
  "meme-star-struck.gif",
  "meme-partying-face.gif",
  "meme-fire.gif",
  "meme-100.gif",
  "meme-sparkles.gif",
  "meme-party-popper.gif",
  "meme-rocket.gif",
  "gesture-thumbs-up.gif",
  "gesture-clap.gif",
  "gesture-raising-hands.gif",
  "gesture-ok.gif",
]);
const JOKE_VIDEO_BG_DIR = resolve(process.cwd(), "assets/fact-videos/joke-backgrounds");
export const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"]);
export const PACK_AUDIO_PREFIX = "pack-audio/";
export const PACK_AUDIO_DIR = resolve(process.cwd(), "data/pack-audio");
// Reserved deck-specific audio subfolders kept OUT of the general melodic pool.
const MEMES_SUBDIR = "memes";
const JOKES_SUBDIR = "anekdoty";
const MOTIVATION_SUBDIR = "motivation";
const NON_MUSIC_SUBDIRS = ["islamic", "christian", "illusions-3d", "illusions-en"];
const isNonMusicTrack = (f: string) => {
  const n = f.replace(/\\/g, "/").toLowerCase();
  return NON_MUSIC_SUBDIRS.some((dir) => n.startsWith(dir + "/"));
};
const isMemesTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(MEMES_SUBDIR + "/");
const isJokesTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(JOKES_SUBDIR + "/");
const isMotivationTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(MOTIVATION_SUBDIR + "/");
const isReservedTrack = (f: string) =>
  isNonMusicTrack(f) ||
  isMemesTrack(f) ||
  isJokesTrack(f) ||
  isMotivationTrack(f);

function insideDir(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeRelativeName(name: string): string {
  const n = String(name || "").replace(/\\/g, "/").trim();
  if (!n || n.startsWith("/") || n.includes("\0")) throw new Error("Bad audio track");
  const parts = n.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) throw new Error("Bad audio track");
  if (!AUDIO_EXT.has(extname(n).toLowerCase())) throw new Error("Unsupported audio track");
  return n;
}

function normalizePackId(packId: string): string {
  const id = String(packId || "").trim();
  if (!id || id.includes("/") || id.includes("\\") || id.includes("..") || id.includes("\0")) {
    throw new Error("Bad pack id");
  }
  return id;
}

export function packAudioTrackId(packId: string, fileName: string): string {
  return `${PACK_AUDIO_PREFIX}${normalizePackId(packId)}/${normalizeRelativeName(fileName)}`;
}

export function parsePackAudioTrack(name: string): { packId: string; fileName: string } | null {
  const normalized = String(name || "").replace(/\\/g, "/").trim();
  if (!normalized.startsWith(PACK_AUDIO_PREFIX)) return null;
  const rest = normalized.slice(PACK_AUDIO_PREFIX.length);
  const parts = rest.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const packId = normalizePackId(parts[0]);
  const fileName = normalizeRelativeName(parts[1]);
  return { packId, fileName };
}

export function packAudioPathFor(packId: string, fileName: string): string {
  const safePackId = normalizePackId(packId);
  const safeFileName = normalizeRelativeName(fileName);
  const dir = resolve(PACK_AUDIO_DIR, safePackId);
  const abs = resolve(dir, safeFileName);
  if (!insideDir(dir, abs)) throw new Error("Bad audio track");
  return abs;
}

export function listPackAudio(packId: string): string[] {
  const safePackId = normalizePackId(packId);
  const dir = resolve(PACK_AUDIO_DIR, safePackId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => f.toString())
    .filter((f) => {
      try {
        return AUDIO_EXT.has(extname(f).toLowerCase()) && existsSync(packAudioPathFor(safePackId, f));
      } catch {
        return false;
      }
    })
    .sort()
    .map((f) => packAudioTrackId(safePackId, f));
}

/** Pick a random royalty-free track from assets/audio, or null if the folder is empty. */
/** List available audio tracks (relative names under assets/audio). */
export function listAudio(): string[] {
  if (!existsSync(AUDIO_DIR)) return [];
  return readdirSync(AUDIO_DIR, { recursive: true })
    .map((f) => f.toString())
    .filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()) && !isReservedTrack(f))
    .sort();
}

/** Pick a random quiet, light bed for the memes deck (relative name under assets/audio), or null. */
export function pickMemesAudio(): string | null {
  const dir = resolve(AUDIO_DIR, MEMES_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${MEMES_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Pick a random light comedy/jazz bed for joke and funny-quote decks. */
export function pickJokesAudio(): string | null {
  const dir = resolve(AUDIO_DIR, JOKES_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${JOKES_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Pick a random focused cinematic bed for motivation decks. */
export function pickMotivationAudio(): string | null {
  const dir = resolve(AUDIO_DIR, MOTIVATION_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${MOTIVATION_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Resolve a relative track name (from listAudio) to an absolute path. */
export function audioPathFor(name: string, opts: { packId?: string } = {}): string {
  const packTrack = parsePackAudioTrack(name);
  if (packTrack) {
    if (!opts.packId || opts.packId !== packTrack.packId) throw new Error("Audio track is not available for this pack");
    const abs = packAudioPathFor(packTrack.packId, packTrack.fileName);
    if (!existsSync(abs)) throw new Error("Audio track not found");
    return abs;
  }

  const normalized = normalizeRelativeName(name);
  const abs = resolve(AUDIO_DIR, normalized);
  if (!insideDir(AUDIO_DIR, abs) || !existsSync(abs)) throw new Error("Audio track not found");
  return abs;
}

/** Minimal deck shape needed to pick deck-specific audio (avoids coupling video.ts to decks.ts). */
export interface AudioDeckHint {
  islamic?: boolean;
  christian?: boolean;
  meme?: boolean;
  audioProfile?: "islamic" | "christian" | "memes" | "jokes" | "motivation";
}

/**
 * Resolve which audio a video should use, from the user's `music` choice + (optionally) its deck.
 * Single source of truth — previously copy-pasted into buildLibraryVideo, the anecdote-video handler,
 * pack-gen and packs-routes (and the islamic/christian override was duplicated verbatim in two of them).
 *  - music === "none"        → silent (audioPath null)
 *  - music === explicit name → that track
 *  - music empty/undefined   → a random instrumental track (or silent if the pool is empty)
 * Deck overrides (skipped when music is explicitly "none"): meme → quiet meme bed,
 * jokes → light comedy/jazz bed.
 * Islamic/christian decks intentionally use the same melodic pool; old ambient/drone beds are not music.
 * Returns the resolved track name (to store on the videos row) + absolute audio path (null = silent).
 */
export function resolveAudio(
  music: string | undefined,
  deck?: AudioDeckHint,
  opts: { packId?: string } = {},
): { music: string; audioPath: string | null } {
  let m = music;
  const explicitNone = m === "none";
  const explicitTrack = !!m && !explicitNone;
  let audioPath: string | null;
  if (m === "none") audioPath = null;
  else if (m) audioPath = audioPathFor(m, opts);
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
  if ((deck?.meme || deck?.audioProfile === "memes") && !explicitNone && !explicitTrack) {
    const bed = pickMemesAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
    }
  }
  if (deck?.audioProfile === "jokes" && !explicitNone && !explicitTrack) {
    const bed = pickJokesAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
    }
  }
  if (deck?.audioProfile === "motivation" && !explicitNone && !explicitTrack) {
    const bed = pickMotivationAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
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
  /** Audio gain for explicit/auto audio. Defaults to 0.5 for background music. */
  audioVolume?: number;
  /** Fade audio out near the end. Defaults to true for background music. */
  fadeAudio?: boolean;
  /** Optional animated sticker overlay. */
  motionOverlay?: MotionOverlay | null;
}

export interface MotionOverlay {
  path: string;
  width: number;
  height?: number;
  x: string;
  y: string;
}

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function jokeMotionOverlayForVariant(variant?: string | null, textLen = 0): MotionOverlay | null {
  if (textLen > JOKE_ANIMATED_MAX_TEXT_LEN || !existsSync(CREATOR_MOTION_DIR)) return null;
  const template = jokeAnimatedTemplateForVariant(variant);
  if (!template) return null;
  const path = resolve(CREATOR_MOTION_DIR, template.gif);
  if (!existsSync(path)) return null;
  return { path, width: textLen > 460 ? Math.max(128, Math.round(template.width * 0.78)) : template.width, x: template.x, y: template.y };
}

export function pickJokeMotionOverlay(seed: string, textLen = 0, visualVariant?: string | null): MotionOverlay | null {
  const forced = jokeMotionOverlayForVariant(visualVariant, textLen);
  if (forced) return forced;
  if (visualVariant && isJokeAnimatedVariant(visualVariant)) return null;
  if (textLen > JOKE_ANIMATED_MAX_TEXT_LEN || !existsSync(CREATOR_MOTION_DIR)) return null;
  const files = readdirSync(CREATOR_MOTION_DIR)
    .map((f) => f.toString())
    .filter((f) => /\.gif$/i.test(f) && CREATOR_JOKE_MOTION_FILES.has(f))
    .sort();
  if (files.length === 0) return null;
  const h = stableHash(seed);
  const positions = [
    { x: "main_w-overlay_w-74", y: "main_h-overlay_h-230" },
    { x: "74", y: "main_h-overlay_h-230" },
  ];
  const pos = positions[(h >>> 4) % positions.length];
  return {
    path: resolve(CREATOR_MOTION_DIR, files[h % files.length]),
    width: textLen > 420 ? 120 : 148,
    x: pos.x,
    y: pos.y,
  };
}

export function pickJokeVideoBackground(seed: string, textLen = 0): string | null {
  if (textLen > 520 || !existsSync(JOKE_VIDEO_BG_DIR)) return null;
  const files = readdirSync(JOKE_VIDEO_BG_DIR)
    .map((f) => f.toString())
    .filter((f) => /\.(mp4|webm|mov)$/i.test(f))
    .sort();
  if (files.length === 0) return null;
  const h = stableHash(seed);
  // Keep static joke cards in the mix; motion backgrounds are a visual variant, not the only template.
  if (h % 3 === 0) return null;
  return resolve(JOKE_VIDEO_BG_DIR, files[h % files.length]);
}

export async function assembleVideoBackground(
  backgroundPath: string,
  overlayImagePath: string,
  outPath: string,
  opts: VideoOptions = {},
): Promise<string> {
  const dur = opts.durationSec ?? 6;
  const audio = opts.audioPath === undefined ? await pickAudio() : opts.audioPath;
  const motion = opts.motionOverlay ?? null;
  await mkdir(dirname(outPath), { recursive: true });

  const args: string[] = ["-y", "-stream_loop", "-1", "-i", backgroundPath];
  if (audio) {
    args.push("-stream_loop", "-1", "-i", audio);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  args.push("-loop", "1", "-framerate", "30", "-i", overlayImagePath);
  if (motion) args.push("-ignore_loop", "0", "-i", motion.path);
  args.push("-t", String(dur));

  const bg =
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920,setsar=1,eq=brightness=-0.06:saturation=0.88,format=rgba[bg]";
  const overlay = "[2:v]scale=1080:1920:flags=lanczos,format=rgba[card];[bg][card]overlay=0:0:format=auto[base]";
  const withSticker = motion
    ? `;[3:v]fps=30,scale=${motion.width}:${motion.height ?? -1}:flags=lanczos,format=rgba[sticker];[base][sticker]overlay=x='${motion.x}':y='${motion.y}':shortest=0:format=auto[v]`
    : ";[base]format=yuv420p[v]";
  args.push("-filter_complex", `${bg};${overlay}${withSticker}`, "-map", "[v]", "-map", "1:a");
  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-r", "30",
  );
  if (audio) {
    const volume = Number.isFinite(opts.audioVolume) ? Math.max(0, Math.min(4, opts.audioVolume ?? 0.5)) : 0.5;
    const filters = [`volume=${volume}`];
    if (opts.fadeAudio !== false) {
      const fadeStart = Math.max(0, dur - 1);
      filters.push(`afade=t=out:st=${fadeStart}:d=1`);
    }
    filters.push("aresample=48000");
    args.push("-af", filters.join(","));
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
  const motion = opts.motionOverlay ?? null;
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
  if (motion) {
    args.push("-ignore_loop", "0", "-i", motion.path);
  }

  args.push("-t", String(dur));
  if (motion) {
    const overlay = `[0:v]${vf}[base];[2:v]fps=30,scale=${motion.width}:${motion.height ?? -1}:flags=lanczos,format=rgba[sticker];[base][sticker]overlay=x='${motion.x}':y='${motion.y}':shortest=0:format=auto[v]`;
    args.push("-filter_complex", overlay, "-map", "[v]", "-map", "1:a");
  } else {
    args.push("-vf", vf);
  }
  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-tune", "stillimage",
  );

  if (audio) {
    const volume = Number.isFinite(opts.audioVolume) ? Math.max(0, Math.min(4, opts.audioVolume ?? 0.5)) : 0.5;
    const filters = [`volume=${volume}`];
    if (opts.fadeAudio !== false) {
      const fadeStart = Math.max(0, dur - 1);
      filters.push(`afade=t=out:st=${fadeStart}:d=1`);
    }
    filters.push("aresample=48000");
    args.push("-af", filters.join(","));
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

/** Downscale an image to a target width (keeps aspect, even height) as JPEG — for Gallery thumbnails. */
export async function downscaleImage(src: string, dest: string, width = 360): Promise<string> {
  await mkdir(dirname(dest), { recursive: true });
  await pexec(
    FFMPEG,
    ["-y", "-i", src, "-vf", `scale=${width}:-2:flags=lanczos`, "-q:v", "5", dest],
    { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
  );
  return dest;
}
