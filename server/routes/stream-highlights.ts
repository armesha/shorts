import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import { StreamHighlightJobs, type StreamJob } from "../services/stream-highlights-jobs.ts";

const Start = z.object({ url: z.string().trim().min(1).max(2048) }).strict();
const Id = z.object({ id: z.string().trim().min(1).max(80) }).strict();

function present(jobs: StreamJob[]) {
  return { jobs };
}

function sameOrigin(req: FastifyRequest) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}

export function registerStreamHighlightRoutes(app: FastifyInstance, root: string, jobs = new StreamHighlightJobs(root)) {
  app.get("/api/stream-highlights", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return present(await jobs.list(userId));
  });

  app.post("/api/stream-highlights", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    if (!checkRateLimit(`stream-highlights:${userId}`, { limit: 30, windowMs: 3600_000 }).ok)
      return reply.code(429).send({ error: "Слишком много разборов, подождите немного." });
    const parsed = Start.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Проверьте ссылку на запись." });
    try { return present(await jobs.start(userId, parsed.data.url)); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось начать разбор." }); }
  });

  app.post("/api/stream-highlights/:id/review", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const params = Id.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Разбор не найден." });
    try { return present(await jobs.review(userId, params.data.id, req.body)); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось сохранить оценку." }); }
  });

  app.post("/api/stream-highlights/:id/cancel", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const params = Id.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Разбор не найден." });
    try { return present(await jobs.cancel(userId, params.data.id)); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось отменить разбор." }); }
  });

  return jobs;
}
