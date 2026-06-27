import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve, extname, isAbsolute, relative } from "node:path";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const AUDIO_DIR = resolve(process.cwd(), "assets/audio");
const LIFEHACK_MOTION_DIR = resolve(process.cwd(), "assets/motion/lifehacks");
const JOKE_MOTION_DIR = resolve(process.cwd(), "assets/motion/jokes");
export const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus"]);
export const PACK_AUDIO_PREFIX = "pack-audio/";
export const PACK_AUDIO_DIR = resolve(process.cwd(), "data/pack-audio");
// Reserved deck-specific audio subfolders kept OUT of the general (instrumental) pool.
// Islamic videos use a nature-ambient track; Christian videos use a sacred organ/choir pad —
// each its own bed, never the shared instrumental music.
const ISLAMIC_SUBDIR = "islamic";
const CHRISTIAN_SUBDIR = "christian";
const MEMES_SUBDIR = "memes";
const LIFEHACK_SUBDIR = "lifehacks";
const JOKES_SUBDIR = "anekdoty";
const MOTIVATION_SUBDIR = "motivation";
const isIslamicTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(ISLAMIC_SUBDIR + "/");
const isChristianTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(CHRISTIAN_SUBDIR + "/");
const isMemesTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(MEMES_SUBDIR + "/");
const isLifehackTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(LIFEHACK_SUBDIR + "/");
const isJokesTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(JOKES_SUBDIR + "/");
const isMotivationTrack = (f: string) => f.replace(/\\/g, "/").toLowerCase().startsWith(MOTIVATION_SUBDIR + "/");
const isReservedTrack = (f: string) =>
  isIslamicTrack(f) ||
  isChristianTrack(f) ||
  isMemesTrack(f) ||
  isLifehackTrack(f) ||
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

/** Pick a random quiet, light bed for the memes deck (relative name under assets/audio), or null. */
export function pickMemesAudio(): string | null {
  const dir = resolve(AUDIO_DIR, MEMES_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${MEMES_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
}

/** Pick a random upbeat copyright-free bed for lifehack decks (relative name under assets/audio), or null. */
export function pickLifehackAudio(): string | null {
  const dir = resolve(AUDIO_DIR, LIFEHACK_SUBDIR);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  if (files.length === 0) return null;
  return `${LIFEHACK_SUBDIR}/${files[Math.floor(Math.random() * files.length)]}`;
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
  lifehack?: boolean;
  audioProfile?: "islamic" | "christian" | "memes" | "lifehack" | "jokes" | "motivation";
}

/**
 * Resolve which audio a video should use, from the user's `music` choice + (optionally) its deck.
 * Single source of truth — previously copy-pasted into buildLibraryVideo, the anecdote-video handler,
 * pack-gen and packs-routes (and the islamic/christian override was duplicated verbatim in two of them).
 *  - music === "none"        → silent (audioPath null)
 *  - music === explicit name → that track
 *  - music empty/undefined   → a random instrumental track (or silent if the pool is empty)
 * Deck overrides (skipped when music is explicitly "none"): islamic → nature ambient, christian → sacred pad,
 * meme → quiet meme bed, lifehack → upbeat synthetic bed, jokes → light comedy/jazz bed.
 * Returns the resolved track name (to store on the videos row) + absolute audio path (null = silent).
 */
export function resolveAudio(
  music: string | undefined,
  deck?: AudioDeckHint,
  opts: { packId?: string } = {},
): { music: string; audioPath: string | null } {
  let m = music;
  const explicitNone = m === "none";
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
  // Islamic deck → nature ambient; Christian deck → sacred organ/choir pad. Explicit "none" stays silent.
  if ((deck?.islamic || deck?.audioProfile === "islamic") && !explicitNone) {
    const amb = pickIslamicAudio();
    if (amb) {
      m = amb;
      audioPath = audioPathFor(amb);
    }
  }
  if ((deck?.christian || deck?.audioProfile === "christian") && !explicitNone) {
    const pad = pickChristianAudio();
    if (pad) {
      m = pad;
      audioPath = audioPathFor(pad);
    }
  }
  if ((deck?.meme || deck?.audioProfile === "memes") && !explicitNone) {
    const bed = pickMemesAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
    }
  }
  if ((deck?.lifehack || deck?.audioProfile === "lifehack") && !explicitNone) {
    const bed = pickLifehackAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
    }
  }
  if (deck?.audioProfile === "jokes" && !explicitNone) {
    const bed = pickJokesAudio();
    if (bed) {
      m = bed;
      audioPath = audioPathFor(bed);
    }
  }
  if (deck?.audioProfile === "motivation" && !explicitNone) {
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
  /** Optional animated sticker overlay, used by lifehack decks. */
  motionOverlay?: MotionOverlay | null;
  /** Optional subtle full-frame motion for still backgrounds. */
  stillMotion?: "slow-zoom" | "slow-drift-left" | "slow-drift-right";
}

export interface MotionOverlay {
  path: string;
  width: number;
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

export function pickLifehackMotionOverlay(seed: string): MotionOverlay | null {
  if (!existsSync(LIFEHACK_MOTION_DIR)) return null;
  const files = readdirSync(LIFEHACK_MOTION_DIR)
    .map((f) => f.toString())
    .filter((f) => /\.gif$/i.test(f))
    .sort();
  if (files.length === 0) return null;
  return {
    path: resolve(LIFEHACK_MOTION_DIR, files[stableHash(seed) % files.length]),
    width: 235,
    x: "main_w-overlay_w-70",
    y: "main_h-overlay_h-86",
  };
}

export function pickJokeMotionOverlay(seed: string, textLen = 0): MotionOverlay | null {
  if (textLen > 560 || !existsSync(JOKE_MOTION_DIR)) return null;
  const files = readdirSync(JOKE_MOTION_DIR)
    .map((f) => f.toString())
    .filter((f) => /\.gif$/i.test(f))
    .sort();
  if (files.length === 0) return null;
  const h = stableHash(seed);
  const positions = [
    { x: "main_w-overlay_w-56", y: "main_h-overlay_h-58" },
    { x: "56", y: "main_h-overlay_h-58" },
    { x: "main_w-overlay_w-64", y: "64" },
  ];
  const pos = positions[(h >>> 4) % positions.length];
  return {
    path: resolve(JOKE_MOTION_DIR, files[h % files.length]),
    width: textLen > 420 ? 132 : 172,
    x: pos.x,
    y: pos.y,
  };
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

  const frames = Math.max(1, Math.round(dur * 30));
  const baseStill =
    "scale=1080:1920:force_original_aspect_ratio=decrease," +
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1";
  const motionVf =
    opts.stillMotion === "slow-zoom"
      ? `scale=1200:2134:force_original_aspect_ratio=increase,crop=1200:2134,zoompan=z='min(zoom+0.00055,1.055)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,setsar=1`
      : opts.stillMotion === "slow-drift-left"
        ? `scale=1160:2062:force_original_aspect_ratio=increase,crop=1160:2062,zoompan=z='1.03':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,setsar=1`
        : opts.stillMotion === "slow-drift-right"
          ? `scale=1160:2062:force_original_aspect_ratio=increase,crop=1160:2062,zoompan=z='1.03':x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=30,setsar=1`
          : null;
  const vf = motionVf ?? baseStill;

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
    const overlay = `[0:v]${vf}[base];[2:v]fps=30,scale=${motion.width}:-1:flags=lanczos,format=rgba[sticker];[base][sticker]overlay=x='${motion.x}':y='${motion.y}':shortest=0:format=auto[v]`;
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
