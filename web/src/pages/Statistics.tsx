import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  apiClient,
  type StatRow,
  type StatPoint,
  type UserAnalytics,
  type PlatformSummary,
  type YoutubeAnalyticsPayload,
  type YoutubeBreakdownRow,
  type YoutubeDemographicsRow,
  type YoutubeSharingRow,
  type YoutubeTopVideo,
} from "../lib/api";
import { AppIcon } from "../components/AppIcon";
import { SystemOverview } from "./AdminAnalytics";
import { useAuth } from "../lib/auth";
import { compactNumber } from "../lib/format";
import { useT } from "../lib/i18n";
import { cleanDisplayText } from "../lib/text";

type Scope = "mine" | "all";
// Admin gets a third «Сводка» tab (operational system overview); everyone else sees mine/all.
type View = "mine" | "all" | "system";
type MetricKey = "subscribers" | "views" | "videos";
type SortKey = "name" | "subscribers" | "views" | "videos" | "delta" | "analyticsViews" | "watchMinutes";
type OverviewMetric = "views" | "watch" | "engaged" | "subscribers";
const PAGE_SIZE = 10;

interface OverviewDailyPoint {
  date: string;
  views: number;
  watchMinutes: number;
  engagedViews: number;
  subscribersGained: number;
  subscribersLost: number;
}

interface OverviewTopVideo extends YoutubeTopVideo {
  accountId: number;
  channelTitle: string;
  ownerUsername: string | null;
}

interface OverviewTopChannel {
  accountId: number;
  channelTitle: string;
  ytChannelId: string | null;
  ownerUsername: string | null;
  subscribers: number;
  publicViews: number;
  analyticsViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  subscribersNet: number;
}

interface StatsOverviewData {
  channels: number;
  connected: number;
  subscribers: number;
  publicViews: number;
  videos: number;
  analyticsChannels: number;
  analyticsViews: number;
  watchMinutes: number;
  engagedViews: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  dataThrough: string | null;
  daily: OverviewDailyPoint[];
  topVideos: OverviewTopVideo[];
  topChannels: OverviewTopChannel[];
  trafficSources: YoutubeBreakdownRow[];
  devices: YoutubeBreakdownRow[];
  countries: YoutubeBreakdownRow[];
}

// Persisted filters — restore the last-used filter/sort on the next visit.
const STORE_KEY = "statsFilters.v1";
type SavedFilters = {
  search?: string;
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
  ownerFilter?: string;
  onlyConnected?: boolean;
  view?: View;
  days?: number; // analytics window: 7 / 30 / 90
  scope?: Scope; // legacy (pre-«Сводка» tab) — still honoured when restoring
};
const DAYS_OPTIONS = [7, 30, 90] as const;
function loadFilters(): SavedFilters {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as SavedFilters;
  } catch {
    return {};
  }
}

export default function Statistics() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saved] = useState(loadFilters); // last-used filters (localStorage), restored on mount
  const [rows, setRows] = useState<StatRow[]>([]);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null); // own publishing activity
  const [summary, setSummary] = useState<PlatformSummary | null>(null); // platform-wide totals (all users)
  const [view, setView] = useState<View>(saved.view ?? saved.scope ?? "mine");
  const [days, setDays] = useState<number>(() => {
    const d = saved.days ?? 30;
    return DAYS_OPTIONS.includes(d as 7 | 30 | 90) ? d : 30;
  });
  // «system» is admin-only; for the channel queries it behaves like «mine».
  const showSystem = view === "system" && isAdmin;
  const scope: Scope = view === "all" ? "all" : "mine";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // «Сводка» tab refresh is owned by <SystemOverview/>: the header button bumps a nonce and reads back its state.
  const [systemRefreshNonce, setSystemRefreshNonce] = useState(0);
  const [systemRefreshing, setSystemRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<number, string | null | undefined>>({});
  // Controls (persisted): search, sort, owner filter, only-connected (default ON), pagination.
  const [search, setSearch] = useState(saved.search ?? "");
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey ?? "subscribers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir ?? "desc");
  const [ownerFilter, setOwnerFilter] = useState(saved.ownerFilter ?? "");
  const [onlyConnected, setOnlyConnected] = useState(saved.onlyConnected ?? true);
  const [page, setPage] = useState(1);
  const [overviewMetric, setOverviewMetric] = useState<OverviewMetric>("views");

  // Auto-dismiss only successful refreshes. Warnings stay until the user closes them.
  useEffect(() => {
    if (!result?.ok) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .stats(scope, days)
      .then(setRows)
      .catch((e) => {
        console.error("[Статистика] запрос /stats упал:", e);
        setError(t("stats.loadError"));
      })
      .finally(() => setLoading(false));
  }, [scope, days]);

  // Channel avatars by accountId (for the cards).
  useEffect(() => {
    apiClient
      .accounts(scope === "all" ? "all" : undefined)
      .then((a) => setAvatarMap(Object.fromEntries(a.map((x) => [x.id, x.avatar]))))
      .catch(() => {});
  }, [scope]);

  // Own publishing analytics (always the user's OWN channels, independent of the admin scope toggle).
  useEffect(() => {
    apiClient.analytics().then(setAnalytics).catch(() => {});
  }, []);

  // Platform-wide production totals (same numbers for everyone).
  useEffect(() => {
    apiClient.summary().then(setSummary).catch(() => {});
  }, []);

  // Any filter/sort/view change → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, view]);

  // Persist the active filters so the next visit/reload restores them.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ search, sortKey, sortDir, ownerFilter, onlyConnected, view, days }),
      );
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, view, days]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setResult(null);
    try {
      // Non-admins always refresh ONLY their own channels (even while viewing «Все каналы»);
      // admins refresh the current tab (мои → свои, все → каналы всех пользователей).
      const refreshScope: Scope = isAdmin ? scope : "mine";
      const r = await apiClient.refreshStats(refreshScope);
      // Re-read the visible list for the selected tab + period (refresh returns a default window).
      setRows(await apiClient.stats(scope, days));
      const connected = r.filter((x) => x.connected);
      const failed = r.filter((x) => x.error);
      if (failed.length) {
        console.error(
          `[Статистика] ошибки обновления у ${failed.length} канал(ов):`,
          failed.map((x) => ({ канал: x.ytChannelTitle || x.channelName, ошибка: x.error })),
        );
        setResult({
          ok: false,
          text: t("stats.refreshPartial", { ok: connected.length - failed.length, total: connected.length, failed: failed.length }),
        });
      } else if (connected.length === 0) {
        setResult({ ok: false, text: t("stats.refreshNoneConnected") });
      } else {
        setResult({ ok: true, text: t("stats.refreshOk", { n: connected.length }) });
      }
    } catch (e) {
      console.error("[Статистика] запрос /stats/refresh упал:", e);
      setError(t("stats.refreshError"));
      setResult({ ok: false, text: t("stats.refreshErrorBanner") });
    } finally {
      setRefreshing(false);
    }
  }

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.ownerUsername).filter((x): x is string => !!x))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyConnected && !r.connected) return false;
      if (ownerFilter && r.ownerUsername !== ownerFilter) return false;
      if (q && !`${r.ytChannelTitle || r.channelName} ${r.ownerUsername || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, ownerFilter, onlyConnected]);
  const overview = useMemo(() => buildOverview(filtered), [filtered]);
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: StatRow): number | string => {
      if (sortKey === "name") return (r.ytChannelTitle || r.channelName || "").toLowerCase();
      if (sortKey === "delta") return r.latest && r.prev ? r.latest.subscribers - r.prev.subscribers : -Infinity;
      if (sortKey === "analyticsViews") return r.analytics.summary.views;
      if (sortKey === "watchMinutes") return r.analytics.summary.watchMinutes;
      return r.latest ? r.latest[sortKey] : -Infinity;
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paged = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const anyData = rows.some((r) => r.latest);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.statistics")}</h1>
          <p className="text-base-content/60">{showSystem ? t("analytics.subtitle") : t("stats.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="join">
            <button
              className={`btn btn-sm join-item ${view === "mine" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("mine")}
            >
              {t("stats.scopeMine")}
            </button>
            <button
              className={`btn btn-sm join-item ${view === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView("all")}
            >
              {t("stats.scopeAll")}
            </button>
            {isAdmin && (
              <button
                className={`btn btn-sm join-item ${view === "system" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setView("system")}
              >
                {t("stats.scopeSystem")}
              </button>
            )}
          </div>
          <button
            className="btn btn-primary gap-2"
            onClick={() => (showSystem ? setSystemRefreshNonce((n) => n + 1) : refresh())}
            disabled={showSystem ? systemRefreshing : refreshing || loading}
            title={!isAdmin && view === "all" ? t("stats.refreshMineHint") : undefined}
          >
            {(showSystem ? systemRefreshing : refreshing) ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <AppIcon name="refresh" size={18} />
            )}
            {t("stats.refreshData")}
          </button>
        </div>
      </header>

      {!isAdmin && view === "all" && (
        <p className="text-xs text-base-content/50 -mt-3">{t("stats.refreshMineHint")}</p>
      )}

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}
      {result && (
        <div className={`alert text-sm py-2 items-start ${result.ok ? "alert-success" : "alert-warning"}`}>
          <AppIcon name={result.ok ? "check" : "warning"} size={17} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-line flex-1">{result.text}</span>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setResult(null)}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <AppIcon name="close" size={14} />
          </button>
        </div>
      )}

      {showSystem ? (
        <SystemOverview refreshNonce={systemRefreshNonce} onRefreshingChange={setSystemRefreshing} />
      ) : (
      <>
      {summary && <PlatformBand s={summary} />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Stat icon={<AppIcon name="users" />} label={t("stats.totalSubscribers")} value={fmt(overview.subscribers)} />
        <Stat icon={<AppIcon name="youtube" />} label={t("stats.totalViews")} value={fmt(overview.publicViews)} />
        <Stat
          icon={<AppIcon name="analytics" />}
          label={t("stats.viewsForDays", { n: days })}
          value={fmt(overview.analyticsViews)}
          title={t("stats.periodViewsHint")}
        />
        <Stat icon={<AppIcon name="time" />} label={t("stats.watchTime")} value={formatWatchMinutes(overview.watchMinutes)} />
        <Stat icon={<AppIcon name="accounts" />} label={t("stats.channelsConnected")} value={`${overview.connected} / ${overview.channels}`} />
      </div>

      {analytics &&
        analytics.summary.published + analytics.summary.scheduled + analytics.summary.failed + analytics.summary.queuedVideos > 0 && (
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <h2 className="card-title text-base">{t("stats.publishActivity")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.published")}</div>
                  <div className="text-2xl font-bold text-success">{fmt(analytics.summary.published)}</div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.scheduled")}</div>
                  <div className="text-2xl font-bold">{fmt(analytics.summary.scheduled)}</div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.failed")}</div>
                  <div className={`text-2xl font-bold ${analytics.summary.failed > 0 ? "text-error" : ""}`}>
                    {fmt(analytics.summary.failed)}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.queued")}</div>
                  <div className="text-2xl font-bold">{fmt(analytics.summary.queuedVideos)}</div>
                </div>
              </div>
              {analytics.daily.length > 1 && (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} width={40} tickFormatter={(value) => compactNumber(Number(value))} />
                      <Tooltip formatter={(value) => compactNumber(Number(value))} />
                      <Legend />
                      <Line type="monotone" dataKey="published" name={t("stats.published")} stroke="#166534" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="scheduled" name={t("stats.scheduled")} stroke="#605dff" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="failed" name={t("stats.failed")} stroke="#dc2626" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
        )}

      {loading && rows.length === 0 ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <Empty text={t("stats.emptyNoChannels")} />
      ) : !anyData ? (
        <Empty
          icon
          text={t("stats.emptyNoData")}
        />
      ) : (
        <>
          {/* Controls: search / sort / direction / owner filter / only-connected */}
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body py-3 flex-row flex-wrap items-center gap-2">
              <div className="join" role="group" aria-label={t("stats.period")}>
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    className={`btn btn-sm join-item ${days === d ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setDays(d)}
                    title={t("stats.periodDaysTitle", { n: d })}
                  >
                    {t("stats.daysShort", { n: d })}
                  </button>
                ))}
              </div>
              <input
                className="input input-bordered input-sm w-full sm:w-56"
                placeholder={t("stats.searchPlaceholder")}
                aria-label={t("stats.searchAria")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="select select-bordered select-sm"
                aria-label={t("stats.sortBy")}
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="subscribers">{t("stats.subscribers")}</option>
                <option value="views">{t("stats.views")}</option>
                <option value="analyticsViews">{t("stats.viewsForDays", { n: days })}</option>
                <option value="watchMinutes">{t("stats.sortWatchTime")}</option>
                <option value="videos">{t("stats.videos")}</option>
                <option value="delta">{t("stats.subscribersGrowth")}</option>
                <option value="name">{t("stats.name")}</option>
              </select>
              <button
                className="btn btn-sm btn-ghost gap-1"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={t("stats.sortDirection")}
              >
                <AppIcon name="chevron-right" size={15} className={sortDir === "asc" ? "-rotate-90" : "rotate-90"} />
                {sortDir === "asc" ? t("stats.ascending") : t("stats.descending")}
              </button>
              {isAdmin && scope === "all" && owners.length > 1 && (
                <select
                  className="select select-bordered select-sm"
                  aria-label={t("stats.owner")}
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                >
                  <option value="">{t("stats.allOwners")}</option>
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      @{o}
                    </option>
                  ))}
                </select>
              )}
              <label className="label cursor-pointer gap-2 text-sm py-0">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={onlyConnected}
                  onChange={(e) => setOnlyConnected(e.target.checked)}
                />
                {t("stats.onlyConnected")}
              </label>
              <span className="text-xs text-base-content/50 ml-auto">{t("stats.channelCount", { n: sorted.length })}</span>
            </div>
          </div>

          <StatsOverview overview={overview} metric={overviewMetric} onMetric={setOverviewMetric} days={days} />

          {sorted.length === 0 ? (
            <Empty text={t("stats.emptyNoMatch")} />
          ) : (
            <div className="space-y-4">
              {paged.map((r) => (
                <ChannelCard key={r.accountId} row={r} isAdmin={!!isAdmin} avatar={avatarMap[r.accountId]} days={days} />
              ))}
            </div>
          )}

          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                aria-label={t("common.back")}
              >
                <AppIcon name="chevron-left" size={16} />
              </button>
              <span className="text-sm text-base-content/60">
                {t("common.page")} {clampedPage} {t("common.of")} {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                aria-label={t("common.forward")}
              >
                <AppIcon name="chevron-right" size={16} />
              </button>
            </div>
          )}

          <AnalyticsFootnote rows={sorted} />
        </>
      )}
      </>
      )}
    </div>
  );
}

function StatsOverview({
  overview,
  metric,
  onMetric,
  days,
}: {
  overview: StatsOverviewData;
  metric: OverviewMetric;
  onMetric: (metric: OverviewMetric) => void;
  days: number;
}) {
  const { t } = useT();
  if (overview.channels === 0) return null;
  const hookRate = overview.analyticsViews > 0 ? (overview.engagedViews / overview.analyticsViews) * 100 : null;
  const likeRatio = overview.likes + overview.dislikes > 0 ? (overview.likes / (overview.likes + overview.dislikes)) * 100 : null;

  const metricLabels: Record<OverviewMetric, string> = {
    views: t("stats.metricViews"),
    watch: t("stats.watchHours"),
    engaged: t("stats.engagedViews"),
    subscribers: t("stats.netSubscribers"),
  };
  const chart = overview.daily.map((p) => {
    const value =
      metric === "watch"
        ? Math.round((p.watchMinutes / 60) * 10) / 10
        : metric === "engaged"
          ? p.engagedViews
          : metric === "subscribers"
            ? p.subscribersGained - p.subscribersLost
            : p.views;
    return { date: shortDate(p.date), value };
  });
  const hasBreakdowns = overview.trafficSources.length > 0 || overview.devices.length > 0 || overview.countries.length > 0;

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">{t("stats.overviewTitle")}</div>
            <div className="text-xs text-base-content/50 mt-1">
              {t("stats.overviewSubtitle", {
                channels: overview.channels,
                ready: overview.analyticsChannels,
              })}
              {overview.dataThrough ? ` · ${t("stats.analyticsDataThrough", { date: overview.dataThrough })}` : ""}
            </div>
          </div>
          <div className="join">
            {(["views", "watch", "engaged", "subscribers"] as OverviewMetric[]).map((key) => (
              <button
                key={key}
                className={`btn btn-xs join-item ${metric === key ? "btn-primary" : "btn-ghost"}`}
                onClick={() => onMetric(key)}
              >
                {metricLabels[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <MiniStat label={t("stats.viewsForDays", { n: days })} value={fmt(overview.analyticsViews)} />
          <MiniStat label={t("stats.watchTime")} value={formatWatchMinutes(overview.watchMinutes)} />
          <MiniStat label={t("stats.hookRate")} value={hookRate == null ? "—" : `${hookRate.toFixed(0)}%`} title={t("stats.hookRateHint")} />
          <MiniStat label={t("stats.engagedViews")} value={fmt(overview.engagedViews)} />
          <MiniStat label={t("stats.avgDuration")} value={formatSeconds(overview.avgViewDuration)} />
          <MiniStat label={t("stats.likeRatio")} value={likeRatio == null ? "—" : `${likeRatio.toFixed(0)}%`} title={t("stats.likeRatioHint", { likes: fmt(overview.likes), dislikes: fmt(overview.dislikes) })} />
          <MiniStat label={t("stats.netSubscribers")} value={signed(overview.subscribersGained - overview.subscribersLost)} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)] gap-4">
          <div className="rounded-lg bg-base-200/50 p-3 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-semibold">{t("stats.overviewChart")}</div>
              <div className="text-xs text-base-content/50">{metricLabels[metric]}</div>
            </div>
            {chart.length > 1 ? (
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={288}
                  initialDimension={{ width: 320, height: 288 }}
                >
                  <LineChart data={chart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" fontSize={12} tickMargin={6} minTickGap={24} />
                    <YAxis fontSize={12} width={46} allowDecimals={metric === "watch"} tickFormatter={(value) => compactNumber(Number(value))} />
                    <Tooltip formatter={(value) => compactNumber(Number(value))} />
                    <Line type="monotone" dataKey="value" name={metricLabels[metric]} stroke="#0f766e" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-sm text-base-content/45 text-center px-4">
                {t("stats.noAnalyticsChart")}
              </div>
            )}
          </div>

          <TopVideosPanel videos={overview.topVideos} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
          {hasBreakdowns ? (
            <div className="grid grid-cols-1 gap-3">
              <Breakdown title={t("stats.trafficSources")} rows={overview.trafficSources} />
              <Breakdown title={t("stats.devices")} rows={overview.devices} />
              <Breakdown title={t("stats.countries")} rows={overview.countries} />
            </div>
          ) : (
            <div className="rounded-lg bg-base-200/50 p-3 min-h-32 flex items-center justify-center text-center text-sm text-base-content/45">
              {t("stats.noBreakdowns")}
            </div>
          )}
          <TopChannelsPanel rows={overview.topChannels} />
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3" title={title}>
      <div className="text-xs text-base-content/55 flex items-center gap-1">
        {label}
        {title && <span className="text-base-content/30 cursor-help">ⓘ</span>}
      </div>
      <div className="text-lg font-bold leading-tight mt-1">{value}</div>
    </div>
  );
}

function TopVideosPanel({ videos }: { videos: OverviewTopVideo[] }) {
  const { t } = useT();
  return (
    <div className="rounded-lg bg-base-200/50 p-3 min-w-0">
      <div className="text-sm font-semibold mb-3">{t("stats.topVideosAll")}</div>
      {videos.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-sm text-base-content/45 text-center px-4">
          {t("stats.noTopVideos")}
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-auto pr-1">
          {videos.slice(0, 10).map((v, index) => (
            <a
              key={`${v.accountId}:${v.videoId}`}
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noreferrer"
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-base-100/70 p-2 hover:bg-base-100"
            >
              <div className="text-xs text-base-content/45 text-right shrink-0">{index + 1}</div>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{cleanDisplayText(v.title)}</div>
                <div className="text-xs text-base-content/50 truncate">{v.channelTitle}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmt(v.views)}</div>
                <div className="text-[11px] text-base-content/45">
                  {t("stats.views").toLowerCase()} · {formatWatchMinutes(v.watchMinutes)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function TopChannelsPanel({ rows }: { rows: OverviewTopChannel[] }) {
  const { t } = useT();
  const ranked = rows.slice(0, 8).map((r) => ({
    ...r,
    mainViews: r.analyticsViews || r.publicViews,
    hasAnalytics: r.analyticsViews > 0,
  }));
  const maxViews = Math.max(1, ...ranked.map((r) => r.mainViews));
  return (
    <aside className="card bg-base-100 border border-base-300">
      <div className="card-body p-4 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{t("stats.topChannels")}</div>
            <div className="text-xs text-base-content/45">{t("stats.topChannelsHint")}</div>
          </div>
          {ranked.some((r) => !r.hasAnalytics) && (
            <span className="badge badge-ghost badge-sm shrink-0">{t("stats.totalFallbackShort")}</span>
          )}
        </div>
      {rows.length === 0 ? (
        <div className="text-sm text-base-content/45 py-6 text-center">{t("stats.noTopChannels")}</div>
      ) : (
        <div className="space-y-2">
          {ranked.map((r, index) => {
            const pct = Math.max(3, Math.round((r.mainViews / maxViews) * 100));
            return (
              <div
                key={r.accountId}
                className={`rounded-lg border px-3 py-2.5 ${
                  r.hasAnalytics ? "bg-base-200/45 border-base-300" : "bg-base-200/20 border-base-300/70"
                }`}
              >
                <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2.5">
                  <div className="text-xs font-semibold text-base-content/45 tabular-nums">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    {r.ytChannelId ? (
                      <a
                        href={`https://www.youtube.com/channel/${r.ytChannelId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium truncate block link-hover"
                        title={t("stats.openOnYoutube")}
                      >
                        {r.channelTitle}
                      </a>
                    ) : (
                      <div className="font-medium truncate">{r.channelTitle}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-base-content/45 min-w-0">
                      {r.ownerUsername && <span className="truncate">@{r.ownerUsername}</span>}
                      {!r.hasAnalytics && <span className="badge badge-ghost badge-xs">{t("stats.noPeriodAnalyticsShort")}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-bold leading-none tabular-nums">{fmt(r.mainViews)}</div>
                    <div className="text-[11px] uppercase tracking-wide text-base-content/45">
                      {r.hasAnalytics ? t("stats.periodShort") : t("stats.totalShort")}
                    </div>
                  </div>
                </div>

                <div className="h-1 rounded-full bg-base-300/70 overflow-hidden mt-2.5">
                  <div
                    className={`h-full rounded-full ${r.hasAnalytics ? "bg-primary" : "bg-base-content/25"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  {r.hasAnalytics ? (
                    <div className="min-w-0 text-base-content/55 truncate">
                      {formatWatchMinutes(r.watchMinutes)} · {formatSeconds(r.avgViewDuration)} ·{" "}
                      <span className={r.subscribersNet > 0 ? "text-success" : r.subscribersNet < 0 ? "text-error" : ""}>
                        {signed(r.subscribersNet)}
                      </span>
                    </div>
                  ) : (
                    <div className="min-w-0 text-base-content/45 truncate">{t("stats.totalFallbackShort")}</div>
                  )}
                  {r.ytChannelId && (
                    <a
                      href={`https://www.youtube.com/channel/${r.ytChannelId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                      title={t("stats.openOnYoutube")}
                      aria-label={t("stats.openOnYoutube")}
                    >
                      <AppIcon name="external" size={14} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </aside>
  );
}

function AnalyticsFootnote({ rows }: { rows: StatRow[] }) {
  const { t } = useT();
  const pending = rows.filter(
    (r) => r.connected && !r.analytics.error && r.analytics.summary.views <= 0 && r.analytics.topVideos.length === 0,
  );
  if (pending.length === 0) return null;
  return (
    <div className="rounded-lg border border-base-300 bg-base-100/50 px-4 py-3 text-xs text-base-content/45">
      <div>{t("stats.analyticsPendingFootnote", { n: pending.length })}</div>
      <details className="mt-1">
        <summary className="cursor-pointer select-none hover:text-base-content/70">
          {t("stats.analyticsPendingChannels")}
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pending.slice(0, 20).map((r) => (
            <span key={r.accountId} className="badge badge-ghost badge-sm">
              {r.ytChannelTitle || r.channelName}
            </span>
          ))}
          {pending.length > 20 && <span className="text-base-content/35">+{pending.length - 20}</span>}
        </div>
      </details>
    </div>
  );
}

function ChannelCard({ row, isAdmin, avatar, days }: { row: StatRow; isAdmin: boolean; avatar?: string | null; days: number }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<StatPoint[] | null>(null);

  useEffect(() => {
    if (open && points == null) {
      apiClient
        .statsHistory(row.accountId)
        .then(setPoints)
        .catch((e) => {
          console.error(`[Статистика] история канала #${row.accountId}:`, e);
          setPoints([]);
        });
    }
  }, [open, points, row.accountId]);

  const title = row.ytChannelTitle || row.channelName;
  const subtitle = !row.connected
    ? t("stats.notConnectedYt")
    : row.latest
      ? t("stats.updatedAgo", { ago: timeAgo(row.latest.takenAt, t) })
      : t("stats.noSnapshots");

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="w-11 h-11 rounded-full object-cover border border-base-300 bg-base-200 shrink-0"
            />
          ) : (
            <div className="bg-primary/10 text-primary rounded-full w-11 h-11 flex items-center justify-center shrink-0">
              <AppIcon name="analytics" size={20} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{title}</div>
            <div className="text-sm text-base-content/60 truncate">
              {isAdmin && row.ownerUsername ? (
                <span className="text-base-content/80">@{row.ownerUsername}</span>
              ) : null}
              {isAdmin && row.ownerUsername ? " · " : ""}
              {subtitle}
            </div>
          </div>
          {row.error ? (
            <span className="badge badge-error badge-sm" title={row.error}>
              {t("stats.badgeError")}
            </span>
          ) : !row.connected ? (
            <span className="badge badge-warning badge-sm">{t("stats.badgeNotConnected")}</span>
          ) : (
            row.ytChannelId && (
              <a
                href={`https://www.youtube.com/channel/${row.ytChannelId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs text-error"
                title={t("stats.openOnYoutube")}
              >
                <AppIcon name="youtube" size={14} />
                YouTube
              </a>
            )
          )}
        </div>

        {row.error && (
          <div className="alert alert-error py-2 text-xs">
            <AppIcon name="warning" size={15} className="shrink-0" />
            <span>{row.error}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Metric label={t("stats.subscribers")} value={row.latest?.subscribers} delta={delta(row, "subscribers")} t={t} />
          <Metric label={t("stats.views")} value={row.latest?.views} delta={delta(row, "views")} t={t} />
          <Metric label={t("stats.videos")} value={row.latest?.videos} delta={delta(row, "videos")} t={t} />
        </div>

        {row.analytics.summary.views > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Metric label={t("stats.viewsForDays", { n: days })} value={row.analytics.summary.views} delta={null} t={t} />
            <Metric
              label={t("stats.hookRate")}
              value={`${((row.analytics.summary.engagedViews / row.analytics.summary.views) * 100).toFixed(0)}%`}
              delta={null}
              t={t}
            />
            <Metric label={t("stats.watchTime")} value={formatWatchMinutes(row.analytics.summary.watchMinutes)} delta={null} t={t} />
            <Metric label={t("stats.engagedViews")} value={row.analytics.summary.engagedViews} delta={null} t={t} />
            <Metric label={t("stats.avgDuration")} value={formatSeconds(row.analytics.summary.avgViewDuration)} delta={null} t={t} />
          </div>
        )}

        <button
          className="btn btn-ghost btn-sm gap-1 w-fit"
          onClick={() => setOpen((v) => !v)}
          disabled={!row.latest}
        >
          <AppIcon name="analytics" size={15} />
          {open ? t("stats.hideChart") : t("stats.showChart")}
          <AppIcon name="chevron-right" size={15} className={open ? "rotate-90 transition-transform" : "transition-transform"} />
        </button>

        {open && (
          <div className="space-y-4">
            <ChannelChart points={points} />
            <ChannelAnalytics analytics={row.analytics} />
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelAnalytics({ analytics }: { analytics: YoutubeAnalyticsPayload }) {
  const { t } = useT();
  if (analytics.error) {
    return (
      <div className="alert alert-warning py-2 text-xs">
        <span>{analytics.error}</span>
      </div>
    );
  }
  if (analytics.summary.views <= 0 && analytics.topVideos.length === 0) {
    return null;
  }
  return (
    <div className="space-y-4">
      {analytics.dataThrough && (
        <div className="text-xs text-base-content/50">
          {t("stats.analyticsDataThrough", { date: analytics.dataThrough })}
        </div>
      )}
      {analytics.topVideos.length > 0 && (
        <div>
          <div className="font-semibold text-sm mb-2">{t("stats.topVideos")}</div>
          <div className="space-y-2">
            {analytics.topVideos.slice(0, 5).map((v) => (
              <a
                key={v.videoId}
                href={`https://www.youtube.com/watch?v=${v.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg bg-base-200/60 p-2 hover:bg-base-200"
              >
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="w-16 h-9 object-cover rounded bg-base-300" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{cleanDisplayText(v.title)}</div>
                  <div className="text-xs text-base-content/50">
                    {fmt(v.views)} {t("stats.views").toLowerCase()} · {formatWatchMinutes(v.watchMinutes)} · {formatSeconds(v.avgViewDuration)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        <Breakdown title={t("stats.trafficSources")} rows={analytics.trafficSources} />
        <Breakdown title={t("stats.devices")} rows={analytics.devices} />
        <Breakdown title={t("stats.countries")} rows={analytics.countries} />
        <Demographics rows={analytics.demographics} />
        <Sharing rows={analytics.sharing} />
      </div>
    </div>
  );
}

// Audience demographics — the API returns only viewerPercentage (logged-in viewers), age×gender.
function Demographics({ rows }: { rows: YoutubeDemographicsRow[] }) {
  const { t } = useT();
  if (!rows.length) return null;
  const top = [...rows].sort((a, b) => b.viewerPercentage - a.viewerPercentage).slice(0, 8);
  const max = Math.max(1, ...top.map((r) => r.viewerPercentage));
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="font-semibold text-sm mb-2">{t("stats.demographics")}</div>
      <div className="space-y-2">
        {top.map((r) => (
          <div key={`${r.ageGroup}:${r.gender}`} className="rounded-md border border-base-300/70 bg-base-100/65 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm">
                {r.ageGroup.replace(/^age/, "")} · {genderLabel(r.gender, t)}
              </span>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{r.viewerPercentage.toFixed(1)}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded bg-base-300 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${Math.round((r.viewerPercentage / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Where viewers shared the video (share counts per service).
function Sharing({ rows }: { rows: YoutubeSharingRow[] }) {
  const { t } = useT();
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.shares, 0);
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="font-semibold text-sm mb-2">{t("stats.sharing")}</div>
      <div className="space-y-2">
        {rows.slice(0, 6).map((r) => {
          const pct = total > 0 ? Math.round((r.shares / total) * 100) : 0;
          return (
            <div key={r.service} className="rounded-md border border-base-300/70 bg-base-100/65 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{sharingLabel(r.service)}</span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{fmt(r.shares)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded bg-base-300 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] text-base-content/45 tabular-nums">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: YoutubeBreakdownRow[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.views, 0);
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="font-semibold text-sm mb-2">{title}</div>
      <div className="space-y-2">
        {rows.slice(0, 5).map((r) => {
          const pct = total > 0 ? Math.round((r.views / total) * 100) : 0;
          return (
            <div key={r.key} className="rounded-md border border-base-300/70 bg-base-100/65 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{labelValue(r.key)}</span>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{fmt(r.views)}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded bg-base-300 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-[11px] text-base-content/45 tabular-nums">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChannelChart({ points }: { points: StatPoint[] | null }) {
  const { t } = useT();
  if (points == null) {
    return (
      <div className="py-8 text-center">
        <span className="loading loading-spinner loading-sm" />
      </div>
    );
  }
  if (points.length < 2) {
    return (
      <div className="text-sm text-base-content/50 py-4">
        {t("stats.needTwoSnapshots")}
      </div>
    );
  }
  const data = points.map((p) => ({
    t: new Date(parseUtc(p.takenAt)).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    }),
    subscribers: p.subscribers,
    views: p.views,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" fontSize={12} tickMargin={6} />
          <YAxis yAxisId="left" fontSize={12} width={44} tickFormatter={(value) => compactNumber(Number(value))} />
          <YAxis yAxisId="right" orientation="right" fontSize={12} width={44} tickFormatter={(value) => compactNumber(Number(value))} />
          <Tooltip formatter={(value) => compactNumber(Number(value))} />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="subscribers" name={t("stats.subscribers")} stroke="#6419e6" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="views" name={t("stats.views")} stroke="#1d4ed8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value, delta, t }: { label: string; value?: ReactNode; delta: number | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="text-xl font-bold leading-tight">{value == null ? "—" : typeof value === "number" ? fmt(value) : value}</div>
      <DeltaBadge delta={delta} t={t} />
    </div>
  );
}

function DeltaBadge({ delta, t }: { delta: number | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (delta == null) return <div className="text-xs text-base-content/40 mt-0.5">{t("stats.firstSnapshot")}</div>;
  if (delta === 0) return <div className="text-xs text-base-content/40 mt-0.5">{t("stats.noChange")}</div>;
  const up = delta > 0;
  return (
    <div className={`text-xs mt-0.5 flex items-center gap-0.5 ${up ? "text-success" : "text-error"}`}>
      {up ? "+" : "−"}
      {fmt(Math.abs(delta))}
    </div>
  );
}

// Platform-wide production totals — one compact strip, the same numbers for every user.
function PlatformBand({ s }: { s: PlatformSummary }) {
  const { t } = useT();
  const items: { label: string; value: ReactNode }[] = [
    { label: t("stats.platQueued"), value: fmt(s.queued) },
    { label: t("stats.platUploaded"), value: fmt(s.published) },
    { label: t("stats.platScheduled"), value: fmt(s.scheduled) },
    { label: t("stats.platChannels"), value: `${fmt(s.channelsConnected)} / ${fmt(s.channels)}` },
  ];
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body py-3 flex-row flex-wrap items-center gap-x-7 gap-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
          <AppIcon name="youtube" size={16} className="text-primary" />
          {t("stats.platTitle")}
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
          {items.map((it) => (
            <div key={it.label} className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tabular-nums leading-none">{it.value}</span>
              <span className="text-xs text-base-content/55">{it.label}</span>
            </div>
          ))}
        </div>
        <span className="text-xs text-base-content/40 ml-auto">{t("stats.platHint")}</span>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, title }: { icon: ReactNode; label: string; value: ReactNode; title?: string }) {
  return (
    <div className="card bg-base-100 border border-base-300" title={title}>
      <div className="card-body flex-row items-center gap-4 py-5">
        <div className="text-primary">{icon}</div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-sm text-base-content/60 mt-1 flex items-center gap-1">
            {label}
            {title && <span className="text-base-content/30 cursor-help">ⓘ</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300 border-dashed">
      <div className="card-body items-center text-center py-16">
        {icon && <AppIcon name="analytics" className="text-base-content/30" size={40} />}
        <p className="text-base-content/60 max-w-md">{text}</p>
      </div>
    </div>
  );
}

function buildOverview(rows: StatRow[]): StatsOverviewData {
  const daily = new Map<string, OverviewDailyPoint>();
  const topVideos: OverviewTopVideo[] = [];
  const topChannels: OverviewTopChannel[] = [];
  const trafficSources: YoutubeBreakdownRow[] = [];
  const devices: YoutubeBreakdownRow[] = [];
  const countries: YoutubeBreakdownRow[] = [];
  const overview: StatsOverviewData = {
    channels: rows.length,
    connected: 0,
    subscribers: 0,
    publicViews: 0,
    videos: 0,
    analyticsChannels: 0,
    analyticsViews: 0,
    watchMinutes: 0,
    engagedViews: 0,
    avgViewDuration: 0,
    avgViewPercentage: 0,
    likes: 0,
    dislikes: 0,
    comments: 0,
    shares: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    dataThrough: null,
    daily: [],
    topVideos,
    topChannels,
    trafficSources: [],
    devices: [],
    countries: [],
  };
  let durationWeighted = 0;
  let percentageWeighted = 0;

  for (const row of rows) {
    if (row.connected) overview.connected += 1;
    if (row.latest) {
      overview.subscribers += row.latest.subscribers;
      overview.publicViews += row.latest.views;
      overview.videos += row.latest.videos;
    }

    const analytics = row.analytics;
    const summary = analytics.summary;
    const hasAnalytics = summary.views > 0 || analytics.daily.length > 0 || analytics.topVideos.length > 0;
    if (hasAnalytics) overview.analyticsChannels += 1;
    if (analytics.dataThrough && (!overview.dataThrough || analytics.dataThrough > overview.dataThrough)) {
      overview.dataThrough = analytics.dataThrough;
    }

    overview.analyticsViews += summary.views;
    overview.watchMinutes += summary.watchMinutes;
    overview.engagedViews += summary.engagedViews;
    overview.likes += summary.likes;
    overview.dislikes += summary.dislikes;
    overview.comments += summary.comments;
    overview.shares += summary.shares;
    overview.subscribersGained += summary.subscribersGained;
    overview.subscribersLost += summary.subscribersLost;
    if (summary.views > 0) {
      durationWeighted += summary.avgViewDuration * summary.views;
      percentageWeighted += summary.avgViewPercentage * summary.views;
    }

    for (const point of analytics.daily) {
      const current =
        daily.get(point.date) ??
        {
          date: point.date,
          views: 0,
          watchMinutes: 0,
          engagedViews: 0,
          subscribersGained: 0,
          subscribersLost: 0,
        };
      current.views += point.views;
      current.watchMinutes += point.watchMinutes;
      current.engagedViews += point.engagedViews;
      current.subscribersGained += point.subscribersGained;
      current.subscribersLost += point.subscribersLost;
      daily.set(point.date, current);
    }

    const channelTitle = row.ytChannelTitle || row.channelName;
    for (const video of analytics.topVideos) {
      topVideos.push({
        ...video,
        accountId: row.accountId,
        channelTitle,
        ownerUsername: row.ownerUsername,
      });
    }
    topChannels.push({
      accountId: row.accountId,
      channelTitle,
      ytChannelId: row.ytChannelId,
      ownerUsername: row.ownerUsername,
      subscribers: row.latest?.subscribers ?? 0,
      publicViews: row.latest?.views ?? 0,
      analyticsViews: summary.views,
      watchMinutes: summary.watchMinutes,
      avgViewDuration: summary.avgViewDuration,
      subscribersNet: summary.subscribersGained - summary.subscribersLost,
    });
    trafficSources.push(...analytics.trafficSources);
    devices.push(...analytics.devices);
    countries.push(...analytics.countries);
  }

  if (overview.analyticsViews > 0) {
    overview.avgViewDuration = durationWeighted / overview.analyticsViews;
    overview.avgViewPercentage = percentageWeighted / overview.analyticsViews;
  }

  overview.daily = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  overview.topVideos = topVideos.sort((a, b) => b.views - a.views).slice(0, 10);
  overview.topChannels = topChannels
    .sort((a, b) => (b.analyticsViews || b.publicViews) - (a.analyticsViews || a.publicViews))
    .slice(0, 8);
  overview.trafficSources = mergeBreakdowns(trafficSources);
  overview.devices = mergeBreakdowns(devices);
  overview.countries = mergeBreakdowns(countries);
  return overview;
}

function mergeBreakdowns(rows: YoutubeBreakdownRow[]): YoutubeBreakdownRow[] {
  const byKey = new Map<string, YoutubeBreakdownRow & { _durationWeighted: number }>();
  for (const row of rows) {
    const key = row.key || "unknown";
    const current =
      byKey.get(key) ??
      {
        key,
        views: 0,
        engagedViews: 0,
        watchMinutes: 0,
        avgViewDuration: 0,
        _durationWeighted: 0,
      };
    current.views += row.views;
    current.engagedViews += row.engagedViews;
    current.watchMinutes += row.watchMinutes;
    if (row.avgViewDuration && row.views > 0) current._durationWeighted += row.avgViewDuration * row.views;
    byKey.set(key, current);
  }
  return [...byKey.values()]
    .map(({ _durationWeighted, ...row }) => ({
      ...row,
      avgViewDuration: row.views > 0 ? _durationWeighted / row.views : 0,
    }))
    .sort((a, b) => b.views - a.views);
}

function delta(row: StatRow, key: MetricKey): number | null {
  if (!row.latest || !row.prev) return null;
  return row.latest[key] - row.prev[key];
}

function fmt(n: number): string {
  return compactNumber(n);
}

function signed(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${fmt(Math.abs(n))}`;
}

function shortDate(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
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

function labelValue(v: string): string {
  return v
    .replace(/^YT_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function genderLabel(g: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const key = g.toLowerCase();
  if (key.includes("female")) return t("stats.genderFemale");
  if (key.includes("male")) return t("stats.genderMale");
  return t("stats.genderOther");
}

// Friendly names for YouTube sharingService values (proper nouns left untranslated).
const SHARING_NAMES: Record<string, string> = {
  WHATS_APP: "WhatsApp",
  TELEGRAM: "Telegram",
  FACEBOOK: "Facebook",
  FACEBOOK_MESSENGER: "Messenger",
  TWITTER: "X (Twitter)",
  REDDIT: "Reddit",
  PINTEREST: "Pinterest",
  TUMBLR: "Tumblr",
  KAKAO: "KakaoTalk",
  LINE: "LINE",
  VKONTAKTE: "VK",
  COPY_PASTE: "Copy link",
  EMAIL: "Email",
  TEXT_MESSAGE: "Messages",
  ANDROID_MESSAGES: "Messages",
  EMBED: "Embed",
};
function sharingLabel(s: string): string {
  return SHARING_NAMES[s] ?? labelValue(s);
}

// SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker; parse it as UTC.
function parseUtc(s: string): string {
  return s.includes("T") ? s : s.replace(" ", "T") + "Z";
}

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const then = new Date(parseUtc(iso)).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return t("stats.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("stats.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("stats.hoursAgo", { n: hr });
  return t("stats.daysAgo", { n: Math.floor(hr / 24) });
}
