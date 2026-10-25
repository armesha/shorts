import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { z } from "zod";
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
      channels: db
        .listAccountsByUser(userId)
        .filter(
          (account) => account.status === "connected" && !account.authError,
        )
        .map((account) => ({
          id: account.id,
          name: account.channelName,
          platform: account.platform || "youtube",
        })),
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
        return reply.code(400).send({
          error:
            parsed.error.issues[0]?.message || "Проверьте параметры нарезки.",
        });
      return reply.code(202).send(await service.create(userId, parsed.data));
    } catch (error) {
      return reply.code(400).send({
        error:
          error instanceof Error ? error.message : "Не удалось создать задачу.",
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
  app.post("/api/video-cutting/jobs/:id/channel", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const parsed = z
      .object({
        accountId: z.number().int().positive(),
        parts: z
          .array(z.number().int().min(1).max(30))
          .min(1)
          .max(30)
          .optional(),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "Выберите канал и готовые части." });
    const id = (req.params as { id: string }).id;
    if (!(await service.get(userId, id)))
      return reply.code(404).send({ error: "Нарезка не найдена." });
    try {
      return await service.addToChannel(
        userId,
        id,
        parsed.data.accountId,
        parsed.data.parts,
      );
    } catch (error) {
      return reply
        .code(400)
        .send({
          error:
            error instanceof Error
              ? error.message
              : "Не удалось добавить части на канал.",
        });
    }
  });
  app.delete("/api/video-cutting/jobs/:id/clips/:part", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const params = req.params as { id: string; part: string };
    if (!(await service.get(userId, params.id)))
      return reply.code(404).send({ error: "Нарезка не найдена." });
    const part = Number(params.part);
    if (!Number.isInteger(part) || part < 1 || part > 30)
      return reply.code(400).send({ error: "Укажите номер готовой части." });
    try {
      return await service.deletePart(userId, params.id, part);
    } catch (error) {
      return reply
        .code(400)
        .send({
          error:
            error instanceof Error
              ? error.message
              : "Не удалось удалить часть.",
        });
    }
  });
}
