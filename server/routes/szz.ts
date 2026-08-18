import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";

const DEFAULT_SZZ_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_REPORT_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_report.html";
const DEFAULT_SZZ_TEMP_TEXT_PATH = "/home/davtian/Documents/db/SZZ_DB_temp_changes.txt";
const DEFAULT_SZZ_BACKUP_HTML_PATH =
  "/home/davtian/Documents/db/backups/2026-08-10_20-46-33_before_full_simplification/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP2_HTML_PATH =
  "/home/davtian/Documents/db/backups/2026-08-17_before_second_thesis_rewrite/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP3_HTML_PATH =
  "/home/davtian/Documents/db/backups/2026-08-17_before_simple_verb_batch/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP4_HTML_PATH =
  "/home/davtian/Documents/db/backups/2026-08-18_before_report_integration/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_ANSWERS_PDF_PATH = "/home/davtian/Documents/db/SZZ_DB.pdf";
const DEFAULT_SZZ_TOPICS_PDF_PATH =
  "/home/davtian/Documents/db/final-verzetoszzbcitb0688a140009113064_DB.pdf";
const DEFAULT_SZZ_TICKET_PDFS_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_pdfs";
const SZZ_TICKET_PDF_FILE = /^SZZ_DB_ticket_1_(?:[1-9]|1[0-9]|2[0-3])\.pdf$/;

type SzzRouteOptions = {
  htmlPath?: string;
  reportHtmlPath?: string;
  tempTextPath?: string;
  backupHtmlPath?: string;
  backup2HtmlPath?: string;
  backup3HtmlPath?: string;
  backup4HtmlPath?: string;
  answersPdfPath?: string;
  topicsPdfPath?: string;
  ticketPdfsPath?: string;
  db?: Db;
};

const MAX_STUDY_STATE_BYTES = 128 * 1024;
const SZZ_TICKET_ID = /^ticket-1-(?:[1-9]|1[0-9]|2[0-3])$/;
const SZZ_TICKET_IDS = Array.from({ length: 23 }, (_, index) => `ticket-1-${index + 1}`);
const MAX_TICKET_COUNT = 1_000_000;
const TICKET_COUNT_VERSION_EPOCH = 1_786_999_412_280;

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

function normalizedTicketCounts(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [ticketId, rawCount] of Object.entries(value)) {
    const count = Number(rawCount);
    if (!SZZ_TICKET_ID.test(ticketId) || !Number.isSafeInteger(count) || count < 0 || count > MAX_TICKET_COUNT) {
      return null;
    }
    if (count > 0) result[ticketId] = count;
  }
  return result;
}

function normalizedTicketCountUpdates(
  value: unknown,
  stateUpdatedAt: number,
): Record<string, number> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, number> = {};
  for (const [ticketId, rawUpdatedAt] of Object.entries(value)) {
    const updatedAt = Number(rawUpdatedAt);
    if (
      !SZZ_TICKET_ID.test(ticketId) ||
      !Number.isSafeInteger(updatedAt) ||
      updatedAt <= 0 ||
      updatedAt > stateUpdatedAt
    ) {
      return null;
    }
    result[ticketId] = updatedAt;
  }
  return result;
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
  const ticketCounts = value.ticketCounts === undefined
    ? undefined
    : normalizedTicketCounts(value.ticketCounts);
  if (value.ticketCounts !== undefined && !ticketCounts) return null;
  const ticketCountUpdates = value.ticketCountUpdates === undefined
    ? undefined
    : normalizedTicketCountUpdates(value.ticketCountUpdates, updatedAt);
  if (value.ticketCountUpdates !== undefined && !ticketCountUpdates) return null;
  const state = {
    version: 1,
    tickets: value.tickets,
    reviews: value.reviews,
    activityDates: value.activityDates,
    ...(ticketCounts ? { ticketCounts } : {}),
    ...(ticketCountUpdates ? { ticketCountUpdates } : {}),
    ticketOrder: value.ticketOrder,
    ...(topicGenerator ? { topicGenerator } : {}),
    updatedAt,
  };
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json, "utf8") > MAX_STUDY_STATE_BYTES) return null;
  return { state, json, updatedAt };
}

function stateUpdatedAt(state: Record<string, unknown>): number {
  const updatedAt = Number(state.updatedAt);
  return Number.isSafeInteger(updatedAt) && updatedAt > 0 ? updatedAt : 0;
}

function ticketCountInState(state: Record<string, unknown>, ticketId: string): number {
  if (!isRecord(state.ticketCounts)) return 0;
  const count = Number(state.ticketCounts[ticketId]);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function ticketCountVersionInState(state: Record<string, unknown>, ticketId: string): number {
  if (isRecord(state.ticketCountUpdates)) {
    const explicitVersion = Number(state.ticketCountUpdates[ticketId]);
    if (Number.isSafeInteger(explicitVersion) && explicitVersion > 0) return explicitVersion;
  }
  return ticketCountInState(state, ticketId) > 0 ? stateUpdatedAt(state) : 0;
}

function withCompleteTicketCountUpdates(state: Record<string, unknown>): Record<string, unknown> {
  const fallbackUpdatedAt = Math.max(stateUpdatedAt(state), TICKET_COUNT_VERSION_EPOCH);
  if (!fallbackUpdatedAt) return state;
  const sourceUpdates = isRecord(state.ticketCountUpdates) ? state.ticketCountUpdates : {};
  const ticketCountUpdates: Record<string, number> = {};
  for (const ticketId of SZZ_TICKET_IDS) {
    const explicitVersion = Number(sourceUpdates[ticketId]);
    ticketCountUpdates[ticketId] = Number.isSafeInteger(explicitVersion) && explicitVersion > 0
      ? explicitVersion
      : fallbackUpdatedAt;
  }
  return {
    ...state,
    ticketCountUpdates,
    updatedAt: Math.max(stateUpdatedAt(state), ...Object.values(ticketCountUpdates)),
  };
}

function mergeTicketCounters(
  storedState: Record<string, unknown> | null,
  incomingState: Record<string, unknown>,
): Record<string, unknown> {
  const baselineState = withCompleteTicketCountUpdates(storedState ?? incomingState);
  const ticketCounts: Record<string, number> = {};
  const ticketCountUpdates: Record<string, number> = {};

  for (const ticketId of SZZ_TICKET_IDS) {
    const storedVersion = ticketCountVersionInState(baselineState, ticketId);
    const incomingVersion = ticketCountVersionInState(incomingState, ticketId);
    const selectedState = incomingVersion >= storedVersion ? incomingState : baselineState;
    const selectedVersion = Math.max(storedVersion, incomingVersion);
    const selectedCount = ticketCountInState(selectedState, ticketId);
    if (selectedCount > 0) ticketCounts[ticketId] = selectedCount;
    if (selectedVersion > 0) ticketCountUpdates[ticketId] = selectedVersion;
  }

  return {
    ...incomingState,
    ticketCounts,
    ticketCountUpdates,
    updatedAt: Math.max(stateUpdatedAt(incomingState), ...Object.values(ticketCountUpdates)),
  };
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

function sendSzzText(reply: FastifyReply, textPath: string) {
  if (!existsSync(textPath)) return reply.code(404).send({ error: "file not found" });
  reply.header("Cache-Control", "no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.type("text/plain; charset=utf-8");
  return reply.send(createReadStream(textPath));
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
  const reportHtmlPath = resolve(
    options.reportHtmlPath ?? process.env.SZZ_REPORT_HTML_PATH ?? DEFAULT_SZZ_REPORT_HTML_PATH,
  );
  const tempTextPath = resolve(
    options.tempTextPath ?? process.env.SZZ_TEMP_TEXT_PATH ?? DEFAULT_SZZ_TEMP_TEXT_PATH,
  );
  const backupHtmlPath = resolve(
    options.backupHtmlPath ??
      process.env.SZZ_BACKUP_HTML_PATH ??
      DEFAULT_SZZ_BACKUP_HTML_PATH,
  );
  const backup2HtmlPath = resolve(
    options.backup2HtmlPath ??
      process.env.SZZ_BACKUP2_HTML_PATH ??
      DEFAULT_SZZ_BACKUP2_HTML_PATH,
  );
  const backup3HtmlPath = resolve(
    options.backup3HtmlPath ??
      process.env.SZZ_BACKUP3_HTML_PATH ??
      DEFAULT_SZZ_BACKUP3_HTML_PATH,
  );
  const backup4HtmlPath = resolve(
    options.backup4HtmlPath ??
      process.env.SZZ_BACKUP4_HTML_PATH ??
      DEFAULT_SZZ_BACKUP4_HTML_PATH,
  );
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
  app.get("/szzreport", async (_req, reply) => sendSzzPage(reply, reportHtmlPath));
  app.get("/szzreport/", async (_req, reply) => sendSzzPage(reply, reportHtmlPath));
  app.get("/tempszz", async (_req, reply) => sendSzzText(reply, tempTextPath));
  app.get("/tempszz/", async (_req, reply) => sendSzzText(reply, tempTextPath));
  app.get("/szzbackup", async (_req, reply) => sendSzzPage(reply, backupHtmlPath));
  app.get("/szzbackup/", async (_req, reply) => sendSzzPage(reply, backupHtmlPath));
  app.get("/szzbackup2", async (_req, reply) => sendSzzPage(reply, backup2HtmlPath));
  app.get("/szzbackup2/", async (_req, reply) => sendSzzPage(reply, backup2HtmlPath));
  app.get("/szzbackup3", async (_req, reply) => sendSzzPage(reply, backup3HtmlPath));
  app.get("/szzbackup3/", async (_req, reply) => sendSzzPage(reply, backup3HtmlPath));
  app.get("/szzbackup4", async (_req, reply) => sendSzzPage(reply, backup4HtmlPath));
  app.get("/szzbackup4/", async (_req, reply) => sendSzzPage(reply, backup4HtmlPath));
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
      const storedState = isRecord(stored?.state) ? stored.state : null;
      return {
        userId,
        state: storedState ? withCompleteTicketCountUpdates(storedState) : null,
        updatedAt: stored?.updatedAt ?? null,
      };
    });

    app.put("/api/szz/state", async (req, reply) => {
      const userId = requestUserId(req);
      if (!userId) return reply.code(401).send({ error: "Не авторизован" });
      const body = (req.body as { state?: unknown }) ?? {};
      const normalized = normalizedStudyState(body.state);
      if (!normalized) return reply.code(400).send({ error: "Некорректное состояние билетов" });
      const stored = options.db!.getSzzStudyState(userId);
      const storedState = isRecord(stored?.state) ? stored.state : null;
      const protectedStoredState = storedState
        ? withCompleteTicketCountUpdates(storedState)
        : null;
      if (
        stored &&
        protectedStoredState &&
        normalized.updatedAt < stateUpdatedAt(protectedStoredState)
      ) {
        return {
          userId,
          saved: false,
          state: protectedStoredState,
          updatedAt: stored.updatedAt,
        };
      }
      const mergedState = mergeTicketCounters(protectedStoredState, normalized.state);
      const merged = normalizedStudyState(mergedState);
      if (!merged) return reply.code(400).send({ error: "Некорректное состояние билетов" });
      const result = options.db!.saveSzzStudyState(userId, merged.json, merged.updatedAt);
      const savedState = isRecord(result.row?.state) ? result.row.state : null;
      return {
        userId,
        saved: result.saved,
        state: savedState
          ? withCompleteTicketCountUpdates(savedState)
          : merged.state,
        updatedAt: result.row?.updatedAt ?? null,
      };
    });
  }
}
