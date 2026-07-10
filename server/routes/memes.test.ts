import assert from "node:assert/strict";
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

  const data = await app.inject({ method: "GET", url: "/memes/memes.js" });
  assert.equal(data.statusCode, 200);
  assert.match(data.body.slice(0, 80), /^window\.MEMES=/);
  const memes = JSON.parse(data.body.replace(/^window\.MEMES=/, "").replace(/;\s*$/, "")) as Array<{ cat: string; layout: string | null }>;
  assert.equal(memes.length, 2508);
  assert.equal(memes.filter((meme) => meme.cat === "Английские мемы").length, 380);
  assert.equal(memes.filter((meme) => meme.layout === "top-text-ru").length, 21);
  assert.equal(memes.filter((meme) => meme.layout === "top-text-en").length, 12);

  const image = await app.inject({ method: "GET", url: "/memes/images/0000.jpg" });
  assert.equal(image.statusCode, 200);
  assert.equal(image.headers["content-type"], "image/jpeg");
  assert.ok(image.rawPayload.length > 500);

  const invalid = await app.inject({ method: "GET", url: "/memes/images/not-a-meme.jpg" });
  assert.equal(invalid.statusCode, 404);

  await app.close();
});
