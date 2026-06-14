// Роуты кастомных («ручных») паков для хаба «Паки и карточки». Регистрируются на общем `app`,
// поэтому глобальный хук /api/* уже проставил req.userId. Изоляция по владельцу — внутри store.
// Превью карточки рисуется тем же мостом рендера (renderTemplateCard), что и шаблоны редактора.
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { loadBaseConfig } from "./config.ts";
import {
  listPacks,
  getPack,
  createPack,
  addCards,
  deleteCard,
  deletePack,
  deriveRules,
  type PackTemplate,
} from "../src/packs/store.ts";
import { renderTemplateCard } from "../src/template/render.ts";

const OUTPUT_DIR = loadBaseConfig().outputDir;
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;

export function registerPacksRoutes(app: FastifyInstance) {
  // Мои паки (сводки, новейшие сверху).
  app.get("/api/packs", async (req) => listPacks(uid(req)));

  // Один пак + выведенные из шаблона правила (роли, min/max, списки) — для формы добавления.
  app.get("/api/packs/:id", async (req, reply) => {
    const p = getPack((req.params as { id: string }).id, uid(req));
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
    const ok = deletePack((req.params as { id: string }).id, uid(req));
    if (!ok) return reply.code(404).send({ error: "Пак не найден" });
    return { deleted: true };
  });

  // Превью карточки #i — рендер шаблоном (шаблоны чередуются по карточкам для разнообразия) → PNG в /files.
  app.get("/api/packs/:id/preview", async (req, reply) => {
    const p = getPack((req.params as { id: string }).id, uid(req));
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
    return { imageUrl: `/files/${rel}` };
  });
}
