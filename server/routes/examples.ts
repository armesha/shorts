import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import type { Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import {
  ANECDOTE_TEMPLATE_EXAMPLES_DIR,
  ANECDOTE_TEMPLATE_EXAMPLES_OWNER,
  collectAnecdoteTemplateExamples,
  publicAnecdoteTemplateExamples,
  refreshImageReadiness,
} from "../services/anecdote-template-examples.ts";

export function registerExamplesRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const outputRoot = resolve(process.cwd(), deps.outputDir, ANECDOTE_TEMPLATE_EXAMPLES_DIR);

  app.get("/api/examples/anecdote-templates", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const catalog = refreshImageReadiness(
      collectAnecdoteTemplateExamples(db, deps.outputDir, ANECDOTE_TEMPLATE_EXAMPLES_OWNER),
    );
    return publicAnecdoteTemplateExamples(catalog);
  });

  app.get("/api/examples/anecdote-templates/:imageId/image", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const raw = String((req.params as { imageId?: string }).imageId ?? "");
    const imageId = cleanImageId(raw);
    if (!imageId) return reply.code(404).send({ error: "not found" });
    const abs = resolve(outputRoot, `${imageId}.jpg`);
    const back = relative(outputRoot, abs);
    if (!back || back.startsWith("..") || isAbsolute(back) || !existsSync(abs)) {
      return reply.code(404).send({ error: "preview not rendered" });
    }
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.type("image/jpeg").send(createReadStream(abs));
  });

  app.get("/api/examples/anecdote-templates/:imageId/video", async (req, reply) => {
    if (!deps.auth.requireSuperAdmin(req, reply)) return;
    const raw = String((req.params as { imageId?: string }).imageId ?? "");
    const imageId = cleanImageId(raw);
    if (!imageId) return reply.code(404).send({ error: "not found" });
    const abs = resolve(outputRoot, `${imageId}.mp4`);
    const back = relative(outputRoot, abs);
    if (!back || back.startsWith("..") || isAbsolute(back) || !existsSync(abs)) {
      return reply.code(404).send({ error: "preview not rendered" });
    }
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.type("video/mp4").send(createReadStream(abs));
  });
}

function cleanImageId(raw: string): string | null {
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const value = raw.trim();
  if (!value || value.length > 140 || !/^[a-z0-9._-]+$/i.test(value)) return null;
  return value;
}
