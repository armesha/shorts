import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { openDb } from "../db.ts";
import { registerVideoCuttingRoutes } from "./video-cutting.ts";
import { VideoCuttingService } from "../services/video-cutting.ts";
import { DailyCuttingService } from "../services/daily-cutting.ts";

test("ready parts can be added and deleted only by their owner through the cutting API", async () => {
  const base = resolve("tmp/cutting-channel-api-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "run-"));
  const db = openDb(":memory:");
  const owner = db.createUser({ username: "owner", passHash: "test" }),
    other = db.createUser({ username: "other", passHash: "test" });
  const account = db.createAccount({
    userId: owner.id,
    channelName: "Channel",
    status: "connected",
  });
  db.createAccount({
    userId: other.id,
    channelName: "Other",
    status: "connected",
  });
  const id = randomUUID(),
    jobs = resolve(root, "jobs");
  await mkdir(resolve(jobs, `u${owner.id}`, id), { recursive: true });
  const source = resolve(root, `creator/cutting-u${owner.id}/${id}`);
  await mkdir(source, { recursive: true });
  await writeFile(resolve(source, "part-1.mp4"), "rendered fixture");
  await writeFile(
    resolve(jobs, `u${owner.id}`, id, "job.json"),
    JSON.stringify({
      id,
      userId: owner.id,
      input: {},
      status: "completed",
      stage: "Готово",
      progress: 100,
      createdAt: new Date().toISOString(),
      clips: [
        {
          number: 1,
          title: "Part",
          reason: "Context",
          duration: 80,
          start: 0,
          end: 80,
          videoUrl: `/files/creator/cutting-u${owner.id}/${id}/part-1.mp4`,
        },
      ],
    }),
  );
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const userId = Number(req.headers["x-user"]);
    if ([owner.id, other.id].includes(userId))
      (req as FastifyRequest & { userId: number }).userId = userId;
  });
  const service = new VideoCuttingService({ root: jobs, outputDir: root, db });
  registerVideoCuttingRoutes(app, db, root, service, new DailyCuttingService(service, { file: resolve(root, "daily.json") }));
  try {
    const headers = { "x-user": String(owner.id) },
      foreign = { "x-user": String(other.id) };
    const beforeUrl = (await app.inject({ url: `/api/video-cutting/jobs/${id}`, headers })).json().clips[0].videoUrl;
    await writeFile(resolve(source, "part-1.mp4"), "a different rendered fixture");
    const afterUrl = (await app.inject({ url: `/api/video-cutting/jobs/${id}`, headers })).json().clips[0].videoUrl;
    assert.notEqual(beforeUrl, afterUrl);
    const workspace = await app.inject({ url: "/api/video-cutting", headers });
    assert.deepEqual(
      workspace.json().channels.map((channel: any) => channel.id),
      [account.id],
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/api/video-cutting/jobs/${id}/channel`,
          headers: foreign,
          payload: { accountId: account.id },
        })
      ).statusCode,
      404,
    );
    const added = await app.inject({
      method: "POST",
      url: `/api/video-cutting/jobs/${id}/channel`,
      headers,
      payload: { accountId: account.id, parts: [1] },
    });
    assert.equal(added.statusCode, 200, added.body);
    assert.equal(added.json().added.length, 1);
    const again = await app.inject({
      method: "POST",
      url: `/api/video-cutting/jobs/${id}/channel`,
      headers,
      payload: { accountId: account.id },
    });
    assert.equal(again.json().existing.length, 1);
    assert.equal(db.listVideos(account.id).length, 1);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/video-cutting/jobs/${id}/clips/1`,
          headers: foreign,
        })
      ).statusCode,
      404,
    );
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/video-cutting/jobs/${id}/clips/1`,
      headers,
    });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().clips.length, 0);
    assert.equal(db.listVideos(account.id).length, 1);
    await writeFile(resolve(source, "part-2.mp4"), "rendered fixture");
    db.createCreatorGalleryItem({ userId: owner.id, packId: "video-cutting", packName: "Нарезка", templateType: "montage", cardIndex: 1, title: "Part 2", text: "", format: "mp4", videoRel: `creator/cutting-u${owner.id}/${id}/part-2.mp4`, durationSec: 80 });
    assert.equal((await app.inject({ method: "DELETE", url: `/api/video-cutting/jobs/${id}`, headers: foreign })).statusCode, 404);
    const removed = await app.inject({ method: "DELETE", url: `/api/video-cutting/jobs/${id}`, headers });
    assert.equal(removed.statusCode, 200, removed.body);
    assert.equal(existsSync(source), false);
    assert.equal(existsSync(resolve(jobs, `u${owner.id}`, id)), false);
    assert.equal(db.listCreatorGalleryItems(owner.id).length, 0);
    assert.equal(db.listVideos(account.id).length, 1);
  } finally {
    await app.close();
    db.db.close();
    await rm(root, { recursive: true, force: true });
  }
});
