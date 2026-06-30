#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS } from "../server/services/super-admin-forbidden-source-decks.ts";

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

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function superAdminFilter(db) {
  if (hasColumn(db, "users", "is_super_admin")) return { where: "u.role = 'admin' AND u.is_super_admin = 1", params: [] };
  return { where: "u.username = ?", params: [SUPER_ADMIN_USERNAME] };
}

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
  return sessionForUser({ superAdmin: true });
}

function sessionForUser(filter) {
  const db = new DatabaseSync(DB_PATH);
  const nowIso = new Date().toISOString();
  const resolved = filter.superAdmin ? superAdminFilter(db) : { where: filter.username ? "u.username = ?" : "u.role = ?", params: [filter.username || filter.role] };
  const existing = db
    .prepare(
      `SELECT s.token AS token
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE ${resolved.where}
          AND s.expires_at > ?
        ORDER BY s.expires_at DESC
        LIMIT 1`,
    )
    .get(...resolved.params, nowIso);
  if (existing?.token) {
    return {
      headers: { cookie: `sid=${existing.token}` },
      close: () => db.close(),
    };
  }

  const admin = db.prepare(`SELECT id FROM users u WHERE ${resolved.where} ORDER BY id LIMIT 1`).get(...resolved.params);
  if (!admin?.id) {
    db.close();
    throw new Error(`no ${filter.superAdmin ? "super-admin" : filter.username || filter.role} user found for authenticated smoke check`);
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

function activeSuperAdminLanguages() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const { where, params } = superAdminFilter(db);
    const rows = db
      .prepare(
        `SELECT DISTINCT COALESCE(NULLIF(a.channel_lang, ''), a.lang) AS lang
           FROM accounts a
           JOIN users u ON u.id = a.user_id
          WHERE ${where}
            AND COALESCE(NULLIF(a.channel_lang, ''), a.lang) <> ''
          ORDER BY lang`,
      )
      .all(...params);
    return new Set(rows.map((row) => String(row.lang || "")).filter(Boolean));
  } finally {
    db.close();
  }
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
    const forbidden = [...FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS].filter((deckId) => ids.has(deckId));
    if (forbidden.length) {
      throw new Error(`forbidden super-admin source decks in theme blocks API: ${forbidden.join(", ")}`);
    }
    const activeLangs = activeSuperAdminLanguages();
    const staleLangs = (body?.languages ?? [])
      .map((lang) => String(lang?.code || ""))
      .filter((lang) => lang && !activeLangs.has(lang));
    if (staleLangs.length) {
      throw new Error(`unused super-admin languages in theme blocks API: ${staleLangs.join(", ")}`);
    }
    const emptyCells = [];
    for (const block of body?.blocks ?? []) {
      for (const cell of block?.cells ?? []) {
        if (!(cell?.accounts ?? []).length) emptyCells.push(`${block.id}:${cell.lang}`);
      }
    }
    if (emptyCells.length) {
      throw new Error(`empty language cells in theme blocks API: ${emptyCells.join(", ")}`);
    }
    console.log(`[smoke] super-admin theme blocks: ok (${body?.blocks?.length ?? 0} blocks, ${ids.size} source decks)`);
  } finally {
    clearTimeout(timer);
    session.close();
  }
}

for (const item of CHECKS) await check(item);
await checkGenerationWorker();
await checkSuperAdminThemeBlocks();
