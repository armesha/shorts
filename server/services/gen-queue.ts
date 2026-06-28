import type { DatabaseSync, StatementSync } from "node:sqlite";

// Global generation queue: processes ONE video at a time across ALL users (FIFO).
// This bounds server load no matter how many people generate at once — there is never more than
// one render+encode running. Each job = N videos for one channel; jobs run head-to-tail.
// When attached to SQLite, unfinished jobs survive process restarts. A previously-running job is
// restored as queued; already-saved videos stay counted via `done`, so work resumes without replaying
// completed cards.
//
// Written as a factory (createGenQueue) so it can be unit-tested with a fresh instance and a mock
// worker; a process-wide singleton is exported for the server to use.

export type JobState = "queued" | "running" | "done" | "exhausted" | "canceled" | "error";

export interface Job {
  id: string;
  /** User who created/controls the job (polling and cancel permissions). */
  userId: number;
  /** User whose content pool is consumed. Defaults to userId for normal users. */
  ownerUserId: number;
  accountId: number;
  /** Optional content source(s) to generate from. Omitted = channel's primary source. */
  deckIds?: string[];
  total: number;
  done: number;
  state: JobState;
  error?: string;
  createdAt: number;
  endedAt?: number;
}

/** Generate ONE random video for the job's channel. Resolve "made", or "exhausted" when the
 *  deck has no unused cards left. Throw on a real failure (the job is marked error and skipped). */
export type GenWorker = (job: Job) => Promise<"made" | "exhausted">;

export interface JobStatus extends Job {
  ahead: number; // videos remaining AHEAD of this job before it starts (0 once running)
  position: number; // 0 = running/next, >0 = waiting, -1 = finished
}

export interface GenQueue {
  attachDatabase(db: DatabaseSync): void;
  initWorker(w: GenWorker): void;
  enqueue(userId: number, accountId: number, total: number, ownerUserId?: number, deckIds?: string[]): Job;
  cancelJob(id: string, userId: number, force?: boolean): boolean;
  jobStatus(id: string): JobStatus | null;
  listStatuses(userId?: number): JobStatus[];
  queuedRemainingForUser(userId: number): number;
  /** Videos still to be made for one CONTENT OWNER, counting only jobs that draw from the given
   *  decks (deck-sets overlapping `deckIds`). Used to not enqueue more than the owner's free cards. */
  queuedRemainingForOwnerDecks(ownerUserId: number, deckIds: string[]): number;
  /** Videos still to be made for one CHANNEL from the given decks. Counts exact remaining deck
   *  occurrences when a job stores a weighted deck sequence. */
  queuedRemainingForAccountDecks(accountId: number, deckIds: string[]): number;
  /** Videos still to be made for one CHANNEL (account) across its active jobs. Used so a "top up to N
   *  days" re-click doesn't stack a second batch on top of one already generating (those in-flight
   *  videos aren't in the saved-videos table yet, so they'd otherwise be counted as still missing). */
  queuedRemainingForAccount(accountId: number): number;
  /** Stop taking NEW videos/jobs; the in-flight video is allowed to finish. For graceful shutdown. */
  drain(): void;
  isDraining(): boolean;
  isRunning(): boolean;
}

const KEEP_FINISHED_MS = 120_000;

type JobRow = {
  id: string;
  user_id: number;
  owner_user_id: number;
  account_id: number;
  deck_ids: string;
  total: number;
  done: number;
  state: JobState;
  error: string | null;
  created_at: number;
  ended_at: number | null;
};

type QueueStore = {
  upsert: StatementSync;
  markRestarted: StatementSync;
  load: StatementSync;
  prune: StatementSync;
};

function parseDeckIds(raw: string | null | undefined): string[] | undefined {
  try {
    const arr = JSON.parse(String(raw || "[]"));
    if (!Array.isArray(arr)) return undefined;
    const clean = arr.map((value) => String(value || "").trim()).filter(Boolean);
    return clean.length ? clean : undefined;
  } catch {
    return undefined;
  }
}

function rowToJob(row: JobRow): Job {
  return {
    id: String(row.id),
    userId: Number(row.user_id),
    ownerUserId: Number(row.owner_user_id),
    accountId: Number(row.account_id),
    deckIds: parseDeckIds(row.deck_ids),
    total: Number(row.total) || 0,
    done: Number(row.done) || 0,
    state: row.state,
    error: row.error ?? undefined,
    createdAt: Number(row.created_at) || Date.now(),
    endedAt: row.ended_at == null ? undefined : Number(row.ended_at),
  };
}

function ensureQueueSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      owner_user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      deck_ids TEXT NOT NULL DEFAULT '[]',
      total INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at INTEGER NOT NULL,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_state_created ON generation_jobs(state, created_at);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_state ON generation_jobs(user_id, state);
    CREATE INDEX IF NOT EXISTS idx_generation_jobs_account_state ON generation_jobs(account_id, state);
  `);
}

export function createGenQueue(): GenQueue {
  const jobs = new Map<string, Job>(); // every job (incl. finished, kept briefly for status reads)
  let pending: string[] = []; // FIFO of not-yet-finished job ids; index 0 = the running/next one
  let running = false;
  let draining = false;
  let seq = 0;
  let worker: GenWorker | null = null;
  let store: QueueStore | null = null;

  function persist(job: Job): void {
    if (!store) return;
    store.upsert.run(
      job.id,
      job.userId,
      job.ownerUserId,
      job.accountId,
      JSON.stringify(job.deckIds ?? []),
      job.total,
      job.done,
      job.state,
      job.error ?? null,
      job.createdAt,
      job.endedAt ?? null,
    );
  }

  function prune(): void {
    const now = Date.now();
    for (const [id, j] of jobs) if (j.endedAt && now - j.endedAt > KEEP_FINISHED_MS) jobs.delete(id);
    store?.prune.run(now - KEEP_FINISHED_MS);
  }

  async function pump(): Promise<void> {
    if (running || !worker) return;
    running = true;
    try {
      while (pending.length) {
        if (draining) break; // shutdown: don't start a new job
        const job = jobs.get(pending[0])!;
        if (job.state === "canceled") {
          job.endedAt ??= Date.now();
          pending.shift();
          continue;
        }
        job.state = "running";
        persist(job);
        while (job.done < job.total) {
          // cast: worker() can be canceled by another request mid-await, which TS's flow analysis
          // can't see (it narrows job.state to "running" from the assignment above).
          if ((job.state as string) === "canceled" || draining) break; // soft stop AFTER the current video
          let res: "made" | "exhausted";
          try {
            res = await worker(job);
          } catch (e) {
            job.state = "error";
            job.error = (e as Error)?.message ?? "ошибка генерации";
            break;
          }
          if (res === "exhausted") {
            job.state = "exhausted";
            persist(job);
            break;
          }
          job.done++;
          persist(job);
        }
        if (draining) {
          // Interrupted by shutdown — leave the job unfinished (not falsely "done"); stop the queue.
          if (job.state === "running") job.state = "queued";
          persist(job);
          break;
        }
        if (job.state === "running") job.state = "done";
        job.endedAt = Date.now();
        persist(job);
        pending.shift();
      }
    } finally {
      running = false;
    }
  }

  function statusFor(id: string): JobStatus | null {
    const job = jobs.get(id);
    if (!job) return null;
    const position = pending.indexOf(id);
    let ahead = 0;
    for (let i = 0; i < position; i++) {
      const j = jobs.get(pending[i]);
      if (j) ahead += Math.max(0, j.total - j.done);
    }
    return { ...job, ahead, position };
  }

  return {
    attachDatabase(db) {
      ensureQueueSchema(db);
      store = {
        upsert: db.prepare(
          "INSERT INTO generation_jobs (id,user_id,owner_user_id,account_id,deck_ids,total,done,state,error,created_at,ended_at) " +
            "VALUES (?,?,?,?,?,?,?,?,?,?,?) " +
            "ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, owner_user_id=excluded.owner_user_id, " +
            "account_id=excluded.account_id, deck_ids=excluded.deck_ids, total=excluded.total, done=excluded.done, " +
            "state=excluded.state, error=excluded.error, created_at=excluded.created_at, ended_at=excluded.ended_at",
        ),
        markRestarted: db.prepare(
          "UPDATE generation_jobs SET state = 'queued', ended_at = NULL WHERE state = 'running'",
        ),
        load: db.prepare(
          "SELECT * FROM generation_jobs " +
            "WHERE state IN ('queued','running') OR (ended_at IS NOT NULL AND ended_at >= ?) " +
            "ORDER BY created_at ASC, id ASC",
        ),
        prune: db.prepare(
          "DELETE FROM generation_jobs WHERE state IN ('done','exhausted','canceled','error') AND ended_at IS NOT NULL AND ended_at < ?",
        ),
      };
      store.markRestarted.run();
      jobs.clear();
      pending = [];
      const cutoff = Date.now() - KEEP_FINISHED_MS;
      for (const row of store.load.all(cutoff) as JobRow[]) {
        const job = rowToJob(row);
        const match = /^g(\d+)-/.exec(job.id);
        if (match) seq = Math.max(seq, Number(match[1]) || 0);
        if (job.state === "running") job.state = "queued";
        jobs.set(job.id, job);
        if (job.state === "queued") pending.push(job.id);
      }
      void pump();
    },
    initWorker(w) {
      worker = w;
      void pump();
    },
    enqueue(userId, accountId, total, ownerUserId = userId, deckIds) {
      prune();
      const id = `g${++seq}-${Date.now().toString(36)}`;
      const cleanDeckIds = deckIds?.map((d) => String(d || "").trim()).filter(Boolean);
      const job: Job = {
        id,
        userId,
        ownerUserId,
        accountId,
        deckIds: cleanDeckIds?.length ? cleanDeckIds : undefined,
        total,
        done: 0,
        state: "queued",
        createdAt: Date.now(),
      };
      jobs.set(id, job);
      persist(job);
      pending.push(id);
      void pump();
      return job;
    },
    cancelJob(id, userId, force = false) {
      const job = jobs.get(id);
      if (!job || (!force && job.userId !== userId)) return false;
      if (job.state !== "queued" && job.state !== "running") return false;
      job.state = "canceled";
      job.endedAt = Date.now();
      persist(job);
      // A still-queued job is removed right away; the running head is dropped by pump after its video.
      if (pending[0] !== id) pending = pending.filter((x) => x !== id);
      return true;
    },
    jobStatus(id) {
      return statusFor(id);
    },
    listStatuses(userId) {
      prune();
      const rank: Record<JobState, number> = {
        running: 0,
        queued: 1,
        error: 2,
        exhausted: 3,
        canceled: 4,
        done: 5,
      };
      return [...jobs.values()]
        .filter((job) => userId == null || job.userId === userId)
        .map((job) => statusFor(job.id))
        .filter((job): job is JobStatus => !!job)
        .sort((a, b) => rank[a.state] - rank[b.state] || a.position - b.position || b.createdAt - a.createdAt);
    },
    queuedRemainingForUser(userId) {
      prune();
      let total = 0;
      for (const id of pending) {
        const j = jobs.get(id);
        if (!j || j.userId !== userId) continue;
        if (j.state !== "queued" && j.state !== "running") continue;
        total += Math.max(0, j.total - j.done);
      }
      return total;
    },
    queuedRemainingForOwnerDecks(ownerUserId, deckIds) {
      prune();
      const want = new Set(deckIds);
      let total = 0;
      for (const id of pending) {
        const j = jobs.get(id);
        if (!j || j.ownerUserId !== ownerUserId) continue;
        if (j.state !== "queued" && j.state !== "running") continue;
        // A job with no recorded decks, or one sharing ≥1 deck, draws from the same card pool.
        // (Cards are unique per deck, so non-overlapping deck-sets consume disjoint pools.)
        const jd = j.deckIds ?? [];
        if (jd.length && !jd.some((d) => want.has(d))) continue;
        total += Math.max(0, j.total - j.done);
      }
      return total;
    },
    queuedRemainingForAccountDecks(accountId, deckIds) {
      prune();
      const want = new Set(deckIds);
      let total = 0;
      for (const id of pending) {
        const j = jobs.get(id);
        if (!j || j.accountId !== accountId) continue;
        if (j.state !== "queued" && j.state !== "running") continue;
        const remaining = Math.max(0, j.total - j.done);
        const jd = j.deckIds ?? [];
        if (!jd.length) {
          total += remaining;
          continue;
        }
        for (let offset = 0; offset < remaining; offset += 1) {
          const deckId = jd[(j.done + offset) % jd.length];
          if (want.has(deckId)) total += 1;
        }
      }
      return total;
    },
    queuedRemainingForAccount(accountId) {
      prune();
      let total = 0;
      for (const id of pending) {
        const j = jobs.get(id);
        if (!j || j.accountId !== accountId) continue;
        if (j.state !== "queued" && j.state !== "running") continue;
        total += Math.max(0, j.total - j.done);
      }
      return total;
    },
    drain() {
      draining = true;
    },
    isDraining() {
      return draining;
    },
    isRunning() {
      return running;
    },
  };
}

// ---- process-wide singleton used by the server ----
const _queue = createGenQueue();
export const attachGenQueueDb = (db: DatabaseSync): void => _queue.attachDatabase(db);
export const initGenQueue = (w: GenWorker): void => _queue.initWorker(w);
export const enqueue = (userId: number, accountId: number, total: number, ownerUserId?: number, deckIds?: string[]): Job =>
  _queue.enqueue(userId, accountId, total, ownerUserId, deckIds);
export const cancelJob = (id: string, userId: number, force?: boolean): boolean => _queue.cancelJob(id, userId, force);
export const jobStatus = (id: string): JobStatus | null => _queue.jobStatus(id);
export const listStatuses = (userId?: number): JobStatus[] => _queue.listStatuses(userId);
export const queuedRemainingForUser = (userId: number): number => _queue.queuedRemainingForUser(userId);
export const queuedRemainingForOwnerDecks = (ownerUserId: number, deckIds: string[]): number =>
  _queue.queuedRemainingForOwnerDecks(ownerUserId, deckIds);
export const queuedRemainingForAccountDecks = (accountId: number, deckIds: string[]): number =>
  _queue.queuedRemainingForAccountDecks(accountId, deckIds);
export const queuedRemainingForAccount = (accountId: number): number => _queue.queuedRemainingForAccount(accountId);
export const drainQueue = (): void => _queue.drain();
