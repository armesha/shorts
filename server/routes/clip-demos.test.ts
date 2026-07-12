import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";

import { openDb } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import { registerClipDemosRoutes } from "./clip-demos.ts";

test("only armen can permanently remove a voiced meme demo", async () => {
  const previousCwd = process.cwd();
  const root = mkdtempSync(join(tmpdir(), "clip-demos-test-"));
  process.chdir(root);
  try {
    const db = openDb(":memory:");
    const armen = db.createUser({ username: "armen", passHash: "x", role: "admin", isSuperAdmin: true });
    const otherAdmin = db.createUser({ username: "other", passHash: "x", role: "admin" });
    const itemId = "vmru_batch_0001";
    const write = (path: string, value: unknown) => {
      mkdirSync(join(root, path.substring(0, path.lastIndexOf("/"))), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(value));
    };
    write("output/admin-demos/manifest.json", { packs: [{ id: "voiced-memes-ru", title: "Озвучка мемов", items: [{ id: itemId, title: "test" }] }] });
    write("data/voiced-memes-ru/videos.json", [{ file: `voiced-memes-ru/${itemId}.mp4`, title: "test" }]);
    write("data/voiced-memes-ru/safety-review.json", { reject: {}, borderline: {} });
    for (const path of [
      `output/admin-demos/${itemId}.mp4`,
      `output/admin-demos/${itemId}.jpg`,
      `assets/fact-videos/voiced-memes-ru/${itemId}.mp4`,
      "output/speech/memoteka-267-batch/wav/0001.wav",
      "tmp/memoteka-267-videos/0001.mp4",
    ]) {
      mkdirSync(join(root, path.substring(0, path.lastIndexOf("/"))), { recursive: true });
      writeFileSync(join(root, path), "x");
    }

    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      const current = req.headers["x-test-user"] === "armen" ? armen : otherAdmin;
      (req as unknown as { userId: number }).userId = current.id;
    });
    registerClipDemosRoutes(app, db, {
      outputDir: "output",
      deckAccess: { deckAllowed: () => true },
    } as unknown as RouteDeps);

    const denied = await app.inject({ method: "DELETE", url: `/api/clip-demos/packs/voiced-memes-ru/items/${itemId}`, headers: { "x-test-user": "other" } });
    assert.equal(denied.statusCode, 403);
    assert.equal(existsSync(join(root, `output/admin-demos/${itemId}.mp4`)), true);

    const removed = await app.inject({ method: "DELETE", url: `/api/clip-demos/packs/voiced-memes-ru/items/${itemId}`, headers: { "x-test-user": "armen" } });
    assert.equal(removed.statusCode, 200);
    assert.equal(existsSync(join(root, `output/admin-demos/${itemId}.mp4`)), false);
    assert.equal(existsSync(join(root, "output/speech/memoteka-267-batch/wav/0001.wav")), false);
    const safety = JSON.parse(readFileSync(join(root, "data/voiced-memes-ru/safety-review.json"), "utf8"));
    assert.ok(safety.userRemoved["0001"]);
    const manifest = JSON.parse(readFileSync(join(root, "output/admin-demos/manifest.json"), "utf8"));
    assert.equal(manifest.packs[0].items.length, 0);
    await app.close();
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
