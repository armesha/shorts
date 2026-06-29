// Standalone generation queue worker. The API can run with GEN_QUEUE_RUNNER=external/0 and only
// enqueue SQLite jobs; this process polls the same DB and renders jobs one video at a time.
import { loadBaseConfig } from "./config.ts";
import { openDb } from "./db.ts";
import { makeDeckAccess } from "./services/deck-access.ts";
import { makeBuildLibraryVideo } from "./services/library-build.ts";
import { syncContentLibraryIndex } from "./services/content-library-index.ts";
import {
  attachGenQueueDb,
  drainQueue,
  initGenQueue,
  isGenQueueRunning,
  startGenQueuePolling,
} from "./services/gen-queue.ts";
import { makeGenQueueWorker } from "./services/gen-queue-worker.ts";
import { writeGenWorkerHeartbeat } from "./services/gen-worker-heartbeat.ts";

const base = loadBaseConfig();
const db = openDb(base.dbPath);

try {
  const synced = syncContentLibraryIndex(db.db);
  process.env.CONTENT_LIBRARY_SQLITE = "1";
  process.env.CONTENT_LIBRARY_DB = base.dbPath;
  console.log(`[gen-worker] SQLite library index synced: ${synced.decks} decks, ${synced.items} items.`);
} catch (err) {
  console.warn("[gen-worker] SQLite library index sync failed; falling back to JSON files.", err);
}

const deckAccess = makeDeckAccess(db, { isAdminReq: () => false, isSuperAdminReq: () => false });
const buildLibraryVideo = makeBuildLibraryVideo({
  db,
  outputDir: base.outputDir,
  builtinDeckVisibleForUser: deckAccess.builtinDeckVisibleForUser,
});

attachGenQueueDb(db.db, { recoverRunning: true });
initGenQueue(makeGenQueueWorker(db, { deckAccess, buildLibraryVideo }));
const pollMs = Number(process.env.GEN_QUEUE_POLL_MS || 1500);
const startedAt = Date.now();
startGenQueuePolling(pollMs);
console.log("[gen-worker] started");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let stopping = false;
function heartbeat(): void {
  try {
    writeGenWorkerHeartbeat(db, {
      version: 1,
      pid: process.pid,
      startedAt,
      beatAt: Date.now(),
      queueRunning: isGenQueueRunning(),
      stopping,
      pollMs,
    });
  } catch (err) {
    console.warn("[gen-worker] heartbeat write failed", err);
  }
}

heartbeat();
const heartbeatTimer = setInterval(heartbeat, Math.max(2_000, Math.min(10_000, pollMs * 2)));
heartbeatTimer.unref();

async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[gen-worker] received ${signal}; draining current video`);
  heartbeat();
  clearInterval(heartbeatTimer);
  drainQueue();
  const started = Date.now();
  while (isGenQueueRunning() && Date.now() - started < 30_000) await sleep(250);
  heartbeat();
  try {
    db.db.close();
  } catch {
    /* already closed */
  }
  process.exit(0);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
