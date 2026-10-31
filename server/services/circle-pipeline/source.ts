import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const Response = z.object({ items: z.array(z.object({ id: z.number().int().positive(),
  date: z.string().min(1), file: z.string().min(1) }).strict()).max(1),
  nextBefore: z.number().int().nonnegative() }).strict();

export function circleSourceConfigured(): boolean {
  const root = resolve("data/social-private/circle-pipeline");
  return [resolve(root, "userbot.session"), resolve(root, "api_id"), resolve(root, "api_hash"),
    resolve("data/output/circle-pipeline/venv/bin/python")].every(existsSync);
}

/** Read only the explicitly configured public source, with bounded pagination. */
export async function fetchCircleCandidate(input: {
  directory: string; before?: number; exclude: number[]; session?: string;
}): Promise<{ items: { id: number; date: string; file: string }[]; nextBefore: number }> {
  const privateDir = resolve("data/social-private/circle-pipeline");
  const session = input.session || resolve(privateDir, "userbot.session");
  const idFile = resolve(privateDir, "api_id");
  const hashFile = resolve(privateDir, "api_hash");
  if (![session, idFile, hashFile].every(existsSync)) throw new Error("Telegram session is not configured");
  if (input.exclude.length > 50_000 || input.exclude.some(value => !Number.isSafeInteger(value) || value <= 0))
    throw new Error("Invalid source history");
  const root = process.cwd();
  const dir = resolve(input.directory);
  const env = Object.fromEntries(["HOME", "PATH", "LANG", "LC_ALL", "TMPDIR"].flatMap(key =>
    process.env[key] ? [[key, process.env[key]!]] : []));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const excludeFile = resolve(dir, `excluded-${randomUUID()}.json`);
  await writeFile(excludeFile, JSON.stringify(input.exclude), { mode: 0o600, flag: "wx" });
  let stdout: string;
  try {
    ({ stdout } = await exec(resolve(root, "data/output/circle-pipeline/venv/bin/python"), [
      resolve(root, "scripts/circle-telegram-source.py"), "--session", resolve(session), "--output", dir,
      "--api-id-file", idFile, "--api-hash-file", hashFile,
      "--limit", "50", "--before", String(input.before || 0), "--exclude-file", excludeFile,
    ], { cwd: root, env, timeout: 120_000, maxBuffer: 128_000 }));
  } finally { await rm(excludeFile, { force: true }); }
  const data = Response.parse(JSON.parse(stdout));
  for (const item of data.items) {
    if (resolve(item.file) !== resolve(dir, `${item.id}.mp4`) || input.exclude.includes(item.id))
      throw new Error("Invalid source result");
  }
  return data;
}
