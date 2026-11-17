import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { hashPassword } from "./auth.ts";
import { createNarezkaApp, NAREZKA_COOKIE, type NarezkaDb } from "./narezka-app.ts";
import { StreamHighlightJobs } from "./services/stream-highlights-jobs.ts";

function memoryDb(): NarezkaDb {
  const users = new Map<string, { id: number; username: string; passHash: string; lockedUntil: string | null; failed: number }>();
  users.set("stas", { id: 7, username: "stas", passHash: hashPassword("secret"), lockedUntil: null, failed: 0 });
  const sessions = new Map<string, { userId: number; expiresAt: string }>();
  const view = (user: { id: number; username: string; passHash: string; lockedUntil: string | null }) => ({
    id: user.id,
    username: user.username,
    passHash: user.passHash,
    lockedUntil: user.lockedUntil,
  });
  return {
    getUserByUsername(username) {
      const user = users.get(username);
      return user ? view(user) : null;
    },
    getUserById(id) {
      const user = [...users.values()].find((item) => item.id === id);
      return user ? view(user) : null;
    },
    incFailedAttempts(id) {
      const user = [...users.values()].find((item) => item.id === id);
      if (!user) return 0;
      user.failed += 1;
      return user.failed;
    },
    lockUser(id, untilIso) {
      const user = [...users.values()].find((item) => item.id === id);
      if (user) user.lockedUntil = untilIso;
    },
    clearLock(id) {
      const user = [...users.values()].find((item) => item.id === id);
      if (!user) return;
      user.failed = 0;
      user.lockedUntil = null;
    },
    createSession(token, userId, expiresAtIso) {
      sessions.set(token, { userId, expiresAt: expiresAtIso });
    },
    getSession(token) {
      return sessions.get(token) ?? null;
    },
    deleteSession(token) {
      sessions.delete(token);
    },
  };
}

test("narezka keeps stream review behind its own login", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "narezka-"));
  const jobs = new StreamHighlightJobs(root, {
    loadSource: async () => { throw new Error("не скачиваем"); },
    plan: async () => [],
  });
  const app = createNarezkaApp({
    db: memoryDb(),
    jobs,
    root,
    secure: false,
    page: resolve("server/public/narezka/index.html"),
  });
  try {
    const page = await app.inject({ url: "/" });
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Нарезка/);
    assert.match(page.body, /Разобрать/);
    assert.equal((await app.inject({ url: "/api/health" })).json().service, "narezka");
    assert.equal((await app.inject({ url: "/api/stream-highlights" })).statusCode, 401);
    assert.equal((await app.inject({ url: "/api/stream-highlights", headers: { cookie: "sid=shareboard" } })).statusCode, 401);
    const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "stas", password: "nope" } });
    assert.equal(bad.statusCode, 401);
    const good = await app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "stas", password: "secret" } });
    assert.equal(good.statusCode, 200, good.body);
    assert.equal(good.json().username, "stas");
    const setCookie = String(good.headers["set-cookie"] ?? "");
    assert.match(setCookie, /narezka_sid=/);
    assert.doesNotMatch(setCookie, /(?:^|; )sid=/);
    const token = /narezka_sid=([^;]+)/.exec(setCookie)?.[1] ?? "";
    const headers = { cookie: `${NAREZKA_COOKIE}=${token}` };
    assert.equal((await app.inject({ url: "/api/auth/me", headers })).json().username, "stas");
    const list = await app.inject({ url: "/api/stream-highlights", headers });
    assert.equal(list.statusCode, 200, list.body);
    assert.deepEqual(list.json().jobs, []);
    const out = await app.inject({ method: "POST", url: "/api/auth/logout", headers });
    assert.equal(out.statusCode, 200);
    assert.match(String(out.headers["set-cookie"] ?? ""), /Max-Age=0/);
    assert.equal((await app.inject({ url: "/api/auth/me", headers })).statusCode, 401);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
