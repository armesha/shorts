import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";

const MEMES_DIR = resolve(process.cwd(), "server/public/memes");
const IMAGE_RE = /^\d{4}\.(?:avif|jpe?g|png|webp)$/i;
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function sendFile(reply: FastifyReply, relativePath: string, contentType: string, cacheControl = "no-cache") {
  const filePath = resolve(MEMES_DIR, relativePath);
  if (!existsSync(filePath)) return reply.code(404).send({ error: "not found" });
  reply.header("Cache-Control", cacheControl);
  reply.type(contentType);
  return reply.send(createReadStream(filePath));
}

export function registerMemesRoutes(app: FastifyInstance) {
  app.get("/memes", async (_req, reply) => sendFile(reply, "index.html", "text/html; charset=utf-8"));
  app.get("/memes/", async (_req, reply) => sendFile(reply, "index.html", "text/html; charset=utf-8"));
  app.get("/memes/memes.js", async (_req, reply) =>
    sendFile(reply, "memes.js", "application/javascript; charset=utf-8", "public, max-age=3600"),
  );
  app.get("/memes/sources.json", async (_req, reply) =>
    sendFile(reply, "sources.json", "application/json; charset=utf-8", "public, max-age=3600"),
  );
  app.get("/memes/images/:name", async (req, reply) => {
    const name = String((req.params as { name?: unknown }).name ?? "");
    if (!IMAGE_RE.test(name)) return reply.code(404).send({ error: "not found" });
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    return sendFile(reply, `images/${name}`, IMAGE_CONTENT_TYPES[extension], "public, max-age=2592000");
  });
}
