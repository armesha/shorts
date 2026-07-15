import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

type IdeaRow = {
  id: number;
  title: string;
  description: string;
  author_id: number | null;
  author_name: string;
  created_at: string;
};

function ideaDto(row: IdeaRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    authorId: row.author_id,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

function text(value: unknown, limit: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);
}

export function registerIdeasRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { requireAdmin } = deps.auth;

  app.get("/api/ideas", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const rows = db.db
      .prepare("SELECT id, title, description, author_id, author_name, created_at FROM ideas ORDER BY created_at DESC, id DESC")
      .all() as IdeaRow[];
    return rows.map(ideaDto);
  });

  app.post("/api/ideas", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = (req.body ?? {}) as { title?: unknown; description?: unknown };
    const title = text(body.title, 140);
    const description = text(body.description, 1_000);
    if (!title) return reply.code(400).send({ error: "Напишите идею" });

    const authorId = uid(req);
    const author = db.getUserById(authorId);
    const result = db.db
      .prepare("INSERT INTO ideas (title, description, author_id, author_name) VALUES (?, ?, ?, ?)")
      .run(title, description, authorId, author?.username ?? "");
    const row = db.db
      .prepare("SELECT id, title, description, author_id, author_name, created_at FROM ideas WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as IdeaRow;
    return reply.code(201).send(ideaDto(row));
  });

  // Это общий список: удалить карточку может любой администратор.
  app.delete("/api/ideas/:id", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = Number((req.params as { id?: string }).id);
    if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "Некорректная идея" });
    const result = db.db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
    if (!result.changes) return reply.code(404).send({ error: "Идея не найдена" });
    return { ok: true };
  });
}
