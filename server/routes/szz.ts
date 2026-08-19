import type { FastifyInstance, FastifyReply } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SZZ_HTML_PATH = "/home/davtian/Documents/db/SZZ_DB_ticket_1_1.html";
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
  backupHtmlPath?: string;
  backup2HtmlPath?: string;
  backup3HtmlPath?: string;
  backup4HtmlPath?: string;
  answersPdfPath?: string;
  topicsPdfPath?: string;
  ticketPdfsPath?: string;
};

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
  for (const path of [
    "/szzcards",
    "/szzcards/",
    "/szzreport",
    "/szzreport/",
    "/tempszz",
    "/tempszz/",
    "/tempszz.txt",
  ]) {
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
}
