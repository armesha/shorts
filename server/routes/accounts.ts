// Channel (account) CRUD + avatar upload/list + publishing history. Regular users see/edit only their
// own channels; admins may pass ?scope=all and open any /accounts/:id. Handlers moved VERBATIM from
// index.ts. The source-deck validation / language guards run through the injected deckAccess cluster.
import type { FastifyInstance } from "fastify";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db, Account } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerAccountsRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const {
    accessibleAccount,
    rejectScheduleLimit,
    randomAvatar,
    listAvatarFiles,
    visibleAccounts,
    outputDir,
  } = deps;
  const { validateAccountSourceDeck, cleanDeckIds, accountSourceDecks, deckContentLang } = deps.deckAccess;

  // ---- Accounts ----
  // Regular users see/edit only their own channels. Admins may pass ?scope=all to list every user's
  // channels and may open/edit a specific /accounts/:id directly.
  app.get("/api/accounts", async (req) => visibleAccounts(req, (req.query as { scope?: string })?.scope));
  app.get("/api/accounts/:id", async (req, reply) => {
    const a = accessibleAccount(req, reply, Number((req.params as { id: string }).id));
    if (!a) return;
    return a;
  });
  app.post("/api/accounts", async (req, reply) => {
    const body = (req.body as Partial<Account>) ?? {};
    if (rejectScheduleLimit(req, reply, body.schedule, null)) return;
    return db.createAccount({
      ...body,
      userId: uid(req),
      avatar: body.avatar ?? randomAvatar(),
      avatarSource: body.avatar ? "manual" : "random",
    });
  });
  // Built-in avatar set (CC0) for the channel avatar picker.
  app.get("/api/avatars", async () => listAvatarFiles().map((f) => `/avatars/${f}`));
  // Upload a custom channel avatar (JSON { dataUrl }); stored under data/output/avatars, served via /files/.
  app.post("/api/accounts/:id/avatar", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!accessibleAccount(req, reply, id)) return;
    const { dataUrl } = (req.body as { dataUrl?: string }) ?? {};
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
    if (!m) return reply.code(400).send({ error: "Нужен PNG / JPEG / WEBP (data URL)." });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 3_000_000) return reply.code(400).send({ error: "Слишком большой файл (макс 3 МБ)." });
    const rel = `avatars/acc-${id}-${Date.now()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
    mkdirSync(resolve(process.cwd(), outputDir, "avatars"), { recursive: true });
    writeFileSync(resolve(process.cwd(), outputDir, rel), buf);
    return db.updateAccount(id, { avatar: `/files/${rel}` });
  });
  app.put("/api/accounts/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const acc = accessibleAccount(req, reply, id);
    if (!acc) return;
    const body = (req.body as Partial<Account>) ?? {};
    // avatar can only be one of our served paths (built-in /avatars/ or uploaded /files/avatars/)
    if (body.avatar != null && !/^\/(avatars|files)\//.test(body.avatar)) delete body.avatar;
    else if (body.avatar != null) body.avatarSource = "manual";
    const requestedSources = cleanDeckIds((body as { sourceDecks?: unknown }).sourceDecks);
    if (requestedSources.length) {
      const channelLang = (body.channelLang ?? acc.channelLang ?? "") as string;
      for (const deckId of requestedSources) {
        const err = validateAccountSourceDeck(req, deckId, channelLang);
        if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
      }
      body.sourceDecks = requestedSources;
      if (!body.lang || !requestedSources.includes(body.lang)) body.lang = requestedSources[0];
    } else if (body.lang) {
      const err = validateAccountSourceDeck(req, body.lang, (body.channelLang ?? acc.channelLang ?? "") as string);
      if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
      body.sourceDecks = [body.lang];
    }
    // Бэкстоп языка: язык выбранного контента (деки/пака) обязан совпадать с языком канала.
    {
      const sources = body.sourceDecks?.length ? body.sourceDecks : accountSourceDecks(acc);
      const newLang = body.lang ?? sources[0] ?? acc.lang ?? "";
      const newChannelLang = (body.channelLang ?? acc.channelLang ?? "") as string;
      for (const source of sources) {
        const cl = deckContentLang(req, source);
        if (newChannelLang && cl && cl !== newChannelLang)
          return reply
            .code(400)
            .send({ error: `Язык контента (${cl.toUpperCase()}) ≠ язык канала (${newChannelLang.toUpperCase()}) — выровняй их.` });
      }
      if (!sources.includes(newLang)) body.lang = sources[0] ?? newLang;
    }
    if (body.slotDecks && typeof body.slotDecks === "object" && !Array.isArray(body.slotDecks)) {
      const allowed = new Set(body.sourceDecks?.length ? body.sourceDecks : accountSourceDecks(acc));
      const clean: Record<string, string> = {};
      for (const [time, deckId] of Object.entries(body.slotDecks)) {
        const t = String(time || "").trim();
        const d = String(deckId || "").trim();
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) && allowed.has(d)) clean[t] = d;
      }
      body.slotDecks = clean;
    }
    // Caps are about platform load: the per-channel ceiling is 18/day for non-admin owners and 20/day
    // for admin-owned channels; the per-Google-key cap (92/day) applies to everyone alike.
    if (rejectScheduleLimit(req, reply, body.schedule, acc, id)) return;
    const a = db.updateAccount(id, body);
    if (!a) return reply.code(404).send({ error: "not found" });
    return a;
  });
  app.delete("/api/accounts/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!accessibleAccount(req, reply, id)) return;
    db.deleteAccount(id);
    return { ok: true };
  });

  // History list (paginated). Regular users see ONLY their own channels. Admins may pass
  // scope=all (every user), or narrow with userId / accountId. Returns { items, total, page, pageSize }.
  app.get("/api/history", async (req) => {
    const q =
      (req.query as {
        scope?: string;
        userId?: string;
        accountId?: string;
        onlyErrors?: string;
        page?: string;
        pageSize?: string;
      }) ?? {};
    const isAdmin = db.getUserById(uid(req))?.role === "admin";
    let filter: { ownerId?: number; accountId?: number };
    if (!isAdmin) filter = { ownerId: uid(req) }; // non-admin: locked to own channels
    else if (q.accountId) filter = { accountId: Number(q.accountId) };
    else if (q.userId) filter = { ownerId: Number(q.userId) };
    else if (q.scope === "all") filter = {}; // every user's channels
    else filter = { ownerId: uid(req) }; // admin's own (default)
    const onlyErrors = q.onlyErrors === "1" || q.onlyErrors === "true"; // «только не выложенные / с ошибками»
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
    const total = db.countHistoryFiltered({ ...filter, onlyErrors });
    const items = db.listHistoryFiltered({ ...filter, onlyErrors, limit: pageSize, offset: (page - 1) * pageSize });
    return { items, total, page, pageSize };
  });
}
