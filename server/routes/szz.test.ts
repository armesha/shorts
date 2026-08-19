import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerSzzRoutes } from "./szz.ts";

test("szz routes serve the latest source HTML without restarting", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-route-"));
  const htmlPath = resolve(dir, "ticket.html");
  writeFileSync(htmlPath, "<!doctype html><title>version one</title>");

  const app = Fastify();
  registerSzzRoutes(app, { htmlPath });

  const first = await app.inject({ method: "GET", url: "/szz" });
  assert.equal(first.statusCode, 200);
  assert.match(first.headers["content-type"] ?? "", /^text\/html/);
  assert.equal(first.headers["cache-control"], "no-store, max-age=0");
  assert.match(first.body, /version one/);

  writeFileSync(htmlPath, "<!doctype html><title>version two</title>");
  const second = await app.inject({ method: "GET", url: "/szz/" });
  assert.equal(second.statusCode, 200);
  assert.match(second.body, /version two/);

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("retired szz routes return 404 instead of the SPA fallback", async () => {
  const app = Fastify();
  registerSzzRoutes(app);

  for (const url of [
    "/szzcards",
    "/szzcards/",
    "/szzreport",
    "/szzreport/",
    "/tempszz",
    "/tempszz/",
    "/tempszz.txt",
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "not found" });
  }

  await app.close();
});

test("szz backup routes serve all configured backups without changing the current page", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-backup-route-"));
  const htmlPath = resolve(dir, "ticket.html");
  const backupHtmlPath = resolve(dir, "ticket-backup.html");
  const backup2HtmlPath = resolve(dir, "ticket-backup2.html");
  const backup3HtmlPath = resolve(dir, "ticket-backup3.html");
  const backup4HtmlPath = resolve(dir, "ticket-backup4.html");
  writeFileSync(htmlPath, "<!doctype html><title>current tickets</title>");
  writeFileSync(backupHtmlPath, "<!doctype html><title>backup tickets</title>");
  writeFileSync(backup2HtmlPath, "<!doctype html><title>second backup tickets</title>");
  writeFileSync(backup3HtmlPath, "<!doctype html><title>third backup tickets</title>");
  writeFileSync(backup4HtmlPath, "<!doctype html><title>fourth backup tickets</title>");

  const app = Fastify();
  registerSzzRoutes(app, {
    htmlPath,
    backupHtmlPath,
    backup2HtmlPath,
    backup3HtmlPath,
    backup4HtmlPath,
  });

  const current = await app.inject({ method: "GET", url: "/szz" });
  assert.equal(current.statusCode, 200);
  assert.match(current.body, /current tickets/);

  for (const url of ["/szzbackup", "/szzbackup/"]) {
    const backup = await app.inject({ method: "GET", url });
    assert.equal(backup.statusCode, 200);
    assert.match(backup.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(backup.headers["cache-control"], "no-store, max-age=0");
    assert.match(backup.body, /backup tickets/);
    assert.doesNotMatch(backup.body, /current tickets/);
  }

  for (const url of ["/szzbackup2", "/szzbackup2/"]) {
    const backup = await app.inject({ method: "GET", url });
    assert.equal(backup.statusCode, 200);
    assert.match(backup.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(backup.headers["cache-control"], "no-store, max-age=0");
    assert.match(backup.body, /second backup tickets/);
    assert.doesNotMatch(backup.body, /current tickets/);
  }

  for (const url of ["/szzbackup3", "/szzbackup3/"]) {
    const backup = await app.inject({ method: "GET", url });
    assert.equal(backup.statusCode, 200);
    assert.match(backup.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(backup.headers["cache-control"], "no-store, max-age=0");
    assert.match(backup.body, /third backup tickets/);
    assert.doesNotMatch(backup.body, /current tickets/);
  }

  for (const url of ["/szzbackup4", "/szzbackup4/"]) {
    const backup = await app.inject({ method: "GET", url });
    assert.equal(backup.statusCode, 200);
    assert.match(backup.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(backup.headers["cache-control"], "no-store, max-age=0");
    assert.match(backup.body, /fourth backup tickets/);
    assert.doesNotMatch(backup.body, /current tickets/);
  }

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("szz offline route downloads the latest source HTML", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-offline-route-"));
  const htmlPath = resolve(dir, "ticket.html");
  const html = "<!doctype html><title>offline tickets</title>";
  writeFileSync(htmlPath, html);

  const app = Fastify();
  registerSzzRoutes(app, { htmlPath });

  const response = await app.inject({ method: "GET", url: "/szz/SZZ_DB_offline.html" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^text\/html/);
  assert.equal(
    response.headers["content-disposition"],
    'attachment; filename="SZZ_DB_offline.html"',
  );
  assert.equal(response.headers["cache-control"], "no-store, max-age=0");
  assert.equal(response.body, html);

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("szz PDF routes serve the latest configured source files inline", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-pdf-route-"));
  const answersPdfPath = resolve(dir, "answers.pdf");
  const topicsPdfPath = resolve(dir, "topics.pdf");
  const answersV1 = Buffer.from("%PDF-1.7\nanswers version one\n");
  const topics = Buffer.from("%PDF-1.7\nofficial topics\n");
  writeFileSync(answersPdfPath, answersV1);
  writeFileSync(topicsPdfPath, topics);

  const app = Fastify();
  registerSzzRoutes(app, { answersPdfPath, topicsPdfPath });

  const answers = await app.inject({ method: "GET", url: "/szz/SZZ_DB.pdf" });
  assert.equal(answers.statusCode, 200);
  assert.match(answers.headers["content-type"] ?? "", /^application\/pdf/);
  assert.equal(answers.headers["content-disposition"], 'inline; filename="SZZ_DB.pdf"');
  assert.equal(answers.headers["cache-control"], "no-store, max-age=0");
  assert.deepEqual(answers.rawPayload, answersV1);

  const topicsResponse = await app.inject({ method: "GET", url: "/szz/SZZ_DB_topics.pdf" });
  assert.equal(topicsResponse.statusCode, 200);
  assert.match(topicsResponse.headers["content-type"] ?? "", /^application\/pdf/);
  assert.equal(
    topicsResponse.headers["content-disposition"],
    'inline; filename="SZZ_DB_topics.pdf"',
  );
  assert.deepEqual(topicsResponse.rawPayload, topics);

  const answersV2 = Buffer.from("%PDF-1.7\nanswers version two\n");
  writeFileSync(answersPdfPath, answersV2);
  const updatedAnswers = await app.inject({ method: "GET", url: "/szz/SZZ_DB.pdf" });
  assert.deepEqual(updatedAnswers.rawPayload, answersV2);

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("szz routes do not expose a missing source path", async () => {
  const app = Fastify();
  registerSzzRoutes(app, { htmlPath: resolve(tmpdir(), "missing-szz-ticket.html") });

  const response = await app.inject({ method: "GET", url: "/szz" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "page not found" });

  const offlineResponse = await app.inject({ method: "GET", url: "/szz/SZZ_DB_offline.html" });
  assert.equal(offlineResponse.statusCode, 404);
  assert.deepEqual(offlineResponse.json(), { error: "page not found" });

  await app.close();
});

test("szz PDF routes return 404 for a missing source file", async () => {
  const app = Fastify();
  registerSzzRoutes(app, { answersPdfPath: resolve(tmpdir(), "missing-szz-answers.pdf") });

  const response = await app.inject({ method: "GET", url: "/szz/SZZ_DB.pdf" });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "file not found" });

  await app.close();
});

test("szz ticket PDF route serves only the 23 generated ticket files", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-ticket-pdf-route-"));
  const ticketPdfsPath = resolve(dir, "tickets");
  const ticketPdf = Buffer.from("%PDF-1.7\nticket 1.23\n");
  mkdirSync(ticketPdfsPath);
  writeFileSync(resolve(ticketPdfsPath, "SZZ_DB_ticket_1_23.pdf"), ticketPdf);

  const app = Fastify();
  registerSzzRoutes(app, { ticketPdfsPath });

  const response = await app.inject({
    method: "GET",
    url: "/szz/tickets/SZZ_DB_ticket_1_23.pdf",
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^application\/pdf/);
  assert.equal(
    response.headers["content-disposition"],
    'inline; filename="SZZ_DB_ticket_1_23.pdf"',
  );
  assert.equal(response.headers["cache-control"], "no-store, max-age=0");
  assert.deepEqual(response.rawPayload, ticketPdf);

  const outsideRange = await app.inject({
    method: "GET",
    url: "/szz/tickets/SZZ_DB_ticket_1_24.pdf",
  });
  assert.equal(outsideRange.statusCode, 404);
  assert.deepEqual(outsideRange.json(), { error: "file not found" });

  const unexpectedName = await app.inject({
    method: "GET",
    url: "/szz/tickets/SZZ_DB.pdf",
  });
  assert.equal(unexpectedName.statusCode, 404);
  assert.deepEqual(unexpectedName.json(), { error: "file not found" });

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
