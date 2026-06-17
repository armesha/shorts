import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  Eye,
  Film,
  TrendingDown,
  TrendingUp,
  Tv,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient, type AdminAnalytics as AdminAnalyticsData } from "../lib/api";
import { useAuth } from "../lib/auth";
import { compactNumber } from "../lib/format";
import { useT } from "../lib/i18n";

type T = (key: string, vars?: Record<string, string | number>) => string;

type Range = { from: string; to: string };

const CHART_COLORS = {
  published: "#2563eb",
  scheduled: "#f97316",
  failed: "#dc2626",
};

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(days: number): Range {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - days + 1);
  return { from: localDate(from), to: localDate(to) };
}

// Operational «Сводка» panel — embedded inside the Statistics page as the admin-only tab.
// No page header / refresh button of its own: the Statistics page header's «Обновить данные»
// button drives it via `refreshNonce` (bumped on click) and reads back its `refreshing` state.
export function SystemOverview({
  refreshNonce = 0,
  dataOnlyRefreshNonce = 0,
  onRefreshingChange,
  onDataOnlyRefreshingChange,
}: {
  refreshNonce?: number;
  dataOnlyRefreshNonce?: number;
  onRefreshingChange?: (refreshing: boolean) => void;
  onDataOnlyRefreshingChange?: (refreshing: boolean) => void;
} = {}) {
  const { user } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === "admin";
  const initial = useMemo(() => presetRange(30), []);
  const [range, setRange] = useState<Range>(initial);
  const [draft, setDraft] = useState<Range>(initial);
  const [activePreset, setActivePreset] = useState<7 | 30 | 90 | null>(30);
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataOnlyRefreshing, setDataOnlyRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let stopped = false;
    apiClient
      .adminAnalytics(range.from, range.to)
      .then((r) => {
        if (!stopped) setData(r);
      })
      .catch((e) => {
        console.error("[Аналитика] запрос /admin/analytics упал:", e);
        if (!stopped) setError(t("analytics.loadFailed"));
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [isAdmin, range.from, range.to, t]);

  const applyPreset = (days: 7 | 30 | 90) => {
    const next = presetRange(days);
    setActivePreset(days);
    setDraft(next);
    setLoading(true);
    setError(null);
    setRange(next);
    setNotice(null);
  };

  const applyDates = () => {
    if (!draft.from || !draft.to) return;
    const next = draft.from <= draft.to ? draft : { from: draft.to, to: draft.from };
    setActivePreset(null);
    setDraft(next);
    setLoading(true);
    setError(null);
    setRange(next);
    setNotice(null);
  };

  const refreshYoutube = async () => {
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const rows = await apiClient.refreshStats("all");
      const failed = rows.filter((r) => r.error).length;
      const connected = rows.filter((r) => r.connected).length;
      const fresh = await apiClient.adminAnalytics(range.from, range.to);
      setData(fresh);
      setNotice(
        failed
          ? t("analytics.ytPartial", { ok: Math.max(0, connected - failed), total: connected, failed })
          : t("analytics.ytUpdated", { n: connected }),
      );
    } catch (e) {
      console.error("[Аналитика] ручное обновление YouTube упало:", e);
      setError(t("analytics.ytRefreshFailed"));
    } finally {
      setRefreshing(false);
    }
  };

  const refreshYoutubeDataOnly = async () => {
    setDataOnlyRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const rows = await apiClient.refreshStatsDataOnly("all");
      const failed = rows.filter((r) => r.error).length;
      const connected = rows.filter((r) => r.connected).length;
      const fresh = await apiClient.adminAnalytics(range.from, range.to);
      setData(fresh);
      setNotice(
        failed
          ? t("stats.refreshDataOnlyPartial", { ok: Math.max(0, connected - failed), total: connected, failed })
          : t("stats.refreshDataOnlyOk", { n: connected }),
      );
    } catch (e) {
      console.error("[Аналитика] обновление YouTube Data упало:", e);
      setError(t("stats.refreshDataOnlyError"));
    } finally {
      setDataOnlyRefreshing(false);
    }
  };

  // Report the refresh state up so the Statistics page header button can show its spinner.
  useEffect(() => {
    onRefreshingChange?.(refreshing);
  }, [refreshing, onRefreshingChange]);
  useEffect(() => {
    onDataOnlyRefreshingChange?.(dataOnlyRefreshing);
  }, [dataOnlyRefreshing, onDataOnlyRefreshingChange]);

  // The page header «Обновить данные» button bumps refreshNonce → run a refresh (skip on mount /
  // re-mount so re-entering the tab never auto-refreshes).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    refreshYoutube();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  const dataOnlyMountedRef = useRef(false);
  useEffect(() => {
    if (!dataOnlyMountedRef.current) {
      dataOnlyMountedRef.current = true;
      return;
    }
    refreshYoutubeDataOnly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataOnlyRefreshNonce]);

  if (!isAdmin) {
    return (
      <div className="alert alert-warning">
        <AlertTriangle size={18} />
        <span>{t("analytics.adminOnly")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-3 flex-row flex-wrap items-center gap-2">
          <div className="join">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                className={`btn btn-sm join-item ${activePreset === days ? "btn-primary" : "btn-ghost"}`}
                onClick={() => applyPreset(days as 7 | 30 | 90)}
              >
                {t("analytics.days", { n: days })}
              </button>
            ))}
          </div>
          <input
            type="date"
            className="input input-bordered input-sm"
            value={draft.from}
            onChange={(e) => setDraft((r) => ({ ...r, from: e.target.value }))}
            aria-label={t("analytics.periodStart")}
          />
          <span className="text-base-content/40">—</span>
          <input
            type="date"
            className="input input-bordered input-sm"
            value={draft.to}
            onChange={(e) => setDraft((r) => ({ ...r, to: e.target.value }))}
            aria-label={t("analytics.periodEnd")}
          />
          <button className="btn btn-sm btn-outline" onClick={applyDates} disabled={!draft.from || !draft.to}>
            {t("analytics.apply")}
          </button>
          {data && (
            <span className="text-xs text-base-content/50 ml-auto">
              {t("analytics.updatedAt", { time: new Date(data.updatedAt).toLocaleString("ru-RU") })}
            </span>
          )}
        </div>
      </div>

      {notice && <div className="alert alert-success text-sm py-2">{notice}</div>}
      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : data ? (
        <>
          <KpiGrid data={data} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <DailyChart data={data.daily} />
            <YoutubeChart data={data.youtubeSeries} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TopChannels rows={data.topChannels} />
            <Runway rows={data.runway} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TopUsers rows={data.topUsers} />
            <Problems failures={data.failures} recentErrors={data.recentErrors} />
          </div>
        </>
      ) : (
        !error && <Empty text={t("analytics.noData")} />
      )}
    </div>
  );
}

function KpiGrid({ data }: { data: AdminAnalyticsData }) {
  const { t } = useT();
  const s = data.summary;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Kpi
        icon={<Film />}
        label={t("analytics.kpiPublished")}
        value={fmt(s.published)}
        hint={t("analytics.kpiPublishedHint", { scheduled: fmt(s.scheduled), failed: fmt(s.failed) })}
        danger={s.failed > 0}
      />
      <Kpi
        icon={<Activity />}
        label={t("analytics.kpiLibrary")}
        value={fmt(s.queuedVideos)}
        hint={t("analytics.kpiLibraryHint", { n: fmt(s.accountsEnabled) })}
      />
      <Kpi
        icon={<Tv />}
        label={t("analytics.kpiChannelsConnected")}
        value={`${fmt(s.accountsConnected)} / ${fmt(s.accountsTotal)}`}
        hint={t("analytics.kpiChannelsHint")}
      />
      <Kpi
        icon={<Users />}
        label={t("analytics.kpiUsers")}
        value={fmt(s.usersTotal)}
        hint={t("analytics.kpiUsersHint", { n: fmt(s.historyTotal) })}
      />
      <Kpi
        icon={<Eye />}
        label={t("analytics.kpiViews")}
        value={fmt(s.views)}
        delta={s.viewsDelta}
        hint={s.dataThrough ? t("analytics.kpiDataThrough", { date: s.dataThrough }) : t("analytics.kpiViewsHint", { n: fmt(s.youtubeVideos) })}
      />
      <Kpi
        icon={<Activity />}
        label={t("analytics.kpiWatchTime")}
        value={formatWatchMinutes(s.watchMinutes)}
        hint={t("analytics.kpiAvgDuration", { value: formatSeconds(s.avgViewDuration) })}
      />
      <Kpi
        icon={<TrendingUp />}
        label={t("analytics.kpiEngagedViews")}
        value={fmt(s.engagedViews)}
        hint={t("analytics.kpiEngagements", { likes: fmt(s.likes), shares: fmt(s.shares) })}
      />
      <Kpi
        icon={<TrendingUp />}
        label={t("analytics.kpiSubscribers")}
        value={fmt(s.subscribers)}
        delta={s.subscriberDelta}
        hint={t("analytics.kpiSubscribersHint", { delta: signed(s.subscribersGained - s.subscribersLost) })}
      />
    </div>
  );
}

function DailyChart({ data }: { data: AdminAnalyticsData["daily"] }) {
  const { t } = useT();
  const kPublished = t("analytics.seriesPublished");
  const kScheduled = t("analytics.seriesScheduled");
  const kFailed = t("analytics.seriesFailed");
  const chart = data.map((p) => ({
    date: shortDate(p.date),
    [kPublished]: p.published,
    [kScheduled]: p.scheduled,
    [kFailed]: p.failed,
  }));
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <BarChart3 size={18} className="text-primary" />
          {t("analytics.dailyTitle")}
        </div>
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={288}
            initialDimension={{ width: 320, height: 288 }}
          >
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" fontSize={12} tickMargin={6} minTickGap={24} />
              <YAxis fontSize={12} width={40} allowDecimals={false} tickFormatter={(value) => compactNumber(Number(value))} />
              <Tooltip formatter={(value) => compactNumber(Number(value))} />
              <Legend />
              <Bar dataKey={kPublished} fill={CHART_COLORS.published} radius={[3, 3, 0, 0]} />
              <Bar dataKey={kScheduled} fill={CHART_COLORS.scheduled} radius={[3, 3, 0, 0]} />
              <Bar dataKey={kFailed} fill={CHART_COLORS.failed} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function YoutubeChart({ data }: { data: AdminAnalyticsData["youtubeSeries"] }) {
  const { t } = useT();
  if (data.length < 2) {
    return (
      <section className="card bg-base-100 border border-base-300 border-dashed">
        <div className="card-body items-center text-center py-12">
          <TrendingUp className="text-base-content/30" size={36} />
          <p className="text-base-content/60 max-w-md">
            {t("analytics.ytChartEmpty")}
          </p>
        </div>
      </section>
    );
  }
  const kViews = t("analytics.seriesViews");
  const kWatch = t("analytics.seriesWatchHours");
  const chart = data.map((p) => ({
    date: shortDate(p.date),
    [kViews]: p.views,
    [kWatch]: Math.round((p.watchMinutes / 60) * 10) / 10,
  }));
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <TrendingUp size={18} className="text-primary" />
          {t("analytics.ytChartTitle")}
        </div>
        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={288}
            initialDimension={{ width: 320, height: 288 }}
          >
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" fontSize={12} tickMargin={6} minTickGap={24} />
              <YAxis yAxisId="left" fontSize={12} width={44} tickFormatter={(value) => compactNumber(Number(value))} />
              <YAxis yAxisId="right" orientation="right" fontSize={12} width={44} tickFormatter={(value) => compactNumber(Number(value))} />
              <Tooltip formatter={(value) => compactNumber(Number(value))} />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey={kViews} stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey={kWatch} stroke="#7c3aed" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function TopChannels({ rows }: { rows: AdminAnalyticsData["topChannels"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.topChannels")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noPublicationsPeriod")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.accountId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                        {r.channelName}
                      </Link>
                      {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold leading-none">{fmt(r.published)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.colPublished")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                      <div className="text-xs text-base-content/50">{runwayText(r.runwayDays, t)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colViews")}</div>
                      <div className="font-medium">{fmt(r.views)}</div>
                      <div className="text-xs text-base-content/50">
                        {formatWatchMinutes(r.watchMinutes)} · {formatSeconds(r.avgViewDuration)}
                      </div>
                      {(r.scheduled > 0 || r.failed > 0) && (
                        <div className="text-xs text-base-content/50">
                          {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colChannel")}</th>
                    <th>{t("analytics.colPublished")}</th>
                    <th>{t("analytics.colQueue")}</th>
                    <th>{t("analytics.colViews")}</th>
                    <th>{t("analytics.colWatchTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountId}>
                      <td>
                        <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                          {r.channelName}
                        </Link>
                        {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                      </td>
                      <td>
                        <span className="font-semibold">{fmt(r.published)}</span>
                        {(r.scheduled > 0 || r.failed > 0) && (
                          <div className="text-xs text-base-content/50">
                            {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                          </div>
                        )}
                      </td>
                      <td>
                        {fmt(r.queued)}
                        <div className="text-xs text-base-content/50">{runwayText(r.runwayDays, t)}</div>
                      </td>
                      <td>{fmt(r.views)}</td>
                      <td>
                        {formatWatchMinutes(r.watchMinutes)}
                        <div className="text-xs text-base-content/50">{formatSeconds(r.avgViewDuration)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Runway({ rows }: { rows: AdminAnalyticsData["runway"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.runwayTitle")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noChannels")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.accountId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                        {r.channelName}
                      </Link>
                      {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                    </div>
                    <span className={`badge badge-sm ${runwayClass(r.runwayDays)}`}>{runwayText(r.runwayDays, t)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colPostsPerDay")}</div>
                      <div className="font-medium">{fmt(r.postsPerDay)}</div>
                    </div>
                  </div>
                  {!r.connected && <div className="text-xs text-warning mt-2">{t("analytics.notConnected")}</div>}
                  {!r.enabled && <div className="text-xs text-base-content/50 mt-1">{t("analytics.disabledChannel")}</div>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colChannel")}</th>
                    <th>{t("analytics.colQueue")}</th>
                    <th>{t("analytics.colPostsPerDay")}</th>
                    <th>{t("analytics.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountId}>
                      <td>
                        <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                          {r.channelName}
                        </Link>
                        {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                      </td>
                      <td>{fmt(r.queued)}</td>
                      <td>{fmt(r.postsPerDay)}</td>
                      <td>
                      <span className={`badge badge-sm ${runwayClass(r.runwayDays)}`}>{runwayText(r.runwayDays, t)}</span>
                      {!r.connected && <div className="text-xs text-warning mt-1">{t("analytics.notConnected")}</div>}
                      {!r.enabled && <div className="text-xs text-base-content/50 mt-1">{t("analytics.disabledChannel")}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function TopUsers({ rows }: { rows: AdminAnalyticsData["topUsers"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.usersTitle")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noActivityPeriod")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.userId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">@{r.username}</div>
                    <div className="text-right">
                      <div className="text-lg font-bold leading-none">{fmt(r.published)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.colPublished")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colChannels")}</div>
                      <div className="font-medium">{fmt(r.channels)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.postsPerDayUnit", { n: fmt(r.postsPerDay) })}</div>
                    </div>
                  </div>
                  {(r.scheduled > 0 || r.failed > 0) && (
                    <div className="text-xs text-base-content/50 mt-2">
                      {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colUser")}</th>
                    <th>{t("analytics.colPublished")}</th>
                    <th>{t("analytics.colChannels")}</th>
                    <th>{t("analytics.colQueue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="font-medium">@{r.username}</td>
                      <td>
                        {fmt(r.published)}
                      {(r.scheduled > 0 || r.failed > 0) && (
                        <div className="text-xs text-base-content/50">
                          {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                        </div>
                      )}
                      </td>
                      <td>{fmt(r.channels)}</td>
                      <td>
                        {fmt(r.queued)}
                        <div className="text-xs text-base-content/50">{t("analytics.postsPerDayUnit", { n: fmt(r.postsPerDay) })}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Problems({
  failures,
  recentErrors,
}: {
  failures: AdminAnalyticsData["failures"];
  recentErrors: AdminAnalyticsData["recentErrors"];
}) {
  const { t } = useT();
  const empty = failures.length === 0 && recentErrors.length === 0;
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Bug size={18} className={empty ? "text-success" : "text-error"} />
          {t("analytics.problemsTitle")}
        </div>
        {empty ? (
          <Empty text={t("analytics.noErrorsPeriod")} compact />
        ) : (
          <div className="space-y-4">
            {failures.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t("analytics.colPublication")}</th>
                      <th>{t("analytics.colChannel")}</th>
                      <th>{t("analytics.colError")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div className="font-medium">{f.title}</div>
                          <div className="text-xs text-base-content/50">{formatDateTime(f.publishedAt || f.createdAt)}</div>
                        </td>
                        <td>{f.channelName}</td>
                        <td className="max-w-[18rem] whitespace-pre-wrap break-words text-error/80">
                          {f.error || t("analytics.noDescription")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {recentErrors.length > 0 && (
              <div className="space-y-2">
                {recentErrors.map((e) => (
                  <div key={e.id} className="rounded-lg bg-base-200/70 p-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-xs ${e.level === "error" ? "badge-error" : "badge-warning"}`}>
                        {e.source}
                      </span>
                      <span className="text-xs text-base-content/50">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <div className="font-medium mt-1 break-words">{e.message}</div>
                    {e.context && <div className="text-xs text-base-content/50 mt-1 break-words">{e.context}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  delta,
  danger,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number;
  danger?: boolean;
}) {
  return (
    <div className={`card bg-base-100 border ${danger ? "border-error/30" : "border-base-300"}`}>
      <div className="card-body py-5 gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-base-content/60">{label}</span>
          <span className={danger ? "text-error" : "text-primary"}>{icon}</span>
        </div>
        <div className="text-3xl font-bold leading-none">{value}</div>
        {delta != null ? (
          <div className={`text-xs flex items-center gap-1 ${delta >= 0 ? "text-success" : "text-error"}`}>
            {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {signed(delta)}
          </div>
        ) : hint ? (
          <div className="text-xs text-base-content/50">{hint}</div>
        ) : null}
        {delta != null && hint && <div className="text-xs text-base-content/50">{hint}</div>}
      </div>
    </div>
  );
}

function Empty({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`text-center text-base-content/50 ${compact ? "py-6" : "py-12"}`}>
      {text}
    </div>
  );
}

function fmt(n: number): string {
  return compactNumber(n);
}

function formatWatchMinutes(n: number): string {
  if (n >= 6000) return `${compactNumber(Math.round(n / 60))} h`;
  if (n >= 60) return `${compactNumber(Math.round((n / 60) * 10) / 10)} h`;
  return `${Math.round(n).toLocaleString("ru-RU")} m`;
}

function formatSeconds(n: number): string {
  const sec = Math.max(0, Math.round(n));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

function signed(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${fmt(Math.abs(n))}`;
}

function shortDate(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function formatDateTime(s: string): string {
  return new Date(s.includes("T") ? s : s.replace(" ", "T") + "Z").toLocaleString("ru-RU");
}

function runwayText(days: number | null, t: T): string {
  if (days == null) return t("analytics.runwayNone");
  if (days === 0) return t("analytics.runwayZero");
  if (days < 1) return t("analytics.runwayLessDay");
  return t("analytics.runwayDays", { n: days.toFixed(days < 10 ? 1 : 0) });
}

function runwayClass(days: number | null): string {
  if (days == null) return "badge-ghost";
  if (days < 1) return "badge-error";
  if (days < 3) return "badge-warning";
  return "badge-success";
}
