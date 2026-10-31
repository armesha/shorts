import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Db } from "../../db.ts";
import type { SocialService } from "../social/store.ts";
import { DAY_MS } from "./schedule.ts";
import { MapPipelineService, type MapJob } from "./service.ts";
import { VIDEO_SECONDS } from "./theme.ts";

type Binding = { owner_id: number; account_id: number; enabled: number };
type Publication = { id: number; map_job_id: string; account_id: number; owner_id: number; day_key: string; state: string; caption: string; created_at: string; submitted_at: string | null; published_at: string | null; url: string | null; error: string | null; cleaned_at: string | null };
export type MapDelivery = Pick<SocialService, "publishMapFile" | "confirmMapPublication">;

export function mapLibraryOwners(db: Db, viewerId: number): number[] {
  return (db.db.prepare(`SELECT b.owner_id FROM map_publication_bindings b JOIN accounts a ON a.id=b.account_id AND a.user_id=b.owner_id
    WHERE b.owner_id=? OR EXISTS(SELECT 1 FROM account_viewers av WHERE av.account_id=a.id AND av.user_id=?)`).all(viewerId, viewerId) as { owner_id: number }[]).map(r => r.owner_id);
}

export class MapPublisher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private active: Promise<void> | undefined;
  private stopped = false;
  private initialized = false;
  constructor(private db: Db, private pipeline: MapPipelineService, private delivery: MapDelivery, private options: { now?: () => number; log?: (message: string) => void } = {}) {}
  private now() { return (this.options.now || Date.now)(); }
  configure(ownerId: number, accountId: number, enabled: boolean) {
    const account = this.db.getAccount(accountId);
    if (!account || account.userId !== ownerId || account.platform !== "tiktok") throw new Error("Выберите собственный TikTok-канал.");
    if (enabled && this.db.db.prepare("SELECT status FROM social_channel_connections WHERE account_id=? AND user_id=?").get(accountId, ownerId)?.status !== "connected") throw new Error("Сначала подтвердите вход в канал.");
    if (enabled) this.db.db.prepare("UPDATE map_publications SET day_key='removed-'||id||'-'||day_key WHERE owner_id=? AND account_id=? AND state='removed' AND day_key NOT LIKE 'removed-%'").run(ownerId, accountId);
    this.db.db.prepare("INSERT INTO map_publication_bindings(owner_id,account_id,enabled) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET account_id=excluded.account_id,enabled=excluded.enabled").run(ownerId, accountId, enabled ? 1 : 0);
  }
  info(viewerId: number) {
    const owners = [viewerId, ...mapLibraryOwners(this.db, viewerId)];
    const rows = this.db.db.prepare("SELECT b.*,a.channel_name,a.social_handle,c.status AS connection_status FROM map_publication_bindings b JOIN accounts a ON a.id=b.account_id LEFT JOIN social_channel_connections c ON c.account_id=a.id").all() as any[];
    return rows.filter(r => owners.includes(r.owner_id)).map(r => ({ accountId: r.account_id, name: r.channel_name, handle: r.social_handle, enabled: !!r.enabled, connectionStatus: r.connection_status }));
  }
  async recordRemoval(ownerId: number, jobId: string) {
    const row = this.db.db.prepare("SELECT * FROM map_publications WHERE owner_id=? AND map_job_id=? AND state IN ('published','removed')").get(ownerId, jobId) as Publication | undefined;
    if (!row?.url) throw new Error("Подтверждённая публикация не найдена.");
    this.db.db.prepare("UPDATE map_publications SET state='removed' WHERE id=?").run(row.id);
    await this.pipeline.notePublication(ownerId, jobId, { state: "removed", url: row.url, ...(row.cleaned_at ? { cleanedAt: row.cleaned_at } : {}) });
    this.db.db.prepare("UPDATE history SET status='deleted' WHERE account_id=? AND platform_url=?").run(row.account_id, row.url);
  }
  async start() {
    if (!this.initialized) {
      this.db.db.prepare("UPDATE map_publications SET state='needs_review',error='Сервис был перезапущен во время отправки. Проверьте профиль.' WHERE state='uploading'").run();
      this.initialized = true;
    }
    if (!this.timer) { this.timer = setInterval(() => { void this.tick().catch(() => this.options.log?.("[map-publish] Ошибка обработки публикации.")); }, 30_000); this.timer.unref(); }
    // Remote uploads must not hold the API's readiness hook open.
    void this.tick().catch(() => this.options.log?.("[map-publish] Ошибка первого прохода очереди."));
  }
  async tick() {
    if (this.stopped || this.active) return;
    this.active = this.work();
    try { await this.active; } finally { this.active = undefined; }
  }
  private async work() {
    const bindings = this.db.db.prepare("SELECT * FROM map_publication_bindings").all() as Binding[];
    for (const binding of bindings) {
      if (this.stopped) return;
      const state = await this.pipeline.list(binding.owner_id);
      if (this.stopped) return;
      const withinDates = !!state.campaign && this.now() < Date.parse(state.campaign.endsAt);
      // Reconciliation never clicks Post; it also completes a cleanup interrupted by a restart.
      const receipts = this.db.db.prepare("SELECT * FROM map_publications WHERE owner_id=? AND account_id=? ORDER BY id").all(binding.owner_id, binding.account_id) as Publication[];
      for (const receipt of receipts) {
        if (receipt.state === "checking" && receipt.url && withinDates) await this.confirm(receipt);
        else if (receipt.state === "checking" && !withinDates) {
          receipt.state = "needs_review"; receipt.error = "Срок расписания завершён. Проверьте публикацию; файлы сохранены.";
          this.db.db.prepare("UPDATE map_publications SET state='needs_review',error=? WHERE id=?").run(receipt.error, receipt.id);
          await this.pipeline.notePublication(receipt.owner_id, receipt.map_job_id, { state: "needs_review", ...(receipt.url ? { url: receipt.url } : {}), error: receipt.error });
        }
        else if (receipt.state === "published" && !receipt.cleaned_at && receipt.url) await this.cleanup(receipt);
        else if (receipt.state === "needs_review") await this.pipeline.notePublication(receipt.owner_id, receipt.map_job_id, { state: "needs_review", ...(receipt.url ? { url: receipt.url } : {}), error: receipt.error || "Проверьте результат в TikTok." });
      }
      const campaign = state.campaign;
      if (!binding.enabled) continue;
      if (!campaign || campaign.stoppedAt || this.now() >= Date.parse(campaign.endsAt) || this.now() < Date.parse(campaign.startedAt)) continue;
      const unresolved = this.db.db.prepare("SELECT id FROM map_publications WHERE account_id=? AND state IN ('uploading','checking','needs_review') LIMIT 1").get(binding.account_id);
      if (unresolved) continue;
      const last = this.db.db.prepare("SELECT COALESCE(published_at,submitted_at,created_at) AS created_at FROM map_publications WHERE account_id=? AND state!='removed' ORDER BY id DESC LIMIT 1").get(binding.account_id) as { created_at: string } | undefined;
      if (last && this.now() - Date.parse(last.created_at) < DAY_MS) continue;
      const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(this.now());
      if (this.db.db.prepare("SELECT id FROM map_publications WHERE account_id=? AND day_key=?").get(binding.account_id, day)) continue;
      const job = state.jobs.slice().reverse().find(j => j.ownerId === binding.owner_id && j.status === "ready" && j.formatVersion === 2 && j.seconds === VIDEO_SECONDS && !this.db.db.prepare("SELECT id FROM map_publications WHERE map_job_id=?").get(j.id));
      if (!job) continue;
      await this.publish(binding, job, day, Date.parse(campaign.endsAt));
    }
  }
  private async publish(binding: Binding, job: MapJob, day: string, endsAt: number) {
    const directory = this.pipeline.directory(job);
    const metadata = JSON.parse(await readFile(resolve(directory, "metadata.json"), "utf8"));
    const caption = `${job.idea?.title || "Карта мира"}\nДанные: Всемирный банк, ${metadata.metric?.year || 2023}; перевод, округление; ≈ — региональная оценка.\n${metadata.source}\nCarefree — Kevin MacLeod (incompetech.com), CC BY 4.0.\nhttps://creativecommons.org/licenses/by/4.0/\n#карты #география #странымира`;
    const time = new Date(this.now()).toISOString();
    const row = this.db.db.prepare("INSERT INTO map_publications(map_job_id,account_id,owner_id,day_key,state,caption,created_at) VALUES(?,?,?,?,'uploading',?,?) RETURNING *").get(job.id, binding.account_id, binding.owner_id, day, caption, time) as Publication;
    await this.pipeline.notePublication(row.owner_id, row.map_job_id, { state: "uploading" });
    let submitted = false;
    try {
      const url = await this.delivery.publishMapFile(row.owner_id, row.account_id, resolve(directory, "video.mp4"), caption, () => {
        const enabled = this.db.db.prepare("SELECT enabled FROM map_publication_bindings WHERE owner_id=? AND account_id=?").get(row.owner_id, row.account_id)?.enabled;
        if (this.now() >= endsAt || this.stopped || !enabled || !this.pipeline.allowsPublication(row.owner_id, this.now())) throw new Error("Срок публикации завершён или отправка остановлена.");
        // Persist uncertainty before the browser clicks Post.
        this.db.db.prepare("UPDATE map_publications SET submitted_at=? WHERE id=?").run(new Date(this.now()).toISOString(), row.id);
        submitted = true;
      });
      if (!/^https:\/\/www\.tiktok\.com\/@[a-zA-Z0-9_.]+\/video\/\d+$/.test(url)) throw new Error("Ссылка TikTok не подтверждена.");
      this.db.db.prepare("UPDATE map_publications SET state='checking',url=? WHERE id=?").run(url, row.id);
      row.state = "checking"; row.url = url;
      await this.confirm(row);
    } catch {
      const uncertain = submitted || row.state === "checking";
      const error = uncertain ? "Проверьте профиль TikTok: результат отправки не подтверждён. Повтор отключён, файлы сохранены." : "Отправка не началась. Проверьте вход и доступность редактора TikTok. Файлы сохранены.";
      this.db.db.prepare("UPDATE map_publications SET state=?,error=? WHERE id=? AND state!='published'").run(uncertain ? "needs_review" : "failed", error, row.id);
      const current = this.db.db.prepare("SELECT state FROM map_publications WHERE id=?").get(row.id) as { state: string };
      if (current.state !== "published") await this.pipeline.notePublication(row.owner_id, row.map_job_id, { state: uncertain ? "needs_review" : "failed", ...(row.url ? { url: row.url } : {}), error });
    }
  }
  private async confirm(row: Publication) {
    if (!row.url || !await this.delivery.confirmMapPublication(row.owner_id, row.account_id, row.url)) {
      await this.pipeline.notePublication(row.owner_id, row.map_job_id, { state: "needs_review", ...(row.url ? { url: row.url } : {}), error: "TikTok принял отправку; ждём подтверждения страницы публикации. Файлы сохраняются." });
      return;
    }
    const time = new Date(this.now()).toISOString();
    const job = (await this.pipeline.list(row.owner_id)).jobs.find(j => j.id === row.map_job_id)!;
    this.db.db.exec("BEGIN");
    try {
      const updated = this.db.db.prepare("UPDATE map_publications SET state='published',published_at=?,error=NULL WHERE id=? AND state='checking' RETURNING id").get(time, row.id);
      if (updated) this.db.addHistory({ accountId: row.account_id, platform: "tiktok", platformUrl: row.url, title: job.idea?.title || "Карта мира", description: row.caption, status: "published", publishedAt: time });
      this.db.db.exec("COMMIT");
    } catch (error) { this.db.db.exec("ROLLBACK"); throw error; }
    row.state = "published"; row.published_at = time;
    await this.cleanup(row);
  }
  private async cleanup(row: Publication) {
    if (row.state !== "published" || !row.url) return;
    await this.pipeline.notePublication(row.owner_id, row.map_job_id, { state: "published", url: row.url });
    await this.pipeline.removePublishedMedia(row.owner_id, row.map_job_id);
    this.db.db.prepare("UPDATE map_publications SET cleaned_at=? WHERE id=? AND state='published' AND url IS NOT NULL").run(new Date(this.now()).toISOString(), row.id);
  }
  async close() { this.stopped = true; if (this.timer) clearInterval(this.timer); await this.active; }
}
