import type { FastifyInstance } from "fastify";
import { uid } from "../infra/auth-session.ts";
import type { SocialService } from "../services/social/store.ts";
import { SocialError, platformValue } from "../services/social/cookies.ts";

export function registerSocialRoutes(
  app: FastifyInstance,
  service: SocialService,
) {
  app.register(async (routes) => {
    routes.addHook("onRequest", async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
      reply.header("Cache-Control", "no-store");
      if (!["GET", "HEAD"].includes(req.method) && req.headers.origin) {
        let host = "";
        try {
          host = new URL(req.headers.origin).host;
        } catch {}
        if (host !== req.headers.host)
          return reply
            .code(403)
            .send({ error: "Запрос с другого сайта запрещён." });
      }
    });
    routes.setErrorHandler((error, _req, reply) => {
      if (error instanceof SocialError)
        return reply.code(error.statusCode).send({ error: error.message });
      return reply
        .code(500)
        .send({ error: "Не удалось выполнить действие. Повторите позже." });
    });
    routes.get("/api/social", async (req) => ({
      connections: service.list(uid(req)),
      jobs: service.jobs(uid(req)),
    }));
    routes.get("/api/social/videos", async (req) => ({
      videos: service.videos(uid(req)),
    }));
    routes.post(
      "/api/social/:platform/cookies",
      { bodyLimit: 520_000 },
      async (req) => {
        const p = platformValue((req.params as { platform: string }).platform);
        const body = req.body as { cookies?: unknown } | null;
        return {
          connections: service.importCookies(uid(req), p, body?.cookies),
        };
      },
    );
    routes.post("/api/social/:platform/verify", async (req) => ({
      connections: await service.verify(
        uid(req),
        platformValue((req.params as { platform: string }).platform),
      ),
    }));
    routes.delete("/api/social/:platform", async (req) => ({
      connections: service.disconnect(
        uid(req),
        platformValue((req.params as { platform: string }).platform),
      ),
    }));
    routes.post("/api/social/:platform/jobs", async (req) => {
      const body = req.body as {
        videoId?: unknown;
        caption?: unknown;
        runAt?: unknown;
      } | null;
      if (
        !body ||
        typeof body.videoId !== "number" ||
        typeof body.caption !== "string" ||
        typeof body.runAt !== "string"
      )
        throw new SocialError("Выберите ролик, подпись и время.");
      return {
        jobs: service.enqueue(
          uid(req),
          platformValue((req.params as { platform: string }).platform),
          body.videoId,
          body.caption,
          body.runAt,
        ),
      };
    });
    routes.post("/api/social/jobs/:id/not-published", async (req) => ({
      jobs: service.confirmNotPublished(
        uid(req),
        Number((req.params as { id: string }).id),
      ),
    }));
    routes.delete("/api/social/jobs/:id", async (req) => ({
      jobs: service.cancel(uid(req), Number((req.params as { id: string }).id)),
    }));
  });
}
