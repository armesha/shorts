import { existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  AUDIO_EXT,
  PACK_AUDIO_DIR,
  listPackAudio,
  packAudioPathFor,
  packAudioTrackId,
  parsePackAudioTrack,
} from "../../src/video.ts";

export const MAX_PACK_AUDIO_FILES = 10;
export const MAX_PACK_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_PACK_AUDIO_UPLOAD_BYTES = 80 * 1024 * 1024;

export interface PackMusicTrack {
  id: string;
  name: string;
  fileName: string;
  bytes: number;
  url: string;
}

export interface PackMusicUploadInput {
  name?: string;
  type?: string;
  size?: number;
  dataUrl?: string;
}

export interface PackMusicUploadError {
  name: string;
  message: string;
}

export function musicNameFromFile(fileName: string): string {
  return basename(fileName, extname(fileName)).replace(/[-_]+/g, " ").trim() || fileName;
}

export function packMusicUrl(packId: string, fileName: string): string {
  return `/api/packs/${encodeURIComponent(packId)}/music/${encodeURIComponent(fileName)}`;
}

export function packMusicTracks(packId: string): PackMusicTrack[] {
  return listPackAudio(packId).flatMap((id) => {
    const parsed = parsePackAudioTrack(id);
    if (!parsed) return [];
    const abs = packAudioPathFor(packId, parsed.fileName);
    if (!existsSync(abs)) return [];
    return [{
      id,
      name: musicNameFromFile(parsed.fileName),
      fileName: parsed.fileName,
      bytes: statSync(abs).size,
      url: packMusicUrl(packId, parsed.fileName),
    }];
  });
}

export function packMusicContentType(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".opus":
      return "audio/opus";
    default:
      return "application/octet-stream";
  }
}

function cleanFileName(name: string): string {
  const ext = extname(name).toLowerCase();
  if (!AUDIO_EXT.has(ext)) throw new Error("Поддерживаются только mp3, m4a, aac, wav, ogg, opus");
  const rawStem = basename(name, ext);
  const stem = rawStem
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "track";
  return `${stem}${ext}`;
}

function uniqueFileName(packId: string, desired: string): string {
  const ext = extname(desired);
  const stem = basename(desired, ext);
  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? desired : `${stem}-${i + 1}${ext}`;
    if (!existsSync(packAudioPathFor(packId, candidate))) return candidate;
  }
  throw new Error("Не удалось подобрать имя файла");
}

function decodeDataUrl(dataUrl: string): Buffer {
  const raw = String(dataUrl || "");
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw);
  if (!match) return Buffer.from(raw, "base64");
  const mime = (match[1] || "").toLowerCase();
  if (mime && !mime.startsWith("audio/") && mime !== "video/mp4" && mime !== "application/ogg") {
    throw new Error("Файл не похож на аудио");
  }
  const payload = match[3] || "";
  return match[2] ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
}

export function savePackMusicUploads(
  packId: string,
  files: PackMusicUploadInput[],
): { added: PackMusicTrack[]; errors: PackMusicUploadError[] } {
  const added: PackMusicTrack[] = [];
  const errors: PackMusicUploadError[] = [];
  if (!Array.isArray(files) || files.length === 0) {
    return { added, errors: [{ name: "", message: "Выберите один или несколько аудиофайлов" }] };
  }
  if (files.length > MAX_PACK_AUDIO_FILES) {
    return { added, errors: [{ name: "", message: `За раз можно загрузить максимум ${MAX_PACK_AUDIO_FILES} файлов` }] };
  }

  mkdirSync(resolve(PACK_AUDIO_DIR, packId), { recursive: true });
  for (const file of files) {
    const originalName = String(file.name || "track").trim();
    try {
      const cleanName = uniqueFileName(packId, cleanFileName(originalName));
      const declaredSize = Number(file.size || 0);
      if (declaredSize > MAX_PACK_AUDIO_BYTES) throw new Error("Файл больше 25 МБ");
      const data = decodeDataUrl(String(file.dataUrl || ""));
      if (data.length === 0) throw new Error("Пустой файл");
      if (data.length > MAX_PACK_AUDIO_BYTES) throw new Error("Файл больше 25 МБ");
      const out = packAudioPathFor(packId, cleanName);
      const tmp = `${out}.tmp`;
      writeFileSync(tmp, data);
      renameSync(tmp, out);
      added.push({
        id: packAudioTrackId(packId, cleanName),
        name: musicNameFromFile(cleanName),
        fileName: cleanName,
        bytes: data.length,
        url: packMusicUrl(packId, cleanName),
      });
    } catch (e) {
      errors.push({
        name: originalName,
        message: e instanceof Error ? e.message : "Не удалось загрузить",
      });
    }
  }
  return { added, errors };
}

export function deletePackMusicTrack(packId: string, fileName: string): boolean {
  const abs = packAudioPathFor(packId, fileName);
  if (!existsSync(abs)) return false;
  unlinkSync(abs);
  return true;
}

export function deletePackMusicDir(packId: string): void {
  rmSync(resolve(PACK_AUDIO_DIR, packId), { recursive: true, force: true });
}
