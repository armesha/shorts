import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

function memberIds(
  body: unknown,
  userId: number,
  db: Db,
): number[] | null | false {
  if (!body || typeof body !== "object" || !("accountIds" in body)) return null;
  const input = (body as { accountIds: unknown }).accountIds;
  if (
    !Array.isArray(input) ||
    input.length > 1000 ||
    input.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    return false;
  const ids = [...new Set(input as number[])];
  return ids.every((id) => db.getAccount(id)?.userId === userId) ? ids : false;
}
function assignMembers(db: Db, id: number, ids: number[] | null) {
  if (ids === null) return;
  db.db.prepare("UPDATE accounts SET group_id=NULL WHERE group_id=?").run(id);
  const update = db.db.prepare("UPDATE accounts SET group_id=? WHERE id=?");
  for (const accountId of ids) update.run(id, accountId);
}
function cleanName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  return name && name.length <= 100 && !/[\x00-\x1f\x7f]/.test(name)
    ? name
    : null;
}
export function registerChannelGroupRoutes(
  app: FastifyInstance,
  db: Db,
  deps: Pick<RouteDeps, "accessibleAccount">,
) {
  app.register(async (routes) => {
    routes.addHook("onRequest", async (req, reply) => {
      if (!uid(req)) return reply.code(401).send({ error: "Не авторизован" });
    });
    routes.get("/api/channel-groups", async (req, reply) => {
      const accountId = (req.query as { accountId?: string })?.accountId;
      if (accountId) {
        const account = deps.accessibleAccount(req, reply, Number(accountId));
        if (!account) return;
        return db.listChannelGroups(account.userId ?? uid(req));
      }
      return db.listChannelGroups(uid(req));
    });
    routes.post("/api/channel-groups", async (req, reply) => {
      const name = cleanName((req.body as { name?: unknown })?.name);
      if (!name)
        return reply
          .code(400)
          .send({ error: "Введите название группы до 100 символов." });
      if (
        db
          .listChannelGroups(uid(req))
          .some(
            (g) =>
              g.name.toLocaleLowerCase("ru-RU") ===
              name.toLocaleLowerCase("ru-RU"),
          )
      )
        return reply
          .code(409)
          .send({ error: "Группа с таким названием уже есть." });
      const members = memberIds(req.body, uid(req), db);
      if (members === false)
        return reply.code(400).send({ error: "Выберите свои каналы." });
      db.db.exec("BEGIN IMMEDIATE");
      try {
        const group = db.createChannelGroup(uid(req), name);
        assignMembers(db, group.id, members);
        db.db.exec("COMMIT");
        return db.getChannelGroup(group.id);
      } catch (error) {
        db.db.exec("ROLLBACK");
        throw error;
      }
    });
    routes.put("/api/channel-groups/:id", async (req, reply) => {
      const id = Number((req.params as { id: string }).id),
        group = db.getChannelGroup(id);
      if (!group || group.userId !== uid(req))
        return reply.code(404).send({ error: "Группа не найдена." });
      const name = cleanName((req.body as { name?: unknown })?.name);
      if (!name)
        return reply
          .code(400)
          .send({ error: "Введите название группы до 100 символов." });
      if (
        db
          .listChannelGroups(uid(req))
          .some(
            (g) =>
              g.id !== id &&
              g.name.toLocaleLowerCase("ru-RU") ===
                name.toLocaleLowerCase("ru-RU"),
          )
      )
        return reply
          .code(409)
          .send({ error: "Группа с таким названием уже есть." });
      const members = memberIds(req.body, uid(req), db);
      if (members === false)
        return reply.code(400).send({ error: "Выберите свои каналы." });
      db.db.exec("BEGIN IMMEDIATE");
      try {
        db.renameChannelGroup(id, name);
        assignMembers(db, id, members);
        db.db.exec("COMMIT");
        return db.getChannelGroup(id);
      } catch (error) {
        db.db.exec("ROLLBACK");
        throw error;
      }
    });
    routes.delete("/api/channel-groups/:id", async (req, reply) => {
      const id = Number((req.params as { id: string }).id),
        group = db.getChannelGroup(id);
      if (!group || group.userId !== uid(req))
        return reply.code(404).send({ error: "Группа не найдена." });
      db.deleteChannelGroup(id);
      return { ok: true };
    });
  });
}
