import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import Fastify, { type FastifyRequest } from "fastify";
import { openDb } from "../db.ts";
import type { CircleYouTubePublisher } from "../services/circle-pipeline/youtube-publisher.ts";
import { registerGta6LiveRoutes } from "./gta6-live.ts";
import { isGta6YouTubeUploading, registerGta6YouTubeRoutes } from "./gta6-youtube.ts";

test("publishes each Shorts banner to its confirmed channel at most once", async () => {
  const root = await mkdtemp(join(tmpdir(), "gta6-youtube-"));
  const db = openDb(":memory:");
  const app = Fastify();
  const owner = db.createUser({ username: "owner", passHash: "x" });
  const viewer = db.createUser({ username: "viewer", passHash: "x" });
  const robot = db.createAccount({ userId: owner.id, platform: "youtube", channelName: "Shortrobot" });
  const simka = db.createAccount({ userId: owner.id, platform: "youtube", channelName: "SIMKA" });
  const robotId = `UC${"a".repeat(22)}`;
  const simkaId = `UC${"b".repeat(22)}`;
  const bind = db.db.prepare("INSERT INTO circle_youtube_connections(account_id,owner_id,status,channel_id) VALUES(?,?,'connected',?)");
  bind.run(robot.id, owner.id, robotId);
  bind.run(simka.id, owner.id, simkaId);
  app.addHook("onRequest", async (req) => {
    const userId = Number(req.headers["x-test-user"]);
    if (userId) (req as FastifyRequest & { userId?: number }).userId = userId;
  });

  const sessions = registerGta6LiveRoutes(app, root, undefined, (user, clip) => isGta6YouTubeUploading(db, user, clip));
  const inputs: Parameters<CircleYouTubePublisher["publishManually"]>[0][] = [];
  const complete: ((value: boolean) => void)[] = [];
  let duration = 181;
  registerGta6YouTubeRoutes(app, db, ownerId => sessions.library(ownerId), {
    publishManually(input) {
      inputs.push(input);
      return new Promise(resolve => { complete.push(resolve); });
    },
  }, async () => ({ duration, width: 1080, height: 1920, fps: "30/1", audio: true }));

  try {
    const library = sessions.library(owner.id);
    await library.add("Игровой эфир", async (_banner, file) => { await writeFile(file, "video"); });
    const [clip] = await library.list();
    assert.ok(clip);
    const api = "/api/creator/gta6-youtube";
    const headers = { "x-test-user": String(owner.id) };
    const other = { "x-test-user": String(viewer.id) };
    assert.equal((await app.inject({ url: api })).statusCode, 401);
    const configure = (banner: string, accountId: number, actor: Record<string, string> = headers) => app.inject({
      method: "PUT", url: `${api}/target`, headers: actor, payload: { banner, accountId },
    });
    assert.equal((await configure("shortrobot", robot.id, other)).statusCode, 400);
    assert.equal((await configure("shortrobot", robot.id, { ...headers, origin: "https://another.example" })).statusCode, 403);
    assert.equal((await configure("shortrobot", robot.id)).statusCode, 200);
    assert.equal((await configure("simka", robot.id)).statusCode, 409);
    assert.equal((await configure("simka", simka.id)).statusCode, 200);

    const submit = (banner: string, accountId: number, channelId: string) => app.inject({
      method: "POST", url: `${api}/${clip.id}/${banner}`, headers, payload: { accountId, channelId },
    });
    assert.equal((await submit("shortrobot", robot.id, robotId)).statusCode, 422);
    assert.equal(inputs.length, 0);
    duration = 180;
    assert.equal((await submit("shortrobot", simka.id, simkaId)).statusCode, 409);
    const starts = await Promise.all([submit("shortrobot", robot.id, robotId), submit("shortrobot", robot.id, robotId)]);
    assert.deepEqual(starts.map(result => result.statusCode).sort(), [202, 409]);
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0]?.file, library.file(clip.id, "shortrobot"));
    assert.match(inputs[0]!.comment, /@shortrobot/u);
    assert.match(inputs[0]!.description, /#Shorts/u);
    assert.equal((await app.inject({ method: "DELETE", url: `/api/gta6-live/library/${clip.id}`, headers })).statusCode, 409);

    const url = "https://www.youtube.com/watch?v=abcdefghijk";
    inputs[0]!.onSubmit(url);
    inputs[0]!.onPublished(url);
    complete[0]!(true);
    await setImmediate();
    assert.equal((await submit("shortrobot", robot.id, robotId)).statusCode, 409);
    assert.equal((await submit("simka", simka.id, simkaId)).statusCode, 202);
    assert.equal(inputs[1]?.file, library.file(clip.id, "simka"));
    assert.match(inputs[1]!.description, /@simka_dbot/u);
    inputs[1]!.onSubmit("https://www.youtube.com/watch?v=zyxwvutsrqp");
    inputs[1]!.onPublished("https://www.youtube.com/watch?v=zyxwvutsrqp");
    complete[1]!(false);
    await setImmediate();
    const result = (await app.inject({ url: api, headers })).json();
    assert.deepEqual(result.publications.map(({ banner, state, commentStatus }: { banner: string; state: string; commentStatus: string }) => [banner, state, commentStatus]), [
      ["shortrobot", "published", "posted"], ["simka", "published", "unconfirmed"],
    ]);
    assert.equal(result.publications[0].url, url);
    assert.deepEqual((await app.inject({ url: api, headers: other })).json(), { accounts: [], targets: [], publications: [], automation: [] });
  } finally {
    await app.close();
    db.db.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a restart keeps submitted videos locked and preserves confirmed links", async () => {
  const db = openDb(":memory:");
  const app = Fastify();
  const root = await mkdtemp(join(tmpdir(), "gta6-youtube-restart-"));
  try {
    const sessions = registerGta6LiveRoutes(app, root);
    db.db.exec(`INSERT INTO gta6_youtube_publications(owner_id,clip_id,banner,state,url,comment_status) VALUES
      (1,'first','shortrobot','uploading',NULL,NULL),
      (1,'second','shortrobot','submitted','https://www.youtube.com/watch?v=abcdefghijk',NULL),
      (1,'third','simka','published','https://www.youtube.com/watch?v=zyxwvutsrqp','pending')`);
    registerGta6YouTubeRoutes(app, db, ownerId => sessions.library(ownerId), { publishManually: async () => { throw new Error("Unexpected upload"); } });
    const rows = db.db.prepare("SELECT state,url,comment_status AS commentStatus FROM gta6_youtube_publications ORDER BY clip_id").all();
    assert.deepEqual(rows.map(row => [row.state, row.url, row.commentStatus]), [
      ["failed", null, null],
      ["review", "https://www.youtube.com/watch?v=abcdefghijk", null],
      ["published", "https://www.youtube.com/watch?v=zyxwvutsrqp", "unconfirmed"],
    ]);
  } finally {
    await app.close();
    db.db.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("automation sends two startup Shorts, then respects hourly intervals and the Prague night pause", async () => {
  const root = await mkdtemp(join(tmpdir(), "gta6-youtube-automation-"));
  const db = openDb(":memory:");
  const app = Fastify();
  try {
    const owner = db.createUser({ username: "owner", passHash: "x" });
    const channel = db.createAccount({ userId: owner.id, platform: "youtube" });
    const channelId = `UC${"a".repeat(22)}`;
    db.db.prepare("INSERT INTO circle_youtube_connections(account_id,owner_id,status,channel_id) VALUES(?,?,'connected',?)")
      .run(channel.id, owner.id, channelId);
    const sessions = registerGta6LiveRoutes(app, root);
    const library = sessions.library(owner.id);
    for (let index = 0; index < 4; index++) {
      await library.add(`Clip ${index}`, async (_banner, file) => { await writeFile(file, "video"); }, 45);
    }
    const sent: string[] = [];
    const started = Date.parse("2026-10-24T10:00:00Z");
    let timestamp = started;
    let crossesNight = false;
    const { tick } = registerGta6YouTubeRoutes(app, db, id => sessions.library(id), {
      async publishManually(input) {
        if (crossesNight) timestamp += 60_000;
        input.onSubmit("https://www.youtube.com/watch?v=abcdefghijk");
        sent.push(input.file);
        input.onPublished("https://www.youtube.com/watch?v=abcdefghijk");
        return true;
      },
    }, async () => ({ duration: 45, width: 1080, height: 1920, fps: "30/1", audio: true }), () => timestamp);
    db.db.prepare("INSERT INTO gta6_youtube_targets(owner_id,banner,account_id,channel_id) VALUES(?,'shortrobot',?,?)")
      .run(owner.id, channel.id, channelId);
    db.db.prepare("INSERT INTO gta6_youtube_automation(owner_id,banner,enabled) VALUES(?,'shortrobot',1)").run(owner.id);
    for (let pass = 0; pass < 5; pass++) await tick();
    assert.equal(sent.length, 2);
    const state = db.db.prepare("SELECT initial_remaining AS remaining,next_at AS nextAt FROM gta6_youtube_automation").get();
    assert.equal(state?.remaining, 0);
    assert.equal(state?.nextAt, started + 60 * 60_000);
    timestamp = started + 60 * 60_000;
    for (let pass = 0; pass < 3; pass++) await tick();
    assert.equal(sent.length, 3);
    assert.equal(new Set(sent).size, 3);

    // An upload begun at 22:59 CEST must stop before submission at 23:00.
    timestamp = Date.parse("2026-10-24T20:59:00Z");
    crossesNight = true;
    await tick();
    await setImmediate();
    crossesNight = false;
    assert.equal(sent.length, 3);
    const morning = Date.parse("2026-10-25T07:00:00Z"); // 08:00 CET after the clock change
    assert.equal(db.db.prepare("SELECT next_at AS nextAt FROM gta6_youtube_automation").get()?.nextAt, morning);
    // A due job already present during the night is moved to the same morning.
    db.db.exec("UPDATE gta6_youtube_automation SET next_at=0");
    await tick();
    assert.equal(db.db.prepare("SELECT next_at AS nextAt FROM gta6_youtube_automation").get()?.nextAt, morning);
    timestamp = morning - 60_000;
    await tick();
    assert.equal(sent.length, 3);
    timestamp = morning;
    await tick();
    assert.equal(sent.length, 4);
    assert.equal(new Set(sent).size, 4);
  } finally {
    await app.close();
    db.db.close();
    await rm(root, { recursive: true, force: true });
  }
});
