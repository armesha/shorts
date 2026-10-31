import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import type { Db } from "../db.ts";
import { VideoCuttingService } from "../services/video-cutting.ts";
import { DailyCuttingService } from "../services/daily-cutting.ts";
import { registerVideoCuttingRoutes } from "./video-cutting.ts";

test("cutting API requires authentication and isolates jobs including cancellation", async () => {
  const base = resolve(process.cwd(), "tmp/video-cutting-routes");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "run-"));
  const service = new VideoCuttingService({
    root,
    outputDir: root,
    execute: async (_job, signal) => {
      await new Promise<void>((_done, reject) =>
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
    },
  });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const id = Number(req.headers["x-test-user"]);
    if ([7, 8].includes(id))
      (req as FastifyRequest & { userId?: number }).userId = id;
  });
  registerVideoCuttingRoutes(app, {listAccountsByUser:()=>[], getUserById: () => ({ role: "user" })} as unknown as Db, root, service, new DailyCuttingService(service, { file: resolve(root, "daily.json") }));
  try {
    assert.equal((await app.inject({ url: "/api/video-cutting/daily" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/video-cutting/daily/start", headers: { "x-test-user": "7" } })).statusCode, 403);
    assert.equal(
      (await app.inject({ url: "/api/video-cutting" })).statusCode,
      401,
    );
    const invalid = await app.inject({
      method: "POST",
      url: "/api/video-cutting/jobs",
      headers: { "x-test-user": "7" },
      payload: { url: "http://127.0.0.1/private", mode: "auto" },
    });
    assert.equal(invalid.statusCode, 400);
    const created = await app.inject({
      method: "POST",
      url: "/api/video-cutting/jobs",
      headers: { "x-test-user": "7" },
      payload: {
        url: "https://youtu.be/iJH6dAG9NVk",
        mode: "manual",
        count: 5,
      },
    });
    assert.equal(created.statusCode, 202, created.body);
    const id = created.json().id;
    assert.equal(
      (
        await app.inject({
          url: `/api/video-cutting/jobs/${id}`,
          headers: { "x-test-user": "8" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/video-cutting/jobs/${id}/cancel`,
          headers: { "x-test-user": "8" },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          url: "/api/video-cutting",
          headers: { "x-test-user": "8" },
        })
      ).json().jobs.length,
      0,
    );
    const cancelled = await app.inject({
      method: "POST",
      url: `/api/video-cutting/jobs/${id}/cancel`,
      headers: { "x-test-user": "7" },
    });
    assert.equal(cancelled.json().status, "cancelled");
  } finally {
    await app.close();
    await rm(root, { force: true, recursive: true });
  }
});
