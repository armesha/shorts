import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiClient, type AdminAnalytics as AdminAnalyticsData } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { KpiGrid, DailyChart, YoutubeChart } from "./adminCharts";
import { TopChannels, Runway, TopUsers, Problems, Empty } from "./adminTables";

type Range = { from: string; to: string };

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
