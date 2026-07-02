// Standalone Creator service. It owns only /creator and /api/creator/* so it can be
// restarted independently from the main upload/scheduler service on :8080.
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadBaseConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { getCookie, SESSION_COOKIE, ADMIN_SESSION_COOKIE, clearSessionCookieHeader, clearAdminSessionCookieHeader, sessionCookieHeader, makeAuthSession, uid } from "./infra/auth-session.ts";
import * as metrics from "./infra/metrics.ts";
import { gracefulShutdown } from "./infra/shutdown.ts";
import { registerCreatorRoutes } from "./routes/creator.ts";

const base = loadBaseConfig();
const port = Number(process.env.CREATOR_PORT ?? process.env.PORT ?? 8091);
const db = openDb(base.dbPath);
const auth = makeAuthSession(db);
const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

const CREATOR_WEB_DIST = resolve(process.cwd(), "web/dist-creator");
if (existsSync(resolve(CREATOR_WEB_DIST, "creator.html"))) {
  await app.register(fastifyStatic, {
    root: resolve(CREATOR_WEB_DIST, "assets"),
    prefix: "/creator/assets/",
    decorateReply: false,
    maxAge: "1y",
    immutable: true,
  });
  app.get("/creator", async (_req, reply) => {
    reply.type("text/html; charset=utf-8");
    return reply.send(createReadStream(resolve(CREATOR_WEB_DIST, "creator.html")));
  });
  app.get("/creator/*", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (path.startsWith("/creator/assets/")) return reply.code(404).send({ error: "not found" });
    reply.type("text/html; charset=utf-8");
    return reply.send(createReadStream(resolve(CREATOR_WEB_DIST, "creator.html")));
  });
  app.log.info("[creator-web] serving built frontend from web/dist-creator");
}

app.get("/api/creator/health", async () => ({ ok: true, service: "creator" }));

app.addHook("onRequest", async (req, reply) => {
  const path = req.url.split("?")[0];
  if (!path.startsWith("/api/creator/")) return;
  if (path === "/api/creator/health") return;
  const token = getCookie(req, SESSION_COOKIE);
  const sess = token ? db.getSession(token) : null;
  if (!sess || new Date(sess.expiresAt).getTime() < Date.now()) {
    if (token) db.deleteSession(token);
    return reply.code(401).send({ error: "Не авторизован" });
  }
  (req as { userId?: number }).userId = sess.userId;
});

app.setErrorHandler((err, req, reply) => {
  app.log.error(err);
  const e = err as { message?: string; stack?: string; statusCode?: number };
  try {
    db.addError({
      source: "creator",
      message: e?.message || String(err),
      detail: e?.stack || null,
      context: `${req.method} ${req.url.split("?")[0]}`,
      userId: (req as { userId?: number }).userId ?? null,
    });
  } catch {
    /* logging must never throw */
  }
  const sc = e?.statusCode;
  reply
    .code(sc && sc >= 400 && sc < 600 ? sc : 500)
    .send({ error: e?.message || "Внутренняя ошибка сервиса Creator" });
});

app.get("/api/creator/auth/me", async (req, reply) => {
  const user = db.getUserById(uid(req));
  if (!user) return reply.code(401).send({ error: "Не авторизован" });
  return auth.publicUser(req, user);
});

app.post("/api/creator/auth/logout", async (req, reply) => {
  const token = getCookie(req, SESSION_COOKIE);
  const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
  if (token) db.deleteSession(token);
  if (adminToken) db.deleteSession(adminToken);
  reply.header("Set-Cookie", [clearSessionCookieHeader(), clearAdminSessionCookieHeader()]);
  return { ok: true };
});

app.post("/api/creator/auth/impersonation/stop", async (req, reply) => {
  const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
  const admin = auth.validSessionUser(adminToken);
  if (!admin || admin.role !== "admin") return reply.code(400).send({ error: "Нет активной сессии администратора" });
  const currentToken = getCookie(req, SESSION_COOKIE);
  if (currentToken && currentToken !== adminToken) db.deleteSession(currentToken);
  reply.header("Set-Cookie", [sessionCookieHeader(adminToken!), clearAdminSessionCookieHeader()]);
  return auth.publicUser(req, { ...admin, passwordSet: true }, null);
});

registerCreatorRoutes(app, db);

app
  .listen({ port, host: "127.0.0.1" })
  .then(() => {
    app.log.info(`Creator service on :${port}`);
    let shuttingDown = false;
    const onSignal = async (sig: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info(`[creator-shutdown] received ${sig}`);
      try {
        await gracefulShutdown({
          log: (m) => app.log.info("[creator-shutdown] " + m),
          stopScheduler: () => {},
          drainQueue: () => {},
          activeCounts: () => metrics.activeCounts(),
          closeServer: () => app.close(),
          closeDb: () => {
            try {
              db.db.close();
            } catch {
              /* already closed */
            }
          },
        });
      } catch (e) {
        app.log.error(e, "[creator-shutdown] shutdown error");
      }
      process.exit(0);
    };
    process.on("SIGTERM", () => void onSignal("SIGTERM"));
    process.on("SIGINT", () => void onSignal("SIGINT"));
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
