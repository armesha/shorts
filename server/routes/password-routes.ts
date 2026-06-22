// Self-service password change: a user changes their OWN password, so the admin who issued the
// initial one no longer knows it. Kept in a separate file for cohesion.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { hashPassword, verifyPassword } from "../auth.ts";

export function registerPasswordRoutes(app: FastifyInstance, db: Db) {
  // POST /api/auth/change-password { currentPassword, newPassword }
  // Gated by the global /api/* session hook, so req.userId is already set to the logged-in user.
  app.post("/api/auth/change-password", async (req, reply) => {
    const userId = (req as { userId?: number }).userId;
    if (!userId) return reply.code(401).send({ error: "Не авторизован" });

    const body = (req.body as { currentPassword?: string; newPassword?: string }) ?? {};
    const current = body.currentPassword ?? "";
    const next = body.newPassword ?? "";
    if (!current || !next) return reply.code(400).send({ error: "Заполни оба поля" });
    if (next.length < 6) return reply.code(400).send({ error: "Новый пароль — минимум 6 символов" });

    const user = db.getUserById(userId);
    if (!user) return reply.code(401).send({ error: "Пользователь не найден" });
    if (!verifyPassword(current, user.passHash))
      return reply.code(400).send({ error: "Текущий пароль неверный" });
    if (verifyPassword(next, user.passHash))
      return reply.code(400).send({ error: "Новый пароль должен отличаться от текущего" });

    // Single shared connection (WAL + busy_timeout enabled in openDb) — no separate connection needed.
    db.setUserPassword(userId, hashPassword(next));
    return { ok: true };
  });
}
