import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CirclePipelineService } from "../services/circle-pipeline/service.ts";
import { registerCirclePipelineRoutes } from "./circle-pipeline.ts";
import { openDb } from "../db.ts";
import { CircleYouTubePublisher } from "../services/circle-pipeline/youtube-publisher.ts";

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

test("YouTube cookies are owner scoped and never returned in API responses", async () => {
  const root = await mkdtemp(join(tmpdir(), "circle-youtube-api-")), db = openDb(":memory:");
  const owner = db.createUser({ username: "owner", passHash: "x", role: "admin" });
  const stranger = db.createUser({ username: "stranger", passHash: "x" });
  const account = db.createAccount({ userId: owner.id, platform: "youtube" });
  const pipeline = new CirclePipelineService({ root, runner: { runOnce: async () => false } });
  const browser = { verify: async () => ({ channelId: `UC${"a".repeat(22)}` }), publish: async () => "" };
  const youtube = new CircleYouTubePublisher(db, pipeline, browser, join(root, "private"));
  const app = Fastify();
  app.addHook("onRequest", async req => { (req as any).userId = Number(req.headers["x-owner"]) || undefined; });
  registerCirclePipelineRoutes(app, pipeline, id => id === owner.id, youtube);
  try {
    const base = `/api/circle-pipeline/youtube/${account.id}`;
    const payload = { cookies: [{ name: "LOGIN_INFO", value: "synthetic-secret", domain: ".youtube.com", secure: true }] };
    assert.equal((await app.inject({ method: "POST", url: `${base}/cookies`, payload, headers: { "x-owner": String(stranger.id) } })).statusCode, 403);
    assert.equal((await app.inject({ method: "POST", url: `${base}/cookies`, payload, headers: { "x-owner": String(owner.id), origin: "https://other.example" } })).statusCode, 403);
    const saved = await app.inject({ method: "POST", url: `${base}/cookies`, payload, headers: { "x-owner": String(owner.id) } });
    assert.equal(saved.statusCode, 200); assert.ok(!saved.body.includes("synthetic-secret"));
    assert.equal((await app.inject({ url: base, headers: { "x-owner": String(stranger.id) } })).statusCode, 404);
    db.shareAccountReadOnly(owner.id, account.id, stranger.id);
    assert.equal((await app.inject({ url: base, headers: { "x-owner": String(stranger.id) } })).statusCode, 200);
    const verified = await app.inject({ method: "POST", url: `${base}/verify`, headers: { "x-owner": String(owner.id) } });
    assert.equal(verified.json().status, "connected"); assert.ok(!verified.body.includes("synthetic-secret"));
    const enabled = await app.inject({ method: "POST", url: `${base}/enable`, headers: { "x-owner": String(owner.id) } });
    assert.equal(enabled.json().enabled, true);
    const disabled = await app.inject({ method: "POST", url: `${base}/disable`, headers: { "x-owner": String(owner.id) } });
    assert.equal(disabled.json().enabled, false);
    const disconnected = await app.inject({ method: "POST", url: `${base}/disconnect`, headers: { "x-owner": String(owner.id) } });
    assert.equal(disconnected.json().status, "disconnected");
  } finally { await app.close(); await youtube.close(); db.db.close(); await rm(root, { recursive: true, force: true }); }
});
