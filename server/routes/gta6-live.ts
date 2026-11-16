import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { uid } from "../infra/auth-session.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
import { Gta6LiveSessions } from "../services/gta6-live-session.ts";

const Start = z.object({
  url: z.string().trim().min(1).max(2048),
  minutes: z.number().int().min(5).max(30).optional(),
  telegram: z.boolean().optional(),
  chunks: z.number().int().min(1).max(12).optional(),
  cuts: z.number().int().min(1).max(8).optional(),
}).strict();
const Stop = z.object({ id: z.string().trim().min(1).max(80) }).strict();

function present(state: Awaited<ReturnType<Gta6LiveSessions["view"]>>) {
  return {
    ...state,
    channels: state.channels.map((channel) => ({
      ...channel,
      clips: channel.clips.map((clip) => ({
        ...clip,
        url: `/api/gta6-live/clips/${encodeURIComponent(channel.id)}/${encodeURIComponent(clip.file)}`,
      })),
    })),
  };
}

function sameOrigin(req: FastifyRequest) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; }
  catch { return false; }
}

export function registerGta6LiveRoutes(app: FastifyInstance, root: string, sessions = new Gta6LiveSessions(root)) {
  app.addHook("onReady", async () => {
    const file = resolve(root, "hour.json");
    try {
      const spec = JSON.parse(await readFile(file, "utf8")) as { userId?: number; urls?: string[]; started?: boolean };
      if (!spec.userId || !Array.isArray(spec.urls)) return;
      if (!spec.started) {
        for (const url of spec.urls) await sessions.start(spec.userId, { url, minutes: 10, chunks: 6, cuts: 4 });
        await writeFile(file, `${JSON.stringify({ ...spec, started: true })}\n`);
      }
      await sessions.resumeInterrupted(spec.userId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") app.log.error(error);
    }
  });
  app.get("/api/gta6-live", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return present(await sessions.view(userId));
  });

  app.post("/api/gta6-live/start", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    if (!checkRateLimit(`gta6-live:${userId}`, { limit: 60, windowMs: 3600_000 }).ok) {
      return reply.code(429).send({ error: "Слишком много запусков, подождите немного." });
    }
    const parsed = Start.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Проверьте ссылку и длину куска." });
    try {
      return present(await sessions.start(userId, parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Не удалось начать эфир." });
    }
  });

  app.post("/api/gta6-live/stop", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const parsed = Stop.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Канал не найден." });
    try { return present(await sessions.stop(userId, parsed.data.id)); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Канал не найден." }); }
  });

  app.get("/api/gta6-live/clips/:channel/:file", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const params = req.params as { channel?: string; file?: string };
    let path: string;
    try { path = sessions.clipFile(userId, String(params.channel || ""), String(params.file || "")); }
    catch { return reply.code(400).send({ error: "Некорректный файл." }); }
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return reply.code(404).send({ error: "Клип не найден." });
    reply.header("Content-Type", "video/mp4");
    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "private, no-store");
    const range = req.headers.range;
    const matched = typeof range === "string" ? /^bytes=(\d+)-(\d*)$/u.exec(range) : null;
    if (typeof range === "string" && !matched) return reply.code(416).send();
    if (matched) {
      const start = Number(matched[1]);
      const end = matched[2] ? Number(matched[2]) : info.size - 1;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || end >= info.size) return reply.code(416).send();
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${info.size}`);
      reply.header("Content-Length", end - start + 1);
      return reply.send(createReadStream(path, { start, end }));
    }
    reply.header("Content-Length", info.size);
    return reply.send(createReadStream(path));
  });

  return sessions;
}
