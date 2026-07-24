import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "../db.ts";
import { registerCircleEditorRoutes } from "./circle-editor.ts";

test("regular authenticated users can use the circle editor and upload 1080p gameplay", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-circle-routes-"));
  const previous = process.env.TG_CIRCLES_DIR;
  process.env.TG_CIRCLES_DIR = root;
  const app = Fastify();
  const db = {
    getUserById: (id: number) => id === 7 ? { id, username: "user", role: "user" } : null,
  } as unknown as Db;
  app.addHook("onRequest", async (req) => {
    if (req.headers.authorization === "Bearer regular-user") {
      (req as FastifyRequest & { userId?: number }).userId = 7;
    }
  });
  registerCircleEditorRoutes(app, db);

  try {
    await app.ready();

    const anonymous = await app.inject({ method: "GET", url: "/api/circle-editor/overlays" });
    assert.equal(anonymous.statusCode, 401);

    const headers = { authorization: "Bearer regular-user" };
    const opened = await app.inject({ method: "GET", url: "/api/circle-editor/overlays", headers });
    assert.equal(opened.statusCode, 200);
    assert.deepEqual(opened.json(), {
      advertisers: [],
      activeAdvertiserId: "",
      bannerEnabled: false,
    });

    const changed = await app.inject({
      method: "PUT",
      url: "/api/circle-editor/overlays/active",
      headers,
      payload: { id: "", enabled: false },
    });
    assert.equal(changed.statusCode, 200);

    const anonymousUpload = await app.inject({
      method: "POST",
      url: "/api/circle-editor/gameplay/upload?filename=gameplay.mp4",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("not-a-video"),
    });
    assert.equal(anonymousUpload.statusCode, 401);

    const invalidExtension = await app.inject({
      method: "POST",
      url: "/api/circle-editor/gameplay/upload?filename=gameplay.txt",
      headers: { ...headers, "content-type": "application/octet-stream" },
      payload: Buffer.from("not-a-video"),
    });
    assert.equal(invalidExtension.statusCode, 400);
    assert.match(invalidExtension.json().error, /MP4/);

    assert.ok(ffmpegPath, "ffmpeg-static должен предоставить исполняемый файл");
    const fixture = resolve(root, "gameplay-1080p.mp4");
    const generated = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=blue:s=1080x1920:r=1:d=1",
      "-frames:v", "1", "-c:v", "libx264", "-preset", "ultrafast",
      "-pix_fmt", "yuv420p", fixture,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/circle-editor/gameplay/upload?filename=%D0%BC%D0%BE%D0%B9-gameplay-1080p.mp4",
      headers: { ...headers, "content-type": "application/octet-stream" },
      payload: readFileSync(fixture),
    });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const uploadResult = uploaded.json() as { gameplay: string; gameplays: string[] };
    assert.match(uploadResult.gameplay, /^мой-gameplay-1080p-\d+-[a-f0-9]{8}\.mp4$/u);
    assert.deepEqual(uploadResult.gameplays, [uploadResult.gameplay]);
    assert.equal(existsSync(resolve(root, "gameplay", uploadResult.gameplay)), true);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
