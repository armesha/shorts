// Channel (account) CRUD + avatar lookup + publishing history. Regular users see/edit only their
// own channels; admins may pass ?scope=all and open any /accounts/:id. Handlers moved VERBATIM from
// index.ts. The source-deck validation / language guards run through the injected deckAccess cluster.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Db, Account } from "../db.ts";
import { MANUAL_VIDEO_DECK } from "../../src/anecdotes/decks.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";
import { thematicBlockSlotDecksForAccount } from "./super-admin-channel-blocks.ts";

export function registerAccountsRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const {
    accessibleAccount,
    rejectScheduleLimit,
    listAvatarFiles,
    visibleAccounts,
    visibleAccount,
  } = deps;
  const { validateAccountSourceDeck, cleanDeckIds, accountSourceDecks, deckContentLang } = deps.deckAccess;

  // ---- Accounts ----
  // Regular users see only their own channels. Admins may pass ?scope=all and may open
  // channels from aggregate admin screens; mutation still goes through accessibleAccount below.
  app.get("/api/accounts", async (req) => visibleAccounts(req, (req.query as { scope?: string })?.scope, true));
  app.get("/api/accounts/:id", async (req, reply) => {
    const a = visibleAccount(req, Number((req.params as { id: string }).id), true);
    if (!a) return reply.code(404).send({ error: "Канал не найден" });
    return a;
  });
  app.post("/api/accounts", async (req, reply) => {
    const body = (req.body as Partial<Account>) ?? {};
    if (rejectScheduleLimit(req, reply, body.schedule, null, undefined, body.channelLang ?? body.lang ?? null)) return;
    const owner = db.getUserById(uid(req));
    const requestedLang = typeof body.lang === "string" ? body.lang.trim() : "";
    const sourceDecks = Array.isArray(body.sourceDecks)
      ? cleanDeckIds(body.sourceDecks)
      : requestedLang
        ? [requestedLang]
        : [];
    const lang = requestedLang || sourceDecks[0] || "";
    const requestedChannelLang = typeof body.channelLang === "string" ? body.channelLang.trim() : "";
    return db.createAccount({
      ...body,
      userId: uid(req),
      lang,
      sourceDecks,
      channelLang: requestedChannelLang || (lang ? deckContentLang(req, lang) || "" : ""),
      timezone: owner?.timezone ?? body.timezone,
      avatar: null,
      avatarSource: "youtube",
    });
  });
  // Legacy endpoint kept for old clients; the UI now always uses the real YouTube channel avatar.
  app.get("/api/avatars", async () => listAvatarFiles().map((f) => `/avatars/${f}`));
  app.post("/api/accounts/:id/avatar", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!accessibleAccount(req, reply, id)) return;
    return reply.code(410).send({ error: "Аватар канала берётся из YouTube и не задаётся вручную." });
  });
  app.put("/api/accounts/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const acc = accessibleAccount(req, reply, id);
    if (!acc) return;
    const body = (req.body as Partial<Account>) ?? {};
    delete body.avatar;
    delete body.avatarSource;
    const requestedSources = cleanDeckIds((body as { sourceDecks?: unknown }).sourceDecks);
    const hasExplicitSourceDecks = Array.isArray((body as { sourceDecks?: unknown }).sourceDecks);
    if (requestedSources.length) {
      const channelLang = (body.channelLang ?? acc.channelLang ?? "") as string;
      for (const deckId of requestedSources) {
        const err = validateAccountSourceDeck(req, deckId, channelLang);
        if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
      }
      body.sourceDecks = requestedSources;
      if (!body.lang || !requestedSources.includes(body.lang)) body.lang = requestedSources[0];
    } else if (hasExplicitSourceDecks) {
      body.sourceDecks = [];
      body.lang = "";
      const currentSlotDecks = body.slotDecks && typeof body.slotDecks === "object" && !Array.isArray(body.slotDecks)
        ? body.slotDecks
        : acc.slotDecks;
      body.slotDecks = Object.fromEntries(
        Object.entries(currentSlotDecks ?? {}).filter(([, deckId]) => deckId === MANUAL_VIDEO_DECK),
      );
    } else if (body.lang) {
      const err = validateAccountSourceDeck(req, body.lang, (body.channelLang ?? acc.channelLang ?? "") as string);
      if (err) return reply.code(err.startsWith("Неизвестный") ? 400 : 403).send({ error: err });
      body.sourceDecks = [body.lang];
    }
    // Бэкстоп языка: язык выбранного контента (деки/пака) обязан совпадать с языком канала.
    {
      const sources = Array.isArray(body.sourceDecks) ? body.sourceDecks : accountSourceDecks(acc);
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
    const hasExplicitSlotDecks = !!body.slotDecks && typeof body.slotDecks === "object" && !Array.isArray(body.slotDecks);
    {
      const schedule = Array.isArray(body.schedule) ? body.schedule : acc.schedule ?? [];
      const sources = Array.isArray(body.sourceDecks) ? body.sourceDecks : accountSourceDecks(acc);
      const mixedAccount = {
        ...acc,
        ...body,
        sourceDecks: sources,
        schedule,
        channelLang: (body.channelLang ?? acc.channelLang) as string,
      } as Account;
      const mixedSlotDecks = hasExplicitSlotDecks ? null : thematicBlockSlotDecksForAccount(db, deps, mixedAccount, schedule, sources);
      if (mixedSlotDecks) body.slotDecks = mixedSlotDecks;
    }
    if (body.slotDecks && typeof body.slotDecks === "object" && !Array.isArray(body.slotDecks)) {
      const allowed = new Set(Array.isArray(body.sourceDecks) ? body.sourceDecks : accountSourceDecks(acc));
      allowed.add(MANUAL_VIDEO_DECK);
      const clean: Record<string, string> = {};
      for (const [time, deckId] of Object.entries(body.slotDecks)) {
        const t = String(time || "").trim();
        const d = String(deckId || "").trim();
        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) && allowed.has(d)) clean[t] = d;
      }
      body.slotDecks = clean;
    }
    // Caps are about platform load: regular users get 5/day per channel and 50/day per Google key;
    // mgs keeps the legacy 18/92 profile; admins/super-admin keep their higher ceilings.
    if (rejectScheduleLimit(req, reply, body.schedule, acc, id, (body.channelLang ?? acc.channelLang) as string)) return;
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
  const historyFilterForReq = (
    req: FastifyRequest,
    q: { scope?: string; userId?: string; accountId?: string },
    canUseAllScope = deps.auth.isAdminLikeReq(req),
  ): { ownerId?: number; accountId?: number } => {
    if (!canUseAllScope) return { ownerId: uid(req) };
    if (q.accountId) return { accountId: Number(q.accountId) };
    if (q.userId) return { ownerId: Number(q.userId) };
    if (q.scope === "all") return {};
    return { ownerId: uid(req) };
  };

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
    const filter = historyFilterForReq(req, q);
    const onlyErrors = q.onlyErrors === "1" || q.onlyErrors === "true"; // «только не выложенные / с ошибками»
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25));
    const total = db.countHistoryFiltered({ ...filter, onlyErrors });
    const items = db.listHistoryFiltered({ ...filter, onlyErrors, limit: pageSize, offset: (page - 1) * pageSize });
    return { items, total, page, pageSize };
  });

  app.delete("/api/history/errors", async (req) => {
    const q =
      (req.query as {
        scope?: string;
        userId?: string;
        accountId?: string;
      }) ?? {};
    const removed = db.deleteHistoryErrors(historyFilterForReq(req, q, deps.auth.isAdminReq(req)));
    return { ok: true, removed };
  });
}
