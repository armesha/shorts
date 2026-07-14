import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerGameRoutes } from "./game.ts";

test("game routes redirect to the slash URL and serve the Godot build with correct types", async () => {
  const gameDir = mkdtempSync(resolve(tmpdir(), "project-bloom-route-"));
  writeFileSync(gameDir + "/index.html", "<!doctype html><title>Project Bloom</title><script src=\"index.js\"></script>");
  writeFileSync(gameDir + "/index.js", "console.log('bloom')");
  writeFileSync(gameDir + "/index.wasm", Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  writeFileSync(gameDir + "/index.pck", Buffer.from([0x47, 0x44, 0x50, 0x43]));

  const app = Fastify();
  registerGameRoutes(app, { gameDir });

  const redirect = await app.inject({ method: "GET", url: "/game" });
  assert.equal(redirect.statusCode, 302);
  assert.equal(redirect.headers.location, "/game/");

  const page = await app.inject({ method: "GET", url: "/game/" });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers["content-type"] ?? "", /^text\/html/);
  assert.match(page.body, /Project Bloom/);

  const wasm = await app.inject({ method: "GET", url: "/game/index.wasm" });
  assert.equal(wasm.statusCode, 200);
  assert.equal(wasm.headers["content-type"], "application/wasm");
  assert.equal(wasm.headers["x-content-type-options"], "nosniff");
  assert.ok(wasm.headers.etag);

  const cached = await app.inject({
    method: "GET",
    url: "/game/index.wasm",
    headers: { "if-none-match": wasm.headers.etag },
  });
  assert.equal(cached.statusCode, 304);
  assert.equal(cached.rawPayload.length, 0);

  const pck = await app.inject({ method: "GET", url: "/game/index.pck" });
  assert.equal(pck.statusCode, 200);
  assert.equal(pck.headers["content-type"], "application/octet-stream");

  const blocked = await app.inject({ method: "GET", url: "/game/project.godot" });
  assert.equal(blocked.statusCode, 404);

  await app.close();
  rmSync(gameDir, { recursive: true, force: true });
});

