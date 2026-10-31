import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const Entry = z.object({ ownerId: z.number().int().positive(), messageId: z.number().int().positive(),
  verdict: z.enum(["accept", "borderline", "reject"]), checkedAt: z.string().datetime(),
  reasons: z.array(z.string().min(1).max(500)).max(100).optional() }).strict();
export type CircleHistoryEntry = z.infer<typeof Entry>;

/** Only completed reviews enter history, so interrupted checks can be retried. */
export class CircleHistory {
  private entries: CircleHistoryEntry[] = [];
  private ready?: Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly root: string;
  constructor(root = "data/output/circle-pipeline") { this.root = resolve(root); }
  private init(): Promise<void> {
    this.ready ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      let raw: string;
      try { raw = await readFile(resolve(this.root, "history.json"), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      this.entries = z.object({ version: z.literal(1), entries: z.array(Entry).max(100_000) }).strict().parse(JSON.parse(raw)).entries;
      const keys = this.entries.map(entry => `${entry.ownerId}:${entry.messageId}`);
      if (new Set(keys).size !== keys.length) throw new Error("Duplicate source history");
    })();
    return this.ready;
  }
  async excluded(ownerId: number): Promise<number[]> {
    await this.tail.catch(() => {}); await this.init();
    return this.entries.filter(entry => entry.ownerId === ownerId).map(entry => entry.messageId);
  }
  async flagged(ownerId: number): Promise<CircleHistoryEntry[]> {
    await this.tail.catch(() => {}); await this.init();
    return structuredClone(this.entries.filter(entry => entry.ownerId === ownerId && entry.verdict !== "accept").slice(-100).reverse());
  }
  record(value: CircleHistoryEntry): Promise<void> {
    const entry = Entry.parse(value);
    const result = this.tail.catch(() => {}).then(async () => {
      await this.init();
      if (this.entries.some(item => item.ownerId === entry.ownerId && item.messageId === entry.messageId))
        throw new Error("Circle source already reviewed");
      const next = [...this.entries, entry];
      const temporary = resolve(this.root, `history-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ version: 1, entries: next }), { flag: "wx", mode: 0o600 });
      await rename(temporary, resolve(this.root, "history.json"));
      this.entries = next;
    });
    this.tail = result;
    return result;
  }
}
