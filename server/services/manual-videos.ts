import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";

const execFileAsync = promisify(execFile);

export { MANUAL_VIDEO_DECK };

export const MAX_MANUAL_VIDEO_DURATION_SEC = 60;
export const DEFAULT_MANUAL_VIDEO_MAX_FILE_MB = 40;
export const DEFAULT_MANUAL_VIDEO_UPLOADS_PER_HOUR = 100;
export const HARD_MAX_MANUAL_VIDEO_FILE_MB = 200;
export const HARD_MAX_MANUAL_VIDEO_UPLOADS_PER_HOUR = 1000;
export const MAX_MANUAL_VIDEO_UPLOAD_BYTES = Math.ceil(HARD_MAX_MANUAL_VIDEO_FILE_MB * 1024 * 1024 * 1.4);

const SETTINGS_MAX_FILE_MB = "manualVideo.maxFileMb";
const SETTINGS_UPLOADS_PER_HOUR = "manualVideo.uploadsPerHour";

export interface ManualVideoLimits {
  maxFileMb: number;
  uploadsPerHour: number;
  durationSec: number;
}

export interface ManualVideoSettingsStore {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

export interface ManualVideoUploadInput {
  name?: string;
  type?: string;
  size?: number;
  title?: string;
  dataUrl?: string;
}

export interface SavedManualVideo {
  title: string;
  text: string;
  videoRel: string;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function getManualVideoLimits(store: Pick<ManualVideoSettingsStore, "getSetting">): ManualVideoLimits {
  return {
    maxFileMb: clampInt(store.getSetting(SETTINGS_MAX_FILE_MB), DEFAULT_MANUAL_VIDEO_MAX_FILE_MB, 1, HARD_MAX_MANUAL_VIDEO_FILE_MB),
    uploadsPerHour: clampInt(
      store.getSetting(SETTINGS_UPLOADS_PER_HOUR),
      DEFAULT_MANUAL_VIDEO_UPLOADS_PER_HOUR,
      1,
      HARD_MAX_MANUAL_VIDEO_UPLOADS_PER_HOUR,
    ),
    durationSec: MAX_MANUAL_VIDEO_DURATION_SEC,
  };
}

export function setManualVideoLimits(
  store: ManualVideoSettingsStore,
  input: { maxFileMb?: unknown; uploadsPerHour?: unknown },
): ManualVideoLimits {
  const maxFileMb = clampInt(input.maxFileMb, DEFAULT_MANUAL_VIDEO_MAX_FILE_MB, 1, HARD_MAX_MANUAL_VIDEO_FILE_MB);
  const uploadsPerHour = clampInt(
    input.uploadsPerHour,
    DEFAULT_MANUAL_VIDEO_UPLOADS_PER_HOUR,
    1,
    HARD_MAX_MANUAL_VIDEO_UPLOADS_PER_HOUR,
  );
  store.setSetting(SETTINGS_MAX_FILE_MB, String(maxFileMb));
  store.setSetting(SETTINGS_UPLOADS_PER_HOUR, String(uploadsPerHour));
  return { maxFileMb, uploadsPerHour, durationSec: MAX_MANUAL_VIDEO_DURATION_SEC };
}

function cleanTitle(raw: string): string {
  return raw.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 90) || "Свой ролик";
}

function cleanFileName(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext !== ".mp4") throw new Error("Поддерживается только MP4");
  const rawStem = basename(name, ext);
  const stem = rawStem
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "clip";
  return `${stem}${ext}`;
}

function uniqueFileName(dir: string, desired: string): string {
  const ext = extname(desired);
  const stem = basename(desired, ext);
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? desired : `${stem}-${i + 1}${ext}`;
    if (!existsSync(resolve(dir, candidate))) return candidate;
  }
  throw new Error("Не удалось подобрать имя файла");
}

function decodeVideoDataUrl(dataUrl: string): Buffer {
  const raw = String(dataUrl || "");
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw);
  if (!match) return Buffer.from(raw, "base64");
  const mime = (match[1] || "").toLowerCase();
  if (mime && mime !== "video/mp4" && mime !== "application/octet-stream") {
    throw new Error("Файл не похож на MP4-видео");
  }
  const payload = match[3] || "";
  return match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
}

async function probeDurationSec(file: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const seconds = Number(String(stdout).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Не удалось определить длительность видео");
  return seconds;
}

export async function saveManualVideoUpload(
  outputDir: string,
  input: ManualVideoUploadInput,
  limits: ManualVideoLimits,
): Promise<SavedManualVideo> {
  const originalName = String(input.name || "clip.mp4").trim();
  const declaredSize = Number(input.size || 0);
  const maxBytes = limits.maxFileMb * 1024 * 1024;
  if (declaredSize > maxBytes) throw new Error(`Файл больше ${limits.maxFileMb} МБ`);
  const cleanName = cleanFileName(originalName);
  const data = decodeVideoDataUrl(String(input.dataUrl || ""));
  if (data.length === 0) throw new Error("Пустой файл");
  if (data.length > maxBytes) throw new Error(`Файл больше ${limits.maxFileMb} МБ`);

  const dir = resolve(process.cwd(), outputDir, "manual");
  mkdirSync(dir, { recursive: true });
  const fileName = uniqueFileName(dir, `${Date.now()}-${cleanName}`);
  const finalAbs = resolve(dir, fileName);
  const tmpAbs = `${finalAbs}.tmp`;
  writeFileSync(tmpAbs, data);
  try {
    const duration = await probeDurationSec(tmpAbs);
    if (duration > MAX_MANUAL_VIDEO_DURATION_SEC + 0.5) {
      throw new Error(`Видео длиннее ${MAX_MANUAL_VIDEO_DURATION_SEC} секунд`);
    }
    renameSync(tmpAbs, finalAbs);
  } catch (e) {
    try {
      unlinkSync(tmpAbs);
    } catch {
      /* already gone */
    }
    throw e;
  }

  const title = cleanTitle(String(input.title || originalName));
  return {
    title,
    text: "Загружено вручную",
    videoRel: `manual/${fileName}`,
  };
}
