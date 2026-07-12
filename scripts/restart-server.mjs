import { execFile as execFileCb, spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8080);
const SERVICE = process.env.SHORTS_SERVICE || "shorts.service";
const WORKER_SERVICE = process.env.SHORTS_WORKER_SERVICE || "shorts-gen-worker.service";
const CREATOR_SERVICE = process.env.SHORTS_CREATOR_SERVICE || "shorts-creator.service";
const LOG_FILE = resolve(ROOT, "logs/server.log");
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;
const HEALTH_WAIT_MS = durationMs(process.env.SHORTS_HEALTH_WAIT_MS, 90_000, 10_000, 300_000);
const WORKER_HEARTBEAT_KEY = "generationWorker.heartbeat.v1";
const WORKER_HEARTBEAT_STALE_MS = 12_000;

function log(message) {
  process.stdout.write(`[restart] ${message}\n`);
}

function durationMs(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function run(command, args, options = {}) {
  return execFile(command, args, {
    cwd: ROOT,
    timeout: options.timeout ?? 15_000,
    maxBuffer: options.maxBuffer ?? 1024 * 1024,
    env: process.env,
  });
}

async function tryRun(command, args, options = {}) {
  try {
    return await run(command, args, options);
  } catch (error) {
    return { stdout: "", stderr: String(error?.stderr || error?.message || error), failed: true };
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitFor(predicate, timeoutMs, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(stepMs);
  }
  return !!(await predicate());
}

function procCmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ").trim();
  } catch {
    return "";
  }
}

function procCwd(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return "";
  }
}

function repoAppPids() {
  if (!existsSync("/proc")) return [];
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    const cmd = procCmdline(pid);
    if (!cmd.includes("server/index.ts") && !cmd.includes("server/gen-worker.ts")) continue;
    const cwd = procCwd(pid);
    if (cwd === ROOT || cmd.includes(ROOT)) pids.push(pid);
  }
  return pids;
}

async function portPids() {
  const { stdout } = await tryRun("ss", ["-ltnpH", `sport = :${PORT}`]);
  const ids = new Set();
  for (const match of stdout.matchAll(/pid=(\d+)/g)) ids.add(Number(match[1]));
  return [...ids].filter((pid) => pid > 1);
}

async function serviceLoadState(service = SERVICE) {
  const { stdout } = await tryRun("systemctl", ["show", service, "-p", "LoadState", "--value"]);
  return stdout.trim();
}

async function serviceMainPid(service = SERVICE) {
  const { stdout } = await tryRun("systemctl", ["show", service, "-p", "MainPID", "--value"]);
  const pid = Number(stdout.trim());
  return Number.isFinite(pid) && pid > 0 ? pid : 0;
}

async function serviceActiveState(service = SERVICE) {
  const { stdout } = await tryRun("systemctl", ["is-active", service]);
  return stdout.trim();
}

async function stopPids(pids) {
  const unique = [...new Set(pids)].filter((pid) => pid > 1 && pid !== process.pid && pidAlive(pid));
  if (!unique.length) return;
  log(`stopping leftover pids: ${unique.join(", ")}`);
  for (const pid of unique) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* gone */
    }
  }
  const stopped = await waitFor(() => unique.every((pid) => !pidAlive(pid)), 8_000);
  if (stopped) return;
  const stuck = unique.filter(pidAlive);
  if (!stuck.length) return;
  log(`force-killing stuck pids: ${stuck.join(", ")}`);
  for (const pid of stuck) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
  await waitFor(() => stuck.every((pid) => !pidAlive(pid)), 5_000);
}

async function waitForHealth() {
  return waitFor(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return false;
      const body = await res.text();
      return body.includes('"ok":true') || body.includes('"ok": true');
    } catch {
      return false;
    }
  }, HEALTH_WAIT_MS, 500);
}

async function healthFailureDetails() {
  const [active, pid, listeners] = await Promise.all([
    serviceActiveState(),
    serviceMainPid(),
    portPids(),
  ]);
  return `${SERVICE}: ${active || "unknown"}; pid=${pid || "none"}; listeners=${listeners.join(", ") || "none"}`;
}

function readWorkerHeartbeat() {
  let db;
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(WORKER_HEARTBEAT_KEY);
    if (!row?.value) return null;
    const heartbeat = JSON.parse(String(row.value));
    const pid = Number(heartbeat.pid);
    const beatAt = Number(heartbeat.beatAt);
    const startedAt = Number(heartbeat.startedAt);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    if (!Number.isFinite(beatAt) || beatAt <= 0) return null;
    if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
    return {
      pid,
      startedAt,
      beatAt,
      stopping: !!heartbeat.stopping,
      queueRunning: !!heartbeat.queueRunning,
      pollMs: Math.max(0, Number(heartbeat.pollMs) || 0),
    };
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

async function waitForWorkerHeartbeat(workerPid, startAfter) {
  return waitFor(() => {
    const heartbeat = readWorkerHeartbeat();
    if (!heartbeat) return false;
    if (workerPid > 0 && heartbeat.pid !== workerPid) return false;
    if (heartbeat.stopping) return false;
    if (heartbeat.beatAt < startAfter) return false;
    return Date.now() - heartbeat.beatAt <= WORKER_HEARTBEAT_STALE_MS;
  }, 20_000, 500);
}

async function startDetachedFallback() {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  const out = openSync(LOG_FILE, "a");
  const child = spawn("npm", ["run", "server"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
    env: process.env,
  });
  child.unref();
  log(`started detached fallback pid=${child.pid}`);
}

async function restartSystemd() {
  log(`using systemd service ${SERVICE}`);
  const workerLoadState = await serviceLoadState(WORKER_SERVICE);
  const hasWorkerService = workerLoadState && workerLoadState !== "not-found";
  const creatorLoadState = await serviceLoadState(CREATOR_SERVICE);
  const hasCreatorService = creatorLoadState && creatorLoadState !== "not-found";
  if (hasCreatorService) {
    log(`using systemd creator ${CREATOR_SERVICE}`);
    await tryRun("sudo", ["-n", "systemctl", "stop", CREATOR_SERVICE], { timeout: 45_000 });
  }
  if (hasWorkerService) {
    log(`using systemd worker ${WORKER_SERVICE}`);
    await tryRun("sudo", ["-n", "systemctl", "stop", WORKER_SERVICE], { timeout: 45_000 });
  }
  await tryRun("sudo", ["-n", "systemctl", "stop", SERVICE], { timeout: 20_000 });
  await waitFor(async () => (await serviceMainPid()) === 0, 12_000);
  if (hasWorkerService) await waitFor(async () => (await serviceMainPid(WORKER_SERVICE)) === 0, 45_000);
  if (hasCreatorService) await waitFor(async () => (await serviceMainPid(CREATOR_SERVICE)) === 0, 45_000);
  const leftovers = [...new Set([...(await portPids()), ...repoAppPids()])];
  await stopPids(leftovers);
  await tryRun("sudo", ["-n", "systemctl", "reset-failed", SERVICE]);
  if (hasWorkerService) await tryRun("sudo", ["-n", "systemctl", "reset-failed", WORKER_SERVICE]);
  if (hasCreatorService) await tryRun("sudo", ["-n", "systemctl", "reset-failed", CREATOR_SERVICE]);
  await run("sudo", ["-n", "systemctl", "start", SERVICE], { timeout: 20_000 });
  const healthStartedAt = Date.now();
  log(`waiting up to ${Math.round(HEALTH_WAIT_MS / 1000)}s for ${HEALTH_URL}`);
  const ok = await waitForHealth();
  if (!ok) {
    const details = await healthFailureDetails();
    throw new Error(`${HEALTH_URL} did not become healthy within ${Math.round(HEALTH_WAIT_MS / 1000)}s after systemd start (${details})`);
  }
  log(`health ready after ${((Date.now() - healthStartedAt) / 1000).toFixed(1)}s`);
  const pid = await serviceMainPid();
  const active = await serviceActiveState();
  log(`${SERVICE}: ${active}; pid=${pid}`);
  if (hasWorkerService) {
    // The API performs startup migrations/indexing. Starting the worker only after health avoids
    // two fresh SQLite writers racing over the same schema and causing a restart loop.
    const workerStartAfter = Date.now();
    await run("sudo", ["-n", "systemctl", "start", WORKER_SERVICE], { timeout: 20_000 });
    const workerPid = await serviceMainPid(WORKER_SERVICE);
    const workerActive = await serviceActiveState(WORKER_SERVICE);
    const workerOk = await waitForWorkerHeartbeat(workerPid, workerStartAfter);
    if (!workerOk) throw new Error(`${WORKER_SERVICE} did not publish a fresh heartbeat`);
    const heartbeat = readWorkerHeartbeat();
    const age = heartbeat ? Date.now() - heartbeat.beatAt : null;
    log(`${WORKER_SERVICE}: ${workerActive}; pid=${workerPid}`);
    log(`generation worker heartbeat: pid=${heartbeat?.pid ?? "?"}; age=${age == null ? "?" : `${Math.round(age)}ms`}`);
  }
  if (hasCreatorService) {
    await run("sudo", ["-n", "systemctl", "start", CREATOR_SERVICE], { timeout: 20_000 });
    const creatorPid = await serviceMainPid(CREATOR_SERVICE);
    const creatorActive = await serviceActiveState(CREATOR_SERVICE);
    log(`${CREATOR_SERVICE}: ${creatorActive}; pid=${creatorPid}`);
  }
}

async function restartFallback() {
  log("systemd service is unavailable; using detached npm fallback");
  await stopPids([...(await portPids()), ...repoAppPids()]);
  await startDetachedFallback();
  const healthStartedAt = Date.now();
  log(`waiting up to ${Math.round(HEALTH_WAIT_MS / 1000)}s for ${HEALTH_URL}`);
  const ok = await waitForHealth();
  if (!ok) {
    const details = await healthFailureDetails();
    throw new Error(`${HEALTH_URL} did not become healthy within ${Math.round(HEALTH_WAIT_MS / 1000)}s after detached start (${details})`);
  }
  log(`health ready after ${((Date.now() - healthStartedAt) / 1000).toFixed(1)}s`);
}

async function main() {
  const loadState = await serviceLoadState();
  if (loadState && loadState !== "not-found") {
    await restartSystemd();
  } else {
    await restartFallback();
  }

  const listeners = await portPids();
  if (listeners.length !== 1) {
    throw new Error(`expected exactly one listener on :${PORT}, got ${listeners.join(", ") || "none"}`);
  }
  log(`ok: ${HEALTH_URL}; listener pid=${listeners[0]}`);
}

main().catch((error) => {
  console.error(`[restart] failed: ${error?.stack || error}`);
  process.exit(1);
});
