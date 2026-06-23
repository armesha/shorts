// Роуты кастомных («ручных») паков для хаба «Паки и карточки». Регистрируются на общем `app`,
// поэтому глобальный хук /api/* уже проставил req.userId. Изоляция по владельцу — внутри store.
// Превью карточки рисуется тем же мостом рендера (renderTemplateCard), что и шаблоны редактора.
import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isSuperAdminUser } from "../auth.ts";
import { loadBaseConfig } from "../config.ts";
import { openDb } from "../db.ts";
import {
  listPacks,
  listAllPacks,
  getPack,
  createPack,
  addCards,
  deleteCard,
  deletePack,
  setPackLang,
  setPackName,
  canEdit,
  deriveRules,
  type PackTemplate,
} from "../../src/packs/store.ts";
import {
  TemplateValidationError,
  renderTemplateCard,
  validateTemplateList,
  type TemplateDoc,
} from "../../src/template/render.ts";
import { packCardKey } from "../services/pack-gen.ts";
import { listAudio, packAudioPathFor, resolveAudio } from "../../src/video.ts";
import { buildStillVideoFiles, cardReadable } from "../infra/media.ts";
import {
  RATE_LIMIT_MESSAGE,
  RateLimitError,
  checkRateLimit,
  heavyActiveKey,
  withActiveLimit,
  withGlobalRenderSlot,
} from "../infra/rate-limits.ts";
import { rememberOutputOwner } from "../infra/output-access.ts";
import {
  MAX_PACK_AUDIO_FILES,
  MAX_PACK_AUDIO_UPLOAD_BYTES,
  deletePackMusicDir,
  deletePackMusicTrack,
  musicNameFromFile,
  packMusicContentType,
  packMusicTracks,
  savePackMusicUploads,
  type PackMusicUploadInput,
} from "../services/pack-audio.ts";

const OUTPUT_DIR = loadBaseConfig().outputDir;
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;

const PACK_PREVIEW_LIMIT = { limit: 20, windowMs: 10 * 60 * 1000 };
const PACK_VIDEO_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

function sendRateLimit(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b: unknown) => unknown } },
  hit?: { retryAfterMs?: number },
): unknown {
  const retryAfter = Math.max(1, Math.ceil((hit?.retryAfterMs ?? 1_000) / 1000));
  reply.header("Retry-After", String(retryAfter));
  return reply.code(429).send({ error: RATE_LIMIT_MESSAGE });
}

function enforceWindow(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b: unknown) => unknown } },
  userId: number,
  isAdmin: boolean,
  route: string,
  rule: { limit: number; windowMs: number },
): boolean {
  if (isAdmin) return true;
  const hit = checkRateLimit(`user:${userId}:${route}:window`, rule);
  if (!hit.ok) {
    sendRateLimit(reply, hit);
    return false;
  }
  return true;
}

async function runHeavyLimited<T>(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b: unknown) => unknown } },
  userId: number,
  isAdmin: boolean,
  route: string,
  fn: () => Promise<T>,
): Promise<T | unknown> {
  try {
    // Per-user fairness AND the shared process-wide render cap (same `global:render` slot as the
    // Studio/batch routes) so pack preview/video can't pile onto the host's Chrome+ffmpeg budget.
    return await withActiveLimit(heavyActiveKey(userId, isAdmin, route), isAdmin ? 2 : 1, () =>
      withGlobalRenderSlot(fn),
    );
  } catch (e) {
    if (e instanceof RateLimitError) return sendRateLimit(reply, e);
    throw e;
  }
}

function templateError(e: unknown): string | null {
  if (e instanceof TemplateValidationError) return e.message;
  if ((e as { statusCode?: number })?.statusCode === 400) return String((e as Error)?.message ?? e);
  return null;
}

function audioError(e: unknown): string {
  return e instanceof Error ? e.message : "Музыка недоступна";
}

function staticAudioUrl(trackId: string): string {
  return `/audio/${trackId.split("/").map(encodeURIComponent).join("/")}`;
}

function builtinMusicTracks() {
  return listAudio().map((id) => ({
    id,
    name: musicNameFromFile(id),
    fileName: id,
    bytes: 0,
    url: staticAudioUrl(id),
  }));
}

export function registerPacksRoutes(app: FastifyInstance, db: ReturnType<typeof openDb>) {
  const adminReq = (req: unknown): boolean => db.getUserById(uid(req))?.role === "admin";
  const superAdminReq = (req: unknown): boolean => isSuperAdminUser(db.getUserById(uid(req)));
  // Видимые мне паки (владелец / главный админ / выдан грант) + сколько карточек свободно/использовано
  // именно у этого юзера — фронт по `available` ограничивает «сколько роликов сгенерировать».
  // По умолчанию исключаем паки, скрытые лично у запросившего. `?all=1` (только главный админ)
  // отдаёт ВСЕ паки без фильтра — для управления владельцами/грантами в Админке.
  app.get("/api/packs", async (req) => {
    const userId = uid(req);
    const isSuperAdmin = superAdminReq(req);
    const all = isSuperAdmin && (req.query as { all?: unknown })?.all != null;
    const usedKeys = db.usedAnecdoteKeys(userId);
    const base = all ? listAllPacks() : listPacks(userId, isSuperAdmin);
    const visible = all ? base : base.filter((s) => !db.isDeckHiddenFor(userId, `pack:${s.id}`));
    return visible.map((s) => {
      const pack = getPack(s.id, userId, isSuperAdmin);
      if (!pack) return { ...s, used: 0, available: s.cards };
      let used = 0;
      for (const c of pack.cards) if (usedKeys.has(packCardKey(c.values))) used++;
      return { ...s, used, available: Math.max(0, pack.cards.length - used) };
    });
  });

  // Один пак + выведенные из шаблона правила (роли, min/max, списки) — для формы добавления.
  app.get("/api/packs/:id", async (req, reply) => {
    const p = getPack((req.params as { id: string }).id, uid(req), superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    return { ...p, rules: p.templates[0] ? deriveRules(p.templates[0]) : [] };
  });

  // Создать пак (имя + язык + шаблон(ы) из редактора).
  app.post("/api/packs", async (req, reply) => {
    const body = (req.body as { name?: string; lang?: string; templates?: PackTemplate[] }) ?? {};
    if (!body.name?.trim()) return reply.code(400).send({ error: "Нужно имя пака" });
    const templates = Array.isArray(body.templates) ? body.templates : [];
    try {
      validateTemplateList(templates);
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      throw e;
    }
    return createPack(uid(req), {
      name: body.name,
      lang: body.lang || "ru",
      templates,
    });
  });

  // Добавить карточки (валидация по правилам шаблона; all-or-nothing).
  app.post("/api/packs/:id/cards", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body as { cards?: unknown; raw?: string }) ?? {};
    const input = body.cards ?? body.raw ?? null;
    if (input == null || (typeof body.raw === "string" && !body.raw.trim()))
      return reply.code(400).send({ error: "Пусто: вставь JSON карточек" });
    const r = addCards(id, uid(req), superAdminReq(req), input);
    if (!r.ok) {
      if (r.reason === "not_found") return reply.code(404).send({ error: "Пак не найден или нет прав на редактирование" });
      if (r.reason === "no_template")
        return reply.code(400).send({ error: "У пака нет шаблона — сначала привяжи шаблон" });
      const errs = r.result?.errors ?? [];
      return reply.code(400).send({
        error: errs.length
          ? `Ошибки в ${errs.length} из ${r.result?.parsed ?? 0} карточек — ничего не добавлено`
          : "Не найдено ни одной карточки",
        errors: errs,
        parsed: r.result?.parsed ?? 0,
      });
    }
    return { added: r.added, total: r.total };
  });

  // Удалить одну карточку (?addedAt= защищает от гонок).
  app.delete("/api/packs/:id/cards/:index", async (req, reply) => {
    const { id, index } = req.params as { id: string; index: string };
    const addedAt = (req.query as Record<string, string>)?.addedAt;
    const r = deleteCard(id, uid(req), superAdminReq(req), Number(index), addedAt);
    if (!r.deleted)
      return reply
        .code(r.reason === "stale" ? 409 : 404)
        .send({ error: r.reason === "stale" ? "Список изменился — обнови" : "Не найдено" });
    return { deleted: true, total: r.total };
  });

  // Удалить пак целиком.
  app.delete("/api/packs/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const ok = deletePack(id, uid(req), superAdminReq(req));
    if (!ok) return reply.code(404).send({ error: "Пак не найден или нет прав на удаление" });
    deletePackMusicDir(id);
    return { deleted: true };
  });

  // Сменить язык (тег) пака — только владелец или главный админ (грант не даёт права редактировать).
  app.post("/api/packs/:id/lang", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const lang = String((req.body as { lang?: string })?.lang || "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(lang)) return reply.code(400).send({ error: "Неверный код языка (2 буквы, напр. ru/de/en)" });
    const p = getPack(id, uid(req), superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    if (!canEdit(p, uid(req), superAdminReq(req))) return reply.code(403).send({ error: "Менять язык может только владелец пака" });
    setPackLang(id, lang);
    return { ok: true, lang };
  });

  // Переименовать пак — только владелец или главный админ. Используется на странице «Карточки».
  app.post("/api/packs/:id/name", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const name = String((req.body as { name?: string })?.name || "").trim();
    if (!name) return reply.code(400).send({ error: "Имя не может быть пустым" });
    const p = getPack(id, uid(req), superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    if (!canEdit(p, uid(req), superAdminReq(req))) return reply.code(403).send({ error: "Переименовать может только владелец пака" });
    setPackName(id, name);
    return { ok: true, name: name.slice(0, 80) };
  });

  // Музыка конкретного пака: встроенные треки + свои треки этого пака.
  app.get("/api/packs/:id/music", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const userId = uid(req);
    const isSuperAdmin = superAdminReq(req);
    const p = getPack(id, userId, isSuperAdmin);
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    return {
      builtin: builtinMusicTracks(),
      custom: packMusicTracks(id),
      canEdit: canEdit(p, userId, isSuperAdmin),
      maxFiles: MAX_PACK_AUDIO_FILES,
      maxFileMb: 25,
    };
  });

  app.post(
    "/api/packs/:id/music",
    { bodyLimit: MAX_PACK_AUDIO_UPLOAD_BYTES },
    async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const userId = uid(req);
      const isSuperAdmin = superAdminReq(req);
      const p = getPack(id, userId, isSuperAdmin);
      if (!p) return reply.code(404).send({ error: "Пак не найден" });
      if (!canEdit(p, userId, isSuperAdmin)) return reply.code(403).send({ error: "Музыку пака может менять только владелец" });
      const body = (req.body as { files?: PackMusicUploadInput[] }) ?? {};
      const result = savePackMusicUploads(id, Array.isArray(body.files) ? body.files : []);
      if (result.added.length === 0 && result.errors.length) {
        return reply.code(400).send({ error: result.errors[0]?.message || "Не удалось загрузить музыку", ...result });
      }
      return { ...result, tracks: packMusicTracks(id) };
    },
  );

  app.get("/api/packs/:id/music/:file", async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    const p = getPack(id, uid(req), superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    let abs: string;
    try {
      abs = packAudioPathFor(id, file);
    } catch (e) {
      return reply.code(400).send({ error: audioError(e) });
    }
    if (!existsSync(abs)) return reply.code(404).send({ error: "Трек не найден" });
    return reply.type(packMusicContentType(file)).send(createReadStream(abs));
  });

  app.delete("/api/packs/:id/music/:file", async (req, reply) => {
    const { id, file } = req.params as { id: string; file: string };
    const userId = uid(req);
    const isSuperAdmin = superAdminReq(req);
    const p = getPack(id, userId, isSuperAdmin);
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    if (!canEdit(p, userId, isSuperAdmin)) return reply.code(403).send({ error: "Музыку пака может менять только владелец" });
    let deleted = false;
    try {
      deleted = deletePackMusicTrack(id, file);
    } catch (e) {
      return reply.code(400).send({ error: audioError(e) });
    }
    if (!deleted) return reply.code(404).send({ error: "Трек не найден" });
    return { deleted: true, tracks: packMusicTracks(id) };
  });

  // Превью карточки #i — рендер шаблоном (шаблоны чередуются по карточкам для разнообразия) → PNG в /files.
  app.get("/api/packs/:id/preview", async (req, reply) => {
    const userId = uid(req);
    const isAdmin = adminReq(req);
    if (!enforceWindow(reply, userId, isAdmin, "pack-preview", PACK_PREVIEW_LIMIT)) return;
    const p = getPack((req.params as { id: string }).id, uid(req), superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    const i = Math.max(0, Math.floor(Number((req.query as Record<string, string>)?.i) || 0));
    const card = p.cards[i];
    if (!card) return reply.code(404).send({ error: "Нет такой карточки" });
    if (!p.templates.length) return reply.code(400).send({ error: "У пака нет шаблона" });
    const tpl = p.templates[i % p.templates.length];
    const rel = `packs/${p.id}-${i}.png`;
    try {
      const rendered = await runHeavyLimited(reply, userId, isAdmin, "pack-preview", () =>
        renderTemplateCard(tpl as TemplateDoc, card.values, resolve(process.cwd(), OUTPUT_DIR, rel)),
      );
      if (typeof rendered !== "string") return;
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      return reply.code(500).send({ error: "Не удалось отрисовать: " + String(e).slice(0, 120) });
    }
    return { imageUrl: `/files/${rel}?v=${Date.now()}` };
  });

  // Собрать видео из карточки #i (рендер мостом + assembleStillVideo). Если передан accountId —
  // сохранить в библиотеку канала (deck="pack:<id>"; метаданные через синтетическую деку в getDeck).
  app.post("/api/packs/:id/cards/:i/video", async (req, reply) => {
    const { id, i } = req.params as { id: string; i: string };
    const body = (req.body as { accountId?: number; music?: string }) ?? {};
    const userId = uid(req);
    const isAdmin = adminReq(req);
    if (!enforceWindow(reply, userId, isAdmin, "pack-video", PACK_VIDEO_LIMIT)) return;
    const p = getPack(id, userId, superAdminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    const idx = Math.max(0, Math.floor(Number(i) || 0));
    const card = p.cards[idx];
    if (!card) return reply.code(404).send({ error: "Нет такой карточки" });
    if (!p.templates.length) return reply.code(400).send({ error: "У пака нет шаблона" });
    const tpl = p.templates[idx % p.templates.length];
    // владелец целевого канала (если сохраняем)
    if (body.accountId != null) {
      const acc = db.getAccount(Number(body.accountId));
      if (!acc || acc.userId !== userId) return reply.code(403).send({ error: "Канал не ваш" });
      if (acc.status !== "connected")
        return reply.code(400).send({ error: "Сначала подключите канал к YouTube — до подключения нельзя готовить видео в очередь." });
      // Бэкстоп: ролик из пака можно класть только в канал, где этот пак выбран источником.
      // Иначе планировщик не должен его выкладывать.
      const sources = acc.sourceDecks?.length ? acc.sourceDecks : [acc.lang];
      if (!sources.includes(`pack:${p.id}`))
        return reply.code(400).send({ error: "Канал не использует этот пак — сначала выбери пак источником канала." });
    }
    // музыка: явная / случайная / без; для pack-audio разрешаем только треки этого пака.
    let resolvedAudio: { music: string; audioPath: string | null };
    try {
      resolvedAudio = resolveAudio(body.music, undefined, { packId: id });
    } catch (e) {
      return reply.code(400).send({ error: audioError(e) });
    }
    const { music, audioPath } = resolvedAudio;
    let imgRel: string;
    let vidRel: string;
    try {
      const built = await runHeavyLimited(reply, userId, isAdmin, "pack-video", () =>
        buildStillVideoFiles({
          prefix: "pack",
          outputDir: OUTPUT_DIR,
          audioPath,
          render: (imgAbs) => renderTemplateCard(tpl as TemplateDoc, card.values, imgAbs),
        }),
      );
      if (!built || typeof built !== "object" || !("imgRel" in built) || !("vidRel" in built)) return;
      ({ imgRel, vidRel } = built as { imgRel: string; vidRel: string });
      rememberOutputOwner([imgRel, vidRel], userId);
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      return reply.code(500).send({ error: "Сборка не удалась: " + String(e).slice(0, 140) });
    }
    let saved = false;
    if (body.accountId != null) {
      const { title, text } = cardReadable(card.values, deriveRules(p.templates[0]));
      db.createVideo({
        accountId: Number(body.accountId),
        title,
        text,
        bg: "",
        music,
        deck: `pack:${p.id}`,
        videoRel: vidRel,
        imageRel: imgRel,
      });
      saved = true;
    }
    return { videoUrl: `/files/${vidRel}`, music, saved };
  });
}
