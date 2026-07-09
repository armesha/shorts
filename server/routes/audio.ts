import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  GeminiTtsCharacterError,
  geminiTtsCharacterSample,
  listGeminiTtsCharacters,
  renameGeminiTtsCharacter,
} from "../services/gemini-tts-characters.ts";

const AUDIO_AVATAR_MODEL_DIR = resolve(process.cwd(), "data/audio-avatars");
const AUDIO_AVATAR_MODELS: Record<string, { name: string; file: string; contentType: string; description: string; license: string; source: string }> = {
  "vika.vrm": {
    name: "Вика",
    file: "vika.vrm",
    contentType: "model/gltf-binary",
    description: "Оригинальный VRM 1.0 персонаж для вертикальных Shorts с анекдотами и мемами.",
    license: "Project-owned custom asset",
    source: "tmp/vika-avatar/vika.vrm",
  },
  "vika.glb": {
    name: "Вика GLB",
    file: "vika.glb",
    contentType: "model/gltf-binary",
    description: "GLB-экспорт того же персонажа для проверки совместимости.",
    license: "Project-owned custom asset",
    source: "tmp/vika-avatar/vika.glb",
  },
  "vityok.vrm": {
    name: "Витёк",
    file: "vityok.vrm",
    contentType: "model/gltf-binary",
    description: "Оригинальный полуреалистичный VRM 1.0 ведущий с полным набором visemes и эмоций.",
    license: "Project-owned custom asset",
    source: "tmp/vityok-avatar/vityok.vrm",
  },
  "vityok.glb": {
    name: "Витёк GLB",
    file: "vityok.glb",
    contentType: "model/gltf-binary",
    description: "GLB-экспорт Витька для проверки совместимости с glTF-пайплайнами.",
    license: "Project-owned custom asset",
    source: "tmp/vityok-avatar/vityok.glb",
  },
  "maya.glb": {
    name: "Майя",
    file: "maya.glb",
    contentType: "model/gltf-binary",
    description: "CC0 говорящая голова MakeHuman/MPFB с 52 ARKit-формами лица и Oculus-viseme для речи.",
    license: "CC0 1.0",
    source: "https://github.com/met4citizen/TalkingHead/blob/eed58d198076a7e1e825f804802921c4d3804d46/avatars/mpfb.glb",
  },
  "coolbanana.vrm": {
    name: "Cool Banana",
    file: "coolbanana.vrm",
    contentType: "model/gltf-binary",
    description: "CC0 VRM 0.x маскот из Open Source Avatars / 100Avatars R1.",
    license: "CC0",
    source: "https://arweave.net/o4gWzn4PPzYo2KPm-wFXnvBC7KrN6N_R0NNfg1yPPeM",
  },
};

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

  app.get("/api/audio/gemini/characters", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    return { characters: listGeminiTtsCharacters() };
  });

  app.patch("/api/audio/gemini/characters/:id", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    try {
      const id = (req.params as { id: string }).id;
      const body = (req.body ?? {}) as { name?: unknown };
      return renameGeminiTtsCharacter(id, body.name);
    } catch (error) {
      if (error instanceof GeminiTtsCharacterError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      req.log.error(error);
      return reply.code(500).send({ error: "Не удалось сохранить персонажа." });
    }
  });

  app.get("/api/audio/gemini/characters/:id/sample", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    try {
      const { stream, mimeType } = geminiTtsCharacterSample((req.params as { id: string }).id);
      return reply.type(mimeType).send(stream);
    } catch (error) {
      if (error instanceof GeminiTtsCharacterError) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      req.log.error(error);
      return reply.code(500).send({ error: "Не удалось открыть аудиопример." });
    }
  });

  app.get("/api/audio/avatar/models", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    return {
      models: Object.entries(AUDIO_AVATAR_MODELS).map(([id, model]) => {
        const abs = resolve(AUDIO_AVATAR_MODEL_DIR, model.file);
        return {
          id,
          name: model.name,
          file: model.file,
          description: model.description,
          license: model.license,
          source: model.source,
          available: existsSync(abs),
          size: existsSync(abs) ? statSync(abs).size : null,
          url: `/api/audio/avatar/model/${encodeURIComponent(id)}`,
        };
      }),
    };
  });

  app.get("/api/audio/avatar/model/:file", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const file = String((req.params as { file?: string }).file ?? "");
    const model = AUDIO_AVATAR_MODELS[file];
    if (!model) return reply.code(404).send({ error: "avatar model not found" });
    const abs = resolve(AUDIO_AVATAR_MODEL_DIR, model.file);
    if (!existsSync(abs)) return reply.code(404).send({ error: "avatar model file is missing" });
    const stat = statSync(abs);
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Length", String(stat.size));
    return reply.type(model.contentType).send(createReadStream(abs));
  });
}
