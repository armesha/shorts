// Auth routes: login (with lockout throttling), logout, current user, and impersonation-stop.
// Handlers moved VERBATIM from index.ts. The global /api/* gate (in index.ts) sets req.userId; the
// public ones (/api/auth/login, /api/auth/impersonation/stop) are in PUBLIC_API there.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  SESSION_TTL_DAYS,
} from "../auth.ts";
import {
  SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  DAY_MS,
  getCookie,
  sessionCookieHeader,
  adminSessionCookieHeader,
  clearSessionCookieHeader,
  clearAdminSessionCookieHeader,
  setSessionCookie,
  uid,
} from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerAuthRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { validSessionUser, publicUser } = deps.auth;

  app.post("/api/auth/login", async (req, reply) => {
    const body = (req.body as { username?: string; password?: string }) ?? {};
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) return reply.code(400).send({ error: "Введите логин и пароль" });

    const user = db.getUserByUsername(username);
    // Generic message so an attacker can't probe which usernames exist.
    if (!user) return reply.code(401).send({ error: "Неверный логин или пароль" });

    // Lockout: refuse even a correct password while the account is locked.
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000));
      return reply.code(423).send({
        error: `Аккаунт заблокирован после ${MAX_FAILED_ATTEMPTS} неудачных попыток. Подождите ~${mins} мин.`,
      });
    }

    if (!verifyPassword(password, user.passHash)) {
      const attempts = db.incFailedAttempts(user.id);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        db.lockUser(user.id, until);
        return reply.code(423).send({
          error: `Слишком много попыток. Аккаунт заблокирован на ${LOCK_MINUTES} мин.`,
        });
      }
      return reply.code(401).send({
        error: `Неверный логин или пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - attempts}`,
      });
    }

    // Success → reset the counter and issue a session.
    db.clearLock(user.id);
    const token = newSessionToken();
    db.createSession(token, user.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
    setSessionCookie(reply, token);
    return publicUser(req, user);
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = getCookie(req, SESSION_COOKIE);
    const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
    if (token) db.deleteSession(token);
    if (adminToken && adminToken !== token) db.deleteSession(adminToken);
    reply.header("Set-Cookie", [clearSessionCookieHeader(), clearAdminSessionCookieHeader()]);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const user = db.getUserById(uid(req));
    if (!user) return reply.code(401).send({ error: "Не авторизован" });
    return publicUser(req, user);
  });

  app.post("/api/auth/impersonation/stop", async (req, reply) => {
    const adminToken = getCookie(req, ADMIN_SESSION_COOKIE);
    const admin = validSessionUser(adminToken);
    if (!admin || admin.role !== "admin" || !adminToken) {
      reply.header("Set-Cookie", clearAdminSessionCookieHeader());
      return reply.code(401).send({ error: "Админская сессия не найдена" });
    }
    const currentToken = getCookie(req, SESSION_COOKIE);
    if (currentToken && currentToken !== adminToken) db.deleteSession(currentToken);
    reply.header("Set-Cookie", [sessionCookieHeader(adminToken), clearAdminSessionCookieHeader()]);
    return publicUser(req, admin, null);
  });
}
