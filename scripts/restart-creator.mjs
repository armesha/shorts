import { execFile as execFileCb, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.CREATOR_PORT || process.env.PORT || 8091);
const SERVICE = process.env.CREATOR_SERVICE || "shorts-creator.service";
const LOG_FILE = resolve(ROOT, "logs/creator.log");
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/creator/health`;

function log(message) {
  process.stdout.write(`[creator-restart] ${message}\n`);
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

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

function repoCreatorPids() {
  if (!existsSync("/proc")) return [];
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    const cmd = procCmdline(pid);
    if (!cmd.includes("server/creator-index.ts")) continue;
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
  log(`stopping leftover creator pids: ${unique.join(", ")}`);
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
  log(`force-killing stuck creator pids: ${stuck.join(", ")}`);
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
  }, 30_000, 500);
}

async function startDetachedFallback() {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  const out = openSync(LOG_FILE, "a");
  const child = spawn("npm", ["run", "creator:server"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, CREATOR_PORT: String(PORT) },
  });
  child.unref();
  log(`started detached fallback pid=${child.pid}`);
}

async function restartSystemd() {
  log(`using systemd service ${SERVICE}`);
  await tryRun("sudo", ["-n", "systemctl", "stop", SERVICE], { timeout: 20_000 });
  await waitFor(async () => (await serviceMainPid()) === 0, 12_000);
  const leftovers = [...new Set([...(await portPids()), ...repoCreatorPids()])];
  await stopPids(leftovers);
  await tryRun("sudo", ["-n", "systemctl", "reset-failed", SERVICE]);
  await run("sudo", ["-n", "systemctl", "start", SERVICE], { timeout: 20_000 });
  const ok = await waitForHealth();
  if (!ok) throw new Error(`${HEALTH_URL} did not become healthy after systemd start`);
  const pid = await serviceMainPid();
  const active = await serviceActiveState();
  log(`${SERVICE}: ${active}; pid=${pid}`);
}

async function restartFallback() {
  log("systemd creator service is unavailable; using detached npm fallback");
  await stopPids([...(await portPids()), ...repoCreatorPids()]);
  await startDetachedFallback();
  const ok = await waitForHealth();
  if (!ok) throw new Error(`${HEALTH_URL} did not become healthy after detached start`);
}

async function main() {
  const loadState = await serviceLoadState();
  if (loadState && loadState !== "not-found") await restartSystemd();
  else await restartFallback();

  const listeners = await portPids();
  if (listeners.length !== 1) {
    throw new Error(`expected exactly one listener on :${PORT}, got ${listeners.join(", ") || "none"}`);
  }
  log(`ok: ${HEALTH_URL}; listener pid=${listeners[0]}`);
}

main().catch((error) => {
  console.error(`[creator-restart] failed: ${error?.stack || error}`);
  process.exit(1);
});
