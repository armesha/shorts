import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";

const DEFAULT_SZZ_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_ANSWERS_PDF_PATH = "/home/davtian/Documents/db/SZZ_DB.pdf";
const DEFAULT_SZZ_TOPICS_PDF_PATH =
  "/home/davtian/Documents/db/final-verzetoszzbcitb0688a140009113064_DB.pdf";

type SzzRouteOptions = {
  htmlPath?: string;
  answersPdfPath?: string;
  topicsPdfPath?: string;
  db?: Db;
};

const MAX_STUDY_STATE_BYTES = 128 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedStudyState(value: unknown): { state: Record<string, unknown>; json: string; updatedAt: number } | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.tickets) || !isRecord(value.reviews) || !isRecord(value.activityDates)) return null;
  if (!Array.isArray(value.ticketOrder) || value.ticketOrder.length > 100) return null;
  if (!value.ticketOrder.every((ticketId) => typeof ticketId === "string" && ticketId.length <= 100)) {
    return null;
  }
  const updatedAt = Math.floor(Number(value.updatedAt));
  if (!Number.isSafeInteger(updatedAt) || updatedAt <= 0) return null;
  const state = {
    version: 1,
    tickets: value.tickets,
    reviews: value.reviews,
    activityDates: value.activityDates,
    ticketOrder: value.ticketOrder,
    updatedAt,
  };
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json, "utf8") > MAX_STUDY_STATE_BYTES) return null;
  return { state, json, updatedAt };
}

function requestUserId(req: unknown): number | null {
  const userId = Number((req as { userId?: number }).userId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function sendSzzPage(reply: FastifyReply, htmlPath: string, downloadFileName?: string) {
  if (!existsSync(htmlPath)) return reply.code(404).send({ error: "page not found" });
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  if (downloadFileName) {
    reply.header("Content-Disposition", `attachment; filename="${downloadFileName}"`);
  }
  reply.type("text/html; charset=utf-8");
  return reply.send(createReadStream(htmlPath));
}

function sendSzzPdf(reply: FastifyReply, pdfPath: string, fileName: string) {
  if (!existsSync(pdfPath)) return reply.code(404).send({ error: "file not found" });
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Content-Disposition", `inline; filename="${fileName}"`);
  reply.type("application/pdf");
  return reply.send(createReadStream(pdfPath));
}

export function registerSzzRoutes(app: FastifyInstance, options: SzzRouteOptions = {}) {
  const htmlPath = resolve(options.htmlPath ?? process.env.SZZ_HTML_PATH ?? DEFAULT_SZZ_HTML_PATH);
  const answersPdfPath = resolve(
    options.answersPdfPath ?? process.env.SZZ_ANSWERS_PDF_PATH ?? DEFAULT_SZZ_ANSWERS_PDF_PATH,
  );
  const topicsPdfPath = resolve(
    options.topicsPdfPath ?? process.env.SZZ_TOPICS_PDF_PATH ?? DEFAULT_SZZ_TOPICS_PDF_PATH,
  );

  app.get("/szz", async (_req, reply) => sendSzzPage(reply, htmlPath));
  app.get("/szz/", async (_req, reply) => sendSzzPage(reply, htmlPath));
  app.get("/szz/SZZ_DB_offline.html", async (_req, reply) =>
    sendSzzPage(reply, htmlPath, "SZZ_DB_offline.html"),
  );
  app.get("/szz/SZZ_DB.pdf", async (_req, reply) =>
    sendSzzPdf(reply, answersPdfPath, "SZZ_DB.pdf"),
  );
  app.get("/szz/SZZ_DB_topics.pdf", async (_req, reply) =>
    sendSzzPdf(reply, topicsPdfPath, "SZZ_DB_topics.pdf"),
  );

  if (options.db) {
    app.get("/api/szz/state", async (req, reply) => {
      const userId = requestUserId(req);
      if (!userId) return reply.code(401).send({ error: "Не авторизован" });
      const stored = options.db!.getSzzStudyState(userId);
      return {
        userId,
        state: stored?.state ?? null,
        updatedAt: stored?.updatedAt ?? null,
      };
    });

    app.put("/api/szz/state", async (req, reply) => {
      const userId = requestUserId(req);
      if (!userId) return reply.code(401).send({ error: "Не авторизован" });
      const body = (req.body as { state?: unknown }) ?? {};
      const normalized = normalizedStudyState(body.state);
      if (!normalized) return reply.code(400).send({ error: "Некорректное состояние билетов" });
      const result = options.db!.saveSzzStudyState(userId, normalized.json, normalized.updatedAt);
      return {
        userId,
        saved: result.saved,
        state: result.row?.state ?? normalized.state,
        updatedAt: result.row?.updatedAt ?? null,
      };
    });
  }
}
