import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Db } from "../../db.ts";
import type { SocialService } from "../social/store.ts";
import { timePartsInTimeZone } from "../timezone.ts";
import type { CirclePipelineService } from "./service.ts";

type Target = { ownerId: number; accountId: number; platform: "instagram" | "tiktok"; slot: 1 | 2 };
const CONFIG_KEY = "circle.social-publishing.targets";

/** The explicit bindings also keep this scheduler away from unrelated channels. */
export function circleSocialTargets(db: Db): Target[] {
  try {
    const raw: unknown = JSON.parse(db.getSetting(CONFIG_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((value): value is Target => value && Number.isSafeInteger(value.ownerId) && value.ownerId > 0 &&
      Number.isSafeInteger(value.accountId) && value.accountId > 0 &&
      ((value.platform === "instagram" && value.slot === 1) || (value.platform === "tiktok" && value.slot === 2)));
  } catch { return []; }
}

/** Assign each source once and use the existing durable social queue for delivery. */
export class CircleSocialPublisher {
  private active?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(private db: Db, private pipeline: Pick<CirclePipelineService, "status" | "library">,
    private social: Pick<SocialService, "enqueueForAccount">, private outputDir: string,
    private options: { now?: () => number; log?: (message: string) => void } = {}) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 10_000);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    if (this.stopped || this.active) return;
    this.active = this.work().catch(() => this.options.log?.("Не удалось подготовить публикацию кружочка."));
    try { await this.active; } finally { this.active = undefined; }
  }
  private async work() {
    const now = new Date((this.options.now || Date.now)());
    const local = timePartsInTimeZone(now, "Europe/Prague");
    // Missed slots are not sent later or accumulated across calendar days.
    if (local.hhmm < "16:00" || local.hhmm > "16:04") return;
    for (const target of circleSocialTargets(this.db)) {
      if (this.stopped) return;
      const account = this.db.getAccount(target.accountId);
      if (!account || account.userId !== target.ownerId || account.platform !== target.platform || !account.enabled || account.status !== "connected") continue;
      const state = await this.pipeline.status(target.ownerId);
      if (!state.enabled) continue;
      const job = state.jobs.find(item => item.day === local.day && item.slot === target.slot && item.state === "ready" && item.messageId);
      if (!job) continue;
      let assignment = this.db.db.prepare("SELECT video_id FROM circle_social_assignments WHERE account_id=? AND day_key=?")
        .get(target.accountId, local.day) as { video_id: number } | undefined;
      if (!assignment) {
        const source = resolve(this.pipeline.library.directory(job), "video.mp4");
        if (!existsSync(source)) continue;
        const relative = join("circle-pipeline", "social-delivery", `u${target.ownerId}`, `${job.id}.mp4`);
        const destination = resolve(this.outputDir, relative);
        mkdirSync(resolve(destination, ".."), { recursive: true, mode: 0o700 });
        copyFileSync(source, destination);
        chmodSync(destination, 0o600);
        this.db.db.exec("BEGIN IMMEDIATE");
        try {
          if (this.db.db.prepare("SELECT 1 FROM circle_social_assignments WHERE circle_job_id=?").get(job.id)) {
            this.db.db.exec("ROLLBACK");
            continue;
          }
          const video = this.db.createVideo({ accountId: target.accountId, title: "Кружочки — случайные истории",
            text: "", bg: "", music: "", deck: "telegram-circles", videoRel: relative, imageRel: null });
          this.db.db.prepare("INSERT INTO circle_social_assignments(owner_id,account_id,day_key,circle_job_id,video_id) VALUES(?,?,?,?,?)")
            .run(target.ownerId, target.accountId, local.day, job.id, video.id);
          this.db.db.exec("COMMIT");
          assignment = { video_id: video.id };
        } catch (error) { this.db.db.exec("ROLLBACK"); throw error; }
      }
      // An existing receipt, including an uncertain or failed one, is never retried automatically.
      if (this.db.db.prepare("SELECT 1 FROM social_jobs WHERE account_id=? AND video_id=?").get(target.accountId, assignment.video_id)) continue;
      try {
        this.social.enqueueForAccount(target.ownerId, target.accountId, assignment.video_id,
          "Кружочки — случайные истории 📹 #кружочки #истории", now.toISOString());
      } catch { this.options.log?.("Не удалось поставить кружочек в очередь площадки."); }
    }
  }
  async close() { this.stopped = true; if (this.timer) clearInterval(this.timer); await this.active; }
}
