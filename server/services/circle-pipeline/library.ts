import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { claimCircleSlot, type CircleScheduleEntry } from "./schedule.ts";

const JobSchema = z.object({
  id: z.string().uuid(), ownerId: z.number().int().positive(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.union([z.literal(0), z.literal(1)]), state: z.enum(["queued", "running", "ready", "failed"]),
  createdAt: z.string().datetime(), messageId: z.number().int().positive().optional(),
  error: z.string().max(500).optional(),
}).strict();
export type CircleLibraryJob = z.infer<typeof JobSchema>;

/** One instance owns one private on-disk library; all mutations are serialized. */
export class CircleLibrary {
  private jobs: CircleLibraryJob[] = [];
  private initialized?: Promise<void>;
  private mutation: Promise<unknown> = Promise.resolve();
  readonly root: string;
  constructor(root = "data/output/circle-pipeline/library") { this.root = resolve(root); }
  private async init() {
    this.initialized ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      let data: string;
      try { data = await readFile(resolve(this.root, "state.json"), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      const state = z.object({ version: z.literal(1), jobs: z.array(JobSchema).max(100_000) }).strict().parse(JSON.parse(data));
      const identities = new Set<string>();
      const ids = new Set<string>();
      for (const job of state.jobs) {
        const key = `${job.ownerId}:${job.day}:${job.slot}`;
        if (identities.has(key) || ids.has(job.id)) throw new Error("Duplicate circle library job");
        identities.add(key); ids.add(job.id);
        if (job.state === "running" || job.state === "queued") {
          job.state = "failed"; job.error = "Работа прервана перезапуском.";
        }
      }
      this.jobs = state.jobs;
      await this.save();
    })();
    return this.initialized;
  }
  private async save() {
    const temporary = resolve(this.root, `state-${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify({ version: 1, jobs: this.jobs }), { mode: 0o600, flag: "wx" });
    await rename(temporary, resolve(this.root, "state.json"));
  }
  private change<T>(fn: () => Promise<T>): Promise<T> {
    const operation = this.mutation.catch(() => {}).then(async () => { await this.init(); return fn(); });
    this.mutation = operation;
    return operation;
  }
  async list(ownerId: number): Promise<CircleLibraryJob[]> {
    await this.mutation.catch(() => {}); await this.init();
    return structuredClone(this.jobs.filter(job => job.ownerId === ownerId).reverse());
  }
  directory(job: Pick<CircleLibraryJob, "ownerId" | "id">): string {
    if (!Number.isSafeInteger(job.ownerId) || job.ownerId <= 0 || !z.string().uuid().safeParse(job.id).success)
      throw new Error("Invalid circle library path");
    return resolve(this.root, `u${job.ownerId}`, job.id);
  }
  async claim(ownerId: number, now = Date.now()): Promise<CircleLibraryJob | null> {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error("Invalid owner");
    return this.change(async () => {
      const entries: CircleScheduleEntry[] = this.jobs.filter(job => job.ownerId === ownerId)
        .map(({ day, slot, state }) => ({ day, slot, state }));
      const entry = claimCircleSlot(entries, now);
      if (!entry) return null;
      let job = this.jobs.find(item => item.ownerId === ownerId && item.day === entry.day && item.slot === entry.slot);
      if (job) { job.state = "queued"; delete job.error; }
      else {
        job = { id: randomUUID(), ownerId, ...entry, createdAt: new Date(now).toISOString() };
        this.jobs.push(job);
      }
      await this.save();
      return structuredClone(job);
    });
  }
  async update(ownerId: number, id: string, state: "running" | "ready" | "failed", detail: {
    messageId?: number; error?: string;
  } = {}): Promise<void> {
    await this.change(async () => {
      const job = this.jobs.find(item => item.ownerId === ownerId && item.id === id);
      if (!job || (state === "running" ? job.state !== "queued" : job.state !== "running"))
        throw new Error("Invalid circle job transition");
      if (state === "ready" && !(detail.messageId || job.messageId)) throw new Error("Ready job needs source");
      if (detail.messageId !== undefined && (!Number.isSafeInteger(detail.messageId) || detail.messageId <= 0))
        throw new Error("Invalid source message");
      job.state = state;
      if (detail.messageId) job.messageId = detail.messageId;
      if (detail.error) job.error = detail.error.slice(0, 500);
      await this.save();
    });
  }
}
