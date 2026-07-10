import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type RussianSpeechViseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

export interface RussianLipSyncCue {
  start: number;
  end: number;
  viseme: RussianSpeechViseme;
  phone: string;
}

export interface RussianLipSyncTimeline {
  engine: "mfa-russian";
  version: 1;
  model: "russian_mfa@3.1.0";
  language: "ru";
  durationSec: number;
  alignmentMs: number;
  cached: boolean;
  cues: RussianLipSyncCue[];
}

type AlignInput = {
  transcript: string;
  wav?: Buffer;
  wavPath?: string;
};

type MfaInterval = [number, number, string];
type MfaAlignmentJson = {
  start?: unknown;
  end?: unknown;
  tiers?: {
    phones?: {
      entries?: unknown;
    };
  };
};

const PROJECT_ROOT = process.cwd();
const LIPSYNC_DIR = resolve(PROJECT_ROOT, "data/audio-lipsync");
const RUNTIME_DIR = resolve(LIPSYNC_DIR, "runtime");
const CACHE_DIR = resolve(LIPSYNC_DIR, "cache");
const MFA_ENV_DIR = resolve(RUNTIME_DIR, "env");
const MFA_BIN = process.env.SHORTS_MFA_BIN?.trim() || resolve(MFA_ENV_DIR, "bin/mfa");
const MFA_ROOT_DIR = process.env.SHORTS_MFA_ROOT?.trim() || resolve(RUNTIME_DIR, "mfa-root");
const MFA_ACOUSTIC_MODEL = resolve(MFA_ROOT_DIR, "pretrained_models/acoustic/russian_mfa.zip");
const MFA_DICTIONARY = resolve(MFA_ROOT_DIR, "pretrained_models/dictionary/russian_mfa.dict");
const ALIGNMENT_CACHE_VERSION = "mfa-russian-v1-model-3.1.0";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURED_OUTPUT = 24_000;

let alignmentQueue: Promise<void> = Promise.resolve();

export class RussianLipSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RussianLipSyncError";
  }
}

export function russianLipSyncStatus() {
  return {
    ready: existsSync(MFA_BIN) && existsSync(MFA_ACOUSTIC_MODEL) && existsSync(MFA_DICTIONARY),
    engine: "mfa-russian" as const,
    model: "russian_mfa@3.1.0" as const,
  };
}

export async function alignRussianLipSync(input: AlignInput): Promise<RussianLipSyncTimeline> {
  const transcript = normalizeRussianTranscript(input.transcript);
  if (!transcript) throw new RussianLipSyncError("В тексте не осталось русской речи для синхронизации.");
  if (!russianLipSyncStatus().ready) {
    throw new RussianLipSyncError("Локальный движок русской мимики не установлен.");
  }

  const wav = input.wav ?? (input.wavPath ? await readFile(input.wavPath) : null);
  if (!wav?.length) throw new RussianLipSyncError("Не удалось прочитать WAV для синхронизации.");
  const cacheKey = createHash("sha256")
    .update(ALIGNMENT_CACHE_VERSION)
    .update("\0")
    .update(transcript)
    .update("\0")
    .update(wav)
    .digest("hex");
  const cachePath = resolve(CACHE_DIR, `${cacheKey}.json`);
  const cached = await readCachedTimeline(cachePath);
  if (cached) return { ...cached, cached: true };

  return enqueueAlignment(async () => {
    const queuedCache = await readCachedTimeline(cachePath);
    if (queuedCache) return { ...queuedCache, cached: true };
    const timeline = await runAlignment(wav, transcript);
    await writeCachedTimeline(cachePath, timeline);
    return timeline;
  });
}

export function normalizeRussianTranscript(value: string): string {
  return String(value ?? "")
    .replace(/\[[^\]\r\n]{1,100}\]/g, " ")
    .replace(/[^\p{L}\p{N}'’\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6_000);
}

export function phoneToRussianViseme(phone: string): RussianSpeechViseme {
  const normalized = String(phone ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[ːˈˌ.]/g, "");
  if (!normalized || /^(sil|sp|spn|<eps>)$/i.test(normalized)) return "sil";
  if (/^(tɕ|dʐ|tʂ|ts|dz|c)/.test(normalized)) return "CH";
  if (/^[aɑɐæä]/.test(normalized)) return "aa";
  if (/^[eɛəɘɜʌœ]/.test(normalized)) return "E";
  if (/^[iɪɨyʏ]/.test(normalized)) return "I";
  if (/^[oɔɒɵø]/.test(normalized)) return "O";
  if (/^[uʊʉɯɤ]/.test(normalized)) return "U";
  if (/^[pbm]/.test(normalized)) return "PP";
  if (/^[fv]/.test(normalized)) return "FF";
  if (/^[td]/.test(normalized)) return "DD";
  if (/^[kgɡqɢxɣh]/.test(normalized)) return "kk";
  if (/^[sʂɕzʐʑʃʒç]/.test(normalized)) return "SS";
  if (/^[nɲŋɳ]/.test(normalized)) return "nn";
  if (/^[rɹɾɽlɫʎjw]/.test(normalized)) return "RR";
  if (/^[θð]/.test(normalized)) return "TH";
  return "sil";
}

export function mfaJsonToRussianLipSync(value: unknown, alignmentMs: number): RussianLipSyncTimeline {
  const data = (value ?? {}) as MfaAlignmentJson;
  const entries = Array.isArray(data.tiers?.phones?.entries) ? data.tiers?.phones?.entries : [];
  const cues: RussianLipSyncCue[] = [];
  for (const entry of entries) {
    if (!isMfaInterval(entry)) continue;
    const start = roundTime(entry[0]);
    const end = roundTime(entry[1]);
    const phone = entry[2].trim();
    if (end <= start) continue;
    const cue: RussianLipSyncCue = { start, end, viseme: phoneToRussianViseme(phone), phone };
    const previous = cues.at(-1);
    if (previous && previous.viseme === cue.viseme && cue.start - previous.end <= 0.025) {
      previous.end = cue.end;
      previous.phone = `${previous.phone} ${cue.phone}`.trim();
    } else {
      cues.push(cue);
    }
  }
  if (!cues.length) throw new RussianLipSyncError("MFA не вернула интервалы русских фонем.");
  const declaredEnd = finiteNumber(data.end);
  const durationSec = roundTime(Math.max(declaredEnd ?? 0, cues.at(-1)?.end ?? 0));
  return {
    engine: "mfa-russian",
    version: 1,
    model: "russian_mfa@3.1.0",
    language: "ru",
    durationSec,
    alignmentMs: Math.max(0, Math.round(alignmentMs)),
    cached: false,
    cues,
  };
}

async function runAlignment(wav: Buffer, transcript: string): Promise<RussianLipSyncTimeline> {
  const tempRoot = resolve(PROJECT_ROOT, "tmp/audio-lipsync");
  await mkdir(tempRoot, { recursive: true });
  const tempDir = await mkdtemp(resolve(tempRoot, "mfa-"));
  const wavPath = resolve(tempDir, "speech.wav");
  const textPath = resolve(tempDir, "speech.txt");
  const outputPath = resolve(tempDir, "alignment.json");
  const workPath = resolve(tempDir, "work");
  await mkdir(workPath, { recursive: true });
  await writeFile(wavPath, wav);
  await writeFile(textPath, `${transcript}\n`, "utf8");

  const startedAt = performance.now();
  try {
    await runMfa([
      "align_one",
      wavPath,
      textPath,
      "russian_mfa",
      "russian_mfa",
      outputPath,
      "--output_format",
      "json",
      "--temporary_directory",
      workPath,
      "--clean",
      "--overwrite",
      "--quiet",
    ]);
    const parsed = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
    return mfaJsonToRussianLipSync(parsed, performance.now() - startedAt);
  } catch (error) {
    if (error instanceof RussianLipSyncError) throw error;
    throw new RussianLipSyncError(error instanceof Error ? error.message : "MFA не смогла выровнять русскую речь.");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runMfa(args: string[]): Promise<void> {
  const timeoutMs = positiveInteger(process.env.SHORTS_MFA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const envBin = dirname(MFA_BIN);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(MFA_BIN, args, {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${envBin}:${process.env.PATH ?? ""}`,
        MFA_ROOT_DIR,
        OPENBLAS_NUM_THREADS: "1",
        OMP_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
      },
    });
    let output = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    const append = (chunk: Buffer | string) => {
      output = `${output}${String(chunk)}`.slice(-MAX_CAPTURED_OUTPUT);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid, "SIGTERM");
      killTimer = setTimeout(() => killProcessGroup(child.pid, "SIGKILL"), 2_000);
      killTimer.unref();
    }, timeoutMs);
    timer.unref();
    child.once("error", (error) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      rejectPromise(new RussianLipSyncError(`Не удалось запустить MFA: ${error.message}`));
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) {
        rejectPromise(new RussianLipSyncError(`MFA превысила лимит ${Math.round(timeoutMs / 1_000)} с.`));
        return;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail = output.trim().split(/\r?\n/).slice(-8).join(" ").slice(0, 1_000);
      rejectPromise(new RussianLipSyncError(`MFA завершилась с кодом ${code ?? signal ?? "unknown"}${detail ? `: ${detail}` : ""}`));
    });
  });
}

function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The exact MFA process has already exited.
    }
  }
}

function enqueueAlignment<T>(task: () => Promise<T>): Promise<T> {
  const result = alignmentQueue.then(task, task);
  alignmentQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readCachedTimeline(path: string): Promise<RussianLipSyncTimeline | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRussianLipSyncTimeline(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedTimeline(path: string, timeline: RussianLipSyncTimeline) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify({ ...timeline, cached: false })}\n`, "utf8");
  await rename(tempPath, path);
}

function isRussianLipSyncTimeline(value: unknown): value is RussianLipSyncTimeline {
  if (!value || typeof value !== "object") return false;
  const timeline = value as Partial<RussianLipSyncTimeline>;
  return (
    timeline.engine === "mfa-russian" &&
    timeline.version === 1 &&
    timeline.model === "russian_mfa@3.1.0" &&
    Array.isArray(timeline.cues) &&
    timeline.cues.length > 0 &&
    timeline.cues.every(
      (cue) =>
        !!cue &&
        typeof cue.start === "number" &&
        typeof cue.end === "number" &&
        typeof cue.phone === "string" &&
        typeof cue.viseme === "string",
    )
  );
}

function isMfaInterval(value: unknown): value is MfaInterval {
  return Array.isArray(value) && value.length >= 3 && finiteNumber(value[0]) != null && finiteNumber(value[1]) != null && typeof value[2] === "string";
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTime(value: number): number {
  return Math.round(Math.max(0, value) * 10_000) / 10_000;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
