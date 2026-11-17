import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { LOCK_SECONDS, MAX_FAILED_ATTEMPTS, SESSION_TTL_DAYS, newSessionToken, verifyPassword } from "./auth.ts";
import { getCookie } from "./infra/auth-session.ts";
import { checkRateLimit } from "./infra/rate-limits.ts";
import { registerStreamHighlightRoutes } from "./routes/stream-highlights.ts";
import { StreamHighlightJobs } from "./services/stream-highlights-jobs.ts";

export const NAREZKA_COOKIE = "narezka_sid";
const DAY_MS = 86_400_000;
const Login = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) }).strict();

type LoginUser = { id: number; username: string; passHash: string; lockedUntil?: string | null };
export type NarezkaDb = {
  getUserByUsername: (username: string) => LoginUser | null;
  getUserById: (id: number) => LoginUser | null;
  incFailedAttempts: (id: number) => number;
  lockUser: (id: number, untilIso: string) => void;
  clearLock: (id: number) => void;
  createSession: (token: string, userId: number, expiresAtIso: string) => void;
  getSession: (token: string) => { userId: number; expiresAt: string } | null;
  deleteSession: (token: string) => void;
};

function cookie(token: string, maxAge: number, secure: boolean) {
  const attrs = [`${NAREZKA_COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

function userIdOf(req: FastifyRequest, db: NarezkaDb) {
  const token = getCookie(req, NAREZKA_COOKIE);
  if (!token) return 0;
  const session = db.getSession(token);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session) db.deleteSession(token);
    return 0;
  }
  return session.userId;
}

export function createNarezkaApp(options: { db: NarezkaDb; jobs?: StreamHighlightJobs; root?: string; secure?: boolean; page?: string; logger?: boolean }) {
  const app = Fastify({ logger: options.logger === true });
  const secure = options.secure === true;
  const page = options.page || resolve(process.cwd(), "server/public/narezka/index.html");
  const root = options.root || resolve(process.cwd(), "data/stream-highlights");
  const jobs = options.jobs ?? new StreamHighlightJobs(root);

  app.get("/api/health", async () => ({ ok: true, service: "narezka" }));
  app.get("/", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.type("text/html; charset=utf-8");
    return reply.send(createReadStream(page));
  });

  app.post("/api/auth/login", async (req, reply) => {
    const ip = req.ip || "local";
    if (!checkRateLimit(`narezka-login:${ip}`, { limit: 30, windowMs: 3600_000 }).ok)
      return reply.code(429).send({ error: "Слишком много попыток входа. Подождите немного." });
    const parsed = Login.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Введите логин и пароль" });
    const user = options.db.getUserByUsername(parsed.data.username);
    if (!user) return reply.code(401).send({ error: "Неверный логин или пароль" });
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const secs = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000));
      return reply.code(423).send({ error: `Слишком много попыток. Вход заморожен на ~${secs} сек.` });
    }
    if (user.lockedUntil) options.db.clearLock(user.id);
    if (!verifyPassword(parsed.data.password, user.passHash)) {
      const attempts = options.db.incFailedAttempts(user.id);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        options.db.lockUser(user.id, new Date(Date.now() + LOCK_SECONDS * 1000).toISOString());
        return reply.code(423).send({ error: `Слишком много попыток. Вход заморожен на ${LOCK_SECONDS} сек.` });
      }
      return reply.code(401).send({ error: `Неверный логин или пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - attempts}` });
    }
    options.db.clearLock(user.id);
    const token = newSessionToken();
    options.db.createSession(token, user.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
    reply.header("Set-Cookie", cookie(token, SESSION_TTL_DAYS * 86_400, secure));
    return { username: user.username };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = getCookie(req, NAREZKA_COOKIE);
    if (token) options.db.deleteSession(token);
    reply.header("Set-Cookie", cookie("", 0, secure));
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const id = userIdOf(req, options.db);
    if (!id) return reply.code(401).send({ error: "Не авторизован" });
    const user = options.db.getUserById(id);
    if (!user) return reply.code(401).send({ error: "Не авторизован" });
    return { username: user.username };
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];
    if (!path.startsWith("/api/stream-highlights")) return;
    const id = userIdOf(req, options.db);
    if (!id) return reply.code(401).send({ error: "Не авторизован" });
    (req as FastifyRequest & { userId?: number }).userId = id;
  });
  registerStreamHighlightRoutes(app, root, jobs);
  return app;
}

export function narezkaPort() {
  return Number(process.env.NAREZKA_PORT || 8092);
}
