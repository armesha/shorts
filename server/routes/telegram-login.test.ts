import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify from "fastify";
import { openDb } from "../db.ts";
import { registerTelegramRoutes } from "./telegram-routes.ts";

// Synthetic Bot API and temporary database: this never contacts a real bot.
test("bot login confirms once, rejects webhook forgery and expired confirmations", async () => {
  const db = openDb(":memory:");
  const app = Fastify();
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousUrl = process.env.PUBLIC_BASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-secret";
  process.env.PUBLIC_BASE_URL = "https://example.test";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ ok: true, result: { username: "test_bot" } }),
      { headers: { "content-type": "application/json" } },
    );
  try {
    const user = db.createUser({
      username: "linked-user",
      passHash: "x",
      role: "user",
    });
    db.setUserTelegram(user.id, "123456", "test");
    registerTelegramRoutes(app, db, {
      setSessionCookie: (reply: {header: (key: string, value: string) => unknown}, token: string) =>
        reply.header(
          "Set-Cookie",
          `sid=${token}; HttpOnly; Secure; SameSite=Lax; Path=/`,
        ),
    } as never);
    const start = await app.inject({
      method: "POST",
      url: "/api/auth/telegram/login/start",
    });
    assert.equal(start.statusCode, 200);
    const { token } = start.json();
    const secret = createHash("sha256")
      .update("test-bot-secret:webhook")
      .digest("hex")
      .slice(0, 40);
    const update = {
      message: {
        text: `/start ${token}`,
        from: { id: 123456 },
        chat: { id: 123456, type: "private" },
      },
    };
    const forged = await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      payload: update,
    });
    assert.equal(forged.statusCode, 401);
    assert.equal(db.getTelegramLink(token)?.status, "pending");
    const confirmed = await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: update,
    });
    assert.equal(confirmed.statusCode, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(db.getTelegramLink(token)?.status, "ready");
    const status = await app.inject({
      url: `/api/auth/telegram/login/status?token=${token}`,
    });
    assert.equal(status.json().status, "ok");
    assert.equal(status.json().user.id, user.id);
    assert.match(String(status.headers["set-cookie"]), /HttpOnly/);
    assert.equal(status.headers["cache-control"], "no-store");
    const repeated = await app.inject({
      url: `/api/auth/telegram/login/status?token=${token}`,
    });
    assert.equal(repeated.json().status, "notfound");
    assert.equal(repeated.headers["set-cookie"], undefined);
    db.createTelegramLink("expired-link", "login", user.id);
    db.updateTelegramLink("expired-link", { status: "ready", userId: user.id });
    db.db
      .prepare(
        "UPDATE telegram_links SET created_at=datetime('now','-11 minutes') WHERE token='expired-link'",
      )
      .run();
    const expired = await app.inject({
      url: "/api/auth/telegram/login/status?token=expired-link",
    });
    assert.equal(expired.json().status, "expired");
    assert.equal(expired.headers["set-cookie"], undefined);
    db.createTelegramLink("group-link", "login", null);
    await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": secret },
      payload: {
        message: {
          ...update.message,
          text: "/start group-link",
          chat: { id: -100, type: "group" },
        },
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(db.getTelegramLink("group-link")?.status, "pending");
  } finally {
    await app.close();
    db.db.close();
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousUrl;
  }
});
