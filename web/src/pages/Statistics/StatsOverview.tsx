import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { YoutubeBreakdownRow } from "../../lib/api";
import { AppIcon } from "../../components/AppIcon";
import { useT } from "../../lib/i18n";
import { cleanDisplayText } from "../../lib/text";
import {
  fmt,
  signed,
  shortDate,
  formatWatchMinutes,
  formatSeconds,
  formatMetricValue,
  labelValue,
} from "../../lib/statsFormat";
import type { OverviewTopChannel, OverviewTopVideo, StatsOverviewData } from "./overview";

export type OverviewMetric = "views" | "watch" | "engaged" | "subscribers";

export function SourceStats({ overview, days, isAdmin }: { overview: StatsOverviewData; days: number; isAdmin: boolean }) {
  const { t } = useT();
  return (
    <div className={`grid grid-cols-1 gap-4 ${isAdmin ? "xl:grid-cols-2" : ""}`}>
      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="card-title text-base">{t("stats.youtubeAnalyticsTitle")}</h2>
            </div>
            <span className="badge badge-info badge-sm">Analytics</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat label={t("stats.viewsForDays", { n: days })} value={fmt(overview.analyticsViews)} title={t("stats.periodViewsHint")} />
            <MiniStat label={t("stats.watchTime")} value={formatWatchMinutes(overview.watchMinutes)} />
            <MiniStat label={t("stats.engagedViews")} value={fmt(overview.engagedViews)} />
            <MiniStat label={t("stats.avgDuration")} value={formatSeconds(overview.avgViewDuration)} />
          </div>
        </div>
      </section>
      {isAdmin && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="card-title text-base">{t("stats.youtubeDataTitle")}</h2>
              </div>
              <span className="badge badge-outline badge-sm shrink-0 whitespace-nowrap">Data API</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label={t("stats.totalSubscribers")} value={fmt(overview.subscribers)} />
              <MiniStat label={t("stats.totalViews")} value={fmt(overview.publicViews)} />
              <MiniStat label={t("stats.videos")} value={fmt(overview.videos)} />
              <MiniStat label={t("stats.channelsConnected")} value={`${overview.connected} / ${overview.channels}`} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export function StatsOverview({
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
            {days !== 90 && (
              <div className="text-xs text-base-content/40 mt-0.5">{t("stats.breakdownPeriodNote")}</div>
            )}
          </div>
          <div className="min-w-0 max-w-full overflow-x-auto pb-1">
            <div className="join min-w-max">
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
                    <YAxis fontSize={12} width={46} allowDecimals={metric === "watch"} tickFormatter={(value) => formatMetricValue(Number(value), metric)} />
                    <Tooltip formatter={(value) => formatMetricValue(Number(value), metric)} />
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

export function MiniStat({ label, value, title }: { label: string; value: ReactNode; title?: string }) {
  return (
    <div className="relative flex min-h-24 flex-col rounded-lg border border-base-300/70 bg-base-100 p-3 shadow-sm" title={title}>
      <div className="min-h-9 pr-5 text-xs leading-snug text-base-content/55">
        {label}
      </div>
      {title && <span className="absolute right-3 top-3 text-base-content/30 cursor-help">ⓘ</span>}
      <div className="mt-auto pt-2 text-xl font-bold leading-none tracking-normal">{value}</div>
    </div>
  );
}

const TOP_VIDEOS_CAP = 100;

export function TopVideosPanel({ videos: allVideos }: { videos: OverviewTopVideo[] }) {
  const { t } = useT();
  // Показываем максимум 100 лучших роликов (overview.topVideos уже отсортирован по просмотрам).
  const videos = allVideos.length > TOP_VIDEOS_CAP ? allVideos.slice(0, TOP_VIDEOS_CAP) : allVideos;
  const [visible, setVisible] = useState(10);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const shown = videos.slice(0, visible);

  useEffect(() => {
    setVisible(10);
  }, [videos.length]);

  useEffect(() => {
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target || visible >= videos.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible((n) => Math.min(videos.length, n + 10));
      },
      { root, rootMargin: "96px 0px", threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [videos.length, visible]);

  return (
    <div className="rounded-lg bg-base-200/50 p-3 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm font-semibold">{t("stats.topVideosAll")}</div>
        {videos.length > 0 && <span className="badge badge-ghost badge-sm">{shown.length} / {videos.length}</span>}
      </div>
      {videos.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-sm text-base-content/45 text-center px-4">
          {t("stats.noTopVideos")}
        </div>
      ) : (
        <>
        <div ref={listRef} className="space-y-2 max-h-72 overflow-auto pr-1">
          {shown.map((v, index) => (
            <div
              key={`${v.accountId}:${v.videoId}`}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-base-100/70 p-2 hover:bg-base-100"
            >
              <div className="text-xs text-base-content/45 text-right shrink-0">{index + 1}</div>
              <div className="min-w-0">
                <a
                  href={`https://www.youtube.com/shorts/${v.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-sm truncate link-hover block"
                  title={t("stats.openOnYoutube")}
                >
                  {cleanDisplayText(v.title)}
                </a>
                <Link
                  to={`/accounts/${v.accountId}`}
                  className="text-xs text-base-content/50 truncate link-hover block"
                  title={t("stats.openChannel")}
                >
                  {v.channelTitle}
                </Link>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">{fmt(v.views)}</div>
                <div className="text-[11px] text-base-content/45">
                  {t("stats.views").toLowerCase()} · {formatWatchMinutes(v.watchMinutes)}
                </div>
              </div>
            </div>
          ))}
          {videos.length > visible && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
        </div>
        </>
      )}
    </div>
  );
}

export function TopChannelsPanel({ rows }: { rows: OverviewTopChannel[] }) {
  const { t } = useT();
  const [visible, setVisible] = useState(8);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ranked = rows.slice(0, visible).map((r) => ({
    ...r,
    mainViews: r.analyticsViews || r.publicViews,
    hasAnalytics: r.analyticsViews > 0,
  }));
  const maxViews = Math.max(1, ...ranked.map((r) => r.mainViews));

  useEffect(() => {
    setVisible(8);
  }, [rows.length]);

  useEffect(() => {
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target || visible >= rows.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible((n) => Math.min(rows.length, n + 8));
      },
      { root, rootMargin: "96px 0px", threshold: 0.01 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [rows.length, visible]);

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
        <div ref={listRef} className="space-y-2 max-h-[32rem] overflow-auto pr-1">
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
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        to={`/accounts/${r.accountId}`}
                        className="font-medium line-clamp-2 break-words link-hover"
                        title={r.channelTitle}
                      >
                        {r.channelTitle}
                      </Link>
                      {r.ytChannelId && (
                        <a
                          href={`https://www.youtube.com/channel/${r.ytChannelId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="badge badge-ghost badge-xs shrink-0"
                          title={t("stats.openOnYoutube")}
                        >
                          YouTube
                        </a>
                      )}
                    </div>
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
          {rows.length > visible && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
        </div>
      )}
      </div>
    </aside>
  );
}

export function Breakdown({ title, rows }: { title: string; rows: YoutubeBreakdownRow[] }) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.views, 0);
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="font-semibold text-sm mb-2">{title}</div>
      <div className="space-y-2 max-h-[18rem] overflow-auto pr-1">
        {rows.map((r) => {
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
