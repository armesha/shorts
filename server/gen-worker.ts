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
startGenQueuePolling(Number(process.env.GEN_QUEUE_POLL_MS || 1500));
console.log("[gen-worker] started");

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[gen-worker] received ${signal}; draining current video`);
  drainQueue();
  const started = Date.now();
  while (isGenQueueRunning() && Date.now() - started < 30_000) await sleep(250);
  try {
    db.db.close();
  } catch {
    /* already closed */
  }
  process.exit(0);
}

process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
