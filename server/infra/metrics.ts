// In-process server metrics for the admin "Сервер" page.
//
// Design goals (per the user's requirements):
//  - Near-zero cost: all samples are cheap in-process reads (os/process/statfs/sysfs), no
//    external commands, no per-request disk walks.
//  - NO database / NO disk persistence: history lives in a fixed-size in-memory ring buffer, so it
//    can never grow on disk and needs no cleanup. It simply resets when the server restarts.
//  - Portable fallback: node:os + statfs work everywhere; Linux sysfs hardware sensors are optional,
//    so moving the app from a personal PC to a VPS needs no code changes.
//
// The ring is sampled on a single light interval timer (default every 30s). Instantaneous values
// (RSS, free RAM, loadavg, uptime) are read live on each /api/system request; CPU% needs a delta so
// it reflects the last sample window; disk is cached from the sampler (free space doesn't move in 5s).

import os from "node:os";
import { readdir, readFile, statfs } from "node:fs/promises";
import { basename, join } from "node:path";

export type TaskKind = "render" | "upload";

/** One point stored in the history ring — kept tiny on purpose (a few numbers). */
export interface HistoryPoint {
  t: number; // epoch ms
  cpu: number; // CPU % over the sample window (0..100)
  memPct: number; // system RAM used %
  rssMb: number; // this process RSS, MB
  diskPct: number; // used % on the data partition
  tempC: number | null; // selected hardware temperature, °C
}

export interface TemperatureSensor {
  kind: "cpu" | "gpu" | "system" | "other";
  label: string;
  tempC: number;
}

export interface HardwareSnapshot {
  tempC: number | null;
  tempLabel: string | null;
  cpuTempC: number | null;
  gpuTempC: number | null;
  fanRpm: number | null;
  sensors: TemperatureSensor[];
}

const SAMPLE_MS = 30_000; // sample cadence — 30s keeps memory tiny and load invisible
const RING_MAX = Math.ceil((24 * 60 * 60 * 1000) / SAMPLE_MS); // ~24h of points (2880)

// ---- Live counters: how many heavy tasks are running right now ----
const active: Record<TaskKind, number> = { render: 0, upload: 0 };

/** Run `fn` while counting it as an active task of `kind`; always decrements (even on throw). */
export async function track<T>(kind: TaskKind, fn: () => Promise<T>): Promise<T> {
  active[kind]++;
  try {
    return await fn();
  } finally {
    active[kind]--;
  }
}
export function activeCounts(): Record<TaskKind, number> {
  return { ...active };
}

// ---- Scheduler heartbeat: proof the per-minute cron is alive + when it last posted ----
let lastSchedulerTickAt: number | null = null;
let lastPostAt: number | null = null;
export function noteSchedulerTick(): void {
  lastSchedulerTickAt = Date.now();
}
export function notePost(): void {
  lastPostAt = Date.now();
}

// ---- CPU sampling (needs a delta between two readings of cumulative CPU times) ----
function cpuTotals(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}
let prevCpu = cpuTotals();
let lastCpuPct = 0;

// ---- Disk (cached from the sampler — statfs is cheap but no need to hit it on every 5s poll) ----
let lastDisk = { usedPct: 0, freeBytes: 0, totalBytes: 0 };
async function readDisk(path: string): Promise<typeof lastDisk> {
  try {
    const s = await statfs(path);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { usedPct: total ? ((total - free) / total) * 100 : 0, freeBytes: free, totalBytes: total };
  } catch {
    return lastDisk; // keep last good reading on error
  }
}

// ---- Hardware sensors (Linux sysfs; cached by the sampler, never runs external commands) ----
let lastHardware: HardwareSnapshot = {
  tempC: null,
  tempLabel: null,
  cpuTempC: null,
  gpuTempC: null,
  fanRpm: null,
  sensors: [],
};

async function readText(path: string): Promise<string | null> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return null;
  }
}

function parseSysfsTemp(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const c = Math.abs(n) > 1000 ? n / 1000 : n;
  if (c < -50 || c > 150) return null;
  return Math.round(c * 10) / 10;
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function sensorKind(name: string, label: string): TemperatureSensor["kind"] {
  const s = `${name} ${label}`.toLowerCase();
  if (/(coretemp|k10temp|cpu|package|x86_pkg|tctl|tdie|processor)/.test(s)) return "cpu";
  if (/(amdgpu|radeon|nouveau|nvidia|gpu|edge|junction|mem)/.test(s)) return "gpu";
  if (/(acpi|acpitz|pch|system|motherboard|board)/.test(s)) return "system";
  return "other";
}

function tempPriority(sensor: TemperatureSensor): number {
  const label = sensor.label.toLowerCase();
  const kindBase = sensor.kind === "cpu" ? 0 : sensor.kind === "gpu" ? 20 : sensor.kind === "system" ? 40 : 60;
  const labelBoost = /(package|tctl|tdie|x86_pkg|junction|edge)/.test(label) ? -5 : 0;
  return kindBase + labelBoost;
}

async function readHwmonSensors(): Promise<{ sensors: TemperatureSensor[]; fanRpm: number | null }> {
  let dirs: string[] = [];
  try {
    dirs = await readdir("/sys/class/hwmon");
  } catch {
    return { sensors: [], fanRpm: null };
  }

  const sensors: TemperatureSensor[] = [];
  const fans: number[] = [];
  await Promise.all(
    dirs.map(async (dir) => {
      const base = join("/sys/class/hwmon", dir);
      const name = (await readText(join(base, "name"))) || dir;
      let files: string[] = [];
      try {
        files = await readdir(base);
      } catch {
        return;
      }

      await Promise.all(
        files
          .filter((file) => /^temp\d+_input$/.test(file))
          .map(async (file) => {
            const idx = file.match(/^temp(\d+)_input$/)?.[1];
            const tempC = parseSysfsTemp(await readText(join(base, file)));
            if (tempC == null || !idx) return;
            const label = (await readText(join(base, `temp${idx}_label`))) || name;
            sensors.push({ kind: sensorKind(name, label), label: `${name}: ${label}`, tempC });
          }),
      );

      await Promise.all(
        files
          .filter((file) => /^fan\d+_input$/.test(file))
          .map(async (file) => {
            const rpm = parsePositiveInt(await readText(join(base, file)));
            if (rpm != null) fans.push(rpm);
          }),
      );
    }),
  );

  return { sensors, fanRpm: fans.length ? Math.max(...fans) : null };
}

async function readThermalZoneSensors(): Promise<TemperatureSensor[]> {
  let dirs: string[] = [];
  try {
    dirs = await readdir("/sys/class/thermal");
  } catch {
    return [];
  }

  const sensors: TemperatureSensor[] = [];
  await Promise.all(
    dirs
      .filter((dir) => dir.startsWith("thermal_zone"))
      .map(async (dir) => {
        const base = join("/sys/class/thermal", dir);
        const label = (await readText(join(base, "type"))) || basename(dir);
        const tempC = parseSysfsTemp(await readText(join(base, "temp")));
        if (tempC == null) return;
        sensors.push({ kind: sensorKind(label, label), label, tempC });
      }),
  );
  return sensors;
}

function pickTemp(sensors: TemperatureSensor[], kind: TemperatureSensor["kind"]): TemperatureSensor | null {
  const scoped = sensors.filter((sensor) => sensor.kind === kind);
  if (!scoped.length) return null;
  return scoped.sort((a, b) => tempPriority(a) - tempPriority(b) || b.tempC - a.tempC)[0] ?? null;
}

async function readHardware(): Promise<HardwareSnapshot> {
  const [{ sensors: hwmonSensors, fanRpm }, thermalSensors] = await Promise.all([
    readHwmonSensors(),
    readThermalZoneSensors(),
  ]);
  const sensors = [...hwmonSensors, ...thermalSensors]
    .sort((a, b) => tempPriority(a) - tempPriority(b) || b.tempC - a.tempC)
    .slice(0, 12);
  const cpu = pickTemp(sensors, "cpu");
  const gpu = pickTemp(sensors, "gpu");
  const selected = cpu || gpu || sensors[0] || null;
  return {
    tempC: selected?.tempC ?? null,
    tempLabel: selected?.label ?? null,
    cpuTempC: cpu?.tempC ?? null,
    gpuTempC: gpu?.tempC ?? null,
    fanRpm,
    sensors,
  };
}

function memUsedPct(): number {
  const total = os.totalmem();
  return total ? ((total - os.freemem()) / total) * 100 : 0;
}

// ---- History ring + sampler ----
const ring: HistoryPoint[] = [];
let sampler: ReturnType<typeof setInterval> | null = null;

export function startSampler(diskPath: string): void {
  if (sampler) return; // idempotent
  prevCpu = cpuTotals();
  void readDisk(diskPath).then((d) => {
    lastDisk = d;
  });
  void readHardware().then((h) => {
    lastHardware = h;
  });

  const sample = async () => {
    const cur = cpuTotals();
    const idleDelta = cur.idle - prevCpu.idle;
    const totalDelta = cur.total - prevCpu.total;
    prevCpu = cur;
    lastCpuPct = totalDelta > 0 ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) : 0;
    const [disk, hardware] = await Promise.all([readDisk(diskPath), readHardware()]);
    lastDisk = disk;
    lastHardware = hardware;
    ring.push({
      t: Date.now(),
      cpu: Math.round(lastCpuPct),
      memPct: Math.round(memUsedPct()),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      diskPct: Math.round(lastDisk.usedPct),
      tempC: lastHardware.tempC,
    });
    while (ring.length > RING_MAX) ring.shift();
  };

  sampler = setInterval(sample, SAMPLE_MS);
  // Don't let the metrics timer keep the process alive on shutdown.
  if (typeof sampler.unref === "function") sampler.unref();
}

/** Current live snapshot + the full history ring. Synchronous & cheap (disk is cached). */
export function snapshot() {
  const mu = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    now: {
      uptimeSec: Math.round(process.uptime()),
      cpuPct: Math.round(lastCpuPct), // averaged over the last sample window
      loadavg: os.loadavg(), // [1m,5m,15m] — returns [0,0,0] on Windows (handled on the UI)
      cpuCount: os.cpus().length,
      rssMb: Math.round(mu.rss / 1048576),
      heapMb: Math.round(mu.heapUsed / 1048576),
      memUsedMb: Math.round((totalMem - freeMem) / 1048576),
      memTotalMb: Math.round(totalMem / 1048576),
      memPct: Math.round(totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0),
      diskFreeMb: Math.round(lastDisk.freeBytes / 1048576),
      diskTotalMb: Math.round(lastDisk.totalBytes / 1048576),
      diskPct: Math.round(lastDisk.usedPct),
      platform: process.platform,
      nodeVersion: process.version,
      sampleSec: SAMPLE_MS / 1000,
    },
    hardware: lastHardware,
    active: { ...active },
    scheduler: { lastTickAt: lastSchedulerTickAt, lastPostAt },
    history: ring.slice(),
  };
}
