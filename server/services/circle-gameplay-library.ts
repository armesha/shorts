import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { circleProjectDir } from "./circle-workspace.ts";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const SHARED_GAMEPLAY_DIR = "assets/fact-videos/voiced-memes-ru/sources";
const SHARED_GAMEPLAY_REGISTRY = "data/voiced-memes-ru/gameplay-sources.json";
const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const dimensionCache = new Map<string, { width: number; height: number }>();

type GameplayRegistry = {
  sources?: Array<{ file?: unknown }>;
};

function isVideoFile(file: string): boolean {
  if (!VIDEO_EXTENSIONS.has(extname(file).toLowerCase())) return false;
  try {
    return existsSync(file) && statSync(file).isFile();
  } catch {
    return false;
  }
}

function listWorkspaceGameplays(root: string): string[] {
  const dir = resolve(root, "gameplay");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name);
}

export function listUploadedCircleGameplays(root = circleProjectDir()): string[] {
  return listWorkspaceGameplays(root).sort((a, b) => a.localeCompare(b, "ru-RU"));
}

function sharedGameplayFiles(repositoryRoot: string): Map<string, string> {
  const sharedRoot = resolve(repositoryRoot, SHARED_GAMEPLAY_DIR);
  const registryFile = resolve(repositoryRoot, SHARED_GAMEPLAY_REGISTRY);
  let registry: GameplayRegistry;
  try {
    registry = JSON.parse(readFileSync(registryFile, "utf8")) as GameplayRegistry;
  } catch {
    return new Map();
  }

  const files = new Map<string, string>();
  for (const source of Array.isArray(registry.sources) ? registry.sources : []) {
    if (typeof source.file !== "string" || !source.file.trim()) continue;
    const file = resolve(repositoryRoot, source.file);
    const rel = relative(sharedRoot, file);
    if (!rel || rel.startsWith("..") || rel.includes("\\") || resolve(sharedRoot, rel) !== file) continue;
    if (!isVideoFile(file)) continue;
    files.set(basename(file), file);
  }
  return files;
}

export function listCircleGameplays(
  root = circleProjectDir(),
  repositoryRoot = process.cwd(),
): string[] {
  return [...new Set([
    ...listUploadedCircleGameplays(root),
    ...sharedGameplayFiles(repositoryRoot).keys(),
  ])].sort((a, b) => a.localeCompare(b, "ru-RU"));
}

export function resolveCircleGameplay(
  name: string,
  root = circleProjectDir(),
  repositoryRoot = process.cwd(),
): string | null {
  const fileName = basename(name);
  if (!fileName || fileName !== name) return null;
  const uploaded = resolve(root, "gameplay", fileName);
  if (isVideoFile(uploaded)) return uploaded;
  return sharedGameplayFiles(repositoryRoot).get(fileName) ?? null;
}

async function probeGameplayDimensions(file: string): Promise<{ width: number; height: number }> {
  const cached = dimensionCache.get(file);
  if (cached) return cached;
  const { stderr } = await pexec(
    FFMPEG,
    [
      "-hide_banner", "-loglevel", "info", "-i", file,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
    ],
    { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
  );
  const match = /\bVideo:[^\r\n]*?\b(\d{2,5})x(\d{2,5})\b/i.exec(stderr);
  const dimensions = {
    width: Number(match?.[1] || 0),
    height: Number(match?.[2] || 0),
  };
  dimensionCache.set(file, dimensions);
  return dimensions;
}

export async function pickCircleGameplay(
  names: string[],
  root = circleProjectDir(),
  repositoryRoot = process.cwd(),
  probe = probeGameplayDimensions,
): Promise<{ name: string; file: string } | null> {
  const resolved = names
    .map((name) => ({ name, file: resolveCircleGameplay(name, root, repositoryRoot) }))
    .filter((item): item is { name: string; file: string } => !!item.file);
  if (!resolved.length) return null;

  const measured = await Promise.all(resolved.map(async (item) => ({
    ...item,
    ...await probe(item.file),
  })));
  const fullHd = measured.filter(({ width, height }) => (
    Math.max(width, height) >= 1920 && Math.min(width, height) >= 1080
  ));
  const candidates = fullHd.length
    ? fullHd
    : measured.filter((item) => (
        item.width * item.height === Math.max(...measured.map(({ width, height }) => width * height))
      ));
  const selected = candidates[Math.floor(Math.random() * candidates.length)] || candidates[0];
  return selected ? { name: selected.name, file: selected.file } : null;
}
