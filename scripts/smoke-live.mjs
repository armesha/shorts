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
const LOCAL_BASE_URL = process.env.SMOKE_LOCAL_BASE_URL || "http://127.0.0.1:8080";
const SUPER_ADMIN_USERNAME = "armen";
const FORBIDDEN_ARMEN_SOURCE_DECKS = [
  "visual-riddles",
  "visual-riddles-de",
  "visual-riddles-en",
  "visual-riddles-it",
  "visual-riddles-es",
  "visual-riddles-fr",
  "visual-riddles-pt",
  "illusions-3d",
  "illusions-3d-de",
  "illusions-3d-en",
  "illusions-en",
  "illusions-de",
  "illusions-it",
  "illusions-es",
  "illusions-ru",
  "illusions-fr",
  "illusions-pt",
  "illusions-hi",
  "illusions-id",
  "illusions-ar",
  "memes-ru",
  "memes-en",
  "memes-de",
  "memes-it",
  "memes-es",
  "memes-fr",
  "memes-pt",
  "memes-hi",
  "memes-id",
  "memes-ar",
  "pack:психология-mgs-mqe2kfjv",
  "pack:психология-mgs-mqp9hqle",
  "pack:mgs-psychologie-eigen",
];

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
  return sessionForUser({ role: "admin" });
}

function superAdminSession() {
  return sessionForUser({ username: SUPER_ADMIN_USERNAME });
}

function sessionForUser(filter) {
  const db = new DatabaseSync(DB_PATH);
  const nowIso = new Date().toISOString();
  const where = filter.username ? "u.username = ?" : "u.role = ?";
  const value = filter.username || filter.role;
  const existing = db
    .prepare(
      `SELECT s.token AS token
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE ${where}
          AND s.expires_at > ?
        ORDER BY s.expires_at DESC
        LIMIT 1`,
    )
    .get(value, nowIso);
  if (existing?.token) {
    return {
      headers: { cookie: `sid=${existing.token}` },
      close: () => db.close(),
    };
  }

  const admin = db.prepare(`SELECT id FROM users WHERE ${where} ORDER BY id LIMIT 1`).get(value);
  if (!admin?.id) {
    db.close();
    throw new Error(`no ${filter.username || filter.role} user found for authenticated smoke check`);
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

function collectThemeBlockSourceIds(body) {
  const ids = new Set();
  for (const block of body?.blocks ?? []) {
    for (const cell of block?.cells ?? []) {
      for (const deckId of cell?.defaultSourceDecks ?? []) ids.add(String(deckId));
      for (const account of cell?.accounts ?? []) {
        for (const deck of account?.sourceDecks ?? []) ids.add(String(deck?.id ?? ""));
      }
    }
  }
  for (const account of body?.unassignedAccounts ?? []) {
    for (const deck of account?.sourceDecks ?? []) ids.add(String(deck?.id ?? ""));
  }
  ids.delete("");
  return ids;
}

async function checkSuperAdminThemeBlocks() {
  const session = superAdminSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/super-admin/channel-blocks`, {
      headers: session.headers,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const ids = collectThemeBlockSourceIds(body);
    const forbidden = FORBIDDEN_ARMEN_SOURCE_DECKS.filter((deckId) => ids.has(deckId));
    if (forbidden.length) {
      throw new Error(`forbidden armen source decks in theme blocks API: ${forbidden.join(", ")}`);
    }
    console.log(`[smoke] armen theme blocks: ok (${body?.blocks?.length ?? 0} blocks, ${ids.size} source decks)`);
  } finally {
    clearTimeout(timer);
    session.close();
  }
}

for (const item of CHECKS) await check(item);
await checkGenerationWorker();
await checkSuperAdminThemeBlocks();
