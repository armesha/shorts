// Routes for the German-psychology card uploader (the "Карточки" page). Registered on the shared
// `app` instance, so the global /api/* session hook already gates them (req.userId is set).
// Kept in its own file so server/index.ts only needs a 1-line import + 1-line call.
import type { FastifyInstance } from "fastify";
import { psychSchema } from "../src/psych/schema.ts";
import { validateBatch, appendCards, listCards, deleteCard } from "../src/psych/cards-store.ts";

export function registerPsychCardsRoutes(app: FastifyInstance) {
  // The format standard (patterns + limits) — drives the on-page instruction panel.
  app.get("/api/psych/cards/schema", async () => psychSchema());

  // Browse uploaded cards, newest first, paginated. ?onlyUploaded=false → include seed cards.
  app.get("/api/psych/cards", async (req) => {
    const q = (req.query as Record<string, string>) ?? {};
    return listCards({
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 12,
      onlyUploaded: q.onlyUploaded !== "false",
    });
  });

  // Validate + append a batch. All-or-nothing: any invalid card → 400 with per-card errors, nothing saved.
  app.post("/api/psych/cards", async (req, reply) => {
    const body = (req.body as { cards?: unknown; raw?: string }) ?? {};
    const input = body.cards ?? body.raw ?? null;
    if (input == null || (typeof body.raw === "string" && !body.raw.trim())) {
      return reply.code(400).send({ error: "Пусто: вставь JSON карточек" });
    }
    let result;
    try {
      result = validateBatch(input);
    } catch (e) {
      return reply.code(400).send({ error: "Неверный JSON: " + String(e).slice(0, 160) });
    }
    if (result.parsed === 0) return reply.code(400).send({ error: "Не найдено ни одной карточки" });
    if (result.errors.length) {
      return reply.code(400).send({
        error: `Ошибки в ${result.errors.length} из ${result.parsed} карточек — ничего не загружено`,
        errors: result.errors,
        parsed: result.parsed,
        valid: result.cards.length,
      });
    }
    const { added, total } = appendCards(result.cards);
    return { added, total };
  });

  // Delete ONE uploaded card by index (?addedAt= guards against a shifted list). Seed cards are protected.
  app.delete("/api/psych/cards/:index", async (req, reply) => {
    const index = Number((req.params as { index: string }).index);
    const addedAt = (req.query as Record<string, string>)?.addedAt;
    const r = deleteCard(index, addedAt);
    if (!r.deleted) {
      const code = r.reason === "stale" ? 409 : r.reason === "protected" ? 403 : 404;
      const error =
        r.reason === "protected"
          ? "Эту карточку нельзя удалить (она из базового набора)"
          : r.reason === "stale"
            ? "Список изменился — обнови и попробуй снова"
            : "Карточка не найдена";
      return reply.code(code).send({ error });
    }
    return { deleted: true, total: r.total };
  });
}
