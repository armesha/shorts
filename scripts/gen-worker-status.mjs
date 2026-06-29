#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(process.cwd(), ".env"));
} catch {
  /* optional */
}

const DB_PATH = process.env.DATABASE_PATH || resolve(process.cwd(), "data/app.db");
const HEARTBEAT_KEY = "generationWorker.heartbeat.v1";
const STALE_MS = Math.max(1_000, Number(process.env.GEN_WORKER_STALE_MS || 12_000) || 12_000);
const LIMIT = Math.max(1, Math.min(25, Math.floor(Number(process.argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) || 8) || 8)));

function readJson(raw, fallback) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return fallback;
  }
}

function fmtAge(ms) {
  if (ms == null) return "n/a";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

function fmtTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Date(n).toLocaleString("ru-RU", { hour12: false });
}

function queueMode(heartbeat) {
  if (process.env.GEN_QUEUE_RUNNER === "0" || process.env.GEN_QUEUE_RUNNER === "external") return "external";
  if (heartbeat) return "external";
  return "embedded";
}

function printTable(rows, columns) {
  if (!rows.length) return;
  const widths = columns.map((column) =>
    Math.min(
      column.max ?? 48,
      Math.max(column.title.length, ...rows.map((row) => String(column.get(row)).length)),
    ),
  );
  const line = columns.map((column, index) => column.title.padEnd(widths[index])).join("  ");
  console.log(line);
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(
      columns
        .map((column, index) => {
          const raw = String(column.get(row));
          const value = raw.length > widths[index] ? `${raw.slice(0, Math.max(0, widths[index] - 1))}…` : raw;
          return value.padEnd(widths[index]);
        })
        .join("  "),
    );
  }
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });

const heartbeatRow = db.prepare("SELECT value FROM settings WHERE key = ?").get(HEARTBEAT_KEY);
const heartbeat = readJson(heartbeatRow?.value, null);
const beatAt = heartbeat ? Number(heartbeat.beatAt) : null;
const ageMs = beatAt ? Math.max(0, Date.now() - beatAt) : null;
const stale = ageMs == null || ageMs > STALE_MS;
const mode = queueMode(heartbeat);
const online = mode === "embedded" || (!!heartbeat && !stale && !heartbeat.stopping);

console.log("Generation worker");
console.log(`- db: ${DB_PATH}`);
console.log(`- mode: ${mode}`);
console.log(`- online: ${online ? "yes" : "no"}${stale && mode === "external" ? " (stale heartbeat)" : ""}`);
if (heartbeat) {
  console.log(`- pid: ${heartbeat.pid}; running: ${heartbeat.queueRunning ? "yes" : "no"}; stopping: ${heartbeat.stopping ? "yes" : "no"}`);
  console.log(`- heartbeat: age=${fmtAge(ageMs)}; beatAt=${fmtTime(heartbeat.beatAt)}; startedAt=${fmtTime(heartbeat.startedAt)}; poll=${heartbeat.pollMs}ms`);
} else {
  console.log("- heartbeat: none");
}

const stateRows = db
  .prepare(
    `SELECT state, COUNT(*) AS jobs, COALESCE(SUM(MAX(total - done, 0)), 0) AS remaining
       FROM generation_jobs
      GROUP BY state
      ORDER BY CASE state
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'error' THEN 2
        WHEN 'exhausted' THEN 3
        WHEN 'canceled' THEN 4
        WHEN 'done' THEN 5
        ELSE 6
      END, state`,
  )
  .all();

const activeRows = db
  .prepare(
    `SELECT gj.id,
            gj.state,
            gj.user_id,
            requester.username AS requester,
            owner.username AS owner,
            gj.account_id,
            COALESCE(a.yt_channel_title, a.channel_name, '#' || gj.account_id) AS channel_name,
            COALESCE(a.channel_lang, a.lang, '') AS channel_lang,
            gj.deck_ids,
            gj.total,
            gj.done,
            gj.created_at,
            gj.error
       FROM generation_jobs gj
       LEFT JOIN accounts a ON a.id = gj.account_id
       LEFT JOIN users requester ON requester.id = gj.user_id
       LEFT JOIN users owner ON owner.id = gj.owner_user_id
      WHERE gj.state IN ('running', 'queued')
      ORDER BY CASE gj.state WHEN 'running' THEN 0 ELSE 1 END, gj.created_at ASC, gj.id ASC
      LIMIT ?`,
  )
  .all(LIMIT);

const unfinishedRemaining = stateRows
  .filter((row) => row.state === "running" || row.state === "queued")
  .reduce((sum, row) => sum + (Number(row.remaining) || 0), 0);
const unfinishedJobs = stateRows
  .filter((row) => row.state === "running" || row.state === "queued")
  .reduce((sum, row) => sum + (Number(row.jobs) || 0), 0);

console.log("\nQueue summary");
if (!stateRows.length) {
  console.log("- no generation jobs");
} else {
  printTable(stateRows, [
    { title: "state", get: (row) => row.state },
    { title: "jobs", get: (row) => Number(row.jobs) || 0 },
    { title: "remaining", get: (row) => Number(row.remaining) || 0 },
  ]);
}
console.log(`- unfinished: ${unfinishedJobs} jobs / ${unfinishedRemaining} videos`);

console.log("\nActive jobs");
if (!activeRows.length) {
  console.log("- none");
} else {
  printTable(
    activeRows.map((row) => {
      const deckIds = readJson(row.deck_ids, []);
      return {
        ...row,
        remaining: Math.max(0, Number(row.total) - Number(row.done)),
        decks: Array.isArray(deckIds) && deckIds.length ? deckIds.join(",") : "-",
      };
    }),
    [
      { title: "state", get: (row) => row.state },
      { title: "left", get: (row) => row.remaining },
      { title: "channel", max: 28, get: (row) => `${row.channel_name} (${String(row.channel_lang || "").toUpperCase()})` },
      { title: "owner", max: 16, get: (row) => row.owner || "-" },
      { title: "decks", max: 42, get: (row) => row.decks },
      { title: "created", max: 22, get: (row) => fmtTime(row.created_at) },
      { title: "id", max: 16, get: (row) => row.id },
    ],
  );
}

db.close();

if (mode === "external" && !online && unfinishedRemaining > 0) {
  console.error("\nworker offline while unfinished jobs exist");
  process.exit(1);
}
