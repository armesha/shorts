import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Fastify, { type FastifyRequest } from "fastify";
import { liveChannelKey } from "../services/gta6-highlights-media.ts";
import { Gta6LiveSessions } from "../services/gta6-live-session.ts";
import type { Gta6Report } from "../services/gta6-highlights-media.ts";
import { registerGta6LiveRoutes } from "./gta6-live.ts";

const channels = [
  "https://www.twitch.tv/alpha",
  "https://www.twitch.tv/beta",
  "https://www.youtube.com/watch?v=abcdefghijk",
  "https://www.youtube.com/live/zzzzzzzzzzz",
  "https://www.youtube.com/@Crew/live",
];

test("live card follows youtube and twitch and stops at five channels", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "gta6-live-api-"));
  const sessions = new Gta6LiveSessions(root, (options) => new Promise<Gta6Report>((done) => {
    options.log?.("Пишу кусок 1, 10 мин.");
    options.signal?.addEventListener("abort", () => done({ published: false, sources: [] }), { once: true });
  }));
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const id = Number(req.headers["x-test-user"]);
    if (id === 7 || id === 8) (req as FastifyRequest & { userId?: number }).userId = id;
  });
  registerGta6LiveRoutes(app, root, sessions);
  const headers = { "x-test-user": "7" };
  try {
    assert.equal((await app.inject({ url: "/api/gta6-live" })).statusCode, 401);
    assert.equal((await app.inject({ method: "POST", url: "/api/gta6-live/start", headers, payload: { url: "https://www.twitch.tv/directory", minutes: 10 } })).statusCode, 400);
    assert.equal((await app.inject({ method: "POST", url: "/api/gta6-live/start", headers, payload: { url: "https://example.com/live", minutes: 10 } })).statusCode, 400);
    for (const url of channels) {
      const started = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers, payload: { url, minutes: 10, telegram: false } });
      assert.equal(started.statusCode, 200, started.body);
    }
    const full = await app.inject({ url: "/api/gta6-live", headers });
    assert.equal(full.json().used, 5);
    assert.equal(full.json().limit, 5);
    assert.equal(full.json().channels.length, 5);
    const sixth = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers, payload: { url: "https://www.twitch.tv/sixth", minutes: 12 } });
    assert.equal(sixth.statusCode, 400);
    assert.match(sixth.json().error, /5 каналами/);
    const duplicate = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers: { "x-test-user": "8" }, payload: { url: "https://www.twitch.tv/Alpha", minutes: 10 } });
    assert.equal(duplicate.statusCode, 400);
    assert.match(duplicate.json().error, /уже идёт/);
    assert.equal((await app.inject({ url: "/api/gta6-live", headers: { "x-test-user": "8" } })).json().channels.length, 0);
    const first = liveChannelKey(channels[0]!).folder;
    const stopped = await app.inject({ method: "POST", url: "/api/gta6-live/stop", headers, payload: { id: first } });
    assert.equal(stopped.statusCode, 200);
    let after = await app.inject({ url: "/api/gta6-live", headers });
    for (let attempt = 0; attempt < 20 && after.json().used !== 4; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      after = await app.inject({ url: "/api/gta6-live", headers });
    }
    assert.equal(after.json().used, 4);
    assert.equal(after.json().channels.find((channel: { id: string }) => channel.id === first).line, "Остановлено");
    const again = await app.inject({ method: "POST", url: "/api/gta6-live/start", headers, payload: { url: "https://www.twitch.tv/sixth", minutes: 15 } });
    assert.equal(again.statusCode, 200, again.body);
    assert.equal(again.json().used, 5);
    const folder = liveChannelKey(channels[2]!).folder;
    await mkdir(resolve(root, "u7", folder, "clips"), { recursive: true });
    await writeFile(resolve(root, "u7", folder, "clips", "part-1-first_look-0-8.mp4"), "clip");
    const own = await app.inject({ url: `/api/gta6-live/clips/${folder}/part-1-first_look-0-8.mp4`, headers });
    assert.equal(own.statusCode, 200);
    assert.equal(own.body, "clip");
    assert.equal((await app.inject({ url: `/api/gta6-live/clips/${folder}/part-1-first_look-0-8.mp4` })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/gta6-live/clips/..%2Fsecret/part-1-first_look-0-8.mp4", headers })).statusCode, 400);
  } finally {
    for (const channel of (await sessions.view(7)).channels) {
      if (channel.running) await sessions.stop(7, channel.id);
    }
    await sessions.settled(7);
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
