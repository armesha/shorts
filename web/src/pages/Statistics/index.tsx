import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  apiClient,
  type StatRow,
  type UserAnalytics,
  type PlatformSummary,
} from "../../lib/api";
import { AppIcon } from "../../components/AppIcon";
import { ToastStack, useToasts } from "../../components/Toasts";
import { useAuth } from "../../lib/auth";
import { isAdminLike, isAdminRole } from "../../lib/authz";
import { compactNumber } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { fmt, shortDate } from "../../lib/statsFormat";
import { buildOverview } from "./overview";
import { SourceStats, StatsOverview, type OverviewMetric } from "./StatsOverview";
import { ChannelCard, AnalyticsFootnote, PlatformBand, Empty } from "./ChannelCard";
import { ChartTip } from "./viz";

type Scope = "mine" | "all";
type View = "mine" | "all";
type Source = "analytics" | "data";
type SortKey = "name" | "subscribers" | "views" | "videos" | "delta" | "analyticsViews" | "watchMinutes";
const PAGE_SIZE = 10;

// Persisted filters — restore the last-used filter/sort on the next visit.
const STORE_KEY = "statsFilters.v1";
type SavedFilters = {
  search?: string;
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
  ownerFilter?: string;
  onlyConnected?: boolean;
  view?: View; // legacy only; the page now always opens on "mine"
  days?: number; // analytics window: 7 / 30 / 90
  scope?: Scope; // legacy (pre-«Сводка» tab) — still honoured when restoring
  source?: Source; // «Analytics» (period metrics, default) vs «Data API» (public counters)
};
const DAYS_OPTIONS = [7, 30, 90] as const;
function loadFilters(): SavedFilters {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as SavedFilters;
  } catch {
    return {};
  }
}

// Publish-activity chart series: status colours from the --stx-* tokens; a series that is zero
// for the whole window (usually «запланировано»/«ошибки») is dropped so an alarm-coloured flat
// line does not hug the axis.
function activitySeries(
  daily: NonNullable<UserAnalytics["daily"]>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { key: "published" | "scheduled" | "failed"; label: string; color: string }[] {
  return (
    [
      { key: "published", label: t("stats.published"), color: "var(--stx-ok)" },
      { key: "scheduled", label: t("stats.scheduled"), color: "var(--stx-mid)" },
      { key: "failed", label: t("stats.failed"), color: "var(--stx-bad)" },
    ] as const
  ).filter((s) => daily.some((d) => d[s.key] > 0));
}

export default function Statistics() {
  const { t } = useT();
  const { user } = useAuth();
  const canViewAll = isAdminLike(user);
  const canRefreshAll = isAdminRole(user);
  const [saved] = useState(loadFilters); // last-used filters (localStorage), restored on mount
  const [rows, setRows] = useState<StatRow[]>([]);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null); // own publishing activity
  const [summary, setSummary] = useState<PlatformSummary | null>(null); // platform-wide totals for the "all channels" view
  const [view, setView] = useState<View>("mine");
  const [days, setDays] = useState<number>(() => {
    const d = saved.days ?? 30;
    return DAYS_OPTIONS.includes(d as 7 | 30 | 90) ? d : 30;
  });
  const scope: Scope = canViewAll && view === "all" ? "all" : "mine";
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Refresh outcomes surface as floating bottom-right toasts (like the Creator studio), not
  // inline banners that push the page content around.
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [avatarMap, setAvatarMap] = useState<Record<number, string | null | undefined>>({});
  // Controls (persisted): search, sort, owner filter, only-connected (default ON), pagination.
  const [search, setSearch] = useState(saved.search ?? "");
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey ?? "subscribers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir ?? "desc");
  const [ownerFilter, setOwnerFilter] = useState(saved.ownerFilter ?? "");
  const [onlyConnected, setOnlyConnected] = useState(saved.onlyConnected ?? true);
  const [page, setPage] = useState(1);
  const [overviewMetric, setOverviewMetric] = useState<OverviewMetric>("views");
  // Source tab: the page is Analytics-first; «Data API» collects everything built on the
  // public lifetime counters (totals ledger, snapshot deltas, history charts).
  const [source, setSource] = useState<Source>(saved.source === "data" ? "data" : "analytics");

  useEffect(() => {
    if (!canViewAll && view === "all") setView("mine");
  }, [canViewAll, view]);

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

  // Publishing analytics: the user's OWN channels, but admins on «Все каналы» get every channel —
  // so the activity section/chart follows the same scope toggle as the rest of the page.
  useEffect(() => {
    const allChannels = canViewAll && scope === "all";
    apiClient
      .analytics(allChannels ? "all" : undefined)
      .then(setAnalytics)
      .catch(() => {});
  }, [scope, canViewAll]);

  // Platform-wide production totals belong only to the "All channels" view.
  useEffect(() => {
    if (scope !== "all") {
      setSummary(null);
      return;
    }
    apiClient.summary().then(setSummary).catch(() => {});
  }, [scope]);

  // Any filter/sort/view change → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, view]);

  // Persist the active filters so the next visit/reload restores them.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ search, sortKey, sortDir, ownerFilter, onlyConnected, days, source }),
      );
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, days, source]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      // Moderators may view all-channel aggregates, but only real admins refresh all channels.
      const refreshScope: Scope = canRefreshAll ? scope : "mine";
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
        pushToast({
          type: "warning",
          text: t(canRefreshAll ? "stats.refreshPartialAdmin" : "stats.refreshPartial", {
            ok: connected.length - failed.length,
            total: connected.length,
            failed: failed.length,
          }),
          // The non-admin text is a step-by-step fix guide — keep it up until closed.
          duration: canRefreshAll ? undefined : null,
        });
      } else if (connected.length === 0) {
        pushToast({ type: "info", text: t("stats.refreshNoneConnected") });
      } else {
        pushToast({ type: "success", text: t("stats.refreshOkShort", { n: connected.length }) });
      }
    } catch (e) {
      console.error("[Статистика] запрос /stats/refresh упал:", e);
      pushToast({ type: "error", text: t("stats.refreshErrorBanner") });
    } finally {
      setRefreshing(false);
    }
  }

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.ownerUsername).filter((x): x is string => !!x))].sort(),
    [rows],
  );
  const activeOwnerFilter = canViewAll && scope === "all" ? ownerFilter : "";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyConnected && !r.connected) return false;
      if (activeOwnerFilter && r.ownerUsername !== activeOwnerFilter) return false;
      if (q && !`${r.ytChannelTitle || r.channelName} ${r.ownerUsername || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, activeOwnerFilter, onlyConnected]);
  const scopeOverview = useMemo(() => buildOverview(rows), [rows]);
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
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.statistics")}</h1>
          <p className="text-base-content/60">{t("stats.subtitle")}</p>
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="join overflow-hidden rounded-lg border border-base-300" role="group" aria-label={t("stats.period")}>
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
            {canViewAll && (
              <div className="join overflow-hidden rounded-lg border border-base-300" role="group" aria-label={t("stats.scope")}>
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
              </div>
            )}
            <div className="join overflow-hidden rounded-lg border border-base-300" role="group" aria-label={t("stats.sourceTabsAria")}>
              <button
                className={`btn btn-sm join-item ${source === "analytics" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSource("analytics")}
                title={t("stats.sourceAnalyticsHint")}
              >
                Analytics
              </button>
              <button
                className={`btn btn-sm join-item ${source === "data" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setSource("data")}
                title={t("stats.sourceDataHint")}
              >
                Data API
              </button>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <span className="hidden md:inline text-xs text-base-content/50">
                {t("stats.contextChannels", { ready: scopeOverview.analyticsChannels, total: scopeOverview.channels })}
              </span>
              <button
                className="btn btn-sm btn-primary gap-2"
                onClick={refresh}
                disabled={refreshing || loading}
                title={t("stats.refreshTitle")}
              >
                {refreshing ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <AppIcon name="refresh" size={18} />
                )}
                {t("stats.refresh")}
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="alert alert-error text-sm py-2 items-start">
          <AppIcon name="warning" size={17} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-line flex-1">{error}</span>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={() => setError(null)}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <AppIcon name="close" size={14} />
          </button>
        </div>
      )}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <>
      {scope === "all" && summary && <PlatformBand s={summary} />}
      <SourceStats overview={scopeOverview} days={days} source={source} />

      {source === "analytics" && analytics &&
        analytics.summary.published + analytics.summary.scheduled + analytics.summary.failed + analytics.summary.queuedVideos > 0 && (
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title text-base">
                  {t("stats.publishActivity")} ·{" "}
                  {canViewAll && scope === "all" ? t("stats.publishScopeAll") : t("stats.publishScopeMine")}
                </h2>
                {analytics.daily.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                    {activitySeries(analytics.daily, t).map((s) => (
                      <span key={s.key} className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2" style={{ background: s.color }} aria-hidden="true" />
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="stx-quiet-row text-sm">
                <span>
                  <span className="stx-num font-bold text-success">{fmt(analytics.summary.published)}</span>{" "}
                  <span className="stx-cap">{t("stats.published")}</span>
                </span>
                <span>
                  <span className="stx-num font-bold">{fmt(analytics.summary.scheduled)}</span>{" "}
                  <span className="stx-cap">{t("stats.scheduled")}</span>
                </span>
                <span>
                  <span className={`stx-num font-bold ${analytics.summary.failed > 0 ? "text-error" : ""}`}>
                    {fmt(analytics.summary.failed)}
                  </span>{" "}
                  <span className="stx-cap">{t("stats.failed")}</span>
                </span>
                <span>
                  <span className="stx-num font-bold">{fmt(analytics.summary.queuedVideos)}</span>{" "}
                  <span className="stx-cap">{t("stats.queued")}</span>
                </span>
              </div>
              {analytics.daily.length > 1 && (
                <div className="stx-panel p-3" style={{ height: 190 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={analytics.daily.map((d) => ({ ...d, date: shortDate(d.date) }))}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="var(--stx-grid)" />
                      <XAxis
                        dataKey="date"
                        fontSize={11}
                        tickMargin={6}
                        minTickGap={28}
                        tickLine={false}
                        axisLine={{ stroke: "var(--stx-grid)" }}
                        tick={{ fill: "var(--stx-axis)" }}
                      />
                      <YAxis
                        allowDecimals={false}
                        fontSize={11}
                        width={40}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "var(--stx-axis)" }}
                        tickFormatter={(value) => compactNumber(Number(value))}
                      />
                      <Tooltip
                        content={<ChartTip format={(v) => compactNumber(v)} />}
                        cursor={{ stroke: "var(--stx-axis)", strokeDasharray: "3 3" }}
                      />
                      {activitySeries(analytics.daily, t).map((s) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={s.color}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      ))}
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
          {source === "analytics" && (
            <StatsOverview overview={overview} metric={overviewMetric} onMetric={setOverviewMetric} days={days} />
          )}

          {/* Controls: search / sort / direction / owner filter / only-connected */}
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body py-3 flex-row flex-wrap items-center gap-2">
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
              {canViewAll && scope === "all" && owners.length > 1 && (
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

          {sorted.length === 0 ? (
            <Empty text={t("stats.emptyNoMatch")} />
          ) : (
            <div className="space-y-4">
              {paged.map((r) => (
                <ChannelCard
                  key={r.accountId}
                  row={r}
                  isAdmin={!!canViewAll}
                  avatar={avatarMap[r.accountId]}
                  days={days}
                  source={source}
                />
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

          {source === "analytics" && <AnalyticsFootnote rows={sorted} />}
        </>
      )}
      </>
    </div>
  );
}
