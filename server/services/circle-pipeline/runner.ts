import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { CircleLibrary } from "./library.ts";
import { CircleHistory } from "./history.ts";
import { fetchCircleCandidate } from "./source.ts";
import { processCircleCandidate } from "./process.ts";
import { UnreliableCircleSpeechError } from "./transcribe.ts";

export class CircleRunner {
  private active = false;
  constructor(private library: CircleLibrary, private history: CircleHistory,
    private deps: { fetch?: typeof fetchCircleCandidate; process?: typeof processCircleCandidate } = {}) {}

  async runOnce(ownerId: number, now = Date.now()): Promise<boolean> {
    if (this.active) return false;
    this.active = true;
    try {
      const job = await this.library.claim(ownerId, now);
      if (!job) return false;
      let ready = false;
      try {
        await this.library.update(ownerId, job.id, "running");
        const excluded = new Set(await this.history.excluded(ownerId));
        for (const item of await this.library.list(ownerId)) if (item.messageId) excluded.add(item.messageId);
        const dir = this.library.directory(job);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        let before = 0;
        for (let index = 0; index < 40; index++) {
          const batch = await (this.deps.fetch ?? fetchCircleCandidate)({ directory: resolve(dir, "sources"), before, exclude: [...excluded] });
          if (!batch.items.length) {
            if (!batch.nextBefore || batch.nextBefore === before) break;
            before = batch.nextBefore;
            continue;
          }
          const source = batch.items[0];
          let result: Awaited<ReturnType<typeof processCircleCandidate>>;
          try {
            result = await (this.deps.process ?? processCircleCandidate)({ source: source.file,
              directory: resolve(dir, "attempts", randomUUID()), messageId: source.id });
          } catch (error) {
            if (!(error instanceof UnreliableCircleSpeechError)) throw error;
            result = { verdict: "borderline", reasons: ["Не удалось надёжно распознать речь."] };
          }
          if (result.verdict === "accept") {
            if (!result.video) throw new Error("Accepted video is missing");
            await rename(result.video, resolve(dir, "video.mp4"));
            await this.library.update(ownerId, job.id, "ready", { messageId: source.id });
            ready = true;
          }
          await this.history.record({ ownerId, messageId: source.id, verdict: result.verdict,
            checkedAt: new Date().toISOString(), reasons: result.reasons?.slice(0, 100) });
          excluded.add(source.id);
          if (ready) return true;
          before = batch.nextBefore;
        }
        throw new Error("Не найден подходящий кружок.");
      } catch (error) {
        if (!ready) await this.library.update(ownerId, job.id, "failed", { error: "Не удалось подготовить видео; задача будет повторена." });
        throw error;
      }
    } finally { this.active = false; }
  }
}
