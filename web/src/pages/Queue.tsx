import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, type QueueJob, type QueueOverview } from "../lib/api";
import { useAuth } from "../lib/auth";
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

export default function QueuePage() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [channelPage, setChannelPage] = useState(1);
  const [data, setData] = useState<QueueOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      const overview = await apiClient.queueOverview(scope === "all" ? "all" : undefined);
      setData(overview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setChannelPage(1);
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [scope]);

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
      await apiClient.cancelGen(jobId);
      await load();
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
            {isAdmin && (
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

      <section className="grid gap-3 md:grid-cols-3">
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
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
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
                  <button
                    className={`btn btn-xs btn-outline ${canceling === job.id ? "loading" : ""}`}
                    disabled={canceling === job.id}
                    onClick={() => void cancelJob(job.id)}
                  >
                    {t("queue.cancel")}
                  </button>
                </div>
                <progress className="progress progress-primary mt-4 w-full" max={100} value={pct(job)} />
                <div className="mt-2 text-xs text-base-content/50">
                  {job.position > 0 ? t("queue.ahead").replace("{n}", String(job.ahead)) : t("queue.runningNow")}
                </div>
              </article>
            ))}
            {!activeJobs.length && <div className="rounded-2xl bg-base-200 p-4 text-sm text-base-content/60">{t("queue.noJobs")}</div>}
          </div>
        </div>

        <div className="rounded-3xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <h2 className="mb-4 text-xl font-black">{t("queue.slotsTitle")}</h2>
          <div className="space-y-2">
            {data?.upcomingSlots.map((slot) => (
              <Link
                key={`${slot.accountId}-${slot.at}-${slot.time}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-base-300 p-3 hover:bg-base-200"
                to={`/accounts/${slot.accountId}`}
              >
                <div>
                  <div className="font-semibold">{slot.channelName}</div>
                  <div className="text-xs text-base-content/55">{slot.deck || t("queue.channelSources")}</div>
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
                {Object.entries(channel.byDeck).slice(0, 5).map(([deck, count]) => (
                  <span key={deck} className="badge badge-ghost">
                    {deck}: {count}
                  </span>
                ))}
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
