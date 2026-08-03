import assert from "node:assert/strict";
import Fastify from "fastify";
import test from "node:test";

import { openDb } from "../db.ts";
import { makeAuthSession } from "../infra/auth-session.ts";
import type { AsatibotSettings, AsatibotSnapshotResponse } from "../services/asatibot-snapshot.ts";
import type { RouteDeps } from "./deps.ts";
import { registerSignalsRoutes } from "./signals.ts";

const SETTINGS: AsatibotSettings = {
  initialBankrollUsd: 100,
  lowConfidencePercent: 5,
  defaultPositionPercent: 5,
  maxPositionPercent: 10,
  maxTotalExposurePercent: 30,
  maxOpenPositions: 5,
  dailyAiLimitUsd: 3,
  monthlyAiLimitUsd: 50,
};

const SNAPSHOT: AsatibotSnapshotResponse = {
  available: true,
  snapshot: {
    version: 1,
    generatedAt: "2026-08-02T03:36:04.000Z",
    settings: SETTINGS,
    health: { state: "running", restartCount: 0 },
    controlStatus: "idle",
    summary: {
      signalCount: 0,
      paperPositionCount: 0,
      openPositionCount: 0,
      blockedRiskCount: 0,
      totalNotionalUsd: 0,
      totalPnlUsd: 0,
      todayAiSpendUsd: 0,
      monthAiSpendUsd: 0,
      dailyAiLimitUsd: 3,
      monthlyAiLimitUsd: 50,
    },
    positions: [],
    recentSignals: [],
  },
};

test("signals API is no-store and accessible to database-backed admins, but not users", async () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "user", passHash: "x", role: "user" });
  const admin = db.createUser({ username: "admin", passHash: "x", role: "admin" });
  const stas = db.createUser({ username: "stas", passHash: "x", role: "admin" });
  const superAdmin = db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const byHeader = { user, admin, stas, owner: superAdmin } as const;
    const name = String(req.headers["x-test-user"] ?? "user") as keyof typeof byHeader;
    (req as unknown as { userId: number }).userId = byHeader[name]?.id ?? user.id;
  });
  let reads = 0;
  registerSignalsRoutes(app, db, { auth: makeAuthSession(db), webOrigin: "https://shareboard.live" } as Pick<RouteDeps, "auth" | "webOrigin">, {
    readSnapshot: async () => {
      reads += 1;
      return SNAPSHOT;
    },
  });

  try {
    const denied = await app.inject({ method: "GET", url: "/api/signals", headers: { "x-test-user": "user" } });
    assert.equal(denied.statusCode, 403);
    assert.equal(denied.headers["cache-control"], "no-store, max-age=0");
    assert.equal(denied.headers.pragma, "no-cache");
    assert.equal(reads, 0);

    for (const name of ["admin", "stas", "owner"]) {
      const allowed = await app.inject({ method: "GET", url: "/api/signals", headers: { "x-test-user": name } });
      assert.equal(allowed.statusCode, 200);
      assert.equal(allowed.headers["cache-control"], "no-store, max-age=0");
      assert.equal(allowed.headers.pragma, "no-cache");
      assert.deepEqual(JSON.parse(allowed.body), {
        ...SNAPSHOT,
        canManageSettings: name === "stas" || name === "owner",
      });
    }
    assert.equal(reads, 3);
  } finally {
    await app.close();
    db.db.close();
  }
});

test("signals settings allow the super-admin and stas while rejecting unknown or unsafe limits", async () => {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "user", passHash: "x", role: "user" });
  const admin = db.createUser({ username: "admin", passHash: "x", role: "admin" });
  const stas = db.createUser({ username: "stas", passHash: "x", role: "admin" });
  const superAdmin = db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    const byHeader = { user, admin, stas, owner: superAdmin } as const;
    const name = String(req.headers["x-test-user"] ?? "user") as keyof typeof byHeader;
    (req as unknown as { userId: number }).userId = byHeader[name]?.id ?? user.id;
  });
  const writes: AsatibotSettings[] = [];
  registerSignalsRoutes(app, db, { auth: makeAuthSession(db), webOrigin: "https://shareboard.live" } as Pick<RouteDeps, "auth" | "webOrigin">, {
    writeSettings: async (settings) => {
      writes.push(settings);
      return true;
    },
  });

  try {
    for (const name of ["user", "admin"]) {
      const denied = await app.inject({
        method: "PUT",
        url: "/api/signals/settings",
        headers: { "x-test-user": name },
        payload: SETTINGS,
      });
      assert.equal(denied.statusCode, 403);
      assert.equal(denied.headers["cache-control"], "no-store, max-age=0");
    }
    assert.deepEqual(writes, []);

    for (const origin of [undefined, "https://evil.example"]) {
      const wrongOrigin = await app.inject({
        method: "PUT",
        url: "/api/signals/settings",
        headers: { "x-test-user": "owner", ...(origin ? { origin } : {}) },
        payload: SETTINGS,
      });
      assert.equal(wrongOrigin.statusCode, 403);
      assert.equal(wrongOrigin.headers["cache-control"], "no-store, max-age=0");
    }
    assert.deepEqual(writes, []);

    const unknown = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, path: "/etc/passwd" },
    });
    assert.equal(unknown.statusCode, 400);

    const invalidInvariant = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, defaultPositionPercent: 11, maxPositionPercent: 10 },
    });
    assert.equal(invalidInvariant.statusCode, 400);

    const invalidLowConfidence = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, lowConfidencePercent: 11, maxPositionPercent: 10 },
    });
    assert.equal(invalidLowConfidence.statusCode, 400);

    const invalidOpenPositions = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, maxOpenPositions: 0 },
    });
    assert.equal(invalidOpenPositions.statusCode, 400);

    const invalidBankroll = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, initialBankrollUsd: 1_000_001 },
    });
    assert.equal(invalidBankroll.statusCode, 400);

    const invalidDailyBudget = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, dailyAiLimitUsd: 51, monthlyAiLimitUsd: 51 },
    });
    assert.equal(invalidDailyBudget.statusCode, 400);

    const invalidMonthlyBudget = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: { ...SETTINGS, monthlyAiLimitUsd: 1_001 },
    });
    assert.equal(invalidMonthlyBudget.statusCode, 400);
    assert.deepEqual(writes, []);

    const accepted = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "owner", origin: "https://shareboard.live" },
      payload: SETTINGS,
    });
    assert.equal(accepted.statusCode, 202);
    assert.equal(accepted.headers["cache-control"], "no-store, max-age=0");
    assert.equal(accepted.headers.pragma, "no-cache");
    assert.deepEqual(JSON.parse(accepted.body), { accepted: true });
    assert.deepEqual(writes, [SETTINGS]);

    const acceptedForStas = await app.inject({
      method: "PUT",
      url: "/api/signals/settings",
      headers: { "x-test-user": "stas", origin: "https://shareboard.live" },
      payload: SETTINGS,
    });
    assert.equal(acceptedForStas.statusCode, 202);
    assert.deepEqual(JSON.parse(acceptedForStas.body), { accepted: true });
    assert.deepEqual(writes, [SETTINGS, SETTINGS]);
  } finally {
    await app.close();
    db.db.close();
  }
});

test("signals API hides local read failures instead of returning their error text", async () => {
  const db = openDb(":memory:");
  const superAdmin = db.createUser({ username: "owner", passHash: "x", role: "admin", isSuperAdmin: true });
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as unknown as { userId: number }).userId = superAdmin.id;
  });
  registerSignalsRoutes(app, db, { auth: makeAuthSession(db), webOrigin: "https://shareboard.live" } as Pick<RouteDeps, "auth" | "webOrigin">, {
    readSnapshot: async () => {
      throw new Error("openrouter-key-or-private-telegram-error");
    },
  });

  try {
    const response = await app.inject({ method: "GET", url: "/api/signals" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store, max-age=0");
    assert.equal(response.headers.pragma, "no-cache");
    assert.deepEqual(JSON.parse(response.body), { available: false, reason: "unavailable", canManageSettings: true });
    assert.equal(response.body.includes("openrouter-key-or-private-telegram-error"), false);
  } finally {
    await app.close();
    db.db.close();
  }
});
