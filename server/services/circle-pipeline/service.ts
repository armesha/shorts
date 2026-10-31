import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { CircleLibrary } from "./library.ts";
import { CircleHistory } from "./history.ts";
import { CircleRunner } from "./runner.ts";
import { circleSourceConfigured } from "./source.ts";

const Config = z.object({ version: z.literal(1), ownerId: z.number().int().positive().nullable(), enabled: z.boolean() }).strict();

export class CirclePipelineService {
  readonly library: CircleLibrary;
  readonly history: CircleHistory;
  private runner: Pick<CircleRunner, "runOnce">;
  private config: z.infer<typeof Config> = { version: 1, ownerId: null, enabled: false };
  private initialized?: Promise<void>;
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private mutation: Promise<unknown> = Promise.resolve();
  private nextAttempt = 0;
  private readonly root: string;
  constructor(options: { root?: string; runner?: Pick<CircleRunner, "runOnce">; log?: (message: string) => void; checkReady?: () => boolean } = {}) {
    this.root = resolve(options.root || "data/output/circle-pipeline");
    this.library = new CircleLibrary(resolve(this.root, "library"));
    this.history = new CircleHistory(this.root);
    this.runner = options.runner || new CircleRunner(this.library, this.history);
    this.log = options.log || (() => {});
    this.checkReady = options.checkReady || circleSourceConfigured;
  }
  private log: (message: string) => void;
  private checkReady: () => boolean;
  private init() {
    this.initialized ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      let text: string;
      try { text = await readFile(resolve(this.root, "config.json"), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      this.config = Config.parse(JSON.parse(text));
      if (this.config.enabled && !this.config.ownerId) throw new Error("Invalid circle schedule owner");
    })();
    return this.initialized;
  }
  private async save(config: z.infer<typeof Config>) {
    const temp = resolve(this.root, `config-${process.pid}.tmp`);
    await writeFile(temp, JSON.stringify(config), { mode: 0o600 });
    await rename(temp, resolve(this.root, "config.json"));
    this.config = config;
  }
  async status(ownerId: number) {
    await this.init();
    return { enabled: this.config.enabled && this.config.ownerId === ownerId, configured: this.checkReady(),
      running: !!this.active && this.config.ownerId === ownerId, jobs: await this.library.list(ownerId),
      flagged: await this.history.flagged(ownerId) };
  }
  async enable(ownerId: number) {
    return this.change(async () => {
      await this.init();
      if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error("Invalid owner");
      if (this.config.ownerId && this.config.ownerId !== ownerId) throw new Error("Schedule belongs to another owner");
      if (!this.checkReady()) throw new Error("Telegram source is not configured");
      await this.save({ version: 1, ownerId, enabled: true });
      this.nextAttempt = 0;
      void this.tick();
      return this.status(ownerId);
    });
  }
  async disable(ownerId: number) {
    return this.change(async () => {
      await this.init();
      if (this.config.ownerId !== ownerId) throw new Error("Schedule belongs to another owner");
      await this.save({ ...this.config, enabled: false });
      return this.status(ownerId);
    });
  }
  private change<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.mutation.catch(() => {}).then(fn);
    this.mutation = result;
    return result;
  }
  async start() {
    await this.init();
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    await this.init();
    if (!this.config.enabled || !this.config.ownerId || this.active || Date.now() < this.nextAttempt) return;
    const ownerId = this.config.ownerId;
    this.active = (async () => {
      try { await this.runner.runOnce(ownerId); this.nextAttempt = Date.now() + 60_000; }
      catch { this.nextAttempt = Date.now() + 15 * 60_000; this.log("Не удалось подготовить кружок; повторим позже."); }
    })();
    try { await this.active; } finally { this.active = undefined; }
  }
  async close() { if (this.timer) clearInterval(this.timer); this.timer = undefined; await this.active; }
}
