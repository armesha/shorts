// Admin routes: user management, ElevenLabs key limits, per-user pack/deck visibility matrix + reset,
// pack-owner assignment, admin/user analytics snapshots, low-deck report, and /api/my-decks.
// Handlers moved VERBATIM from index.ts.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { hashPassword, isSuperAdminUser, newSessionToken, SESSION_TTL_DAYS } from "../auth.ts";
import { DECKS, deckLang } from "../../src/anecdotes/decks.ts";
import { listAllPacks, setGrant, setPackOwners, getPack, canAccess } from "../../src/packs/store.ts";
import { libraryStats, deckAnecdoteKeys } from "../../src/anecdotes/library.ts";
import { packCardKey } from "../services/pack-gen.ts";
import { INFINITE_PACKS_FEATURE, infiniteCounts } from "../services/infinite-packs.ts";
import { COMMERCIAL_CREATOR_FEATURE } from "../services/creator-assets.ts";
import { readElevenLabsKeys, fetchElevenLabsLimit } from "../services/elevenlabs-limits.ts";
import { getManualVideoLimits, setManualVideoLimits } from "../services/manual-videos.ts";
import { getReadinessLimits, setReadinessLimits } from "../services/readiness-limits.ts";
import { buildAdminAnalytics } from "../services/admin-analytics.ts";
import { grantDefaultRegisteredUserDecks, registeredUserDefaultGrantIds } from "../services/default-user-decks.ts";
import { parseStringArray, type Row } from "../db/mappers.ts";
import {
  DAY_MS,
  SESSION_COOKIE,
  getCookie,
  sessionCookieHeader,
  adminSessionCookieHeader,
  uid,
} from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerAdminRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { requireAdmin, requireSuperAdmin } = deps.auth;
  const { emitNotificationChange } = deps.notifier;
  const { isGrantableBuiltinDeck, isGrantableBuiltinDeckId, builtinDeckVisibleForUser, visibleDecksForUser } =
    deps.deckAccess;
  const isGrantableLongVideoDeckId = (deckId: string): boolean => {
    const deck = DECKS.find((d) => d.id === deckId);
    return !!deck?.longVideo && isGrantableBuiltinDeck(deck);
  };
  const currentAccountDecksByUser = (): Record<number, string[]> => {
    const sets: Record<number, Set<string>> = {};
    const add = (userId: number, deckId: string) => {
      if (!userId || !deckId || deckId.startsWith("pack:")) return;
      (sets[userId] ??= new Set()).add(deckId);
    };
    const rows = db.db
      .prepare("SELECT user_id, lang, source_decks, long_video_decks FROM accounts WHERE user_id IS NOT NULL")
      .all() as Row[];
    for (const row of rows) {
      const userId = Number(row.user_id);
      const sourceDecks = parseStringArray(row.source_decks, row.lang ? [String(row.lang)] : []);
      for (const deckId of sourceDecks) add(userId, deckId);
      for (const deckId of parseStringArray(row.long_video_decks, [])) add(userId, deckId);
    }
    return Object.fromEntries(Object.entries(sets).map(([userId, decks]) => [Number(userId), [...decks]]));
  };

  // ---- Admin: user management (admin creates accounts for friends) ----
  app.get("/api/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return db.listUsers().map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      isSuperAdmin: isSuperAdminUser(u),
      locked: !!(u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now()),
      createdAt: u.createdAt,
    }));
  });

  app.post("/api/admin/users", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = (req.body as { username?: string; password?: string; role?: string; hidden?: string[] }) ?? {};
    const username = (body.username ?? "").trim();
    const password = body.password ?? "";
    const role = body.role === "admin" ? "admin" : "user";
    const isSuperAdmin = deps.auth.isSuperAdminReq(req);
    if (role === "admin" && !isSuperAdmin) {
      return reply.code(403).send({ error: "Роль админа может выдавать только главный администратор" });
    }
    if (!isSuperAdmin && Array.isArray(body.hidden) && body.hidden.length > 0) {
      return reply.code(403).send({ error: "Паки нового пользователя может настраивать только главный администратор" });
    }
    if (!username || password.length < 3)
      return reply.code(400).send({ error: "Логин обязателен, пароль ≥ 3 символа" });
    if (db.listUsers().some((u) => u.username.trim().toLowerCase() === username.toLowerCase()))
      return reply.code(409).send({ error: "Такой логин уже есть" });
    const u = db.createUser({ username, passHash: hashPassword(password), role });
    // Optionally hide some packs for the new user from the start (admins are never restricted).
    if (role !== "admin" && Array.isArray(body.hidden)) {
      const valid = body.hidden.filter((id) => DECKS.some((d) => d.id === id && !isGrantableBuiltinDeck(d)));
      if (valid.length) db.setHiddenDecks(u.id, valid);
    }
    if (role !== "admin") grantDefaultRegisteredUserDecks(db, u.id);
    return { id: u.id, username: u.username, role: u.role, isSuperAdmin: isSuperAdminUser(u) };
  });

  app.put("/api/admin/users/:id/role", async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;
    const targetId = Number((req.params as { id: string }).id);
    const target = db.getUserById(targetId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const role = (req.body as { role?: string } | null)?.role === "admin" ? "admin" : "user";
    if (isSuperAdminUser(target) && role !== "admin") {
      return reply.code(400).send({ error: "Супер-админа нельзя понизить" });
    }
    const updated = db.updateUserRole(targetId, role);
    return { ok: true, role: updated?.role ?? role, isSuperAdmin: isSuperAdminUser(updated) };
  });

  app.post("/api/admin/users/:id/impersonate", async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;
    const targetId = Number((req.params as { id: string }).id);
    const target = db.getUserById(targetId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    if (target.id === uid(req)) return reply.code(400).send({ error: "Нельзя войти под самим собой" });
    const adminToken = getCookie(req, SESSION_COOKIE);
    if (!adminToken) return reply.code(401).send({ error: "Админская сессия не найдена" });
    const targetToken = newSessionToken();
    db.createSession(targetToken, target.id, new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS).toISOString());
    reply.header("Set-Cookie", [sessionCookieHeader(targetToken), adminSessionCookieHeader(adminToken)]);
    const admin = db.getUserById(uid(req))!;
    return {
      id: target.id,
      username: target.username,
      role: target.role,
      isSuperAdmin: isSuperAdminUser(target),
      impersonator: { id: admin.id, username: admin.username, role: admin.role, isSuperAdmin: isSuperAdminUser(admin) },
    };
  });

  app.post("/api/admin/users/:id/notifications", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const targetId = Number((req.params as { id: string }).id);
    const target = db.getUserById(targetId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const body =
      (req.body as {
        severity?: string;
        title?: string;
        message?: string;
        solution?: string;
        actionUrl?: string;
      }) ?? {};
    const message = (body.message ?? "").trim();
    if (!message) return reply.code(400).send({ error: "Текст уведомления обязателен" });
    const title = (body.title ?? "").trim() || "Сообщение от администратора";
    const severity = ["info", "warning", "error"].includes(body.severity ?? "") ? body.severity! : "info";
    const admin = db.getUserById(uid(req))!;
    const notification = db.upsertNotification({
      userId: target.id,
      accountId: null,
      severity,
      category: "admin_message",
      title,
      message,
      solution: (body.solution ?? "").trim() || null,
      actionUrl: (body.actionUrl ?? "").trim() || null,
      dedupeKey: `admin-message:${target.id}:${Date.now()}:${newSessionToken().slice(0, 12)}`,
      source: "admin",
      context: `admin notification by ${admin.username}#${admin.id}`,
    });
    emitNotificationChange(notification.userId);
    return notification;
  });

  app.get("/api/admin/limits", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const keys = readElevenLabsKeys();
    const rows = await Promise.all(keys.map((key, index) => fetchElevenLabsLimit(key, index)));
    const numericRows = rows.filter((row) => row.characterCount != null && row.characterLimit != null);
    const characterCount = numericRows.reduce((sum, row) => sum + (row.characterCount ?? 0), 0);
    const characterLimit = numericRows.reduce((sum, row) => sum + (row.characterLimit ?? 0), 0);
    const remaining = numericRows.reduce((sum, row) => sum + Math.max(0, row.remaining ?? 0), 0);
    return {
      provider: "elevenlabs",
      updatedAt: new Date().toISOString(),
      keys: rows,
      manualVideo: getManualVideoLimits(db),
      readiness: getReadinessLimits(db),
      totals: {
        configured: rows.length,
        active: rows.filter((row) => row.status === "ok" && (row.remaining == null || row.remaining > 0)).length,
        exhausted: rows.filter((row) => row.status === "exhausted").length,
        invalid: rows.filter((row) => row.status === "invalid").length,
        rateLimited: rows.filter((row) => row.status === "rate_limited").length,
        errors: rows.filter((row) => row.status === "error").length,
        blocked: rows.filter((row) => row.status === "blocked").length,
        characterCount: numericRows.length ? characterCount : null,
        characterLimit: numericRows.length ? characterLimit : null,
        remaining: numericRows.length ? remaining : null,
        usedPercent: characterLimit > 0 ? Math.min(100, Math.round((characterCount / characterLimit) * 1000) / 10) : null,
      },
    };
  });

  app.put("/api/admin/manual-video-limits", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = (req.body as { maxFileMb?: unknown; uploadsPerHour?: unknown }) ?? {};
    return setManualVideoLimits(db, body);
  });

  app.put("/api/admin/readiness-limits", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const body = (req.body as { minRunwayDays?: unknown }) ?? {};
    return setReadinessLimits(db, { minRunwayDays: body.minRunwayDays == null ? undefined : Number(body.minRunwayDays) });
  });

  // ---- Admin: per-user pack (deck) visibility ----
  // All packs (matrix columns).
  app.get("/api/admin/decks", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const defaultGrants = registeredUserDefaultGrantIds();
    const defaultDeckIds = new Set([
      ...defaultGrants.deckIds,
      ...defaultGrants.longVideoDeckIds,
      ...defaultGrants.packDeckIds,
    ]);
    // встроенные деки + кастомные паки (всегда показываем паки колонками; id = "pack:<id>").
    // Возвращаем ВСЕ деки (вкл. чисто admin-only): для строк-юзеров такие колонки рисуются «—»
    // (им недоступно), а в СВОЕЙ строке админ может скрыть любую деку/пак лично у себя (opt-out).
    return [
      ...DECKS.map((d) => ({
        id: d.id,
        name: d.name,
        pack: false,
        grantable: !!(d.adminOnly && d.grantable),
        adminOnly: !!d.adminOnly,
        longVideo: !!d.longVideo,
        defaultForNewUser: defaultDeckIds.has(d.id),
      })),
      ...listAllPacks().map((p) => {
        const id = `pack:${p.id}`;
        return { id, name: p.name, pack: true, grantable: false, adminOnly: false, defaultForNewUser: defaultDeckIds.has(id) };
      }),
    ];
  });

  // All custom packs for admin-only rights screens (owners matrix / grants). This does not grant
  // edit access on /cards; pack editing still uses owner/super-admin checks in /api/packs/:id.
  app.get("/api/admin/packs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return listAllPacks();
  });

  // Matrix data: per user — which packs are hidden + which packs they actually use.
  app.get("/api/admin/user-decks", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const hidden = db.hiddenDecksByUser();
    const grantedBuiltins = db.grantedDecksByUser();
    const grantedLongVideos = db.grantedLongVideoDecksByUser();
    const used = currentAccountDecksByUser();
    const posted = db.postedByUserDeck();
    const allPacks = listAllPacks();
    return db.listUsers().map((u) => {
      // Per-deck remaining/used/posted for the decks this user actually uses (so admin sees when a pack runs out).
      const usedKeys = new Set(db.usedAnecdoteKeys(u.id));
      const deckStats: Record<string, { used: number; available: number; total: number; posted: number }> = {};
      for (const deckId of used[u.id] ?? []) {
        if (!DECKS.some((d) => d.id === deckId)) continue; // skip non-deck langs (e.g. "en")
        const s = libraryStats(deckId, usedKeys);
        deckStats[deckId] = { used: s.used, available: s.available, total: s.total, posted: posted[u.id]?.[deckId] ?? 0 };
      }
      const userIsSuperAdmin = isSuperAdminUser(u);
      return {
        userId: u.id,
        username: u.username,
        role: u.role,
        isSuperAdmin: userIsSuperAdmin,
        hidden: hidden[u.id] ?? [],
        grantedPacks: [
          ...(grantedBuiltins[u.id] ?? []),
          ...allPacks
            .filter((p) => userIsSuperAdmin || p.owners.includes(u.id) || p.grants.includes(u.id))
            .map((p) => `pack:${p.id}`),
        ],
        grantedLongVideos: grantedLongVideos[u.id] ?? [],
        used: used[u.id] ?? [],
        scheduled: db.scheduleSlotsForUser(u.id), // posts/day planned across all their channels
        library: db.countVideosByUser(u.id), // videos queued in their libraries
        usedTotal: db.usedAnecdoteCount(u.id), // всего использованных карточек (встроенные + кастомные) — бейдж в панели сброса
        infiniteSim: db.hasFeature(u.id, INFINITE_PACKS_FEATURE), // «бесконечный пак» (имитация): тумблер ниже
        commercialCreator: db.hasFeature(u.id, COMMERCIAL_CREATOR_FEATURE),
        deckStats, // ВСЕГДА реальные числа (правда для админа), даже когда у юзера включён бесконечный пак
      };
    });
  });
  // Replace a user's hidden-pack set (body.hidden = pack ids to hide) and grants.
  app.put("/api/admin/users/:id/decks", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = Number((req.params as { id: string }).id);
    const target = db.getUserById(id);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const body = (req.body as { hidden?: string[]; grants?: string[]; longVideoGrants?: string[] }) ?? {};
    const rawGrants = Array.isArray(body.grants) ? body.grants.map((g) => String(g || "").trim()).filter(Boolean) : [];
    const rawLongVideoGrants = Array.isArray(body.longVideoGrants)
      ? body.longVideoGrants.map((g) => String(g || "").trim()).filter(Boolean)
      : rawGrants.filter(isGrantableLongVideoDeckId);

    // ГЛАВНЫЙ АДМИН: видит всё по умолчанию → hidden работает как opt-out и может содержать
    // ЛЮБУЮ встроенную деку (вкл. admin-only) и кастомный пак "pack:<id>". Гранты админу не нужны.
    if (isSuperAdminUser(target)) {
      const packIds = new Set(listAllPacks().map((p) => `pack:${p.id}`));
      const adminHidden = [
        ...new Set(
          (Array.isArray(body.hidden) ? body.hidden : [])
            .map((d) => String(d || "").trim())
            .filter((d) => DECKS.some((x) => x.id === d) || packIds.has(d)),
        ),
      ];
      db.setHiddenDecks(id, adminHidden);
      db.setGrantedDecks(id, []); // у админа полный доступ — гранты не используются
      db.setGrantedLongVideoDecks(id, []); // long-video гранты живут отдельно и админу тоже не нужны
      return { ok: true, hidden: adminHidden };
    }

    // ОБЫЧНЫЙ АДМИН: встроенные admin-only деки доступны по роли, но кастомные паки — только если
    // он владелец или главный админ выдал грант. Это не главный админ и не "владелец всего".
    if (target.role === "admin") {
      const packIds = new Set(listAllPacks().map((p) => `pack:${p.id}`));
      const adminHidden = [
        ...new Set(
          (Array.isArray(body.hidden) ? body.hidden : [])
            .map((d) => String(d || "").trim())
            .filter((d) => DECKS.some((x) => x.id === d) || packIds.has(d)),
        ),
      ];
      db.setHiddenDecks(id, adminHidden);
      db.setGrantedDecks(id, []);
      db.setGrantedLongVideoDecks(id, []);
      const grants = rawGrants.filter((g) => !isGrantableLongVideoDeckId(g));
      const want = new Set(grants.filter((g) => g.startsWith("pack:")).map((g) => g.replace(/^pack:/, "")));
      for (const p of listAllPacks()) {
        if (p.owners.includes(id)) continue;
        setGrant(p.id, id, want.has(p.id));
      }
      return { ok: true, hidden: adminHidden };
    }

    // ОБЫЧНЫЙ ЮЗЕР: hidden = только обычные встроенные деки (opt-out); admin-only/grantable/кастомные
    // паки даются грантом (opt-in) ниже.
    const valid = Array.isArray(body.hidden)
      ? body.hidden.filter((d) => DECKS.some((x) => x.id === d && !isGrantableBuiltinDeck(x)))
      : [];
    db.setHiddenDecks(id, valid);
    const grants = rawGrants.filter((g) => !isGrantableLongVideoDeckId(g));
    const builtInGrants = grants.filter((deckId) => isGrantableBuiltinDeckId(deckId));
    db.setGrantedDecks(id, builtInGrants);
    const longVideoGrants = rawLongVideoGrants.filter(isGrantableLongVideoDeckId);
    db.setGrantedLongVideoDecks(id, longVideoGrants);
    // Кастомные паки (opt-in): выдать/снять доступ этому юзеру по body.grants (id вида "pack:<id>").
    // Владельца не трогаем.
    const want = new Set(grants.filter((g) => g.startsWith("pack:")).map((g) => g.replace(/^pack:/, "")));
    for (const p of listAllPacks()) {
      if (p.owners.includes(id)) continue; // владельцу грант не нужен
      setGrant(p.id, id, want.has(p.id));
    }
    return { ok: true, hidden: valid };
  });

  // Admin: toggle the "infinite packs" simulation for a user (his personal request — see
  // services/infinite-packs.ts). ON → that user's decks/packs report their full size as free
  // everywhere he looks (Studio / channel sources / «Паки»), AND the scheduler recycles his
  // already-queued videos round-robin forever instead of deleting them after each post. Fresh generation
  // repeats the same fixed card; real used-card accounting and deck access are untouched.
  app.put("/api/admin/users/:id/infinite-packs", async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;
    const id = Number((req.params as { id: string }).id);
    const target = db.getUserById(id);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const enabled = !!(req.body as { enabled?: unknown })?.enabled;
    db.setFeature(id, INFINITE_PACKS_FEATURE, enabled);
    return { ok: true, enabled };
  });

  app.put("/api/admin/users/:id/commercial-creator", async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;
    const id = Number((req.params as { id: string }).id);
    const target = db.getUserById(id);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const enabled = !!(req.body as { enabled?: unknown })?.enabled;
    db.setFeature(id, COMMERCIAL_CREATOR_FEATURE, enabled);
    return { ok: true, enabled };
  });

  // Reset one user's used-history for a built-in deck. Existing library videos stay intact;
  // the next generation can pick that deck's items from the beginning again.
  app.post("/api/admin/users/:id/decks/:deckId/reset", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = Number((req.params as { id: string; deckId: string }).id);
    const deckId = decodeURIComponent((req.params as { id: string; deckId: string }).deckId);
    const target = db.getUserById(id);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    if (!deps.auth.isSuperAdminReq(req) && isSuperAdminUser(target)) {
      return reply.code(403).send({ error: "Сброс истории супер-админа доступен только супер-админу" });
    }
    // Кастомный пак: ключи карточек = packCardKey(values); чистим именно их у этого юзера.
    if (deckId.startsWith("pack:")) {
      const pack = getPack(deckId.slice(5), id, true); // admin-load: читаем карточки любого пака
      if (!pack) return reply.code(404).send({ error: "Пак не найден" });
      const removed = db.clearAnecdoteUsedKeys(id, pack.cards.map((c) => packCardKey(c.values)));
      return { ok: true, removed };
    }
    if (!DECKS.some((d) => d.id === deckId)) return reply.code(404).send({ error: "Пак не найден" });
    const removed = db.clearAnecdoteUsedKeys(id, deckAnecdoteKeys(deckId));
    return { ok: true, removed };
  });

  // Admin: полная «занятость паков» одного юзера — каждый встроенный дек и кастомный пак, который он
  // МОЖЕТ использовать ИЛИ уже использовал, с per-user used/total/available. Кормит панель сброса
  // (встроенные `DECKS` + кастомные `pack:*`), чтобы было видно ВСЕ паки юзера, а не только использованные.
  app.get("/api/admin/users/:id/pack-usage", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = Number((req.params as { id: string }).id);
    const target = db.getUserById(id);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    if (!deps.auth.isSuperAdminReq(req) && isSuperAdminUser(target)) {
      return reply.code(403).send({ error: "Историю супер-админа может смотреть только супер-админ" });
    }
    const usedKeys = db.usedAnecdoteKeys(id);
    const targetIsSuperAdmin = isSuperAdminUser(target);
    const items: { id: string; name: string; pack: boolean; total: number; used: number; available: number }[] = [];
    // Встроенные деки: видимые юзеру ИЛИ уже использованные (чтобы ничего сбрасываемого не пряталось).
    for (const d of DECKS) {
      const visible = target.role === "admin" || builtinDeckVisibleForUser(id, d);
      const s = libraryStats(d.id, usedKeys);
      if (!visible && s.used === 0) continue;
      items.push({ id: d.id, name: d.name, pack: false, total: s.total, used: s.used, available: s.available });
    }
    // Кастомные паки: доступные юзеру ИЛИ уже использованные (ключи карточек — packCardKey(values)).
    for (const summary of listAllPacks()) {
      const pack = getPack(summary.id, id, true); // admin-load: нужны карточки, чтобы посчитать used
      if (!pack) continue;
      let used = 0;
      for (const c of pack.cards) if (usedKeys.has(packCardKey(c.values))) used++;
      if (!canAccess(pack, id, targetIsSuperAdmin) && used === 0) continue;
      const total = pack.cards.length;
      items.push({ id: `pack:${pack.id}`, name: pack.name, pack: true, total, used, available: Math.max(0, total - used) });
    }
    return { userId: id, username: target.username, items };
  });

  // Admin: set a custom pack's owners (0+ users). Owners may edit the pack (name/lang/cards) on /cards.
  // Главного админа во владельцы не пишем — он и так всё может.
  app.put("/api/admin/packs/:id/owners", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = (req.params as { id: string }).id.replace(/^pack:/, "");
    const raw = (req.body as { owners?: unknown })?.owners;
    const ids = Array.isArray(raw) ? [...new Set(raw.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : [];
    const owners: number[] = [];
    for (const oid of ids) {
      const u = db.getUserById(oid);
      if (!u) return reply.code(404).send({ error: "Пользователь не найден" });
      if (isSuperAdminUser(u)) continue; // главному админу отдельное владение не нужно
      owners.push(oid);
    }
    if (!setPackOwners(id, owners)) return reply.code(404).send({ error: "Пак не найден" });
    return { ok: true, owners };
  });

  app.get("/api/my-decks", async (req, reply) => {
    const me = db.getUserById(uid(req));
    const isSuperAdmin = isSuperAdminUser(me);
    const q = (req.query as { userId?: string }) ?? {};
    const targetId = isSuperAdmin && q.userId ? Number(q.userId) : uid(req);
    const target = db.getUserById(targetId);
    if (!target) return reply.code(404).send({ error: "Пользователь не найден" });
    const usedKeys = new Set(db.usedAnecdoteKeys(targetId));
    const posted = db.postedByUserDeck()[targetId] ?? {};
    // «Бесконечный пак»: это «вид паков самого юзера» (его страница «Паки») → показываем весь пак,
    // как и в /api/generators. Админ-обзор (матрица/low-decks/pack-usage) остаётся с реальными числами.
    const infinite = db.hasFeature(targetId, INFINITE_PACKS_FEATURE);
    const decks = visibleDecksForUser(targetId).map((d) => {
      const s = libraryStats(d.id, usedKeys);
      const c = infinite ? infiniteCounts(s.total) : { total: s.total, used: s.used, available: s.available };
      return { id: d.id, name: d.name, total: c.total, used: c.used, available: c.available, posted: posted[d.id] ?? 0 };
    });
    return { userId: targetId, username: target.username, decks };
  });

  // Admin: every actively used built-in deck where the user's remaining cards are below the threshold
  // (100). Keep this scoped to current channel sources; otherwise a super-admin sees every visible
  // historical deck (for example old Space videos) even after the deck was removed from blocks.
  app.get("/api/admin/low-decks", async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;
    const THRESHOLD = 100;
    const posted = db.postedByUserDeck();
    const used = currentAccountDecksByUser();
    const out: {
      userId: number;
      username: string;
      deckId: string;
      deckName: string;
      lang: string | null;
      available: number;
      total: number;
      used: number;
      posted: number;
    }[] = [];
    for (const u of db.listUsers()) {
      const usedKeys = new Set(db.usedAnecdoteKeys(u.id));
      for (const deckId of used[u.id] ?? []) {
        const d = DECKS.find((candidate) => candidate.id === deckId);
        if (!d) continue;
        const s = libraryStats(d.id, usedKeys);
        if (s.available < THRESHOLD) {
          out.push({
            userId: u.id,
            username: u.username,
            deckId: d.id,
            deckName: d.name,
            lang: deckLang(d.id) || null,
            available: s.available,
            total: s.total,
            used: s.used,
            posted: posted[u.id]?.[d.id] ?? 0,
          });
        }
      }
    }
    out.sort((a, b) => a.available - b.available);
    return out;
  });

  // Admin analytics: one read-only aggregated snapshot per requested period. No polling and no
  // YouTube calls here; it uses stored channel_stats snapshots so opening the tab is cheap.
  app.get("/api/admin/analytics", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as { from?: string; to?: string }) ?? {};
    return buildAdminAnalytics(db, { from: q.from, to: q.to });
  });
}
