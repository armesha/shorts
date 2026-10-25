import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import { listCircleAdvertisers } from "../services/circle-advertisers.ts";
import {
  CUTTING_MODEL,
  CUTTING_EFFORT,
  CutRequestSchema,
} from "../services/video-cutting-plan.ts";
import { VideoCuttingService } from "../services/video-cutting.ts";

export function registerVideoCuttingRoutes(
  app: FastifyInstance,
  db: Db,
  outputDir: string,
  service = new VideoCuttingService({ db, outputDir }),
) {
  app.addHook("onClose", async () => service.close());
  app.get("/api/video-cutting", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    return {
      jobs: await service.list(userId),
      banners: listCircleAdvertisers().map((item) => ({
        id: item.id,
        name: item.name,
      })),
      engine: { model: CUTTING_MODEL, effort: CUTTING_EFFORT },
    };
  });
  app.post("/api/video-cutting/jobs", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (
      !checkRateLimit(`video-cutting:${userId}`, {
        limit: 10,
        windowMs: 3600000,
      }).ok
    )
      return reply
        .code(429)
        .send({ error: "Слишком много задач. Попробуйте позже." });
    try {
      const parsed = CutRequestSchema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            error:
              parsed.error.issues[0]?.message || "Проверьте параметры нарезки.",
          });
      return reply.code(202).send(await service.create(userId, parsed.data));
    } catch (error) {
      return reply
        .code(400)
        .send({
          error:
            error instanceof Error
              ? error.message
              : "Не удалось создать задачу.",
        });
    }
  });
  app.get("/api/video-cutting/jobs/:id", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const job = await service.get(userId, (req.params as { id: string }).id);
    return job || reply.code(404).send({ error: "Задача не найдена." });
  });
  app.post("/api/video-cutting/jobs/:id/cancel", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const job = await service.cancel(userId, (req.params as { id: string }).id);
    return job || reply.code(404).send({ error: "Задача не найдена." });
  });
}
