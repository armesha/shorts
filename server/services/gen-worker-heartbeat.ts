const HEARTBEAT_KEY = "generationWorker.heartbeat.v1";
const DEFAULT_STALE_MS = 12_000;

export interface GenWorkerHeartbeat {
  version: 1;
  pid: number;
  startedAt: number;
  beatAt: number;
  queueRunning: boolean;
  stopping: boolean;
  pollMs: number;
}

export interface PublicGenWorkerStatus {
  mode: "embedded" | "external";
  online: boolean;
  stale: boolean;
  ageMs: number | null;
  heartbeat: GenWorkerHeartbeat | null;
}

type SettingReader = { getSetting(key: string): string | null };
type SettingWriter = { setSetting(key: string, value: string): void };

function parseHeartbeat(raw: string | null): GenWorkerHeartbeat | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GenWorkerHeartbeat> | null;
    if (!value || value.version !== 1) return null;
    const beatAt = Number(value.beatAt);
    const startedAt = Number(value.startedAt);
    const pid = Number(value.pid);
    if (!Number.isFinite(beatAt) || beatAt <= 0) return null;
    if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return {
      version: 1,
      pid,
      startedAt,
      beatAt,
      queueRunning: !!value.queueRunning,
      stopping: !!value.stopping,
      pollMs: Math.max(0, Number(value.pollMs) || 0),
    };
  } catch {
    return null;
  }
}

export function writeGenWorkerHeartbeat(db: SettingWriter, heartbeat: GenWorkerHeartbeat): void {
  db.setSetting(HEARTBEAT_KEY, JSON.stringify(heartbeat));
}

export function readGenWorkerHeartbeat(db: SettingReader): GenWorkerHeartbeat | null {
  return parseHeartbeat(db.getSetting(HEARTBEAT_KEY));
}

export function publicGenWorkerStatus(
  db: SettingReader,
  options: { mode?: "embedded" | "external"; now?: number; staleMs?: number } = {},
): PublicGenWorkerStatus {
  const mode = options.mode ?? "embedded";
  const now = options.now ?? Date.now();
  if (mode === "embedded") return { mode, online: true, stale: false, ageMs: null, heartbeat: null };
  const heartbeat = readGenWorkerHeartbeat(db);
  const ageMs = heartbeat ? Math.max(0, now - heartbeat.beatAt) : null;
  const stale = heartbeat ? ageMs! > (options.staleMs ?? DEFAULT_STALE_MS) : true;
  return {
    mode,
    online: !!heartbeat && !stale && !heartbeat.stopping,
    stale,
    ageMs,
    heartbeat,
  };
}
