import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { registerMapStudioRoutes } from "./map-studio.ts";
test("map preview requires a session and cannot publish finished video outputs", async () => {
  const db = openDb(":memory:"),
    app = Fastify();
  const user = db.createUser({ username: "map-user", passHash: "test" });
  db.createSession(
    "synthetic-session",
    user.id,
    new Date(Date.now() + 60000).toISOString(),
  );
  registerMapStudioRoutes(app, db);
  try {
    assert.equal((await app.inject({ url: "/map-studio/" })).statusCode, 401);
    assert.equal(
      (await app.inject({ url: "/api/map-studio/themes" })).statusCode,
      401,
    );
    for (const path of [
      "exports/movie.mp4",
      "local-videos/movie.mov",
      "data/video-library.json",
      "../../.env",
    ]) {
      const response = await app.inject({
        url: `/map-studio/${path}`,
        headers: { cookie: "sid=synthetic-session" },
      });
      assert.equal(response.statusCode, 404, path);
    }
  } finally {
    await app.close();
    db.db.close();
  }
});
