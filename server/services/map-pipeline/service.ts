import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, stat, rm, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { RateLimitError, withGlobalRenderSlot } from "../../infra/rate-limits.ts";
import * as metrics from "../../infra/metrics.ts";
import { claimDay, createCampaign, recoverCampaign, validateCampaign, type MapCampaign } from "./schedule.ts";
import { planMapIdea, type MapIdea } from "./planner.ts";
import { METRICS, fetchMetric, loadMapInputs, mapObservations } from "./sources.ts";
import { buildMapTheme, BANNER_SLOT } from "./theme.ts";
import { renderMapVideo } from "./render.ts";

const JobSchema = z.object({
  id: z.string().uuid(), ownerId: z.number().int().positive(), kind: z.enum(["sample", "daily"]),
  status: z.enum(["queued", "running", "ready", "failed", "published"]), stage: z.string(),
  createdAt: z.string().datetime(), finishedAt: z.string().datetime().optional(),
  day: z.number().int().min(0).max(29).optional(), themeId: z.string().optional(),
  idea: z.object({ themeId: z.string(), title: z.string(), hook: z.string(), reason: z.string() }).optional(),
  error: z.string().optional(), seconds: z.number().positive().optional(),
  attempts: z.number().int().min(0).max(3).optional(),
  publication: z.object({ state: z.enum(["uploading", "published", "needs_review", "failed"]), url: z.string().url().optional(), error: z.string().optional(), cleanedAt: z.string().datetime().optional() }).optional(),
});
export type MapJob = z.infer<typeof JobSchema>;
type State = { version: 1; campaigns: Record<string, MapCampaign>; jobs: MapJob[] };
export type PipelineOptions = {
  root?: string; source?: string; built?: string; log?: (message: string) => void;
  now?: () => number;
  readOwners?: (viewerId: number) => number[];
  generate?: (job: MapJob, directory: string, signal: AbortSignal, stage: (message: string) => Promise<void>, used: string[]) => Promise<{ seconds: number; idea: MapIdea }>;
};

export class MapPipelineService {
  readonly root: string;
  readonly source: string;
  readonly built: string;
  private state: State = { version: 1, campaigns: {}, jobs: [] };
  private initialized: Promise<void> | undefined;
  private writeTail: Promise<void> = Promise.resolve();
  private mutationTail: Promise<unknown> = Promise.resolve();
  private active: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private current: MapJob | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private closing = false;
  private now: () => number;
  constructor(private options: PipelineOptions = {}) {
    this.root = resolve(options.root || "data/output/map-pipeline");
    this.source = resolve(options.source || process.env.MAP_STUDIO_SOURCE || "/home/davtian/Documents/map");
    this.built = resolve(options.built || "data/map-studio");
    this.now = options.now || Date.now;
  }
  directory(job: Pick<MapJob, "ownerId" | "id">) {
    if (!Number.isSafeInteger(job.ownerId) || job.ownerId <= 0 || !z.string().uuid().safeParse(job.id).success) throw new Error("Invalid library entry");
    return resolve(this.source, "exports/daily-library", `u${job.ownerId}`, job.id);
  }
  private save() {
    const json = JSON.stringify(this.state, null, 2);
    const write = this.writeTail.catch(() => {}).then(async () => {
      const file = resolve(this.root, "state.json");
      await writeFile(`${file}.tmp`, json, { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    });
    this.writeTail = write;
    return write;
  }
  private async init() {
    this.initialized ??= (async () => {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      let stored: string;
      try { stored = await readFile(resolve(this.root, "state.json"), "utf8"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
      const data = JSON.parse(stored);
      if (data.version !== 1 || !data.campaigns || typeof data.campaigns !== "object" || !Array.isArray(data.jobs)) throw new Error("Сохранённый конвейер повреждён.");
      const jobs = z.array(JobSchema).max(10000).parse(data.jobs);
      if (new Set(jobs.map(j => j.id)).size !== jobs.length) throw new Error("Повтор идентификатора задачи.");
      for (const [owner, campaign] of Object.entries(data.campaigns)) {
        validateCampaign(campaign as MapCampaign);
        if (String((campaign as MapCampaign).ownerId) !== owner) throw new Error("Неверный владелец расписания.");
        recoverCampaign(campaign as MapCampaign, this.now());
      }
      this.state = { version: 1, campaigns: data.campaigns, jobs };
      for (const job of jobs) {
        if (job.status === "running") { job.status = "failed"; job.stage = "Прервано перезапуском"; job.error = "Незавершённая задача остановлена. Готовые ролики сохранены."; job.finishedAt = new Date(this.now()).toISOString(); }
      }
      await this.save();
    })();
    return this.initialized;
  }
  private mutate<T>(action: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.catch(() => {}).then(action);
    this.mutationTail = result;
    return result;
  }
  async list(ownerId: number) {
    await this.init();
    const owners = [...new Set([ownerId, ...(this.options.readOwners?.(ownerId) || [])])];
    return { campaign: structuredClone(this.state.campaigns[ownerId] || owners.map(id => this.state.campaigns[id]).find(Boolean) || null),
      jobs: structuredClone(this.state.jobs.filter(j => owners.includes(j.ownerId)).slice().reverse()), bannerSlot: BANNER_SLOT };
  }
  allowsPublication(ownerId: number, now: number): boolean {
    const campaign = this.state.campaigns[ownerId];
    return !this.closing && !!campaign && !campaign.stoppedAt && now >= Date.parse(campaign.startedAt) && now < Date.parse(campaign.endsAt);
  }
  async notePublication(ownerId: number, id: string, publication: NonNullable<MapJob["publication"]>) {
    return this.mutate(async () => {
      await this.init();
      const job = this.state.jobs.find(j => j.ownerId === ownerId && j.id === id);
      if (!job || !["ready", "published"].includes(job.status)) throw new Error("Видео для публикации недоступно.");
      job.publication = publication;
      if (publication.state === "published") {
        if (!publication.url || !/^https:\/\/www\.tiktok\.com\/@[a-zA-Z0-9_.]+\/video\/\d+$/.test(publication.url)) throw new Error("Ссылка публикации не подтверждена.");
        job.status = "published"; job.stage = "Опубликовано";
      }
      await this.save();
    });
  }
  async removePublishedMedia(ownerId: number, id: string) {
    await this.init();
    const job = this.state.jobs.find(j => j.ownerId === ownerId && j.id === id);
    if (!job || job.status !== "published" || !job.publication?.url) throw new Error("Удаление до подтверждения публикации запрещено.");
    const directory = this.directory(job);
    try {
      const base = await realpath(resolve(this.source, "exports/daily-library", `u${ownerId}`));
      const actual = await realpath(directory);
      if (!actual.startsWith(base + sep) || actual !== resolve(base, job.id)) throw new Error("Неверная папка ролика.");
      await rm(actual, { recursive: true, force: true });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await this.notePublication(ownerId, id, { ...job.publication, state: "published", cleanedAt: new Date(this.now()).toISOString() });
  }
  async samples(ownerId: number, rebuild = false) {
    return this.mutate(async () => {
      await this.init();
      if (this.closing) throw new Error("Конвейер останавливается.");
      const count = this.state.jobs.filter(j => j.ownerId === ownerId && j.kind === "sample").length;
      for (const job of this.state.jobs) if (job.ownerId === ownerId && job.kind === "sample" && (job.status === "failed" || rebuild && job.status === "ready") && (job.attempts || 0) < 3) {
        job.status = "queued"; job.stage = "Повторная попытка"; delete job.error; delete job.finishedAt;
      }
      for (let i = count; i < 2; i++) this.state.jobs.push(this.newJob(ownerId, "sample"));
      await this.save();
      return this.list(ownerId);
    });
  }
  async begin(ownerId: number) {
    return this.mutate(async () => {
      await this.init();
      if (this.closing) throw new Error("Конвейер останавливается.");
      // A saved campaign is never silently extended or restarted by another click.
      this.state.campaigns[ownerId] ??= createCampaign(ownerId, this.now());
      await this.save();
      return this.list(ownerId);
    });
  }
  async stop(ownerId: number) {
    return this.mutate(async () => {
      await this.init();
      const campaign = this.state.campaigns[ownerId];
      if (campaign) campaign.stoppedAt ||= new Date(this.now()).toISOString();
      if (this.current?.ownerId === ownerId && this.current.kind === "daily") this.controller?.abort();
      for (const job of this.state.jobs) if (job.ownerId === ownerId && job.kind === "daily" && job.status === "queued") {
        job.status = "failed"; job.stage = "Расписание остановлено"; job.finishedAt = new Date(this.now()).toISOString();
        const run = campaign?.runs.find(r => r.day === job.day); if (run) { run.state = "failed"; run.finishedAt = job.finishedAt; }
      }
      await this.save();
      return this.list(ownerId);
    });
  }
  async shortenDeadline(ownerId: number, endsAt: string) {
    return this.mutate(async () => {
      await this.init();
      const campaign = this.state.campaigns[ownerId];
      const end = Date.parse(endsAt);
      if (!campaign || !Number.isFinite(end) || end <= this.now() || end > Date.parse(campaign.endsAt) ||
          campaign.runs.some(r => Date.parse(r.startedAt) >= end)) throw new Error("Нельзя продлить расписание или указать прошедшую дату.");
      campaign.endsAt = new Date(end).toISOString();
      validateCampaign(campaign);
      if (this.current?.ownerId === ownerId && this.current.kind === "daily") this.armDeadline(campaign);
      await this.save();
      return this.list(ownerId);
    });
  }
  private armDeadline(campaign: MapCampaign) {
    if (this.deadline) clearTimeout(this.deadline);
    const controller = this.controller;
    this.deadline = setTimeout(() => controller?.abort(), Math.max(0, Math.min(Date.parse(campaign.endsAt) - this.now(), 2_147_483_647)));
    this.deadline.unref();
  }
  private newJob(ownerId: number, kind: MapJob["kind"], day?: number): MapJob {
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error("Invalid library owner");
    return { id: randomUUID(), ownerId, kind, day, status: "queued", stage: "В очереди", createdAt: new Date(this.now()).toISOString() };
  }
  async file(ownerId: number, id: string, name: "video.mp4" | "poster.jpg") {
    await this.init();
    const owners = [ownerId, ...(this.options.readOwners?.(ownerId) || [])];
    const job = this.state.jobs.find(j => owners.includes(j.ownerId) && j.id === id && j.status === "ready");
    if (!job) return null;
    const file = resolve(this.directory(job), name);
    const info = await stat(file);
    return { file, size: info.size };
  }
  async tick() {
    await this.mutate(async () => {
      await this.init();
      if (this.closing) return;
      for (const campaign of Object.values(this.state.campaigns)) {
        const run = claimDay(campaign, this.now());
        if (run) this.state.jobs.push(this.newJob(campaign.ownerId, "daily", run.day));
      }
      await this.save();
      if (this.closing) return;
      if (!this.active) {
        const job = this.state.jobs.find(j => j.status === "queued");
        if (job) {
          job.status = "running";
          job.attempts = (job.attempts || 0) + 1;
          await this.save();
          this.active = this.execute(job).catch(() => this.options.log?.("[maps] Не удалось сохранить результат задачи.")).finally(() => { this.active = undefined; this.current = undefined; this.controller = undefined; });
        }
      }
    });
  }
  private async execute(job: MapJob) {
    this.current = job;
    const controller = this.controller = new AbortController();
    const campaign = job.kind === "daily" ? this.state.campaigns[job.ownerId] : undefined;
    const remaining = campaign ? Date.parse(campaign.endsAt) - this.now() : Infinity;
    if (campaign) this.armDeadline(campaign);
    // Node timers cannot exceed ~24.8 days; only the currently running day's remaining window matters.
    const hardLimit = setTimeout(() => controller.abort(), 4 * 3600_000);
    const stage = async (message: string) => { job.stage = message; await this.save(); this.options.log?.(`[maps] ${job.id}: ${message}`); };
    try {
      if (campaign && (remaining <= 0 || campaign.stoppedAt)) throw new Error("Срок ежедневной генерации завершён.");
      const directory = this.directory(job);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const used = this.state.jobs.filter(j => j.ownerId === job.ownerId && j.id !== job.id && j.themeId).map(j => j.themeId!);
      const generate = this.options.generate || ((...args) => this.generate(...args));
      controller.signal.throwIfAborted();
      let result: { seconds: number; idea: MapIdea };
      let waiting = false;
      for (;;) {
        controller.signal.throwIfAborted();
        try {
          result = await withGlobalRenderSlot(() => metrics.track("render", () => generate(job, directory, controller.signal, stage, used)));
          break;
        } catch (error) {
          if (!(error instanceof RateLimitError)) throw error;
          if (!waiting) { await stage("Ожидание свободного рендера"); waiting = true; }
          await delay(5000, undefined, { signal: controller.signal });
        }
      }
      controller.signal.throwIfAborted();
      if (campaign && (this.now() >= Date.parse(campaign.endsAt) || campaign.stoppedAt)) throw new Error("Срок ежедневной генерации завершён.");
      job.status = "ready"; job.stage = "Готово"; job.seconds = result.seconds; job.idea = result.idea; job.themeId = result.idea.themeId;
    } catch (error) {
      job.status = "failed"; job.stage = "Не завершено";
      job.error = controller.signal.aborted ? "Генерация остановлена по сроку или при выключении сервиса." : error instanceof Error ? error.message : "Не удалось создать видео.";
      this.options.log?.(`[maps] ${job.id}: ${job.error}`);
    } finally {
      if (this.deadline) clearTimeout(this.deadline); this.deadline = undefined; clearTimeout(hardLimit);
      job.finishedAt = new Date(this.now()).toISOString();
      const run = campaign?.runs.find(r => r.day === job.day);
      if (run) { run.state = job.status === "ready" ? "ready" : "failed"; run.finishedAt = job.finishedAt; if (job.status === "ready") run.video = job.id; }
      await this.save();
    }
  }
  private async generate(job: MapJob, directory: string, signal: AbortSignal, stage: (message: string) => Promise<void>, used: string[]) {
    await stage("Выбор идеи");
    const idea = job.idea || await planMapIdea(resolve(directory, "planning"), METRICS, used, { signal });
    job.idea = idea; job.themeId = idea.themeId; await this.save();
    const metric = METRICS.find(m => m.id === idea.themeId)!;
    await stage("Проверка и подготовка данных");
    let snapshot: Awaited<ReturnType<typeof fetchMetric>>;
    try {
      snapshot = JSON.parse(await readFile(resolve(directory, "source.json"), "utf8"));
      if (snapshot.metric.indicator !== metric.indicator || snapshot.metric.year !== metric.year) throw new Error("Неверный снимок исходных данных.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      snapshot = await fetchMetric(metric, directory, signal);
    }
    const { template, meta } = await loadMapInputs(this.source);
    const ids = [...new Set<string>(template.reveals.flatMap((r: any) => r.countries))];
    const observations = mapObservations(ids, meta, snapshot.byIso3, metric.year);
    await writeFile(resolve(directory, "observations.json"), JSON.stringify(observations, null, 2));
    const theme = buildMapTheme(template, meta, observations, metric, idea, `daily-${job.id}`);
    await writeFile(resolve(directory, "theme.json"), JSON.stringify(theme, null, 2));
    const result = await renderMapVideo({ source: this.source, built: this.built, directory, theme, idea, metric, signal, stage });
    await writeFile(resolve(directory, "metadata.json"), JSON.stringify({ title: idea.title, hook: idea.hook, metric, source: snapshot.url, license: snapshot.license, bannerSlot: BANNER_SLOT,
      music: { title: "Carefree", composer: "Kevin MacLeod", source: "https://incompetech.com/", license: "https://creativecommons.org/licenses/by/4.0/", tempo: 1.15 }, duration: result.seconds }, null, 2));
    return { seconds: result.seconds, idea };
  }
  async start() {
    await this.init();
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(() => this.options.log?.("[maps] Ошибка очереди: проверьте сохранённое состояние.")); }, 15_000);
    this.timer.unref();
    await this.tick();
  }
  async idle() { await this.active; }
  async close() {
    this.closing = true;
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort();
    await this.mutationTail.catch(() => {});
    this.controller?.abort();
    await this.active;
    await this.writeTail;
  }
}
