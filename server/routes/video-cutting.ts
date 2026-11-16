import { sharedWorkspaceUserIds } from "../services/shared-workspace.ts";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import { circleAdvertiserState, listCircleAdvertisers } from "../services/circle-advertisers.ts";
import {
  CUTTING_MODEL,
  CUTTING_EFFORT,
  CutRequestSchema,
} from "../services/video-cutting-plan.ts";
import { VideoCuttingService } from "../services/video-cutting.ts";
import { DailyCuttingService } from "../services/daily-cutting.ts";
import { isSuperAdminUser } from "../auth.ts";

export function registerVideoCuttingRoutes(
  app: FastifyInstance,
  db: Db,
  outputDir: string,
  service = new VideoCuttingService({ db, outputDir }),
  daily = new DailyCuttingService(service, { log: message => app.log.error(message) }),
) {
  app.addHook("onReady", async () => { try { await daily.start(); } catch { app.log.error("Не удалось загрузить расписание нарезок."); } });
  app.addHook("onClose", async () => daily.close());
  app.addHook("onClose", async () => service.close());
  app.get("/api/video-cutting/daily", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    const ownerId = daily.sharedOwner(sharedWorkspaceUserIds(db, userId), userId);
    const state = await daily.info(ownerId);
    const jobs = (await service.list(userId)).filter(job => job.daily);
    return { ...state, jobs, canManage: isSuperAdminUser(db.getUserById(userId)) || sharedWorkspaceUserIds(db, userId).length > 1 };
  });
  for (const action of ["start", "stop", "run-now"] as const) app.post(`/api/video-cutting/daily/${action}`, async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!isSuperAdminUser(db.getUserById(userId)) && sharedWorkspaceUserIds(db, userId).length < 2) return reply.code(403).send({ error: "Недостаточно прав." });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." }); }
      catch { return reply.code(403).send({ error: "Некорректный источник запроса." }); }
    }
    const ownerId = daily.sharedOwner(sharedWorkspaceUserIds(db, userId), userId);
    try { return action === "start" ? await daily.enable(ownerId) : action === "stop" ? await daily.disable(ownerId) : await daily.runNow(ownerId, (req.body as { url?: unknown } | null)?.url); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось изменить расписание." }); }
  });
  app.post("/api/video-cutting/daily/channels", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!isSuperAdminUser(db.getUserById(userId)) && sharedWorkspaceUserIds(db, userId).length < 2) return reply.code(403).send({ error: "Недостаточно прав." });
    const body = req.body as { url?: unknown; name?: unknown } | null;
    if (!body || typeof body.url !== "string" || (body.name !== undefined && typeof body.name !== "string"))
      return reply.code(400).send({ error: "Укажите ссылку на канал YouTube." });
    try { return await daily.addChannel(daily.sharedOwner(sharedWorkspaceUserIds(db, userId), userId), body.url, body.name); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось добавить канал." }); }
  });
  app.delete("/api/video-cutting/daily/channels", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!isSuperAdminUser(db.getUserById(userId)) && sharedWorkspaceUserIds(db, userId).length < 2) return reply.code(403).send({ error: "Недостаточно прав." });
    const body = req.body as { url?: unknown } | null;
    if (!body || typeof body.url !== "string") return reply.code(400).send({ error: "Укажите канал." });
    try { return await daily.removeChannel(daily.sharedOwner(sharedWorkspaceUserIds(db, userId), userId), body.url); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось удалить канал." }); }
  });
  app.get("/api/video-cutting", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    return {
      jobs: await service.list(userId),
      channels: sharedWorkspaceUserIds(db, userId)
        .flatMap(id => db.listAccountsByUser(id))
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
      activeBannerId: circleAdvertiserState().activeAdvertiserId,
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
  app.post("/api/video-cutting/jobs/:id/marks", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!isSuperAdminUser(db.getUserById(userId)) && sharedWorkspaceUserIds(db, userId).length < 2) return reply.code(403).send({ error: "Недостаточно прав." });
    const parsed = z.object({ part: z.number().int().positive().nullable(), mark: z.enum(["SR", "SM"]), checked: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Некорректная отметка." });
    try { return await service.setMark(userId, (req.params as { id: string }).id, parsed.data.part, parsed.data.mark, parsed.data.checked); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось сохранить отметку." }); }
  });
  app.delete("/api/video-cutting/jobs/:id", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const id = (req.params as { id: string }).id;
    if (!(await service.get(userId, id))) return reply.code(404).send({ error: "Нарезка не найдена." });
    try { const result = await service.deleteJob(userId, id); await daily.forgetJob(daily.sharedOwner(sharedWorkspaceUserIds(db, userId), userId), id); return result; }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось удалить нарезку." }); }
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
          .array(z.number().int().min(1).max(200))
          .min(1)
          .max(200)
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
    if (!Number.isInteger(part) || part < 1 || part > 200)
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
