// User notification inbox (list/counts/SSE stream/read/unread/resolve/delete/read-all), the client +
// admin error log, and the server-health snapshot (/api/system). Handlers moved VERBATIM from index.ts.
// The SSE stream registers/unregisters clients on the SINGLE notifier hub injected via deps.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import * as metrics from "../infra/metrics.ts";
import { uid } from "../infra/auth-session.ts";
import type { NotificationStreamClient } from "../services/notify-stream.ts";
import type { RouteDeps } from "./deps.ts";

export function registerNotificationsRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { requireAdmin } = deps.auth;
  const { notificationVisible } = deps;
  const { notificationStreams, writeNotificationEvent, emitNotificationChange } = deps.notifier;

  // ---- User notifications: user issue inbox; admins may inspect all users' inboxes ----
  app.get("/api/notifications", async (req, reply) => {
    const q = (req.query as { scope?: string; status?: string; userId?: string; limit?: string; offset?: string }) ?? {};
    const scopeAll = q.scope === "all";
    if (scopeAll && !requireAdmin(req, reply)) return;
    const userId = scopeAll && q.userId ? Number(q.userId) : uid(req);
    if (!Number.isFinite(userId) || userId <= 0) return reply.code(400).send({ error: "Некорректный пользователь" });
    const status = q.status || "open";
    return db.listNotifications({
      userId: scopeAll && !q.userId ? undefined : userId,
      includeResolved: status === "all",
      onlyResolved: status === "resolved",
      onlyUnread: status === "unread",
      limit: Number(q.limit) || 100,
      offset: Number(q.offset) || 0,
    });
  });

  app.get("/api/notifications/stream", async (req, reply) => {
    const q = (req.query as { scope?: string }) ?? {};
    const scopeAll = q.scope === "all";
    if (scopeAll && !requireAdmin(req, reply)) return;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const client: NotificationStreamClient = {
      userId: uid(req),
      scopeAll,
      write: (chunk) => reply.raw.write(chunk),
      // Ending an SSE response leaves its keep-alive socket idle; Node's server.close() then waits
      // for the socket timeout. Destroy only this long-lived SSE socket during shutdown.
      close: () => {
        reply.raw.end();
        reply.raw.destroy();
      },
    };
    notificationStreams.add(client);
    writeNotificationEvent(client, "ready", { at: new Date().toISOString() });

    const ping = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        clearInterval(ping);
        notificationStreams.delete(client);
      }
    }, 25_000);

    req.raw.on("close", () => {
      clearInterval(ping);
      notificationStreams.delete(client);
    });
  });

  // SSE requests intentionally stay open. End them before Fastify closes its listener so a normal
  // restart does not wait for systemd's stop timeout while browser tabs are connected.
  app.addHook("preClose", async () => {
    for (const client of [...notificationStreams]) {
      try {
        client.close?.();
      } catch {
        /* a browser may already have disconnected */
      }
    }
    notificationStreams.clear();
  });

  app.get("/api/notifications/counts", async (req, reply) => {
    const q = (req.query as { scope?: string }) ?? {};
    const scopeAll = q.scope === "all";
    if (scopeAll && !requireAdmin(req, reply)) return;
    return db.notificationCounts(scopeAll ? undefined : uid(req));
  });

  app.post("/api/notifications/read-all", async (req, reply) => {
    const q = (req.query as { scope?: string }) ?? {};
    const scopeAll = q.scope === "all";
    if (scopeAll && !requireAdmin(req, reply)) return;
    const changed = db.markAllNotificationsRead(scopeAll ? undefined : uid(req));
    emitNotificationChange(scopeAll ? null : uid(req));
    return { ok: true, changed };
  });

  app.post("/api/notifications/:id/read", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
    const notification = db.markNotificationRead(id);
    if (notification) emitNotificationChange(notification.userId);
    return notification;
  });

  app.post("/api/notifications/:id/unread", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
    const notification = db.markNotificationUnread(id);
    if (notification) emitNotificationChange(notification.userId);
    return notification;
  });

  app.post("/api/notifications/:id/resolve", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
    const notification = db.resolveNotification(id);
    if (notification) emitNotificationChange(notification.userId);
    return notification;
  });

  app.delete("/api/notifications/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!notificationVisible(req, id)) return reply.code(404).send({ error: "Уведомление не найдено" });
    const notification = db.getNotification(id);
    db.deleteNotification(id);
    if (notification) emitNotificationChange(notification.userId);
    return { ok: true };
  });

  // ---- Error log: client-side reports (any user) + admin viewer/clear ----
  app.post("/api/client-error", async (req) => {
    const b = (req.body as { message?: string; detail?: string; context?: string }) ?? {};
    if (!b.message) return { ok: false };
    db.addError({
      source: "client",
      message: b.message,
      detail: b.detail ?? null,
      context: b.context ?? null,
      userId: uid(req),
    });
    return { ok: true };
  });

  app.get("/api/errors", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return db.listErrors(200);
  });

  app.delete("/api/errors", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    db.clearErrors();
    return { ok: true };
  });

  // ---- Server health (any logged-in user, per owner request): live CPU/RAM/disk + history + activity ----
  // All values are cheap in-process reads; history is an in-memory ring (no DB, no disk growth).
  // Behind the session gate (not public) but no longer admin-only — every user sees the load graph.
  app.get("/api/system", async () => {
    const accs = db.listAccounts();
    return {
      ...metrics.snapshot(),
      domain: {
        videosQueued: db.totalVideoCount(),
        accountsTotal: accs.length,
        accountsEnabled: accs.filter((a) => a.enabled).length,
        accountsConnected: accs.filter((a) => a.status === "connected").length,
        errors24h: db.recentErrorCount(24),
        errorsTotal: db.errorCount(),
      },
    };
  });
}
