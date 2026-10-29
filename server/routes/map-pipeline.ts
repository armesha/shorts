import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { uid } from "../infra/auth-session.ts";
import { MapPipelineService } from "../services/map-pipeline/service.ts";

export function registerMapPipelineRoutes(app: FastifyInstance, service = new MapPipelineService({ log: message => app.log.info(message) }), canGenerate: (ownerId: number) => boolean = () => false) {
  app.addHook("onReady", async () => {
    try { await service.start(); }
    catch { app.log.error("[maps] Конвейер не запущен: проверьте сохранённое состояние. Остальные функции доступны."); }
  });
  app.addHook("onClose", () => service.close());
  app.get("/api/map-pipeline", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return { ...await service.list(uid(req)), canGenerate: canGenerate(uid(req)) };
  });
  for (const action of ["samples", "start", "stop"] as const) {
    app.post(`/api/map-pipeline/${action}`, async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (action !== "stop" && !canGenerate(uid(req))) return reply.code(403).send({ error: "Автоматическая генерация доступна администратору." });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
        catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
      }
      try {
        const rebuild = action === "samples" && (req.body as { rebuild?: unknown } | null)?.rebuild === true;
        return await (action === "samples" ? service.samples(uid(req), rebuild) : action === "start" ? service.begin(uid(req)) : service.stop(uid(req)));
      } catch { return reply.code(503).send({ error: "Конвейер недоступен. Сохранённые видео остаются в библиотеке." }); }
    });
  }
  for (const kind of ["video", "poster"] as const) {
    app.get(`/api/map-pipeline/jobs/:id/${kind}`, async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      const file = await service.file(uid(req), (req.params as { id: string }).id, kind === "video" ? "video.mp4" : "poster.jpg");
      if (!file) return reply.code(404).send({ error: "Видео не найдено." });
      reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
      reply.type(kind === "video" ? "video/mp4" : "image/jpeg");
      if (kind === "video") reply.header("Content-Disposition", `inline; filename="map-${(req.params as { id: string }).id}.mp4"`);
      reply.header("Accept-Ranges", "bytes");
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = match?.[1] ? Number(match[1]) : 0;
        let end = match?.[2] ? Number(match[2]) : file.size - 1;
        if (match && !match[1] && match[2]) { start = Math.max(0, file.size - Number(match[2])); end = file.size - 1; }
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= file.size || end < start || start < 0) return reply.code(416).header("Content-Range", `bytes */${file.size}`).send();
        end = Math.min(end, file.size - 1);
        reply.code(206).header("Content-Range", `bytes ${start}-${end}/${file.size}`).header("Content-Length", end - start + 1);
        return reply.send(createReadStream(file.file, { start, end }));
      }
      reply.header("Content-Length", file.size);
      return reply.send(createReadStream(file.file));
    });
  }
  return service;
}
