import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function activeCuttingJobs(root) {
  const base = resolve(root, "data/video-cutting");
  const active = [];
  if (!existsSync(base)) return active;
  for (const owner of readdirSync(base)) {
    if (!/^u[1-9]\d*$/.test(owner)) continue;
    for (const id of readdirSync(resolve(base, owner))) {
      if (!/^[a-f\d-]{36}$/.test(id)) continue;
      const file = resolve(base, owner, id, "job.json");
      if (!existsSync(file)) continue;
      let job;
      try {
        job = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        throw Error(`Cannot verify cutting task ${id}; restart stopped.`);
      }
      if (!["completed", "failed", "cancelled"].includes(job.status))
        active.push({
          id,
          userId: Number(owner.slice(1)),
          status: job.status,
          readyClips: job.clips?.length || 0,
          progress: job.progress || 0,
        });
    }
  }
  return active;
}
export function assertNoActiveCuttingJobs(root) {
  const active = activeCuttingJobs(root);
  if (active.length)
    throw Error(
      `Restart blocked: ${active.length} active video cutting task(s). Wait for completion; no services were stopped.`,
    );
}
