import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";
import { getCookie, SESSION_COOKIE, type AuthSession } from "../infra/auth-session.ts";

const DEFAULT_SZZ_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_CARDS_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_cards.html";
const DEFAULT_SZZ_CARD_IDS_PATH = "/home/davtian/Documents/db/szz/generated/card-ids.json";
const DEFAULT_SZZ_BACKUP_HTML_PATH =
  "/home/davtian/Documents/db/archive/backups/2026-08-10_20-46-33_before_full_simplification/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP2_HTML_PATH =
  "/home/davtian/Documents/db/archive/backups/2026-08-17_before_second_thesis_rewrite/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP3_HTML_PATH =
  "/home/davtian/Documents/db/archive/backups/2026-08-17_before_simple_verb_batch/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_BACKUP4_HTML_PATH =
  "/home/davtian/Documents/db/archive/backups/2026-08-18_before_report_integration/SZZ_DB_ticket_1_1.html";
const DEFAULT_SZZ_ANSWERS_PDF_PATH =
  "/home/davtian/Documents/db/reference/legacy/SZZ_DB.pdf";
const DEFAULT_SZZ_TOPICS_PDF_PATH =
  "/home/davtian/Documents/db/reference/official/SZZ_DB_topics.pdf";
const DEFAULT_SZZ_TICKET_PDFS_PATH =
  "/home/davtian/Documents/db/generated/ticket-pdfs";
const SZZ_TICKET_PDF_FILE = /^SZZ_DB_ticket_1_(?:[1-9]|1[0-9]|2[0-3])\.pdf$/;

type SzzRouteOptions = {
  htmlPath?: string;
  cardsHtmlPath?: string;
  cardIdsPath?: string;
  validFlashcardIds?: readonly string[] | ReadonlySet<string>;
  backupHtmlPath?: string;
  backup2HtmlPath?: string;
  backup3HtmlPath?: string;
  backup4HtmlPath?: string;
  answersPdfPath?: string;
  topicsPdfPath?: string;
  ticketPdfsPath?: string;
  db?: Db;
  validSessionUser?: AuthSession["validSessionUser"];
};

const MAX_STUDY_STATE_BYTES = 128 * 1024;
const SZZ_TICKET_ID = /^ticket-1-(?:[1-9]|1[0-9]|2[0-3])$/;
const SZZ_TICKET_IDS = Array.from({ length: 23 }, (_, index) => `ticket-1-${index + 1}`);
const MAX_TICKET_COUNT = 1_000_000;
const TICKET_COUNT_VERSION_EPOCH = 1_786_999_412_280;
const MAX_FLASHCARD_STATE_BYTES = 256 * 1024;
const MAX_FLASHCARD_CARDS = 1_000;
const MAX_FLASHCARD_HISTORY = 500;
const MAX_FLASHCARD_COUNTER = 1_000_000;
const MAX_TIMESTAMP = 8_640_000_000_000_000;
const FLASHCARD_ID =
  /^ticket-1-(?:[1-9]|1[0-9]|2[0-3])::[a-z0-9]+(?:-[a-z0-9]+)*::(?:0|[1-9][0-9]{0,2})$/;
const CONTENT_HASH = /^[0-9a-f]{64}$/;
const FLASHCARD_SEED =
  /^[0-9a-f]{64}:(?:(?:learn|connections|review|exam):[1-9][0-9]{0,15}|[1-9][0-9]{0,15}:(?:learn|connections|review|exam))$/;
const FLASHCARD_MODES = ["learn", "connections", "review", "exam"] as const;
const FLASHCARD_MODE_SET = new Set<string>(FLASHCARD_MODES);
const FLASHCARD_STATUSES = new Set(["new", "learning", "review", "mastered"]);
const FLASHCARD_RESULTS = new Set(["again", "hard", "good", "easy"]);
const FORBIDDEN_FLASHCARD_FIELDS = new Set([
  "question",
  "answer",
  "html",
  "sourcetext",
  "questiontext",
  "answertext",
  "questionhtml",
  "answerhtml",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function containsForbiddenFlashcardField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenFlashcardField);
  if (!isRecord(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_FLASHCARD_FIELDS.has(normalizedKey)) return true;
    if (containsForbiddenFlashcardField(child)) return true;
  }
  return false;
}

function isSafeTimestamp(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_TIMESTAMP
  );
}

function isSafeCounter(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_FLASHCARD_COUNTER
  );
}

function normalizedFlashcardMode(
  value: unknown,
  validFlashcardIds: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, new Set(["order", "index", "currentCardId", "revealed", "seed", "updatedAt"]))) {
    return null;
  }
  if (!Array.isArray(value.order) || value.order.length > MAX_FLASHCARD_CARDS) return null;
  if (!value.order.every((cardId) =>
    typeof cardId === "string" && FLASHCARD_ID.test(cardId) && validFlashcardIds.has(cardId)
  )) return null;
  if (new Set(value.order).size !== value.order.length) return null;
  if (
    typeof value.index !== "number" ||
    !Number.isSafeInteger(value.index) ||
    value.index < 0 ||
    value.index > value.order.length
  ) {
    return null;
  }
  if (typeof value.revealed !== "boolean" || !isSafeTimestamp(value.updatedAt)) return null;
  const validSeed =
    typeof value.seed === "string" && FLASHCARD_SEED.test(value.seed);
  if (!validSeed) return null;

  const expectedCurrentCardId = value.index < value.order.length ? value.order[value.index] : null;
  if (value.currentCardId !== expectedCurrentCardId) return null;
  if (expectedCurrentCardId === null && value.revealed) return null;

  return {
    order: [...value.order],
    index: value.index,
    currentCardId: value.currentCardId,
    revealed: value.revealed,
    seed: value.seed,
    updatedAt: value.updatedAt,
  };
}

function normalizedFlashcardProgress(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const allowed = new Set([
    "status",
    "dueAt",
    "lastReviewedAt",
    "reviewCount",
    "correctCount",
    "incorrectCount",
    "streak",
    "intervalDays",
    "ease",
    "sourceHash",
    "questionNeedsReview",
    "updatedAt",
  ]);
  if (!hasOnlyKeys(value, allowed)) return null;
  if (typeof value.status !== "string" || !FLASHCARD_STATUSES.has(value.status)) return null;
  if (!isSafeTimestamp(value.updatedAt)) return null;

  for (const key of ["reviewCount", "correctCount", "incorrectCount", "streak"] as const) {
    if (value[key] !== undefined && !isSafeCounter(value[key])) return null;
  }
  for (const key of ["dueAt", "lastReviewedAt"] as const) {
    if (value[key] !== undefined && value[key] !== null && !isSafeTimestamp(value[key])) return null;
  }
  if (
    value.intervalDays !== undefined &&
    (typeof value.intervalDays !== "number" || !Number.isFinite(value.intervalDays) || value.intervalDays < 0 || value.intervalDays > 36_500)
  ) {
    return null;
  }
  if (
    value.ease !== undefined &&
    (typeof value.ease !== "number" || !Number.isFinite(value.ease) || value.ease < 1 || value.ease > 5)
  ) {
    return null;
  }
  if (value.sourceHash !== undefined && (typeof value.sourceHash !== "string" || !CONTENT_HASH.test(value.sourceHash))) {
    return null;
  }
  if (value.questionNeedsReview !== undefined && typeof value.questionNeedsReview !== "boolean") return null;

  const progress: Record<string, unknown> = {
    status: value.status,
    updatedAt: value.updatedAt,
  };
  for (const key of [
    "dueAt",
    "lastReviewedAt",
    "reviewCount",
    "correctCount",
    "incorrectCount",
    "streak",
    "intervalDays",
    "ease",
    "sourceHash",
    "questionNeedsReview",
  ] as const) {
    if (value[key] !== undefined) progress[key] = value[key];
  }
  return progress;
}

function normalizedFlashcardHistoryEvent(
  value: unknown,
  validFlashcardIds: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (!hasOnlyKeys(value, new Set(["cardId", "mode", "result", "reviewedAt"]))) return null;
  if (
    typeof value.cardId !== "string" ||
    !FLASHCARD_ID.test(value.cardId) ||
    !validFlashcardIds.has(value.cardId)
  ) return null;
  if (typeof value.mode !== "string" || !FLASHCARD_MODE_SET.has(value.mode)) return null;
  if (typeof value.result !== "string" || !FLASHCARD_RESULTS.has(value.result)) return null;
  if (!isSafeTimestamp(value.reviewedAt)) return null;
  return {
    cardId: value.cardId,
    mode: value.mode,
    result: value.result,
    reviewedAt: value.reviewedAt,
  };
}

function normalizedFlashcardState(
  value: unknown,
  validFlashcardIds: ReadonlySet<string>,
): { state: Record<string, unknown>; json: string; updatedAt: number } | null {
  if (!isRecord(value) || containsForbiddenFlashcardField(value)) return null;
  if (!hasOnlyKeys(value, new Set(["version", "catalogVersion", "activeMode", "modes", "cards", "history", "updatedAt"]))) {
    return null;
  }
  if (value.version !== 1) return null;
  if (typeof value.catalogVersion !== "string" || !CONTENT_HASH.test(value.catalogVersion)) return null;
  if (typeof value.activeMode !== "string" || !FLASHCARD_MODE_SET.has(value.activeMode)) return null;
  if (!isRecord(value.modes) || !hasOnlyKeys(value.modes, FLASHCARD_MODE_SET)) return null;
  if (Object.keys(value.modes).length !== FLASHCARD_MODES.length) return null;
  if (!isRecord(value.cards) || Object.keys(value.cards).length > MAX_FLASHCARD_CARDS) return null;
  if (!Array.isArray(value.history) || value.history.length > MAX_FLASHCARD_HISTORY) return null;
  if (!isSafeTimestamp(value.updatedAt)) return null;

  const modes: Record<string, unknown> = {};
  for (const mode of FLASHCARD_MODES) {
    const normalized = normalizedFlashcardMode(value.modes[mode], validFlashcardIds);
    if (!normalized) return null;
    modes[mode] = normalized;
  }

  const cards: Record<string, unknown> = {};
  for (const [cardId, rawProgress] of Object.entries(value.cards)) {
    if (!FLASHCARD_ID.test(cardId) || !validFlashcardIds.has(cardId)) return null;
    const progress = normalizedFlashcardProgress(rawProgress);
    if (!progress) return null;
    cards[cardId] = progress;
  }

  const history: Record<string, unknown>[] = [];
  for (const rawEvent of value.history) {
    const event = normalizedFlashcardHistoryEvent(rawEvent, validFlashcardIds);
    if (!event) return null;
    history.push(event);
  }

  const state = {
    version: 1,
    catalogVersion: value.catalogVersion,
    activeMode: value.activeMode,
    modes,
    cards,
    history,
    updatedAt: value.updatedAt,
  };
  const json = JSON.stringify(state);
  if (Buffer.byteLength(json, "utf8") > MAX_FLASHCARD_STATE_BYTES) return null;
  return { state, json, updatedAt: value.updatedAt };
}

function payloadFitsFlashcardLimit(value: unknown): boolean {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_FLASHCARD_STATE_BYTES;
  } catch {
    return false;
  }
}

function loadFlashcardIds(path: string): Set<string> {
  let document: unknown;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read SZZ card-ID manifest at ${path}`, { cause: error });
  }
  if (!isRecord(document) || document.schemaVersion !== 1 || !Array.isArray(document.cardIds)) {
    throw new Error(`Invalid SZZ card-ID manifest at ${path}`);
  }
  const cardIds = document.cardIds;
  if (
    cardIds.length !== 143 ||
    !cardIds.every((cardId) => typeof cardId === "string" && FLASHCARD_ID.test(cardId)) ||
    new Set(cardIds).size !== cardIds.length
  ) {
    throw new Error(`SZZ card-ID manifest must contain exactly 143 unique valid IDs: ${path}`);
  }
  return new Set(cardIds);
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

function setPrivateNoStore(reply: FastifyReply) {
  reply.header("Cache-Control", "private, no-store, max-age=0");
  reply.header("Pragma", "no-cache");
  reply.header("Vary", "Cookie");
}

function sendPrivateSzzPage(reply: FastifyReply, htmlPath: string) {
  setPrivateNoStore(reply);
  if (!existsSync(htmlPath)) return reply.code(404).send({ error: "page not found" });
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
  const cardsHtmlPath = resolve(
    options.cardsHtmlPath ?? process.env.SZZ_CARDS_HTML_PATH ?? DEFAULT_SZZ_CARDS_HTML_PATH,
  );
  const cardIdsPath = resolve(
    options.cardIdsPath ?? process.env.SZZ_CARD_IDS_PATH ?? DEFAULT_SZZ_CARD_IDS_PATH,
  );
  const validFlashcardIds = options.db
    ? new Set(options.validFlashcardIds ?? loadFlashcardIds(cardIdsPath))
    : new Set<string>();
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
  for (const path of ["/szzcards", "/szzcards/"]) {
    app.get(path, async (req, reply) => {
      setPrivateNoStore(reply);
      const sessionUser = options.validSessionUser?.(getCookie(req, SESSION_COOKIE)) ?? null;
      if (!sessionUser) return reply.code(401).send({ error: "Не авторизован" });
      const armen = options.db?.getUserByUsername("armen") ?? null;
      if (!armen || sessionUser.id !== armen.id) {
        return reply.code(403).send({ error: "Карточки доступны только владельцу" });
      }
      return sendPrivateSzzPage(reply, cardsHtmlPath);
    });
  }
  for (const path of ["/szzreport", "/szzreport/", "/tempszz", "/tempszz/", "/tempszz.txt"]) {
    app.get(path, async (_req, reply) => reply.code(404).send({ error: "not found" }));
  }
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

    app.get("/api/szz/cards/state", async (req, reply) => {
      setPrivateNoStore(reply);
      const userId = requestUserId(req);
      if (!userId) return reply.code(401).send({ error: "Не авторизован" });
      const armen = options.db!.getUserByUsername("armen");
      if (!armen || armen.id !== userId) {
        return reply.code(403).send({ error: "Карточки доступны только владельцу" });
      }
      const stored = options.db!.getSzzFlashcardState(userId);
      return {
        userId,
        revision: stored?.revision ?? 0,
        state: stored?.state ?? null,
        updatedAt: stored?.updatedAt ?? null,
      };
    });

    app.put("/api/szz/cards/state", async (req, reply) => {
      setPrivateNoStore(reply);
      const userId = requestUserId(req);
      if (!userId) return reply.code(401).send({ error: "Не авторизован" });
      const armen = options.db!.getUserByUsername("armen");
      if (!armen || armen.id !== userId) {
        return reply.code(403).send({ error: "Карточки доступны только владельцу" });
      }
      if (!payloadFitsFlashcardLimit(req.body)) {
        return reply.code(400).send({ error: "Состояние карточек превышает 256 КиБ" });
      }
      const body = isRecord(req.body) ? req.body : null;
      if (!body || !hasOnlyKeys(body, new Set(["expectedRevision", "state"]))) {
        return reply.code(400).send({ error: "Некорректное состояние карточек" });
      }
      const expectedRevision = body.expectedRevision;
      if (
        typeof expectedRevision !== "number" ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0
      ) {
        return reply.code(400).send({ error: "Некорректная ревизия карточек" });
      }
      const normalized = normalizedFlashcardState(body.state, validFlashcardIds);
      if (!normalized) {
        return reply.code(400).send({ error: "Некорректное состояние карточек" });
      }
      const result = options.db!.saveSzzFlashcardState(
        userId,
        normalized.json,
        normalized.updatedAt,
        expectedRevision,
      );
      if (!result.saved) {
        return reply.code(409).send({
          userId,
          saved: false,
          revision: result.row?.revision ?? 0,
          state: result.row?.state ?? null,
          updatedAt: result.row?.updatedAt ?? null,
        });
      }
      return {
        userId,
        saved: true,
        revision: result.row?.revision ?? expectedRevision + 1,
        state: result.row?.state ?? normalized.state,
        updatedAt: result.row?.updatedAt ?? null,
      };
    });
  }
}
