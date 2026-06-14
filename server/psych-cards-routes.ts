// Routes for the German-psychology card uploader (the "Карточки" page). Registered on the shared
// `app` instance, so the global /api/* session hook already gates them (req.userId is set).
// Kept in its own file so server/index.ts only needs a 1-line import + 1-line call.
import type { FastifyInstance } from "fastify";
import { psychSchema } from "../src/psych/schema.ts";
import { validateBatch, appendCards, listCards } from "../src/psych/cards-store.ts";

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
      theme: q.theme,
    });
  });

  // Validate + append a batch. All-or-nothing: any invalid card → 400 with per-card errors, nothing saved.
  app.post("/api/psych/cards", async (req, reply) => {
    const body = (req.body as { cards?: unknown; raw?: string; theme?: string }) ?? {};
    const theme = typeof body.theme === "string" ? body.theme : undefined;
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
    const { added, total } = appendCards(result.cards, theme);
    return { added, total };
  });
}
