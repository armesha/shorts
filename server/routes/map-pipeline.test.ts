import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MapPipelineService } from "../services/map-pipeline/service.ts";
import { registerMapPipelineRoutes } from "./map-pipeline.ts";

test("library endpoints enforce owner, auth, origin and valid byte ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "map-api-"));
  const service = new MapPipelineService({ root: join(root, "state"), source: root,
    generate: async (_job, dir) => { await writeFile(join(dir, "video.mp4"), "0123456789"); return { seconds: 90, idea: { themeId: "life", title: "Тест", hook: "Тест", reason: "Тест" } }; } });
  const app = Fastify();
  app.addHook("onRequest", async req => { (req as any).userId = Number(req.headers["x-owner"]) || undefined; });
  registerMapPipelineRoutes(app, service, ownerId => ownerId === 1);
  try {
    await app.ready(); await service.samples(1);
    await service.tick(); await service.idle();
    const id = (await service.list(1)).jobs.find(j => j.status === "ready")!.id;
    const url = `/api/map-pipeline/jobs/${id}/video`;
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ url, headers: { "x-owner": "2" } })).statusCode, 404);
    const part = await app.inject({ url, headers: { "x-owner": "1", range: "bytes=2-5" } });
    assert.equal(part.statusCode, 206); assert.equal(part.body, "2345");
    assert.equal(part.headers["content-range"], "bytes 2-5/10");
    assert.equal((await app.inject({ url, headers: { "x-owner": "1", range: "bytes=999-" } })).statusCode, 416);
    assert.equal((await app.inject({ url: "/api/map-pipeline/start", method: "POST", headers: { "x-owner": "1", origin: "https://other.example" } })).statusCode, 403);
    assert.equal((await app.inject({ url: "/api/map-pipeline", headers: { "x-owner": "2" } })).json().jobs.length, 0);
    assert.equal((await app.inject({ url: "/api/map-pipeline/samples", method: "POST", headers: { "x-owner": "2" } })).statusCode, 403);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test("numeric rebuild requires authorization and changes only the selected video", async () => {
  const root = await mkdtemp(join(tmpdir(), "map-rebuild-api-"));
  const service = new MapPipelineService({ root: join(root, "state"), source: root,
    generate: async (_job, dir) => { await writeFile(join(dir, "video.mp4"), "test-video"); return { seconds: 90, idea: { themeId: "life", title: "Тест", hook: "Тест", reason: "Тест" } }; } });
  const app = Fastify();
  app.addHook("onRequest", async req => { (req as any).userId = Number(req.headers["x-owner"]) || undefined; });
  const publisher = { start: async () => {}, close: async () => {}, info: () => [] } as any;
  registerMapPipelineRoutes(app, service, ownerId => ownerId === 1, publisher);
  try {
    await app.ready(); await service.samples(1);
    for (let i = 0; i < 2; i++) { await service.tick(); await service.idle(); }
    const id = (await service.list(1)).jobs[0].id;
    const url = "/api/map-pipeline/rebuild-numeric";
    assert.equal((await app.inject({ method: "POST", url, payload: { ids: [id] } })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-owner": "2" }, payload: { ids: [id] } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-owner": "1", origin: "https://other.example" }, payload: { ids: [id] } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url, headers: { "x-owner": "1" }, payload: { ids: [id] } })).statusCode, 200);
    const jobs = (await service.list(1)).jobs;
    assert.equal(jobs.find(j => j.id === id)?.answerMode, "numeric");
    assert.equal(jobs.filter(j => j.status === "queued").length, 1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
