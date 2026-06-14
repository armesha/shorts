// Global in-memory generation queue: processes ONE video at a time across ALL users (FIFO).
// This bounds server load no matter how many people generate at once — there is never more than
// one render+encode running. Each job = N videos for one channel; jobs run head-to-tail.
// Lost on restart (in-flight jobs abandoned; already-saved videos stay) — acceptable for this scale.

export type JobState = "queued" | "running" | "done" | "exhausted" | "canceled" | "error";

export interface Job {
  id: string;
  userId: number;
  accountId: number;
  total: number;
  done: number;
  state: JobState;
  error?: string;
  createdAt: number;
  endedAt?: number;
}

/** Generate ONE random video for the job's channel. Resolve "made", or "exhausted" when the
 *  deck has no unused cards left. Throw on a real failure (the job is marked error and skipped). */
type Worker = (job: Job) => Promise<"made" | "exhausted">;

const jobs = new Map<string, Job>(); // every job (incl. finished, kept briefly so clients read final state)
let pending: string[] = []; // FIFO of not-yet-finished job ids; index 0 = the running/next one
let running = false;
let seq = 0;
let worker: Worker | null = null;
const KEEP_FINISHED_MS = 120_000;

export function initGenQueue(w: Worker): void {
  worker = w;
}

function prune(): void {
  const now = Date.now();
  for (const [id, j] of jobs) if (j.endedAt && now - j.endedAt > KEEP_FINISHED_MS) jobs.delete(id);
}

export function enqueue(userId: number, accountId: number, total: number): Job {
  prune();
  const id = `g${++seq}-${Date.now().toString(36)}`;
  const job: Job = { id, userId, accountId, total, done: 0, state: "queued", createdAt: Date.now() };
  jobs.set(id, job);
  pending.push(id);
  void pump();
  return job;
}

export function cancelJob(id: string, userId: number): boolean {
  const job = jobs.get(id);
  if (!job || job.userId !== userId) return false;
  if (job.state !== "queued" && job.state !== "running") return false;
  job.state = "canceled";
  job.endedAt = Date.now();
  // Running job (head) is left for the pump loop to drop after the current video; a still-queued
  // job is removed right away so it never starts.
  if (pending[0] !== id) pending = pending.filter((x) => x !== id);
  return true;
}

export interface JobStatus extends Job {
  ahead: number; // videos remaining AHEAD of this job before it starts (0 once running)
  position: number; // 0 = running/next, >0 = waiting, -1 = finished
}

export function jobStatus(id: string): JobStatus | null {
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

async function pump(): Promise<void> {
  if (running || !worker) return;
  running = true;
  try {
    while (pending.length) {
      const job = jobs.get(pending[0])!;
      if (job.state === "canceled") {
        job.endedAt ??= Date.now();
        pending.shift();
        continue;
      }
      job.state = "running";
      while (job.done < job.total) {
        if (job.state === "canceled") break; // soft stop AFTER the current video
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
      if (job.state === "running") job.state = "done";
      job.endedAt = Date.now();
      pending.shift();
    }
  } finally {
    running = false;
  }
}
