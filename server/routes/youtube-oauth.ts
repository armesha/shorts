// YouTube OAuth: build the consent URL for a channel (bound to one of the owner's Google keys) and the
// redirect callback Google sends the browser back to. /api/youtube/callback is in PUBLIC_API (no session
// — Google redirects the browser). Handlers moved VERBATIM from index.ts.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { buildAuthUrl, exchangeAndGetChannel, parseCreds, type ClientCreds } from "../services/youtube.ts";
import { ytErrorMessage } from "../services/youtube-errors.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerYouTubeOAuthRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { accessibleAccount, accountOwnerId, redirectUri, webOrigin } = deps;
  const REDIRECT_URI = redirectUri;
  const WEB_ORIGIN = webOrigin;

  // ---- YouTube OAuth (connect a channel with ONE of the owner's keys; the channel is bound to it) ----
  app.get("/api/youtube/auth-url", async (req, reply) => {
    const accountId = Number((req.query as { accountId?: string }).accountId ?? 0);
    if (!accountId) return reply.code(400).send({ error: "accountId required" });
    const acc = accessibleAccount(req, reply, accountId);
    if (!acc) return;
    const ownerId = accountOwnerId(req, acc);
    const keys = db.listOAuthClients(ownerId);
    if (!keys.length) return reply.code(400).send({ error: "Сначала добавьте свой Google-ключ в Настройках" });
    // Pick the key: explicit ?clientId=, else the channel's existing binding (so RECONNECT — incl. an admin
    // reconnecting a user's channel — reuses the same key without a picker), else the only key, else ask.
    const requested = Number((req.query as { clientId?: string }).clientId ?? 0);
    let chosen = requested ? keys.find((k) => k.id === requested) ?? null : null;
    if (requested && !chosen) return reply.code(400).send({ error: "Выбранный Google-ключ не найден" });
    if (!chosen && acc.oauthClientId) chosen = keys.find((k) => k.id === acc.oauthClientId) ?? null;
    if (!chosen) {
      if (keys.length > 1)
        return reply.code(400).send({ error: "Выберите, каким Google-ключом подключить канал", code: "choose_key" });
      chosen = keys[0];
    }
    const json = db.getOAuthClientSecretForUser(ownerId, chosen.id);
    if (!json) return reply.code(400).send({ error: "Google-ключ недоступен" });
    let creds: ClientCreds;
    try {
      creds = parseCreds(json);
    } catch {
      return reply.code(400).send({ error: "Google-ключ повреждён — загрузите его заново в Настройках" });
    }
    // Carry the chosen key id in the OAuth state; bind it to the channel ONLY after a successful exchange
    // (in the callback) — so an abandoned consent never rebinds/breaks an already-working channel.
    const state = `${accountId}:${chosen.id}`;
    app.log.info({ accountId, user: uid(req), owner: ownerId, key: chosen.id, redirect: REDIRECT_URI }, "[oauth] auth-url issued");
    return { url: buildAuthUrl(creds, REDIRECT_URI, state) };
  });

  app.get("/api/youtube/callback", async (req, reply) => {
    const { code, state, error: gError } = req.query as { code?: string; state?: string; error?: string };
    app.log.info({ state, hasCode: !!code, gError, webOrigin: WEB_ORIGIN }, "[oauth] callback received");
    // state = "<accountId>:<oauthClientId>" (clientId optional for legacy links) — split for redirects + creds.
    const [accIdStr, clientIdStr] = String(state ?? "").split(":");
    const accountId = Number(accIdStr || 0);
    const chosenClientId = Number(clientIdStr || 0);
    const fail = (where: string, msg: string, detail: string | null = null) => {
      app.log.error({ state, where, msg }, "[oauth] callback failed");
      db.addError({
        source: "server",
        message: "Привязка YouTube: " + msg,
        detail,
        context: `youtube/callback ${where} state=${state}`,
      });
      return reply.redirect(`${WEB_ORIGIN}/accounts/${accIdStr ?? ""}?error=${encodeURIComponent(msg)}`);
    };
    if (gError) return fail("google", `Google отклонил доступ (${gError})`);
    if (!code || !state) return fail("params", "Google вернул запрос без code/state");
    // No session here (Google redirects the browser) — resolve the owner's key from the state/account.
    const acc = db.getAccount(accountId);
    if (!acc || acc.userId == null) return fail("account", `Канал #${accIdStr} не найден или без владельца`);
    // Decide the key id: from state, else the channel's existing binding, else (legacy link) the owner's
    // newest key. We ALWAYS bind on success below, so a connected channel is never left unbound (which would
    // later make accountCreds guess a possibly-wrong key).
    let useClientId = chosenClientId || acc.oauthClientId || 0;
    if (!useClientId) {
      const ks = db.listOAuthClients(acc.userId);
      useClientId = ks.length ? ks[ks.length - 1].id : 0; // listOAuthClients is ordered by id → last = newest
    }
    if (!useClientId) return fail("creds", "Google-ключ канала не найден — начните подключение заново из Настроек");
    const json = db.getOAuthClientSecretForUser(acc.userId, useClientId);
    let creds: ClientCreds | null = null;
    if (json) {
      try {
        creds = parseCreds(json);
      } catch {
        creds = null;
      }
    }
    if (!creds) return fail("creds", "Google-ключ канала не найден — начните подключение заново из Настроек");
    try {
      app.log.info({ accountId, owner: acc.userId, key: useClientId }, "[oauth] exchanging code for tokens…");
      const r = await exchangeAndGetChannel(creds, REDIRECT_URI, code);
      // Success → bind this channel to the key it actually authorized, then store the tokens.
      db.bindAccountOAuthClient(accountId, useClientId);
      db.setYouTube(accountId, r);
      app.log.info(
        { accountId, channelId: r.channelId, channelTitle: r.channelTitle, hasRefresh: !!r.refreshToken },
        "[oauth] connected ✓",
      );
      if (!r.refreshToken)
        app.log.warn({ accountId }, "[oauth] no refresh_token — re-consent likely needed (prompt=consent)");
      return reply.redirect(`${WEB_ORIGIN}/accounts/${accountId}?connected=1`);
    } catch (err) {
      return fail("exchange", ytErrorMessage(err), (err as Error)?.stack ?? null);
    }
  });
}
