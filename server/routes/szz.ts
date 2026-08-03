import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";

const DEFAULT_SZZ_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_ANSWERS_PDF_PATH = "/home/davtian/Documents/db/SZZ_DB.pdf";
const DEFAULT_SZZ_TOPICS_PDF_PATH =
  "/home/davtian/Documents/db/final-verzetoszzbcitb0688a140009113064_DB.pdf";
const DEFAULT_SZZ_TICKET_PDFS_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_pdfs";
const SZZ_TICKET_PDF_FILE = /^SZZ_DB_ticket_1_(?:[1-9]|1[0-9]|2[0-3])\.pdf$/;

type SzzRouteOptions = {
  htmlPath?: string;
  answersPdfPath?: string;
  topicsPdfPath?: string;
  ticketPdfsPath?: string;
  db?: Db;
};

const MAX_STUDY_STATE_BYTES = 128 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedTopicGenerator(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || !Array.isArray(value.order)) return null;
  if (value.order.length < 1 || value.order.length > 200) return null;
  if (!value.order.every((key) => typeof key === "string" && key.length > 0 && key.length <= 200)) {
    return null;
  }
  if (new Set(value.order).size !== value.order.length) return null;
  const completed = Math.floor(Number(value.completed));
  const rounds = Math.floor(Number(value.rounds));
  if (!Number.isSafeInteger(completed) || completed < 0 || completed >= value.order.length) return null;
  if (!Number.isSafeInteger(rounds) || rounds < 0) return null;
  return {
    version: 1,
    order: value.order,
    completed,
    rounds,
  };
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
  const topicGenerator = value.topicGenerator === undefined
    ? undefined
    : normalizedTopicGenerator(value.topicGenerator);
  if (value.topicGenerator !== undefined && !topicGenerator) return null;
  const state = {
    version: 1,
    tickets: value.tickets,
    reviews: value.reviews,
    activityDates: value.activityDates,
    ticketOrder: value.ticketOrder,
    ...(topicGenerator ? { topicGenerator } : {}),
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
  const ticketPdfsPath = resolve(
    options.ticketPdfsPath ??
      process.env.SZZ_TICKET_PDFS_PATH ??
      DEFAULT_SZZ_TICKET_PDFS_PATH,
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
  app.get<{ Params: { fileName: string } }>("/szz/tickets/:fileName", async (req, reply) => {
    const { fileName } = req.params;
    if (!SZZ_TICKET_PDF_FILE.test(fileName)) {
      return reply.code(404).send({ error: "file not found" });
    }
    return sendSzzPdf(reply, resolve(ticketPdfsPath, fileName), fileName);
  });

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
