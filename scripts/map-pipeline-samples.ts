import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { MapPipelineService } from "../server/services/map-pipeline/service.ts";

const db = new DatabaseSync(process.env.DATABASE_PATH || resolve("data/app.db"), { readOnly: true });
const owner = db.prepare("SELECT id FROM users WHERE username=?").get("armen") as { id: number } | undefined;
db.close();
if (!owner) throw new Error("Library owner is missing");
const service = new MapPipelineService({ log: console.log });
try {
  await service.samples(owner.id);
  await service.start();
  for (;;) {
    await service.tick();
    await service.idle();
    const state = await service.list(owner.id);
    if (!state.jobs.some(j => j.status === "queued" || j.status === "running")) {
      const samples = state.jobs.filter(j => j.kind === "sample");
      console.log(JSON.stringify(samples.map(j => ({ id: j.id, status: j.status, title: j.idea?.title, error: j.error }))));
      if (samples.length !== 2 || samples.some(j => j.status !== "ready")) process.exitCode = 1;
      break;
    }
  }
} finally { await service.close(); }
