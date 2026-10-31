import { createReadStream } from "node:fs";
import type { FastifyInstance } from "fastify";
import { uid } from "../infra/auth-session.ts";
import { MapPipelineService } from "../services/map-pipeline/service.ts";
import type { MapPublisher } from "../services/map-pipeline/publisher.ts";

export function registerMapPipelineRoutes(app: FastifyInstance, service = new MapPipelineService({ log: message => app.log.info(message) }), canGenerate: (ownerId: number) => boolean = () => false, publisher?: MapPublisher) {
  app.addHook("onReady", async () => {
    try { await service.start(); }
    catch { app.log.error("[maps] Конвейер не запущен: проверьте сохранённое состояние. Остальные функции доступны."); }
  });
  app.addHook("onClose", () => service.close());
  if (publisher) {
    for (const action of ["approve-review", "rebuild-old"] as const) app.post(`/api/map-pipeline/${action}`, async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (!canGenerate(uid(req))) return reply.code(403).send({ error: "Недостаточно прав." });
      if (req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); } catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); } }
      try { return action === "approve-review" ? await service.approveReview(uid(req)) : await service.rebuildOld(uid(req)); }
      catch { return reply.code(400).send({ error: "Не удалось подготовить ролики." }); }
    });
    app.post("/api/map-pipeline/rebuild-numeric", async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (!canGenerate(uid(req))) return reply.code(403).send({ error: "Недостаточно прав." });
      if (req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); } catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); } }
      const ids = (req.body as { ids?: unknown } | null)?.ids;
      if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) return reply.code(400).send({ error: "Выберите ролики." });
      try { return await service.rebuildNumeric(uid(req), ids); }
      catch { return reply.code(400).send({ error: "Не удалось подготовить ролики." }); }
    });
    app.post("/api/map-pipeline/jobs/:id/removed", async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (!canGenerate(uid(req))) return reply.code(403).send({ error: "Недостаточно прав." });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
        catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
      }
      try { await publisher.recordRemoval(uid(req), (req.params as { id: string }).id); return { ok: true }; }
      catch { return reply.code(400).send({ error: "Не удалось обновить запись публикации." }); }
    });
    app.addHook("onReady", async () => { try { await publisher.start(); } catch { app.log.error("[map-publish] Публикации не запущены; проверьте состояние очереди."); } });
    app.addHook("onClose", () => publisher.close());
    app.post("/api/map-pipeline/publishing", async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (!canGenerate(uid(req))) return reply.code(403).send({ error: "Недостаточно прав." });
      const body = req.body as { accountId?: unknown; enabled?: unknown } | null;
      if (!body || !Number.isSafeInteger(body.accountId) || typeof body.enabled !== "boolean") return reply.code(400).send({ error: "Выберите канал публикации." });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
        catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
      }
      try { publisher.configure(uid(req), body.accountId as number, body.enabled); return { targets: publisher.info(uid(req)) }; }
      catch { return reply.code(400).send({ error: "Нужен собственный подключённый TikTok-канал." }); }
    });
  }
  app.get("/api/map-pipeline", async (req, reply) => {
    if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return { ...await service.list(uid(req)), canGenerate: canGenerate(uid(req)), targets: publisher?.info(uid(req)) || [] };
  });
  for (const action of ["samples", "start", "stop", "deadline"] as const) {
    app.post(`/api/map-pipeline/${action}`, async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      if (action !== "stop" && !canGenerate(uid(req))) return reply.code(403).send({ error: "Автоматическая генерация доступна администратору." });
      if (req.headers.origin) {
        try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
        catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
      }
      try {
        if (action === "deadline") {
          const endsAt = (req.body as { endsAt?: unknown } | null)?.endsAt;
          if (typeof endsAt !== "string" || !Number.isFinite(Date.parse(endsAt))) return reply.code(400).send({ error: "Укажите дату остановки." });
          try { return await service.shortenDeadline(uid(req), endsAt); }
          catch { return reply.code(400).send({ error: "Можно только сократить действующее расписание до будущей даты." }); }
        }
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
