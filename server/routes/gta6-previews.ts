import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";
import { GTA6_BANNERS, GTA6_CLIP_ID, type Gta6Banner, type Gta6Library } from "../services/gta6-library.ts";
import { probeCuttingMedia, runCuttingProcess } from "../services/video-cutting.ts";

const params = z.object({ id: z.string().regex(GTA6_CLIP_ID), banner: z.enum(GTA6_BANNERS) });
const pending = new Map<string, Promise<string>>();
let previewTail: Promise<unknown> = Promise.resolve();

export async function prepareGta6Preview(library: Gta6Library, id: string, banner: Gta6Banner) {
  const video = library.file(id, banner);
  const dir = dirname(video);
  const preview = resolve(dir, `${banner}-preview.jpg`);
  if ((await stat(preview).catch(() => null))?.isFile()) return preview;
  const existing = pending.get(preview);
  if (existing) return existing;
  const job = previewTail.then(async () => {
    const metaPath = resolve(dir, "clip.json");
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as { duration?: number };
    const duration = meta.duration ?? (await probeCuttingMedia(video)).duration;
    const seek = Math.min(12, duration * 0.15);
    const suffix = randomUUID();
    const temporary = resolve(dir, `.preview-${suffix}.jpg`);
    const metaTemp = resolve(dir, `.clip-${suffix}.json`);
    try {
      await runCuttingProcess(process.env.VIDEO_CUTTING_FFMPEG || "ffmpeg", [
        "-v", "error", "-threads", "1", "-ss", String(seek), "-i", video, "-frames:v", "1",
        "-filter_threads", "1", "-vf", "scale=720:-2", "-threads", "1", "-q:v", "4", temporary,
      ], { cwd: dir, timeoutMs: 15_000 });
      if (meta.duration === undefined) {
        await writeFile(metaTemp, JSON.stringify({ ...meta, duration }));
        await rename(metaTemp, metaPath);
      }
      await rename(temporary, preview);
      return preview;
    } finally {
      await rm(temporary, { force: true });
      await rm(metaTemp, { force: true });
    }
  });
  pending.set(preview, job);
  previewTail = job.then(() => undefined, () => undefined);
  try { return await job; }
  finally { pending.delete(preview); }
}

export function registerGta6Previews(app: FastifyInstance, libraryFor: (ownerId: number) => Gta6Library) {
  app.get("/api/creator/gta6-previews/:id/:banner", async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    const input = params.safeParse(req.params);
    if (!input.success) return reply.code(400).send({ error: "Некорректное превью." });
    try {
      const { id, banner } = input.data;
      const file = await prepareGta6Preview(libraryFor(ownerId), id, banner);
      const { duration } = JSON.parse(await readFile(resolve(dirname(file), "clip.json"), "utf8")) as { duration?: number };
      if (typeof duration === "number" && Number.isFinite(duration)) reply.header("X-Clip-Duration", String(duration));
      return reply.type("image/jpeg").header("Cache-Control", "private, max-age=3600").send(createReadStream(file));
    } catch { return reply.code(404).send({ error: "Превью недоступно." }); }
  });
}
