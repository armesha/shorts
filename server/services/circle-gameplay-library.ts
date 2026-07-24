import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import { circleProjectDir } from "./circle-workspace.ts";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const SHARED_GAMEPLAY_DIR = "assets/fact-videos/voiced-memes-ru/sources";
const SHARED_GAMEPLAY_REGISTRY = "data/voiced-memes-ru/gameplay-sources.json";

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
    ...listWorkspaceGameplays(root),
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
