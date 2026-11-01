import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import type { Cookie } from "playwright";
import type { Db } from "../../db.ts";
import { invalidateReadCache } from "../read-cache.ts";
import { timePartsInTimeZone } from "../timezone.ts";
import type { CirclePipelineService } from "./service.ts";
import { normalizeYouTubeCookies } from "./youtube-cookie-browser.ts";
import { readCircleCaption } from "./caption.ts";

type Browser = {
  verify(cookies: Cookie[], authuser?: number): Promise<{ channelId: string }>;
  publish(cookies: Cookie[], channelId: string, file: string, title: string, description: string, onSubmit: () => void, authuser?: number): Promise<string>;
};
type Connection = { account_id: number; owner_id: number; status: string; channel_id: string | null; checked_at: string | null; error: string | null };
const TARGET_KEY = "circle.youtube-publishing.target";

export class CircleYouTubePublisher {
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private locks = new Set<number>();
  private stopped = false;
  private root: string;
  constructor(private db: Db, private pipeline: Pick<CirclePipelineService, "status" | "library">,
    private browser: Browser, root: string, private options: { now?: () => number; log?: (message: string) => void } = {}) {
    this.root = resolve(root); mkdirSync(this.root, { recursive: true, mode: 0o700 }); chmodSync(this.root, 0o700);
  }
  private path(ownerId: number, accountId: number) { return join(this.root, `${ownerId}-account-${accountId}.json`); }
  private authuser(accountId: number): number | undefined {
    const value = this.db.getSetting(`circle.youtube-authuser.${accountId}`);
    return value && /^\d{1,2}$/.test(value) ? Number(value) : undefined;
  }
  private account(ownerId: number, accountId: number) {
    const account = this.db.getAccount(accountId);
    if (!account || account.userId !== ownerId || account.platform !== "youtube") throw new Error("Канал YouTube не найден.");
    return account;
  }
  private connection(ownerId: number, accountId: number): Connection | undefined {
    return this.db.db.prepare("SELECT * FROM circle_youtube_connections WHERE account_id=? AND owner_id=?").get(accountId, ownerId) as Connection | undefined;
  }
  status(ownerId: number, accountId: number) {
    this.account(ownerId, accountId);
    const row = this.connection(ownerId, accountId);
    let enabled = false;
    try {
      const target = JSON.parse(this.db.getSetting(TARGET_KEY) || "null");
      enabled = target?.ownerId === ownerId && target?.accountId === accountId;
    } catch { /* an invalid setting cannot activate publishing */ }
    const latest = this.db.db.prepare("SELECT day_key,state,url,error FROM circle_youtube_publications WHERE account_id=? AND owner_id=? ORDER BY id DESC LIMIT 1")
      .get(accountId, ownerId) as { day_key: string; state: string; url: string | null; error: string | null } | undefined;
    return { accountId, status: row?.status || "disconnected", channelId: row?.channel_id || null,
      checkedAt: row?.checked_at || null, error: row?.error || null, enabled, latest: latest || null };
  }
  visibleStatus(viewerId: number, accountId: number) {
    const account = this.db.listVisibleAccountsByUser(viewerId).find(item => item.id === accountId);
    if (!account || account.userId == null) throw new Error("Канал не найден.");
    return this.status(account.userId, accountId);
  }
  importCookies(ownerId: number, accountId: number, input: unknown) {
    this.account(ownerId, accountId);
    if (this.locks.has(accountId)) throw new Error("Канал занят.");
    const cookies = normalizeYouTubeCookies(input);
    const path = this.path(ownerId, accountId), temp = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, JSON.stringify(cookies), { mode: 0o600, flag: "wx" }); renameSync(temp, path); }
    finally { rmSync(temp, { force: true }); }
    this.db.db.prepare("INSERT INTO circle_youtube_connections(account_id,owner_id,status) VALUES(?,?,'unchecked') ON CONFLICT(account_id) DO UPDATE SET status='unchecked',channel_id=NULL,checked_at=NULL,error=NULL")
      .run(accountId, ownerId);
    invalidateReadCache();
    return this.status(ownerId, accountId);
  }
  async verify(ownerId: number, accountId: number) {
    this.account(ownerId, accountId);
    if (this.locks.has(accountId)) throw new Error("Канал занят.");
    this.locks.add(accountId);
    try {
      const profile = await this.browser.verify(normalizeYouTubeCookies(readFileSync(this.path(ownerId, accountId), "utf8")), this.authuser(accountId));
      this.db.db.prepare("UPDATE circle_youtube_connections SET status='connected',channel_id=?,checked_at=?,error=NULL WHERE account_id=? AND owner_id=?")
        .run(profile.channelId, new Date().toISOString(), accountId, ownerId);
    } catch {
      this.db.db.prepare("UPDATE circle_youtube_connections SET status='needs_login',channel_id=NULL,checked_at=NULL,error=? WHERE account_id=? AND owner_id=?")
        .run("Не удалось подтвердить вход в YouTube Studio.", accountId, ownerId);
    } finally { this.locks.delete(accountId); invalidateReadCache(); }
    return this.status(ownerId, accountId);
  }
  configure(ownerId: number, accountId: number) {
    this.account(ownerId, accountId);
    if (this.connection(ownerId, accountId)?.status !== "connected") throw new Error("Сначала подтвердите вход в YouTube.");
    this.db.setSetting(TARGET_KEY, JSON.stringify({ ownerId, accountId }));
  }
  disable(ownerId: number, accountId: number) {
    if (this.status(ownerId, accountId).enabled) this.db.setSetting(TARGET_KEY, "");
  }
  disconnect(ownerId: number, accountId: number) {
    this.account(ownerId, accountId);
    if (this.locks.has(accountId)) throw new Error("Канал занят.");
    this.disable(ownerId, accountId);
    rmSync(this.path(ownerId, accountId), { force: true });
    this.db.db.prepare("DELETE FROM circle_youtube_connections WHERE account_id=? AND owner_id=?").run(accountId, ownerId);
    invalidateReadCache();
    return this.status(ownerId, accountId);
  }
  start() {
    this.db.db.prepare("UPDATE circle_youtube_publications SET state='needs_review',error=? WHERE state='uploading'")
      .run("Сервис перезапущен во время отправки. Проверьте канал перед повтором.");
    if (!this.timer) { this.timer = setInterval(() => void this.tick(), 10_000); this.timer.unref(); }
    void this.tick();
  }
  async tick() {
    if (this.stopped || this.active) return;
    this.active = this.work().catch(() => this.options.log?.("Не удалось подготовить публикацию YouTube."));
    try { await this.active; } finally { this.active = undefined; }
  }
  private async work() {
    const now = new Date((this.options.now || Date.now)()), local = timePartsInTimeZone(now, "Europe/Prague");
    if (local.hhmm < "16:00" || local.hhmm > "16:04") return;
    let target: { ownerId: number; accountId: number };
    try { target = JSON.parse(this.db.getSetting(TARGET_KEY) || "null"); } catch { return; }
    if (!target || !Number.isSafeInteger(target.ownerId) || !Number.isSafeInteger(target.accountId)) return;
    const account = this.account(target.ownerId, target.accountId), connection = this.connection(target.ownerId, target.accountId);
    if (!account.enabled || connection?.status !== "connected" || !connection.channel_id || this.locks.has(account.id)) return;
    const state = await this.pipeline.status(target.ownerId);
    if (!state.enabled || this.stopped) return;
    const job = state.jobs.find(item => item.day === local.day && item.slot === 0 && item.state === "ready" && item.messageId);
    if (!job || this.db.db.prepare("SELECT 1 FROM circle_youtube_publications WHERE account_id=? AND day_key=?").get(account.id, local.day)) return;
    const file = resolve(this.pipeline.library.directory(job), "video.mp4");
    if (!existsSync(file) || !lstatSync(file).isFile()) return;
    const caption = readCircleCaption(this.pipeline.library.directory(job));
    const row = this.db.db.prepare("INSERT INTO circle_youtube_publications(owner_id,account_id,day_key,circle_job_id,state,created_at) VALUES(?,?,?,?,'uploading',?) RETURNING id")
      .get(target.ownerId, account.id, local.day, job.id, now.toISOString()) as { id: number };
    let submitted = false;
    this.locks.add(account.id);
    try {
      const cookies = normalizeYouTubeCookies(readFileSync(this.path(target.ownerId, account.id), "utf8"));
      const url = await this.browser.publish(cookies, connection.channel_id, file, `${caption.title} #shorts`,
        `${caption.description}\n\n#кружочки #shorts`, () => {
          if (this.stopped || !this.db.getAccount(account.id)?.enabled || !this.status(target.ownerId, account.id).enabled) throw new Error("Публикация остановлена.");
          this.db.db.prepare("UPDATE circle_youtube_publications SET submitted_at=? WHERE id=?").run(new Date().toISOString(), row.id);
          submitted = true;
        }, this.authuser(account.id));
      const match = /^https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})$/.exec(url);
      if (!match) throw new Error("Некорректная ссылка публикации.");
      this.db.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.db.prepare("UPDATE circle_youtube_publications SET state='published',url=? WHERE id=?").run(url, row.id);
        this.db.addHistory({ accountId: account.id, platform: "youtube", platformUrl: url, youtubeId: match[1],
          title: caption.title, description: caption.description, status: "published", publishedAt: new Date().toISOString(), deck: "telegram-circles" });
        this.db.db.exec("COMMIT");
      } catch (error) { this.db.db.exec("ROLLBACK"); throw error; }
    } catch {
      const error = submitted ? "Проверьте канал: результат отправки не подтверждён. Автоматический повтор отключён." : "Отправка не началась. Проверьте вход и редактор YouTube.";
      this.db.db.prepare("UPDATE circle_youtube_publications SET state=?,error=? WHERE id=?").run(submitted ? "needs_review" : "failed", error, row.id);
    } finally { this.locks.delete(account.id); }
  }
  async close() { this.stopped = true; if (this.timer) clearInterval(this.timer); await this.active; }
}
