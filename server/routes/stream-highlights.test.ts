import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { registerStreamHighlightRoutes } from "./stream-highlights.ts";
import { StreamHighlightJobs } from "../services/stream-highlights-jobs.ts";

test("stream highlight routes stay private and cancellable", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "stream-api-"));
  let release: (() => void) | undefined;
  const gate = new Promise<void>((done) => { release = done; });
  const jobs = new StreamHighlightJobs(root, {
    loadSource: (_url, _dir, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("Задача отменена.")), { once: true });
    }),
    plan: async () => [],
  });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const id = Number(req.headers["x-test-user"]);
    if (id) (req as FastifyRequest & { userId?: number }).userId = id;
  });
  registerStreamHighlightRoutes(app, root, jobs);
  const headers = { "x-test-user": "7" };
  try {
    assert.equal((await app.inject({ url: "/api/stream-highlights" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/stream-highlights", headers, payload: { url: "https://example.com/video" } })).statusCode, 400);
    const forbidden = await app.inject({ method: "POST", url: "/api/stream-highlights", headers: { ...headers, origin: "https://evil.example" }, payload: { url: "https://youtu.be/abcdefghijk" } });
    assert.equal(forbidden.statusCode, 403);
    const started = await app.inject({ method: "POST", url: "/api/stream-highlights", headers, payload: { url: "https://youtu.be/abcdefghijk" } });
    assert.equal(started.statusCode, 200, started.body);
    const id = started.json().jobs[0].id as string;
    let status = started.json().jobs[0].status as string;
    for (let i = 0; i < 40 && status === "queued"; i++) {
      await new Promise((done) => setTimeout(done, 15));
      status = (await app.inject({ url: "/api/stream-highlights", headers })).json().jobs[0].status;
    }
    const cancelled = await app.inject({ method: "POST", url: `/api/stream-highlights/${id}/cancel`, headers, payload: {} });
    assert.equal(cancelled.statusCode, 200, cancelled.body);
    assert.equal(cancelled.json().jobs[0].status, "cancelled");
    const foreign = await app.inject({ url: "/api/stream-highlights", headers: { "x-test-user": "8" } });
    assert.equal(foreign.json().jobs.length, 0);
  } finally {
    release?.();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
