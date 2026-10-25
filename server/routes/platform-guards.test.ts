import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { Account, Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";
import { registerYouTubeOAuthRoutes } from "./youtube-oauth.ts";
import { registerStatsRoutes } from "./stats.ts";
import { refreshAccountStats } from "../services/stats-refresh.ts";

const social = { id: 9, userId: 7, platform: "instagram", socialHandle: "sample", status: "connected", channelName: "Sample", schedule: ["12:00"] } as Account;

test("YouTube OAuth rejects a social account before resolving Google credentials", async () => {
  const app = Fastify();
  let googleReads = 0;
  const db = {
    getAccount: () => social,
    addError: () => {},
    listOAuthClients: () => { googleReads++; throw new Error("Google credentials must not be accessed"); },
  } as unknown as Db;
  registerYouTubeOAuthRoutes(app, db, {
    accessibleAccount: () => social,
    accountOwnerId: () => social.userId,
    redirectUri: "https://example.test/api/youtube/callback",
    webOrigin: "https://example.test",
  } as unknown as RouteDeps);
  try {
    const start = await app.inject({ url: "/api/youtube/auth-url?accountId=9" });
    assert.equal(start.statusCode, 400);
    assert.match(start.json().error, /cookies/);
    const callback = await app.inject({ url: "/api/youtube/callback?code=synthetic-code&state=9:1" });
    assert.equal(callback.statusCode, 302);
    assert.match(decodeURIComponent(String(callback.headers.location)), /cookies/);
    assert.equal(googleReads, 0);
  } finally { await app.close(); }
});

test("social statistics refresh does not access Google credentials or stored YouTube metrics", async () => {
  const app = Fastify();
  let googleReads = 0;
  const db = {
    getRefreshToken: () => { googleReads++; throw new Error("Google credentials must not be accessed"); },
    latestSnapshot: () => { throw new Error("Social accounts have no YouTube metrics"); },
  } as unknown as Db;
  registerStatsRoutes(app, db, {
    auth: { requireAdmin: () => true, requireAdminLike: () => true, isAdminLikeReq: () => false },
    visibleAccounts: () => [social],
    accountCreds: () => { googleReads++; throw new Error("Google credentials must not be accessed"); },
    statRow: (a: Account, error: string | null) => ({ accountId: a.id, error }),
    statsRefreshHooks: {},
    redirectUri: "",
  } as unknown as RouteDeps);
  try {
    const full = await app.inject({ method: "POST", url: "/api/stats/refresh" });
    assert.equal(full.statusCode, 200);
    assert.match(full.json()[0].error, /пока недоступна/);
    const onlyData = await app.inject({ method: "POST", url: "/api/stats/refresh-data-only", payload: {} });
    assert.equal(onlyData.statusCode, 200);
    assert.deepEqual(onlyData.json(), []);
    const totals = await app.inject({ url: "/api/stats/totals" });
    assert.equal(totals.statusCode, 200);
    assert.equal(totals.json().channels, 0);
    assert.equal(googleReads, 0);
    const shared = await refreshAccountStats({ account: social, db, creds: null, refreshToken: null } as never);
    assert.match(shared.error ?? "", /пока недоступна/);
  } finally { await app.close(); }
});
