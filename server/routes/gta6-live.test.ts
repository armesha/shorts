import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { Gta6LiveSessions } from "../services/gta6-live-session.ts";
import type { Gta6Report } from "../services/gta6-highlights-media.ts";
import { registerGta6LiveRoutes } from "./gta6-live.ts";

test("live card API starts one stream, stops it, and refuses other files", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-live-api-"));
  const sessions = new Gta6LiveSessions(root, (options) => new Promise<Gta6Report>((done) => {
    options.log?.("Пишу кусок 1, 10 мин.");
    options.signal?.addEventListener("abort", () => done({ published: false, sources: [] }), { once: true });
  }));
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const id = Number(req.headers["x-test-user"]);
    if (id === 7) (req as FastifyRequest & { userId?: number }).userId = id;
  });
  registerGta6LiveRoutes(app, root, sessions);
  try {
    assert.equal((await app.inject({ url: "/api/gta6-live" })).statusCode, 401);
    const bad = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers: { "x-test-user": "7" }, payload: { url: "https://example.com/live", minutes: 10 } });
    assert.equal(bad.statusCode, 400);
    const started = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers: { "x-test-user": "7" }, payload: { url: "https://www.twitch.tv/example", minutes: 10, telegram: false } });
    assert.equal(started.statusCode, 200, started.body);
    assert.equal(started.json().running, true);
    const again = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers: { "x-test-user": "7" }, payload: { url: "https://www.youtube.com/watch?v=abcdefghijk", minutes: 15 } });
    assert.equal(again.statusCode, 400);
    const stopped = await app.inject({ method: "POST", url: "/api/gta6-live/stop", headers: { "x-test-user": "7" } });
    assert.equal(stopped.statusCode, 200);
    await sessions.settled(7);
    const view = await app.inject({ url: "/api/gta6-live", headers: { "x-test-user": "7" } });
    assert.equal(view.json().running, false);
    assert.equal(view.json().line, "Остановлено");
    await mkdir(resolve(root, "u7", "clips"), { recursive: true });
    await writeFile(resolve(root, "u7", "clips", "live-1-first_look-0-8.mp4"), "clip");
    const own = await app.inject({ url: "/api/gta6-live/clips/live-1-first_look-0-8.mp4", headers: { "x-test-user": "7" } });
    assert.equal(own.statusCode, 200);
    assert.equal(own.body, "clip");
    const foreign = await app.inject({ url: "/api/gta6-live/clips/live-1-first_look-0-8.mp4" });
    assert.equal(foreign.statusCode, 401);
    const missing = await app.inject({ url: "/api/gta6-live/clips/missing.mp4", headers: { "x-test-user": "7" } });
    assert.equal(missing.statusCode, 404);
    const escape = await app.inject({ url: "/api/gta6-live/clips/..%2Fstate.json", headers: { "x-test-user": "7" } });
    assert.equal(escape.statusCode, 400);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
