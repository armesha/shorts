import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import { uid } from "../infra/auth-session.ts";
import { CirclePipelineService } from "../services/circle-pipeline/service.ts";

export function registerCirclePipelineRoutes(app: FastifyInstance, service: CirclePipelineService,
  canGenerate: (ownerId: number) => boolean) {
  app.addHook("onReady", async () => {
    try { await service.start(); }
    catch { app.log.error("[circles] Не удалось запустить библиотеку кружков."); }
  });
  app.addHook("onClose", () => service.close());
  app.get("/api/circle-pipeline", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return { ...await service.status(uid(req)), canGenerate: canGenerate(uid(req)) };
  });
  for (const action of ["start", "stop"] as const) app.post(`/api/circle-pipeline/${action}`, async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    if (!canGenerate(uid(req))) return reply.code(403).send({ error: "Недостаточно прав." });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
      catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
    }
    try { return action === "start" ? await service.enable(uid(req)) : await service.disable(uid(req)); }
    catch { return reply.code(400).send({ error: "Не удалось изменить расписание." }); }
  });
  app.get("/api/circle-pipeline/jobs/:id/video", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    const job = (await service.library.list(uid(req))).find(item => item.id === (req.params as { id: string }).id && item.state === "ready");
    if (!job) return reply.code(404).send({ error: "Видео не найдено." });
    const file = resolve(service.library.directory(job), "video.mp4");
    let size: number;
    try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink()) throw new Error(); size = info.size; }
    catch { return reply.code(404).send({ error: "Видео не найдено." }); }
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff")
      .header("Accept-Ranges", "bytes").type("video/mp4");
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : size - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, size - Number(match[2])); end = size - 1; }
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || start >= size || end < start) return reply.code(416).header("Content-Range", `bytes */${size}`).send();
      end = Math.min(end, size - 1);
      return reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`).header("Content-Length", end - start + 1)
        .send(createReadStream(file, { start, end }));
    }
    return reply.header("Content-Length", size).send(createReadStream(file));
  });
}
