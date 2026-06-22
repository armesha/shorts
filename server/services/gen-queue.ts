// Global in-memory generation queue: processes ONE video at a time across ALL users (FIFO).
// This bounds server load no matter how many people generate at once — there is never more than
// one render+encode running. Each job = N videos for one channel; jobs run head-to-tail.
// Lost on restart (in-flight jobs abandoned; already-saved videos stay) — acceptable for this scale.
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
  initWorker(w: GenWorker): void;
  enqueue(userId: number, accountId: number, total: number, ownerUserId?: number, deckIds?: string[]): Job;
  cancelJob(id: string, userId: number): boolean;
  jobStatus(id: string): JobStatus | null;
  queuedRemainingForUser(userId: number): number;
  /** Videos still to be made for one CONTENT OWNER, counting only jobs that draw from the given
   *  decks (deck-sets overlapping `deckIds`). Used to not enqueue more than the owner's free cards. */
  queuedRemainingForOwnerDecks(ownerUserId: number, deckIds: string[]): number;
  /** Stop taking NEW videos/jobs; the in-flight video is allowed to finish. For graceful shutdown. */
  drain(): void;
  isDraining(): boolean;
  isRunning(): boolean;
}

const KEEP_FINISHED_MS = 120_000;

export function createGenQueue(): GenQueue {
  const jobs = new Map<string, Job>(); // every job (incl. finished, kept briefly for status reads)
  let pending: string[] = []; // FIFO of not-yet-finished job ids; index 0 = the running/next one
  let running = false;
  let draining = false;
  let seq = 0;
  let worker: GenWorker | null = null;

  function prune(): void {
    const now = Date.now();
    for (const [id, j] of jobs) if (j.endedAt && now - j.endedAt > KEEP_FINISHED_MS) jobs.delete(id);
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
            break;
          }
          job.done++;
        }
        if (draining) {
          // Interrupted by shutdown — leave the job unfinished (not falsely "done"); stop the queue.
          if (job.state === "running") job.state = "queued";
          break;
        }
        if (job.state === "running") job.state = "done";
        job.endedAt = Date.now();
        pending.shift();
      }
    } finally {
      running = false;
    }
  }

  return {
    initWorker(w) {
      worker = w;
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
        deckIds: cleanDeckIds?.length ? [...new Set(cleanDeckIds)] : undefined,
        total,
        done: 0,
        state: "queued",
        createdAt: Date.now(),
      };
      jobs.set(id, job);
      pending.push(id);
      void pump();
      return job;
    },
    cancelJob(id, userId) {
      const job = jobs.get(id);
      if (!job || job.userId !== userId) return false;
      if (job.state !== "queued" && job.state !== "running") return false;
      job.state = "canceled";
      job.endedAt = Date.now();
      // A still-queued job is removed right away; the running head is dropped by pump after its video.
      if (pending[0] !== id) pending = pending.filter((x) => x !== id);
      return true;
    },
    jobStatus(id) {
      const job = jobs.get(id);
      if (!job) return null;
      const position = pending.indexOf(id);
      let ahead = 0;
      for (let i = 0; i < position; i++) {
        const j = jobs.get(pending[i]);
        if (j) ahead += Math.max(0, j.total - j.done);
      }
      return { ...job, ahead, position };
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
export const initGenQueue = (w: GenWorker): void => _queue.initWorker(w);
export const enqueue = (userId: number, accountId: number, total: number, ownerUserId?: number, deckIds?: string[]): Job =>
  _queue.enqueue(userId, accountId, total, ownerUserId, deckIds);
export const cancelJob = (id: string, userId: number): boolean => _queue.cancelJob(id, userId);
export const jobStatus = (id: string): JobStatus | null => _queue.jobStatus(id);
export const queuedRemainingForUser = (userId: number): number => _queue.queuedRemainingForUser(userId);
export const queuedRemainingForOwnerDecks = (ownerUserId: number, deckIds: string[]): number =>
  _queue.queuedRemainingForOwnerDecks(ownerUserId, deckIds);
export const drainQueue = (): void => _queue.drain();
