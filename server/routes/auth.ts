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
  LOCK_SECONDS,
  SESSION_TTL_DAYS,
} from "../auth.ts";
import { checkRateLimit } from "../infra/rate-limits.ts";
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
import { COMMERCIAL_CREATOR_FEATURE } from "../services/creator-assets.ts";
import type { RouteDeps } from "./deps.ts";

const REGISTER_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000 };
const MIN_PASSWORD_LEN = 3;
const RESERVED_USERNAMES = new Set(["admin", "root", "system", "support", "shareboard"]);

function registerClientKey(req: { headers: Record<string, unknown>; ip?: string }): string {
  const cf = typeof req.headers["cf-connecting-ip"] === "string" ? req.headers["cf-connecting-ip"] : "";
  const forwarded = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"] : "";
  const ip = cf.trim() || forwarded.split(",")[0]?.trim() || req.ip || "unknown";
  return `auth-register:${ip}`;
}

function cleanRegisterUsername(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function registerAuthRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { validSessionUser, publicUser } = deps.auth;

  app.post("/api/auth/register", async (req, reply) => {
    const hit = checkRateLimit(registerClientKey(req), REGISTER_LIMIT);
    if (!hit.ok) {
      reply.header("Retry-After", String(Math.ceil((hit.retryAfterMs ?? 1_000) / 1_000)));
      return reply.code(429).send({ error: "Слишком много регистраций. Попробуйте чуть позже." });
    }

    const body = (req.body as { username?: string; password?: string }) ?? {};
    const username = cleanRegisterUsername(body.username);
    const password = body.password ?? "";
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) || RESERVED_USERNAMES.has(username)) {
      return reply.code(400).send({ error: "Логин: 3-32 символа, латиница/цифры/._-" });
    }
    if (password.length < MIN_PASSWORD_LEN || password.length > 200) {
      return reply.code(400).send({ error: "Пароль должен быть от 3 до 200 символов" });
    }
    if (db.listUsers().some((u) => u.username.trim().toLowerCase() === username)) {
      return reply.code(409).send({ error: "Такой логин уже занят" });
    }

    try {
      const user = db.createUser({ username, passHash: hashPassword(password), role: "user", passwordSet: true });
      db.setFeature(user.id, COMMERCIAL_CREATOR_FEATURE, true);
      const token = newSessionToken();
      db.createSession(token, user.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
      setSessionCookie(reply, token);
      return publicUser(req, user);
    } catch (e) {
      if (String(e).includes("UNIQUE")) return reply.code(409).send({ error: "Такой логин уже занят" });
      throw e;
    }
  });

  app.post("/api/auth/login", async (req, reply) => {
    const body = (req.body as { username?: string; password?: string }) ?? {};
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    if (!username || !password) return reply.code(400).send({ error: "Введите логин и пароль" });

    const user = db.getUserByUsername(username);
    // Generic message so an attacker can't probe which usernames exist.
    if (!user) return reply.code(401).send({ error: "Неверный логин или пароль" });

    // Lockout: refuse even a correct password while frozen; after it expires, start a fresh 10-try window.
    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const secs = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1_000));
      return reply.code(423).send({
        error: `Слишком много попыток. Вход заморожен на ~${secs} сек.`,
      });
    }
    if (user.lockedUntil) db.clearLock(user.id);

    if (!verifyPassword(password, user.passHash)) {
      const attempts = db.incFailedAttempts(user.id);
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const until = new Date(Date.now() + LOCK_SECONDS * 1_000).toISOString();
        db.lockUser(user.id, until);
        return reply.code(423).send({
          error: `Слишком много попыток. Вход заморожен на ${LOCK_SECONDS} сек.`,
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
