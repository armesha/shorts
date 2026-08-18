import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { registerSzzRoutes } from "./szz.ts";

function allTicketCountUpdates(updatedAt: number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: 23 }, (_, index) => [`ticket-1-${index + 1}`, updatedAt]),
  );
}

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

test("szz report routes serve the current audit HTML", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-report-route-"));
  const reportHtmlPath = resolve(dir, "report.html");
  const html = "<!doctype html><title>SZZ audit report</title>";
  writeFileSync(reportHtmlPath, html);

  const app = Fastify();
  registerSzzRoutes(app, { reportHtmlPath });

  for (const url of ["/szzreport", "/szzreport/"]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] ?? "", /^text\/html/);
    assert.equal(response.headers["cache-control"], "no-store, max-age=0");
    assert.equal(response.body, html);
  }

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

test("szz backup routes serve all configured backups without changing the current page", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "szz-backup-route-"));
  const htmlPath = resolve(dir, "ticket.html");
  const backupHtmlPath = resolve(dir, "ticket-backup.html");
  const backup2HtmlPath = resolve(dir, "ticket-backup2.html");
  const backup3HtmlPath = resolve(dir, "ticket-backup3.html");
  writeFileSync(htmlPath, "<!doctype html><title>current tickets</title>");
  writeFileSync(backupHtmlPath, "<!doctype html><title>backup tickets</title>");
  writeFileSync(backup2HtmlPath, "<!doctype html><title>second backup tickets</title>");
  writeFileSync(backup3HtmlPath, "<!doctype html><title>third backup tickets</title>");

  const app = Fastify();
  registerSzzRoutes(app, { htmlPath, backupHtmlPath, backup2HtmlPath, backup3HtmlPath });

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

test("szz study state is stored per authenticated user and rejects stale writes", async () => {
  const firstUpdatedAt = 2_000_000_000_000;
  const staleUpdatedAt = firstUpdatedAt - 100;
  const secondUpdatedAt = firstUpdatedAt + 100;
  const accidentalUpdatedAt = firstUpdatedAt + 200;
  const intentionalUpdatedAt = firstUpdatedAt + 300;
  const db = openDb(":memory:");
  const firstUser = db.createUser({ username: "szz-first", passHash: "x" });
  const secondUser = db.createUser({ username: "szz-second", passHash: "x" });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const header = req.headers["x-test-user-id"];
    if (header) (req as typeof req & { userId?: number }).userId = Number(header);
  });
  registerSzzRoutes(app, { db });

  const anonymous = await app.inject({ method: "GET", url: "/api/szz/state" });
  assert.equal(anonymous.statusCode, 401);

  const initial = await app.inject({
    method: "GET",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
  });
  assert.deepEqual(initial.json(), {
    userId: firstUser.id,
    state: null,
    updatedAt: null,
  });

  const firstState = {
    version: 1,
    tickets: { "ticket-1-6": { status: "mastered" } },
    reviews: { "2026-07-30": { "ticket-1-6": 2 } },
    activityDates: { "2026-07-30": true },
    ticketCounts: { "ticket-1-6": 3, "ticket-1-9": 1 },
    ticketOrder: ["ticket-1-6", "ticket-1-9"],
    topicGenerator: {
      version: 1,
      order: ["ticket-1-1::model", "ticket-1-1::server"],
      completed: 1,
      rounds: 2,
    },
    updatedAt: firstUpdatedAt,
  };
  const saved = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: { state: firstState },
  });
  const firstStoredState = {
    ...firstState,
    ticketCountUpdates: allTicketCountUpdates(firstUpdatedAt),
  };
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().saved, true);
  assert.deepEqual(saved.json().state, firstStoredState);

  const stale = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: { ...firstState, ticketOrder: ["ticket-1-9"], updatedAt: staleUpdatedAt },
    },
  });
  assert.equal(stale.statusCode, 200);
  assert.equal(stale.json().saved, false);
  assert.deepEqual(stale.json().state, firstStoredState);

  const secondState = {
    version: 1,
    tickets: {},
    reviews: {},
    activityDates: {},
    ticketOrder: ["ticket-1-23"],
    updatedAt: secondUpdatedAt,
  };
  await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(secondUser.id) },
    payload: { state: secondState },
  });
  const secondStoredState = {
    ...secondState,
    ticketCounts: {},
    ticketCountUpdates: allTicketCountUpdates(secondUpdatedAt),
  };

  const firstRead = await app.inject({
    method: "GET",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
  });
  const secondRead = await app.inject({
    method: "GET",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(secondUser.id) },
  });
  assert.deepEqual(firstRead.json().state, firstStoredState);
  assert.deepEqual(secondRead.json().state, secondStoredState);

  const accidentalEmptyCounters = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: {
        ...firstState,
        ticketCounts: {},
        updatedAt: accidentalUpdatedAt,
      },
    },
  });
  assert.equal(accidentalEmptyCounters.statusCode, 200);
  assert.deepEqual(accidentalEmptyCounters.json().state.ticketCounts, firstState.ticketCounts);
  assert.deepEqual(
    accidentalEmptyCounters.json().state.ticketCountUpdates,
    allTicketCountUpdates(firstUpdatedAt),
  );

  const intentionalZero = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: {
        ...firstState,
        ticketCounts: { "ticket-1-9": 1 },
        ticketCountUpdates: { "ticket-1-6": intentionalUpdatedAt },
        updatedAt: intentionalUpdatedAt,
      },
    },
  });
  assert.equal(intentionalZero.statusCode, 200);
  assert.deepEqual(intentionalZero.json().state.ticketCounts, { "ticket-1-9": 1 });
  assert.equal(
    intentionalZero.json().state.ticketCountUpdates["ticket-1-6"],
    intentionalUpdatedAt,
  );
  assert.equal(
    intentionalZero.json().state.ticketCountUpdates["ticket-1-9"],
    intentionalUpdatedAt,
  );

  const invalid = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: { state: { ticketOrder: [], updatedAt: intentionalUpdatedAt } },
  });
  assert.equal(invalid.statusCode, 400);

  const invalidGenerator = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: {
        ...firstState,
        topicGenerator: {
          version: 1,
          order: ["ticket-1-1::model", "ticket-1-1::model"],
          completed: 0,
          rounds: 0,
        },
        updatedAt: intentionalUpdatedAt,
      },
    },
  });
  assert.equal(invalidGenerator.statusCode, 400);

  const invalidTicketCounts = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: {
        ...firstState,
        ticketCounts: { "ticket-1-6": -1 },
        updatedAt: intentionalUpdatedAt + 1,
      },
    },
  });
  assert.equal(invalidTicketCounts.statusCode, 400);

  const invalidTicketCountUpdate = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: {
      state: {
        ...firstState,
        ticketCountUpdates: { "ticket-1-6": intentionalUpdatedAt + 2 },
        updatedAt: intentionalUpdatedAt + 1,
      },
    },
  });
  assert.equal(invalidTicketCountUpdate.statusCode, 400);

  await app.close();
  db.db.close();
});
