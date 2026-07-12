import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { RouteDeps } from "./deps.ts";

const DEFAULT_MEMES_DIR = resolve(process.cwd(), "server/public/memes");
const DEFAULT_SOURCE_DIR = "/home/davtian/Downloads/memes";
const IMAGE_RE = /^\d{4}\.(?:avif|jpe?g|png|webp)$/i;
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

type MemeRecord = { id: string; url: string; thumb?: string; [key: string]: unknown };
const execFileAsync = promisify(execFile);

function readMemes(dir: string): MemeRecord[] {
  const raw = readFileSync(resolve(dir, "memes.js"), "utf8").replace(/^window\.MEMES=/, "").replace(/;\s*$/, "");
  return JSON.parse(raw) as MemeRecord[];
}

function atomicWrite(path: string, value: string) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, value);
  renameSync(temporary, path);
}

function removeMemesFromDir(dir: string, ids: Set<string>): { removedIds: string[]; count: number } {
  if (!existsSync(resolve(dir, "memes.js"))) return { removedIds: [], count: 0 };
  const memes = readMemes(dir);
  const targets = memes.filter((meme) => ids.has(meme.id));
  if (!targets.length) return { removedIds: [], count: memes.length };
  const removedIds = targets.map((meme) => meme.id);
  const remaining = memes.filter((meme) => !ids.has(meme.id));
  atomicWrite(resolve(dir, "memes.js"), `window.MEMES=${JSON.stringify(remaining)};\n`);
  const jsonPath = resolve(dir, "memes.json");
  if (existsSync(jsonPath)) atomicWrite(jsonPath, `${JSON.stringify(remaining, null, 2)}\n`);

  const referenced = new Set(remaining.flatMap((meme) => [meme.url, meme.thumb].filter(Boolean)));
  for (const relativePath of new Set(targets.flatMap((target) => [target.url, target.thumb].filter(Boolean)))) {
    if (typeof relativePath !== "string" || referenced.has(relativePath) || !/^images\/\d{4}\.(?:avif|jpe?g|png|webp)$/i.test(relativePath)) continue;
    const imagePath = resolve(dir, relativePath);
    if (existsSync(imagePath)) unlinkSync(imagePath);
  }
  return { removedIds, count: remaining.length };
}

function markLedgerRemoved(dir: string, ids: Set<string>) {
  const ledgerPath = resolve(dir, "ingestion-ledger.json");
  if (!existsSync(ledgerPath)) return;
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as { updatedAt?: string; items?: Array<{ id?: string; status?: string; removedAt?: string }> };
  const removedAt = new Date().toISOString();
  let changed = false;
  for (const item of ledger.items ?? []) {
    if (!item.id || !ids.has(item.id)) continue;
    item.status = "removed";
    item.removedAt = removedAt;
    changed = true;
  }
  if (!changed) return;
  ledger.updatedAt = removedAt;
  atomicWrite(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

function sendFile(reply: FastifyReply, memesDir: string, relativePath: string, contentType: string, cacheControl = "no-cache") {
  const filePath = resolve(memesDir, relativePath);
  if (!existsSync(filePath)) return reply.code(404).send({ error: "not found" });
  reply.header("Cache-Control", cacheControl);
  reply.type(contentType);
  return reply.send(createReadStream(filePath));
}

export function registerMemesRoutes(
  app: FastifyInstance,
  deps?: Pick<RouteDeps, "auth">,
  options: { memesDir?: string; sourceDir?: string | null } = {},
) {
  const memesDir = options.memesDir ?? DEFAULT_MEMES_DIR;
  const sourceDir = options.sourceDir === undefined ? DEFAULT_SOURCE_DIR : options.sourceDir;
  app.get("/memes", async (_req, reply) => sendFile(reply, memesDir, "index.html", "text/html; charset=utf-8"));
  app.get("/memes/", async (_req, reply) => sendFile(reply, memesDir, "index.html", "text/html; charset=utf-8"));
  app.get("/memes/memes.js", async (_req, reply) =>
    sendFile(reply, memesDir, "memes.js", "application/javascript; charset=utf-8"),
  );
  app.get("/memes/sources.json", async (_req, reply) =>
    sendFile(reply, memesDir, "sources.json", "application/json; charset=utf-8", "public, max-age=3600"),
  );
  app.get("/memes/images/:name", async (req, reply) => {
    const name = String((req.params as { name?: unknown }).name ?? "");
    if (!IMAGE_RE.test(name)) return reply.code(404).send({ error: "not found" });
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    return sendFile(reply, memesDir, `images/${name}`, IMAGE_CONTENT_TYPES[extension], "public, max-age=2592000");
  });

  if (deps) app.delete("/api/memes/:id", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const id = String((req.params as { id?: unknown }).id ?? "");
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)) return reply.code(400).send({ error: "Некорректный ID мема" });
    const ids = new Set([id]);
    const result = removeMemesFromDir(memesDir, ids);
    if (!result.removedIds.length) return reply.code(404).send({ error: "Мем не найден" });
    markLedgerRemoved(memesDir, ids);
    if (sourceDir && resolve(sourceDir) !== resolve(memesDir)) {
      removeMemesFromDir(sourceDir, ids);
      markLedgerRemoved(sourceDir, ids);
    }
    return { ok: true, id, count: result.count };
  });

  if (deps) app.post("/api/memes/download", async (req, reply) => {
    const ids = new Set(Array.isArray((req.body as { ids?: unknown })?.ids) ? (req.body as { ids: unknown[] }).ids.map(String) : []);
    if (!ids.size || ids.size > 3000) return reply.code(400).send({ error: "Выберите от 1 до 3000 мемов" });
    const memes = readMemes(memesDir).filter((meme) => ids.has(meme.id));
    if (!memes.length) return reply.code(404).send({ error: "Мемы не найдены" });
    const files = [...new Set(memes.map((meme) => resolve(memesDir, meme.url)).filter(existsSync))];
    const temporaryDir = mkdtempSync(resolve(tmpdir(), "memoteka-download-"));
    const archivePath = resolve(temporaryDir, "memoteka.zip");
    try {
      await execFileAsync("zip", ["-j", "-q", archivePath, ...files]);
      reply.header("Content-Disposition", `attachment; filename=\"memoteka-${memes.length}.zip\"`);
      reply.type("application/zip");
      reply.raw.once("close", () => rmSync(temporaryDir, { recursive: true, force: true }));
      return reply.send(createReadStream(archivePath));
    } catch (error) {
      rmSync(temporaryDir, { recursive: true, force: true });
      throw error;
    }
  });

  if (deps) app.post("/api/memes/delete", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const rawIds = Array.isArray((req.body as { ids?: unknown })?.ids) ? (req.body as { ids: unknown[] }).ids.map(String) : [];
    const ids = new Set(rawIds.filter((id) => /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)));
    if (!ids.size || ids.size > 3000 || ids.size !== rawIds.length) return reply.code(400).send({ error: "Некорректный список мемов" });
    const result = removeMemesFromDir(memesDir, ids);
    markLedgerRemoved(memesDir, ids);
    if (sourceDir && resolve(sourceDir) !== resolve(memesDir)) {
      removeMemesFromDir(sourceDir, ids);
      markLedgerRemoved(sourceDir, ids);
    }
    return { ok: true, removedIds: result.removedIds, count: result.count };
  });
}
