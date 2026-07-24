import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { circleProjectDir } from "./circle-workspace.ts";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const OWNED_SOURCE_RE = /^circle-u([1-9]\d*)-/;

export function circleSourcePrefix(userId: number): string {
  return `circle-u${Math.max(1, Math.trunc(userId))}`;
}

export function telegramCircleSourceName(userId: number, fileUniqueId: string): string {
  const fingerprint = createHash("sha256").update(fileUniqueId).digest("hex").slice(0, 20);
  return `${circleSourcePrefix(userId)}-telegram-${fingerprint}.mp4`;
}

export function circleSourceOwnerId(fileName: string): number | null {
  const match = OWNED_SOURCE_RE.exec(fileName);
  return match ? Number(match[1]) : null;
}

export function circleSourceVisibleToUser(fileName: string, userId: number): boolean {
  const ownerId = circleSourceOwnerId(fileName);
  return ownerId == null || ownerId === userId;
}

export function listCircleSourcesForUser(userId: number, root = circleProjectDir()): string[] {
  const dir = resolve(root, "downloads");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (
      entry.isFile()
      && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase())
      && circleSourceVisibleToUser(entry.name, userId)
    ))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "ru-RU"));
}

type RotationState = {
  remaining?: string[];
  last?: string;
};

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function rotationFile(userId: number, root: string): string {
  return resolve(root, ".runtime", `source-rotation-u${Math.max(1, Math.trunc(userId))}.json`);
}

function readRotation(file: string): RotationState {
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as RotationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeRotation(file: string, state: RotationState): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

export async function pickCircleSourceForUser(
  userId: number,
  root = circleProjectDir(),
): Promise<string | null> {
  const available = listCircleSourcesForUser(userId, root);
  if (!available.length) return null;

  const file = rotationFile(userId, root);
  const previous = readRotation(file);
  const availableSet = new Set(available);
  let remaining = Array.isArray(previous.remaining)
    ? previous.remaining.filter((item) => availableSet.has(item))
    : [];

  if (!remaining.length) {
    remaining = shuffle(available);
    if (remaining.length > 1 && remaining[0] === previous.last) {
      [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
    }
  }

  const picked = remaining.shift() || available[0];
  await writeRotation(file, { remaining, last: picked });
  return picked;
}
