#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const CHECKS = [
  {
    name: "local health",
    url: process.env.SMOKE_LOCAL_URL || "http://127.0.0.1:8080/api/health",
    method: "GET",
  },
  {
    name: "public channels",
    url: process.env.SMOKE_PUBLIC_URL || "https://shareboard.live/channels",
    method: "HEAD",
  },
];

const DB_PATH = process.env.DATABASE_PATH || resolve(process.cwd(), "data/app.db");
const WORKER_URL = process.env.SMOKE_WORKER_URL || "http://127.0.0.1:8080/api/gen-queue/worker";

async function check({ name, url, method }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[smoke] ${name}: ok (${res.status})`);
  } finally {
    clearTimeout(timer);
  }
}

function adminSession() {
  const db = new DatabaseSync(DB_PATH);
  const nowIso = new Date().toISOString();
  const existing = db
    .prepare(
      `SELECT s.token AS token
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE u.role = 'admin'
          AND s.expires_at > ?
        ORDER BY s.expires_at DESC
        LIMIT 1`,
    )
    .get(nowIso);
  if (existing?.token) {
    return {
      headers: { cookie: `sid=${existing.token}` },
      close: () => db.close(),
    };
  }

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  if (!admin?.id) {
    db.close();
    throw new Error("no admin user found for authenticated smoke check");
  }
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, admin.id, expiresAt);
  return {
    headers: { cookie: `sid=${token}` },
    close: () => {
      try {
        db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      } finally {
        db.close();
      }
    },
  };
}

async function checkGenerationWorker() {
  const session = adminSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(WORKER_URL, { headers: session.headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const worker = body?.worker;
    if (!worker?.online || worker?.stale) {
      throw new Error(`worker offline: ${JSON.stringify(worker)}`);
    }
    const age = worker.ageMs == null ? "n/a" : `${Math.round(worker.ageMs)}ms`;
    console.log(`[smoke] generation worker: ok (${worker.mode}, age ${age})`);
  } finally {
    clearTimeout(timer);
    session.close();
  }
}

for (const item of CHECKS) await check(item);
await checkGenerationWorker();
