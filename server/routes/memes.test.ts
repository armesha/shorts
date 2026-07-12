import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify from "fastify";
import { registerMemesRoutes } from "./memes.ts";

test("public memes page and assets are served without auth", async () => {
  const app = Fastify();
  registerMemesRoutes(app);

  const page = await app.inject({ method: "GET", url: "/memes" });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers["content-type"] ?? "", /^text\/html/);
  assert.match(page.body, /Мемотека/);
  assert.match(page.body, /<base href="\/memes\/">/);
  assert.match(page.body, /id="lb-delete"/);

  const data = await app.inject({ method: "GET", url: "/memes/memes.js" });
  assert.equal(data.statusCode, 200);
  assert.match(data.body.slice(0, 80), /^window\.MEMES=/);
  const memes = JSON.parse(data.body.replace(/^window\.MEMES=/, "").replace(/;\s*$/, "")) as Array<{
    id: string;
    cat: string;
    lang?: string;
    layout: string | null;
  }>;
  assert.ok(memes.length >= 2000);
  assert.equal(new Set(memes.map((meme) => meme.id)).size, memes.length);
  assert.ok(memes.some((meme) => meme.lang === "ar"));
  assert.ok(memes.some((meme) => meme.lang === "ja"));

  const image = await app.inject({ method: "GET", url: "/memes/images/0000.jpg" });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  assert.ok(image.rawPayload.length > 500);

  const webp = await app.inject({ method: "GET", url: "/memes/images/2509.webp" });
  assert.equal(webp.statusCode, 200);
  assert.equal(webp.headers["content-type"], "image/webp");

  const png = await app.inject({ method: "GET", url: "/memes/images/2522.png" });
  assert.equal(png.statusCode, 200);
  assert.equal(png.headers["content-type"], "image/png");

  const avif = await app.inject({ method: "GET", url: "/memes/images/2596.avif" });
  assert.equal(avif.statusCode, 200);
  assert.equal(avif.headers["content-type"], "image/avif");

  const invalid = await app.inject({ method: "GET", url: "/memes/images/not-a-meme.jpg" });
  assert.equal(invalid.statusCode, 404);

  await app.close();
});

test("super admin can delete a meme and its unshared image", async () => {
  const dir = mkdtempSync(resolve(tmpdir(), "memoteka-delete-"));
  mkdirSync(resolve(dir, "images"));
  writeFileSync(resolve(dir, "index.html"), "Мемотека");
  writeFileSync(resolve(dir, "sources.json"), "{}");
  writeFileSync(resolve(dir, "images/0001.jpg"), "image");
  writeFileSync(resolve(dir, "memes.js"), 'window.MEMES=[{"id":"delete-me","url":"images/0001.jpg","thumb":"images/0001.jpg"}];\n');
  const app = Fastify();
  registerMemesRoutes(
    app,
    { auth: { requireSuperAdmin: () => true } as never },
    { memesDir: dir, sourceDir: null },
  );

  const download = await app.inject({ method: "POST", url: "/api/memes/download", payload: { ids: ["delete-me"] } });
  assert.equal(download.statusCode, 200);
  assert.equal(download.headers["content-type"], "application/zip");
  assert.equal(download.rawPayload.subarray(0, 2).toString(), "PK");

  const response = await app.inject({ method: "DELETE", url: "/api/memes/delete-me" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, id: "delete-me", count: 0 });
  assert.equal(readFileSync(resolve(dir, "memes.js"), "utf8"), "window.MEMES=[];\n");
  const image = await app.inject({ method: "GET", url: "/memes/images/0001.jpg" });
  assert.equal(image.statusCode, 404);

  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
