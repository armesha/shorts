import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import type { Db } from "../db.ts";
import { registerCircleEditorRoutes } from "./circle-editor.ts";

test("regular authenticated users can open and control the banner library", async () => {
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
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
