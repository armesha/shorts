// Health/changelog/config + per-user Google OAuth key (client_secret) management for Settings.
// Handlers moved VERBATIM from index.ts.
import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";
import { parseCredMeta, MAX_OAUTH_CLIENTS_PER_USER } from "../db.ts";
import { parseCreds, type ClientCreds } from "../services/youtube.ts";
import { publicClient } from "../services/oauth-clients-view.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerSettingsKeysRoutes(
  app: FastifyInstance,
  db: Db,
  deps: RouteDeps & { chromePath: string },
) {
  const REDIRECT_URI = deps.redirectUri;

  app.get("/api/health", async () => ({ ok: true, time: new Date().toISOString() }));

  // Project changelog (CHANGELOG.md) surfaced on the site — read live so it always reflects the file.
  app.get("/api/changelog", async () => {
    const file = resolve(process.cwd(), "CHANGELOG.md");
    const raw = existsSync(file) ? readFileSync(file, "utf8") : "";
    return { raw };
  });

  app.get("/api/config", async (req) => {
    const hasGoogleKey = db.countOAuthClients(uid(req)) > 0;
    return {
      hasGoogleKey,
      credsConfigured: hasGoogleKey, // alias kept for the channels badge
      chromePath: deps.chromePath,
      llm: "claude-code-headless",
    };
  });

  // Kept for back-compat (AppSettings.hasGoogleKey); the keys UI now uses /api/youtube/clients.
  app.get("/api/settings", async (req) => ({ hasGoogleKey: db.countOAuthClients(uid(req)) > 0 }));

  app.get("/api/youtube/clients", async (req) => ({
    clients: db.listOAuthClients(uid(req)).map(publicClient),
    max: MAX_OAUTH_CLIENTS_PER_USER,
    redirectUri: REDIRECT_URI, // authoritative redirect the server sends to Google
  }));

  app.post("/api/youtube/clients", async (req, reply) => {
    const body = (req.body as { json?: string; label?: string }) ?? {};
    const json = (body.json ?? "").trim();
    if (!json) return reply.code(400).send({ error: "Пустой файл ключа" });
    if (db.countOAuthClients(uid(req)) >= MAX_OAUTH_CLIENTS_PER_USER)
      return reply
        .code(409)
        .send({ error: `Можно хранить не больше ${MAX_OAUTH_CLIENTS_PER_USER} ключей — удалите лишний.` });
    let creds: ClientCreds;
    try {
      creds = parseCreds(json); // validates client_id/client_secret present
    } catch (e) {
      return reply.code(400).send({ error: "Неверный client_secret.json: " + String(e).slice(0, 120) });
    }
    const meta = parseCredMeta(json);
    const redirectOk = (creds.redirect_uris ?? []).includes(REDIRECT_URI);
    const client = db.addOAuthClient(uid(req), {
      json,
      label: body.label,
      clientId: meta.clientId || creds.client_id,
      projectId: meta.projectId,
    });
    return { client: publicClient(client), redirectOk, redirectUri: REDIRECT_URI };
  });

  app.patch("/api/youtube/clients/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const label = String((req.body as { label?: string })?.label ?? "").trim();
    if (!label) return reply.code(400).send({ error: "Пустое название" });
    if (!db.renameOAuthClient(uid(req), id, label.slice(0, 60))) return reply.code(404).send({ error: "Ключ не найден" });
    return { ok: true };
  });

  app.delete("/api/youtube/clients/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!db.listOAuthClients(uid(req)).some((c) => c.id === id)) return reply.code(404).send({ error: "Ключ не найден" });
    const inUse = db.accountsUsingOAuthClient(id);
    if (inUse.length)
      return reply.code(409).send({
        error: `Ключ используют каналы: ${inUse.map((a) => a.channelName).join(", ")}. Переподключите их на другой ключ и повторите.`,
      });
    db.deleteOAuthClient(uid(req), id);
    return { ok: true };
  });
}
