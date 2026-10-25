import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import {
  withActiveLimit,
  withGlobalRenderSlot,
  checkRateLimit,
  RateLimitError,
} from "../infra/rate-limits.ts";
import { track } from "../infra/metrics.ts";
import {
  renderMontageTemplate,
  validateMontageSegments,
} from "../services/montage-template.ts";
export function registerVideoTemplateRoutes(
  app: FastifyInstance,
  db: Db,
  outputDir: string,
) {
  app.post("/api/video-templates/montage", async (req, reply) => {
    const userId = uid(req);
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });
    const body = req.body as { source?: unknown; segments?: unknown };
    if (typeof body?.source !== "string")
      return reply.code(400).send({ error: "Загрузите исходное видео." });
    let segments;
    try {
      segments = validateMontageSegments(body.segments);
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message });
    }
    const limit = checkRateLimit(`montage:${userId}`, {
      limit: 20,
      windowMs: 3600000,
    });
    if (!limit.ok)
      return reply
        .code(429)
        .send({ error: "Слишком частая сборка. Повторите позже." });
    try {
      const result = await withActiveLimit(`montage:${userId}`, 1, () =>
        withGlobalRenderSlot(() =>
          track("render", () =>
            renderMontageTemplate({
              userId,
              source: body.source as string,
              segments,
              outputDir,
            }),
          ),
        ),
      );
      db.createCreatorGalleryItem({
        userId,
        packId: "template-montage",
        packName: "Нарезка видео",
        templateType: "montage",
        cardIndex: 0,
        title: "Нарезка видео",
        text: "",
        format: "mp4",
        videoRel: result.videoRel,
        durationSec: result.durationSec,
      });
      return {
        videoUrl: `/files/${result.videoRel}`,
        durationSec: result.durationSec,
      };
    } catch (e) {
      return reply
        .code(e instanceof RateLimitError ? 429 : 400)
        .send({
          error: e instanceof Error ? e.message : "Не удалось собрать видео.",
        });
    }
  });
}
