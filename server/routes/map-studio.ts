import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, resolve, sep } from "node:path";
import type { Db } from "../db.ts";
import { getCookie, SESSION_COOKIE } from "../infra/auth-session.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};
export function registerMapStudioRoutes(app: FastifyInstance, db: Db) {
  const source = resolve(
    process.env.MAP_STUDIO_SOURCE || "/home/davtian/Documents/map",
    "public",
  );
  const built = resolve("data/map-studio");
  function loggedIn(req: { headers: { cookie?: string } }) {
    const value = getCookie(req, SESSION_COOKIE);
    const session = value ? db.getSession(value) : null;
    return (
      !!session &&
      Date.parse(session.expiresAt) > Date.now() &&
      !!db.getUserById(session.userId)
    );
  }
  app.get("/api/map-studio/themes", async (req, reply) => {
    if (!loggedIn(req))
      return reply.code(401).send({ error: "Не авторизован" });
    const dir = resolve(source, "data/themes");
    if (!existsSync(dir)) return { themes: [] };
    const themes = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((file) => {
        try {
          const theme = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
          return typeof theme.id === "string" &&
            typeof theme.name === "string" &&
            Array.isArray(theme.stops) &&
            theme.stops.length >= 2
            ? [{ id: theme.id, name: theme.name }]
            : [];
        } catch {
          return [];
        }
      });
    return { themes };
  });
  const serve = async (
    req: { headers: { cookie?: string }; params?: unknown },
    reply: FastifyReply,
  ) => {
    if (!loggedIn(req))
      return reply.code(401).send({ error: "Не авторизован" });
    const path = String(
      (req.params as { "*"?: string })?.["*"] || "index.html",
    );
    if (
      path.includes("..") ||
      path.includes("\\") ||
      /library|exports|local-videos|video-catalog/i.test(path) ||
      !MIME[extname(path).toLowerCase()]
    )
      return reply.code(404).send({ error: "not found" });
    const root =
      path === "index.html" || path.startsWith("assets/") ? built : source;
    if (
      root === source &&
      !/^(data|fonts|images|audio)\//.test(path) &&
      path !== "favicon.svg"
    )
      return reply.code(404).send({ error: "not found" });
    let file: string;
    try {
      const base = realpathSync(root);
      file = realpathSync(resolve(base, path));
      if (!file.startsWith(base + sep) || !statSync(file).isFile())
        throw new Error();
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
    reply
      .header("Cache-Control", "private, no-store")
      .type(MIME[extname(file).toLowerCase()]);
    return reply.send(createReadStream(file));
  };
  app.get("/map-studio/", serve);
  app.get("/map-studio/*", serve);
}
