import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { openDb } from "../db.ts";
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

test("szz study state is stored per authenticated user and rejects stale writes", async () => {
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
    ticketOrder: ["ticket-1-6", "ticket-1-9"],
    updatedAt: 200,
  };
  const saved = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: { state: firstState },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().saved, true);
  assert.deepEqual(saved.json().state, firstState);

  const stale = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: { state: { ...firstState, ticketOrder: ["ticket-1-9"], updatedAt: 100 } },
  });
  assert.equal(stale.statusCode, 200);
  assert.equal(stale.json().saved, false);
  assert.deepEqual(stale.json().state, firstState);

  const secondState = {
    version: 1,
    tickets: {},
    reviews: {},
    activityDates: {},
    ticketOrder: ["ticket-1-23"],
    updatedAt: 300,
  };
  await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(secondUser.id) },
    payload: { state: secondState },
  });

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
  assert.deepEqual(firstRead.json().state, firstState);
  assert.deepEqual(secondRead.json().state, secondState);

  const invalid = await app.inject({
    method: "PUT",
    url: "/api/szz/state",
    headers: { "x-test-user-id": String(firstUser.id) },
    payload: { state: { ticketOrder: [], updatedAt: 400 } },
  });
  assert.equal(invalid.statusCode, 400);

  await app.close();
  db.db.close();
});
