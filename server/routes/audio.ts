import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import {
  GEMINI_TTS_MODEL,
  GEMINI_TTS_PRESETS,
  GEMINI_TTS_VOICES,
  GeminiTtsError,
  generateGeminiTtsPreview,
  hasServerGeminiApiKey,
  listArmenTtsLanguages,
  type GeminiTtsPreviewInput,
} from "../services/gemini-tts.ts";

export function registerAudioRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  app.get("/api/audio/gemini/options", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    return {
      model: GEMINI_TTS_MODEL,
      serverKeyConfigured: hasServerGeminiApiKey(),
      languages: listArmenTtsLanguages(db),
      voices: GEMINI_TTS_VOICES,
      presets: GEMINI_TTS_PRESETS,
    };
  });

  app.post("/api/audio/gemini/preview", { bodyLimit: 80_000 }, async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    try {
      return await generateGeminiTtsPreview((req.body ?? {}) as GeminiTtsPreviewInput);
    } catch (error) {
      if (error instanceof GeminiTtsError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      req.log.error(error);
      return reply.code(500).send({ error: "Не удалось сгенерировать озвучку." });
    }
  });
}
