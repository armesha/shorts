import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CirclePipelineService } from "../services/circle-pipeline/service.ts";
import { registerCirclePipelineRoutes } from "./circle-pipeline.ts";

test("library enforces owner access, permissions, origin and byte ranges", async () => {
  const root = await mkdtemp(join(tmpdir(), "circle-api-"));
  const service = new CirclePipelineService({ root, runner: { runOnce: async () => false } });
  const app = Fastify();
  app.addHook("onRequest", async req => { (req as any).userId = Number(req.headers["x-owner"]) || undefined; });
  registerCirclePipelineRoutes(app, service, owner => owner === 1);
  try {
    await app.ready();
    const job = (await service.library.claim(1))!;
    await service.library.update(1, job.id, "running");
    const dir = service.library.directory(job);
    await mkdir(dir, { recursive: true }); await writeFile(join(dir, "video.mp4"), "0123456789");
    await service.library.update(1, job.id, "ready", { messageId: 7 });
    const url = `/api/circle-pipeline/jobs/${job.id}/video`;
    assert.equal((await app.inject({ url })).statusCode, 401);
    assert.equal((await app.inject({ url, headers: { "x-owner": "2" } })).statusCode, 404);
    const result = await app.inject({ url, headers: { "x-owner": "1", range: "bytes=2-5" } });
    assert.equal(result.statusCode, 206); assert.equal(result.body, "2345");
    assert.equal((await app.inject({ url, headers: { "x-owner": "1", range: "bytes=999-" } })).statusCode, 416);
    assert.equal((await app.inject({ url: "/api/circle-pipeline/start", method: "POST", headers: { "x-owner": "2" } })).statusCode, 403);
    assert.equal((await app.inject({ url: "/api/circle-pipeline/start", method: "POST", headers: { "x-owner": "1", origin: "https://other.example" } })).statusCode, 403);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
