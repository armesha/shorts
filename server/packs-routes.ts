// Роуты кастомных («ручных») паков для хаба «Паки и карточки». Регистрируются на общем `app`,
// поэтому глобальный хук /api/* уже проставил req.userId. Изоляция по владельцу — внутри store.
// Превью карточки рисуется тем же мостом рендера (renderTemplateCard), что и шаблоны редактора.
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { loadBaseConfig } from "./config.ts";
import { openDb } from "./db.ts";
import {
  listPacks,
  getPack,
  createPack,
  addCards,
  deleteCard,
  deletePack,
  setPackLang,
  deriveRules,
  type PackTemplate,
  type CardValues,
  type RoleRule,
} from "../src/packs/store.ts";
import { renderTemplateCard } from "../src/template/render.ts";
import { assembleStillVideo, listAudio, audioPathFor } from "../src/video.ts";

const OUTPUT_DIR = loadBaseConfig().outputDir;
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;

// Заголовок + читаемый текст карточки (для имени видео и YouTube-описания).
function cardTitleAndText(values: CardValues, rules: RoleRule[]): { title: string; text: string } {
  let title = "";
  const parts: string[] = [];
  for (const r of rules) {
    const v = values[r.role];
    if (v == null) continue;
    if (!r.list && typeof v === "string" && !title) title = v;
    parts.push(Array.isArray(v) ? v.map((x) => `• ${x}`).join("\n") : String(v));
  }
  return { title: (title || "Карточка").slice(0, 100), text: parts.join("\n\n") };
}

export function registerPacksRoutes(app: FastifyInstance, db: ReturnType<typeof openDb>) {
  const adminReq = (req: unknown): boolean => db.getUserById(uid(req))?.role === "admin";
  // Видимые мне паки (владелец / админ / выдан грант).
  app.get("/api/packs", async (req) => listPacks(uid(req), adminReq(req)));

  // Один пак + выведенные из шаблона правила (роли, min/max, списки) — для формы добавления.
  app.get("/api/packs/:id", async (req, reply) => {
    const p = getPack((req.params as { id: string }).id, uid(req), adminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    return { ...p, rules: p.templates[0] ? deriveRules(p.templates[0]) : [] };
  });

  // Создать пак (имя + язык + шаблон(ы) из редактора).
  app.post("/api/packs", async (req, reply) => {
    const body = (req.body as { name?: string; lang?: string; templates?: PackTemplate[] }) ?? {};
    if (!body.name?.trim()) return reply.code(400).send({ error: "Нужно имя пака" });
    return createPack(uid(req), {
      name: body.name,
      lang: body.lang || "ru",
      templates: Array.isArray(body.templates) ? body.templates : [],
    });
  });

  // Добавить карточки (валидация по правилам шаблона; all-or-nothing).
  app.post("/api/packs/:id/cards", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body as { cards?: unknown; raw?: string }) ?? {};
    const input = body.cards ?? body.raw ?? null;
    if (input == null || (typeof body.raw === "string" && !body.raw.trim()))
      return reply.code(400).send({ error: "Пусто: вставь JSON карточек" });
    const r = addCards(id, uid(req), input);
    if (!r.ok) {
      if (r.reason === "not_found") return reply.code(404).send({ error: "Пак не найден" });
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
    const r = deleteCard(id, uid(req), Number(index), addedAt);
    if (!r.deleted)
      return reply
        .code(r.reason === "stale" ? 409 : 404)
        .send({ error: r.reason === "stale" ? "Список изменился — обнови" : "Не найдено" });
    return { deleted: true, total: r.total };
  });

  // Удалить пак целиком.
  app.delete("/api/packs/:id", async (req, reply) => {
    const ok = deletePack((req.params as { id: string }).id, uid(req), adminReq(req));
    if (!ok) return reply.code(404).send({ error: "Пак не найден или нет прав на удаление" });
    return { deleted: true };
  });

  // Сменить язык (тег) пака — владелец или админ. Используется на странице «Паки».
  app.post("/api/packs/:id/lang", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const lang = String((req.body as { lang?: string })?.lang || "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(lang)) return reply.code(400).send({ error: "Неверный код языка (2 буквы, напр. ru/de/en)" });
    const p = getPack(id, uid(req), adminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    setPackLang(id, lang);
    return { ok: true, lang };
  });

  // Превью карточки #i — рендер шаблоном (шаблоны чередуются по карточкам для разнообразия) → PNG в /files.
  app.get("/api/packs/:id/preview", async (req, reply) => {
    const p = getPack((req.params as { id: string }).id, uid(req), adminReq(req));
    if (!p) return reply.code(404).send({ error: "Пак не найден" });
    const i = Math.max(0, Math.floor(Number((req.query as Record<string, string>)?.i) || 0));
    const card = p.cards[i];
    if (!card) return reply.code(404).send({ error: "Нет такой карточки" });
    if (!p.templates.length) return reply.code(400).send({ error: "У пака нет шаблона" });
    const tpl = p.templates[i % p.templates.length];
    const rel = `packs/${p.id}-${i}.png`;
    try {
      await renderTemplateCard(tpl, card.values, resolve(process.cwd(), OUTPUT_DIR, rel));
    } catch (e) {
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
    const p = getPack(id, userId, adminReq(req));
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
      // Бэкстоп: ролик из пака можно класть только в канал, у которого ЭТОТ пак выбран источником
      // (иначе планировщик его не выложит — он постит по точной деке канала; и язык не тот).
      if (acc.lang !== `pack:${p.id}`)
        return reply.code(400).send({ error: "Канал не использует этот пак — сначала выбери пак источником канала." });
    }
    // музыка: явная / случайная / без
    let music = body.music;
    let audioPath: string | null | undefined;
    if (music === "none") audioPath = null;
    else if (music) audioPath = audioPathFor(music);
    else {
      const t = listAudio();
      if (t.length) { music = t[Math.floor(Math.random() * t.length)]; audioPath = audioPathFor(music); }
      else { music = "none"; audioPath = null; }
    }
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const imgRel = `library/pack-${stamp}.png`;
    const vidRel = `library/pack-${stamp}.mp4`;
    try {
      await renderTemplateCard(tpl, card.values, resolve(process.cwd(), OUTPUT_DIR, imgRel));
      await assembleStillVideo(
        resolve(process.cwd(), OUTPUT_DIR, imgRel),
        resolve(process.cwd(), OUTPUT_DIR, vidRel),
        { durationSec: 6, audioPath },
      );
    } catch (e) {
      return reply.code(500).send({ error: "Сборка не удалась: " + String(e).slice(0, 140) });
    }
    let saved = false;
    if (body.accountId != null) {
      const { title, text } = cardTitleAndText(card.values, deriveRules(p.templates[0]));
      db.createVideo({
        accountId: Number(body.accountId),
        title,
        text,
        bg: "",
        music: music ?? "",
        deck: `pack:${p.id}`,
        videoRel: vidRel,
        imageRel: imgRel,
      });
      saved = true;
    }
    return { videoUrl: `/files/${vidRel}`, music: music ?? "none", saved };
  });
}
