import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, type QueueJob, type QueueOverview } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdminLike, isAdminRole } from "../lib/authz";
import { useT } from "../lib/i18n";

const activeStates = new Set(["queued", "running"]);

function pct(job: QueueJob): number {
  if (!job.total) return 0;
  return Math.max(0, Math.min(100, Math.round((job.done / job.total) * 100)));
}

function formatRunway(days: number | null): string {
  if (days == null) return "—";
  if (days < 1) return "<1";
  return days.toFixed(days < 10 ? 1 : 0);
}

function formatAt(value: string): string {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAgeMs(ageMs: number | null): string {
  if (ageMs == null) return "—";
  const sec = Math.max(0, Math.round(ageMs / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  return `${min}m`;
}

function formatDurationSeconds(value: number | null): string {
  if (value == null) return "рассчитывается";
  const minutes = Math.max(0, Math.round(value / 60));
  if (minutes < 60) return `≈ ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `≈ ${hours} ч ${rest} мин`;
}

export default function QueuePage() {
  const { t } = useT();
  const { user } = useAuth();
  const canViewAll = isAdminLike(user);
  const canCancelAny = isAdminRole(user);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [channelPage, setChannelPage] = useState(1);
  const [data, setData] = useState<QueueOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (opts: { skipIfBusy?: boolean } = {}) => {
    if (opts.skipIfBusy && loadingRef.current) return;
    loadingRef.current = true;
    try {
      setError(null);
      const overview = await apiClient.queueOverview(scope === "all" ? "all" : undefined);
      setData(overview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    setChannelPage(1);
    setLoading(true);
    void load();
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void load({ skipIfBusy: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const activeJobs = useMemo(() => data?.generationJobs.filter((job) => activeStates.has(job.state)) ?? [], [data]);
  const historyJobs = useMemo(() => data?.generationJobs.filter((job) => !activeStates.has(job.state)) ?? [], [data]);
  const queuedTotal = useMemo(
    () => data?.channelQueues.reduce((sum, channel) => sum + channel.queued, 0) ?? 0,
    [data],
  );
  const postsPerDay = useMemo(
    () => data?.channelQueues.reduce((sum, channel) => sum + channel.postsPerDay, 0) ?? 0,
    [data],
  );
  const channelPageSize = 12;
  const channelCount = data?.channelQueues.length ?? 0;
  const channelPageCount = Math.max(1, Math.ceil(channelCount / channelPageSize));
  const safeChannelPage = Math.min(Math.max(1, channelPage), channelPageCount);
  const pagedChannels = (data?.channelQueues ?? []).slice(
    (safeChannelPage - 1) * channelPageSize,
    safeChannelPage * channelPageSize,
  );

  const cancelJob = async (jobId: string) => {
    setCanceling(jobId);
    try {
      setError(null);
      const result = await apiClient.cancelGen(jobId);
      if (!result.ok) setError(t("queue.cancelFailed"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCanceling(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-black">{t("queue.title")}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {canViewAll && (
              <div className="join">
                <button className={`btn join-item btn-sm ${scope === "mine" ? "btn-primary" : "btn-ghost"}`} onClick={() => setScope("mine")}>
                  {t("queue.scopeMine")}
                </button>
                <button className={`btn join-item btn-sm ${scope === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setScope("all")}>
                  {t("queue.scopeAll")}
                </button>
              </div>
            )}
            <button className={`btn btn-sm ${loading ? "loading" : ""}`} onClick={() => void load()}>
              {t("common.refresh")}
            </button>
          </div>
        </div>
        {error && <div className="alert alert-error mt-4 text-sm">{error}</div>}
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
          <div className="text-sm text-base-content/55">{t("queue.metricJobs")}</div>
          <div className="text-3xl font-black">{activeJobs.length}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
          <div className="text-sm text-base-content/55">{t("queue.metricVideos")}</div>
          <div className="text-3xl font-black">{queuedTotal}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
          <div className="text-sm text-base-content/55">{t("queue.metricDaily")}</div>
          <div className="text-3xl font-black">{postsPerDay}</div>
        </div>
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4">
          <div className="text-sm text-base-content/55">{t("queue.metricWorker")}</div>
          <div className={`text-2xl font-black ${!data?.worker ? "" : data.worker.online ? "text-success" : "text-error"}`}>
            {!data?.worker ? "—" : data.worker.online ? t("queue.workerOnline") : t("queue.workerOffline")}
          </div>
          <div className="text-xs text-base-content/45">
            {!data?.worker
              ? t("common.loading")
              : data.worker.mode === "external"
                ? t("queue.workerBeat").replace("{age}", formatAgeMs(data.worker.ageMs))
                : t("queue.workerEmbedded")}
          </div>
        </div>
      </section>

      {data?.voicedMemesRender && (
        <section className="overflow-hidden rounded-3xl border border-primary/25 bg-base-100 shadow-sm">
          <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">Озвучка мемов</h2>
                <span className={`badge ${data.voicedMemesRender.state === "running" ? "badge-success" : data.voicedMemesRender.state === "done" ? "badge-primary" : "badge-warning"}`}>
                  {data.voicedMemesRender.state === "running" ? "Рендер идёт" : data.voicedMemesRender.state === "done" ? "Готово" : "Остановлен"}
                </span>
                {data.voicedMemesRender.currentId && <span className="badge badge-ghost">Сейчас: {data.voicedMemesRender.currentId}</span>}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 text-sm">
                <span className="font-semibold">{data.voicedMemesRender.completed} из {data.voicedMemesRender.target} Shorts</span>
                <span className="text-base-content/55">{data.voicedMemesRender.percent}%</span>
              </div>
              <progress className="progress progress-primary mt-2 h-3 w-full" max={100} value={data.voicedMemesRender.percent} />
            </div>
            <div className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
              <RenderMetric label="Осталось" value={String(Math.max(0, data.voicedMemesRender.target - data.voicedMemesRender.completed))} />
              <RenderMetric label="Примерно ждать" value={formatDurationSeconds(data.voicedMemesRender.etaSeconds)} />
              <RenderMetric label="На один ролик" value={data.voicedMemesRender.avgSecondsPerVideo == null ? "—" : `${data.voicedMemesRender.avgSecondsPerVideo} с`} />
              <RenderMetric label="Исключено" value={String(data.voicedMemesRender.blocked)} hint={data.voicedMemesRender.failed ? `Ошибок: ${data.voicedMemesRender.failed}` : "Ошибок нет"} />
            </div>
          </div>
          <div className="border-t border-base-300 bg-base-200/55 px-5 py-2 text-xs text-base-content/50">
            Автообновление каждые 15 секунд
            {data.voicedMemesRender.updatedAt ? ` · обновлено ${new Date(data.voicedMemesRender.updatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}` : ""}
          </div>
        </section>
      )}

      <section className={`grid gap-4 ${activeJobs.length ? "xl:grid-cols-[1.1fr_0.9fr]" : ""}`}>
        {!!activeJobs.length && (
          <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">{t("queue.jobsTitle")}</h2>
              <span className="badge badge-outline">{activeJobs.length}</span>
            </div>
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <article key={job.id} className="rounded-2xl border border-base-300 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link className="font-bold hover:underline" to={`/accounts/${job.accountId}`}>
                        {job.channelName}
                      </Link>
                      <div className="mt-1 text-xs text-base-content/55">
                        {job.state} · {job.done}/{job.total} · {job.deckIds?.join(", ") || t("queue.channelSources")}
                      </div>
                    </div>
                    {(canCancelAny || job.userId === user?.id) && (
                      <button
                        className={`btn btn-xs btn-outline btn-error ${canceling === job.id ? "loading" : ""}`}
                        disabled={canceling === job.id}
                        title={t("queue.cancelTitle")}
                        onClick={() => void cancelJob(job.id)}
                      >
                        {canceling === job.id ? t("queue.canceling") : t("queue.cancel")}
                      </button>
                    )}
                  </div>
                  <progress className="progress progress-primary mt-4 w-full" max={100} value={pct(job)} />
                  <div className="mt-2 text-xs text-base-content/50">
                    {job.position > 0 ? t("queue.ahead").replace("{n}", String(job.ahead)) : t("queue.runningNow")}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">{t("queue.slotsTitle")}</h2>
            <span className="badge badge-outline">{data?.upcomingSlots.length ?? 0}</span>
          </div>
          <div className="max-h-96 space-y-2 overflow-auto pr-1">
            {data?.upcomingSlots.map((slot) => (
              <Link
                key={`${slot.accountId}-${slot.at}-${slot.time}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-base-300 p-3 hover:bg-base-200"
                to={`/accounts/${slot.accountId}`}
              >
                <div>
                  <div className="font-semibold">{slot.channelName}</div>
                  <div className="text-xs text-base-content/55" title={slot.deck || undefined}>
                    {slot.deckName || slot.deck || t("queue.channelSources")}
                  </div>
                </div>
                <div className="text-right text-sm font-bold">{formatAt(slot.at)}</div>
              </Link>
            ))}
            {!data?.upcomingSlots.length && <div className="rounded-2xl bg-base-200 p-4 text-sm text-base-content/60">{t("queue.noSlots")}</div>}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">{t("queue.channelsTitle")}</h2>
          <span className="badge badge-outline">{data?.channelQueues.length ?? 0}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pagedChannels.map((channel) => (
            <Link key={channel.accountId} className="rounded-2xl border border-base-300 p-4 hover:bg-base-200" to={`/accounts/${channel.accountId}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{channel.channelName}</div>
                  {channel.ownerUsername && <div className="text-xs text-base-content/45">@{channel.ownerUsername}</div>}
                </div>
                <span className={`badge ${channel.connected && channel.enabled ? "badge-success" : "badge-warning"}`}>
                  {channel.connected && channel.enabled ? t("queue.ready") : t("queue.needsAttention")}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-base-200 p-2">
                  <div className="text-lg font-black">{channel.queued}</div>
                  <div className="text-[11px] text-base-content/50">{t("queue.queuedShort")}</div>
                </div>
                <div className="rounded-xl bg-base-200 p-2">
                  <div className="text-lg font-black">{channel.postsPerDay}</div>
                  <div className="text-[11px] text-base-content/50">{t("queue.perDayShort")}</div>
                </div>
                <div className="rounded-xl bg-base-200 p-2">
                  <div className="text-lg font-black">{formatRunway(channel.runwayDays)}</div>
                  <div className="text-[11px] text-base-content/50">{t("queue.daysShort")}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(channel.byDeck)
                  .slice(0, 5)
                  .map(([deck, count]) => {
                    const label = channel.deckNames?.[deck] ?? deck;
                    const title = label === deck ? `${deck}: ${count}` : `${label}: ${count} (${deck})`;
                    return (
                      <span key={deck} className="badge badge-ghost max-w-full overflow-hidden text-ellipsis whitespace-nowrap" title={title}>
                        {label}: {count}
                      </span>
                    );
                  })}
                {!Object.keys(channel.byDeck).length && <span className="badge badge-ghost">{t("queue.emptyLibrary")}</span>}
              </div>
            </Link>
          ))}
        </div>
        {channelCount > channelPageSize && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              className="btn btn-sm btn-outline"
              disabled={safeChannelPage <= 1}
              onClick={() => setChannelPage((p) => Math.max(1, p - 1))}
              aria-label={t("queue.prevPage")}
            >
              ‹
            </button>
            <span className="text-sm text-base-content/60">
              {t("queue.pageOf", { page: safeChannelPage, total: channelPageCount })}
            </span>
            <button
              className="btn btn-sm btn-outline"
              disabled={safeChannelPage >= channelPageCount}
              onClick={() => setChannelPage((p) => Math.min(channelPageCount, p + 1))}
              aria-label={t("queue.nextPage")}
            >
              ›
            </button>
          </div>
        )}
      </section>

      {!!historyJobs.length && (
        <section className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-black">{t("queue.recentJobsTitle")}</h2>
          <div className="space-y-2">
            {historyJobs.slice(0, 8).map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 rounded-2xl bg-base-200 p-3 text-sm">
                <span>{job.channelName}</span>
                <span className="badge badge-outline">
                  {job.state} · {job.done}/{job.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RenderMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-base-200 p-3">
      <div className="text-[11px] text-base-content/50">{label}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
      {hint && <div className="text-[10px] text-base-content/45">{hint}</div>}
    </div>
  );
}
