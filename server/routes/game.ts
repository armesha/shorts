import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_GAME_DIR = resolve(process.cwd(), "server/public/game");

const ASSET_TYPES: Readonly<Record<string, string>> = {
  "index.html": "text/html; charset=utf-8",
  "index.js": "text/javascript; charset=utf-8",
  "index.wasm": "application/wasm",
  "index.pck": "application/octet-stream",
  "index.audio.worklet.js": "text/javascript; charset=utf-8",
  "index.audio.position.worklet.js": "text/javascript; charset=utf-8",
  "index.png": "image/png",
  "index.icon.png": "image/png",
  "index.apple-touch-icon.png": "image/png",
};

type GameRouteOptions = {
  gameDir?: string;
};

function sendGameAsset(
  req: FastifyRequest,
  reply: FastifyReply,
  gameDir: string,
  assetName: string,
) {
  const contentType = ASSET_TYPES[assetName];
  if (!contentType) return reply.code(404).send({ error: "not found" });

  const filePath = resolve(gameDir, assetName);
  if (!existsSync(filePath)) return reply.code(404).send({ error: "not found" });

  const stat = statSync(filePath);
  const etag = 'W/"' + stat.size.toString(16) + "-" + Math.trunc(stat.mtimeMs).toString(16) + '"';
  reply.header("Cache-Control", assetName === "index.html" ? "no-cache" : "public, max-age=0, must-revalidate");
  reply.header("ETag", etag);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Cross-Origin-Resource-Policy", "same-origin");
  reply.type(contentType);
  if (req.headers["if-none-match"] === etag) return reply.code(304).send();
  return reply.send(createReadStream(filePath));
}

export function registerGameRoutes(app: FastifyInstance, options: GameRouteOptions = {}) {
  const gameDir = resolve(options.gameDir ?? DEFAULT_GAME_DIR);

  app.get("/game", async (_req, reply) => reply.redirect("/game/"));
  app.get("/game/", async (req, reply) => sendGameAsset(req, reply, gameDir, "index.html"));
  app.get("/game/:asset", async (req, reply) => {
    const assetName = String((req.params as { asset?: unknown }).asset ?? "");
    return sendGameAsset(req, reply, gameDir, assetName);
  });
}

