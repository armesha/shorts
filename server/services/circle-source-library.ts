import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
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
  used?: string[];
  last?: string;
};

export type CircleSourceStats = {
  total: number;
  used: number;
  available: number;
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

function readRotation(file: string): RotationState | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as RotationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return null;
  }
}

async function writeRotation(file: string, state: RotationState): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

function resolvedRotation(userId: number, root: string): {
  file: string;
  available: string[];
  remaining: string[];
  used: string[];
  last?: string;
} {
  const available = listCircleSourcesForUser(userId, root);
  const availableSet = new Set(available);
  const file = rotationFile(userId, root);
  const previous = readRotation(file);
  const legacyRemaining = cleanNames(previous?.remaining).filter((item) => availableSet.has(item));
  const used = previous?.used
    ? cleanNames(previous.used)
    : previous
      ? available.filter((item) => !legacyRemaining.includes(item))
      : [];
  const usedSet = new Set(used);
  const remaining = legacyRemaining.filter((item) => !usedSet.has(item));
  const known = new Set([...used, ...remaining]);
  const added = shuffle(available.filter((item) => !known.has(item)));
  remaining.push(...added);
  return {
    file,
    available,
    remaining,
    used,
    last: typeof previous?.last === "string" ? previous.last : undefined,
  };
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

async function withRotationLock<T>(userId: number, root: string, run: () => Promise<T>): Promise<T> {
  const file = rotationFile(userId, root);
  const lockFile = `${file}.lock`;
  await mkdir(dirname(lockFile), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      handle = await open(lockFile, "wx", 0o600);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const info = await stat(lockFile);
        if (Date.now() - info.mtimeMs > 5 * 60_000) await rm(lockFile, { force: true });
      } catch {
        // The other process may have released the lock between open() and stat().
      }
      await wait(25);
    }
  }
  if (!handle) throw new Error("Не удалось заблокировать выбор Telegram-кружка.");
  try {
    return await run();
  } finally {
    await handle.close().catch(() => {});
    await rm(lockFile, { force: true }).catch(() => {});
  }
}

export function circleSourceStatsForUser(
  userId: number,
  root = circleProjectDir(),
): CircleSourceStats {
  const state = resolvedRotation(userId, root);
  const availableSet = new Set(state.available);
  const used = state.used.filter((item) => availableSet.has(item)).length;
  return {
    total: state.available.length,
    used,
    available: Math.max(0, state.available.length - used),
  };
}

export function listAvailableCircleSourcesForUser(
  userId: number,
  root = circleProjectDir(),
): string[] {
  const state = resolvedRotation(userId, root);
  const used = new Set(state.used);
  return state.available.filter((item) => !used.has(item));
}

export async function pickCircleSourceForUser(
  userId: number,
  root = circleProjectDir(),
): Promise<string | null> {
  return withRotationLock(userId, root, async () => {
    const state = resolvedRotation(userId, root);
    const picked = state.remaining.shift() || null;
    const used = picked ? [...new Set([...state.used, picked])] : state.used;
    await writeRotation(state.file, { remaining: state.remaining, used, last: picked || state.last });
    return picked;
  });
}

export async function releaseCircleSourceForUser(
  userId: number,
  source: string,
  root = circleProjectDir(),
): Promise<void> {
  const clean = String(source || "").trim();
  if (!clean) return;
  await withRotationLock(userId, root, async () => {
    const state = resolvedRotation(userId, root);
    const used = state.used.filter((item) => item !== clean);
    const remaining = state.available.includes(clean) && !state.remaining.includes(clean)
      ? [clean, ...state.remaining]
      : state.remaining;
    await writeRotation(state.file, { remaining, used, last: state.last });
  });
}
