import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
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
} from "../../lib/statsFormat";
import {
  reportRangeTitle,
  type OverviewReportRange,
  type OverviewTopChannel,
  type OverviewTopVideo,
  type StatsOverviewData,
} from "./overview";
import { ChartTip, CompositionStrip, LedgerStrip, RankBadge, Sparkline } from "./viz";

export type OverviewMetric = "views" | "watch" | "engaged" | "subscribers";

const OVERVIEW_LAYOUT_STORAGE_KEY = "statsOverview.layoutShare.v1";
const DEFAULT_CHART_SHARE = 60;
const MIN_CHART_SHARE = 45;
const MAX_CHART_SHARE = 75;

function readOverviewChartShare(): number {
  if (typeof window === "undefined") return DEFAULT_CHART_SHARE;
  const stored = window.localStorage.getItem(OVERVIEW_LAYOUT_STORAGE_KEY);
  if (!stored) return DEFAULT_CHART_SHARE; // Number(null) is 0, which would clamp to the minimum
  const raw = Number(stored);
  if (!Number.isFinite(raw)) return DEFAULT_CHART_SHARE;
  return Math.min(MAX_CHART_SHARE, Math.max(MIN_CHART_SHARE, raw));
}

// Slim per-source ledgers instead of two boxy KPI cards: Analytics for everyone, Data API — admin.
export function SourceStats({ overview, days, isAdmin }: { overview: StatsOverviewData; days: number; isAdmin: boolean }) {
  const { t } = useT();
  return (
    <div className={`grid grid-cols-1 gap-4 ${isAdmin ? "xl:grid-cols-2" : ""}`}>
      <LedgerStrip
        tag={
          <>
            <span className="badge badge-info badge-sm">Analytics</span>
            <span className="stx-cap">{t("stats.daysShort", { n: days })}</span>
          </>
        }
        items={[
          { label: t("stats.metricViews"), value: fmt(overview.analyticsViews), hint: t("stats.periodViewsHint") },
          { label: t("stats.watchTime"), value: formatWatchMinutes(overview.watchMinutes) },
          { label: t("stats.engagedViews"), value: fmt(overview.engagedViews) },
          { label: t("stats.avgDurationShort"), value: formatSeconds(overview.avgViewDuration), hint: t("stats.avgDuration") },
        ]}
      />
      {isAdmin && (
        <LedgerStrip
          tag={<span className="badge badge-outline badge-sm shrink-0 whitespace-nowrap">Data API</span>}
          items={[
            { label: t("stats.totalSubscribers"), value: fmt(overview.subscribers) },
            { label: t("stats.totalViews"), value: fmt(overview.publicViews) },
            { label: t("stats.videos"), value: fmt(overview.videos) },
            { label: t("stats.channelsConnected"), value: `${overview.connected} / ${overview.channels}` },
          ]}
        />
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
  const [chartShare, setChartShare] = useState(readOverviewChartShare);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const topVideosShare = 100 - chartShare;
  const overviewGridStyle = {
    "--stats-overview-columns": `minmax(0, ${chartShare}fr) auto minmax(18rem, ${topVideosShare}fr)`,
  } as CSSProperties;

  useEffect(() => {
    try {
      window.localStorage.setItem(OVERVIEW_LAYOUT_STORAGE_KEY, String(chartShare));
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [chartShare]);

  // The chart/top-videos divider is dragged with the mouse (pointer capture keeps the drag
  // alive outside the handle); double-click resets, arrow keys nudge it.
  const shareFromPointer = (clientX: number) => {
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setChartShare(Math.round(Math.min(MAX_CHART_SHARE, Math.max(MIN_CHART_SHARE, pct))));
  };

  if (overview.channels === 0) return null;
  const hookRate = overview.analyticsViews > 0 ? (overview.engagedViews / overview.analyticsViews) * 100 : null;
  const likeRatio = overview.likes + overview.dislikes > 0 ? (overview.likes / (overview.likes + overview.dislikes)) * 100 : null;

  const metricValue = (p: StatsOverviewData["daily"][number], key: OverviewMetric): number =>
    key === "watch"
      ? Math.round((p.watchMinutes / 60) * 10) / 10
      : key === "engaged"
        ? p.engagedViews
        : key === "subscribers"
          ? p.subscribersGained - p.subscribersLost
          : p.views;

  // KPI tiles double as the chart metric switch; each carries its own halftone sparkline.
  const netSubscribers = overview.subscribersGained - overview.subscribersLost;
  const tiles: { key: OverviewMetric; label: string; value: string; hint?: string }[] = [
    { key: "views", label: t("stats.viewsForDays", { n: days }), value: fmt(overview.analyticsViews), hint: t("stats.periodViewsHint") },
    { key: "watch", label: t("stats.watchTime"), value: formatWatchMinutes(overview.watchMinutes) },
    { key: "engaged", label: t("stats.engagedViews"), value: fmt(overview.engagedViews) },
    { key: "subscribers", label: t("stats.netSubscribers"), value: signed(netSubscribers) },
  ];

  const metricLabels: Record<OverviewMetric, string> = {
    views: t("stats.metricViews"),
    watch: t("stats.watchHours"),
    engaged: t("stats.engagedViews"),
    subscribers: t("stats.netSubscribers"),
  };
  const chart = overview.daily.map((p) => ({ date: shortDate(p.date), value: metricValue(p, metric) }));
  const peak = chart.reduce<{ date: string; value: number } | null>(
    (best, p) => (p.value > 0 && (!best || p.value > best.value) ? p : best),
    null,
  );
  const hasBreakdowns = overview.trafficSources.length > 0 || overview.devices.length > 0 || overview.countries.length > 0;
  const quietStats: { label: string; value: string; hint?: string }[] = [
    { label: t("stats.hookRate"), value: hookRate == null ? "—" : `${hookRate.toFixed(0)}%`, hint: t("stats.hookRateHint") },
    { label: t("stats.avgDuration"), value: formatSeconds(overview.avgViewDuration) },
    {
      label: t("stats.likeRatio"),
      value: likeRatio == null ? "—" : `${likeRatio.toFixed(0)}%`,
      hint: t("stats.likeRatioHint", { likes: fmt(overview.likes), dislikes: fmt(overview.dislikes) }),
    },
    { label: t("stats.likes"), value: fmt(overview.likes) },
    { label: t("stats.comments"), value: fmt(overview.comments) },
    { label: t("stats.sharesStat"), value: fmt(overview.shares) },
  ];
  const breakdownSubtitle = reportRangeTitle(t, overview.breakdownsRange, days);

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-5">
        <div className="font-semibold">{t("stats.overviewTitle")}</div>

        <div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {tiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                className={`stx-tile ${metric === tile.key ? "is-on" : ""}`}
                aria-pressed={metric === tile.key}
                onClick={() => onMetric(tile.key)}
                title={tile.hint ?? t("stats.tileSwitchHint")}
              >
                <span className="stx-cap">{tile.label}</span>
                <span className="stx-num stx-tile-value text-2xl font-bold leading-none">{tile.value}</span>
                <span className="mt-auto block pt-1">
                  <Sparkline values={overview.daily.map((p) => metricValue(p, tile.key))} height={26} className="w-full" />
                </span>
              </button>
            ))}
          </div>
          <div className="stx-quiet-row mt-3 text-sm">
            {quietStats.map((s) => (
              <span key={s.label} title={s.hint} className={s.hint ? "cursor-help" : undefined}>
                <span className="stx-num font-bold">{s.value}</span>{" "}
                <span className="stx-cap">{s.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div
          ref={splitRef}
          className={`grid grid-cols-1 xl:grid-cols-[var(--stats-overview-columns)] gap-4 xl:gap-0 ${dragging ? "select-none" : ""}`}
          style={overviewGridStyle}
        >
          <div className="stx-panel p-3 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="text-sm font-semibold">{t("stats.overviewChart")}</div>
              <div className="flex items-center gap-3 text-xs text-base-content/50">
                {peak && chart.length > 1 && (
                  <span className="stx-num" title={t("stats.peakDayHint")}>
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: "var(--stx-peak-fill)", boxShadow: "0 0 0 1.5px var(--stx-peak-ring) inset" }}
                      aria-hidden="true"
                    />
                    {t("stats.peakDay", { date: peak.date, value: formatMetricValue(peak.value, metric) })}
                  </span>
                )}
                <span>{metricLabels[metric]}</span>
              </div>
            </div>
            {chart.length > 1 ? (
              <OverviewChart chart={chart} metric={metric} peak={peak} name={metricLabels[metric]} />
            ) : (
              <div className="h-72 flex items-center justify-center text-sm text-base-content/45 text-center px-4">
                {t("stats.noAnalyticsChart")}
              </div>
            )}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={chartShare}
            aria-valuemin={MIN_CHART_SHARE}
            aria-valuemax={MAX_CHART_SHARE}
            aria-label={t("stats.overviewLayoutAria")}
            title={t("stats.overviewLayoutTitle", { chart: chartShare, top: topVideosShare })}
            tabIndex={0}
            className="stx-gutter hidden xl:flex"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
              shareFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (dragging) shareFromPointer(e.clientX);
            }}
            onPointerUp={(e) => {
              e.currentTarget.releasePointerCapture(e.pointerId);
              setDragging(false);
            }}
            onDoubleClick={() => setChartShare(DEFAULT_CHART_SHARE)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const delta = e.key === "ArrowLeft" ? -5 : 5;
                setChartShare((s) => Math.min(MAX_CHART_SHARE, Math.max(MIN_CHART_SHARE, s + delta)));
              }
            }}
          >
            <span className="stx-gutter-bar" aria-hidden="true" />
          </div>

          <TopVideosPanel videos={overview.topVideos} range={overview.topVideosRange} days={days} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4">
          {hasBreakdowns ? (
            <div className="grid grid-cols-1 gap-3 content-start">
              <CompositionStrip title={t("stats.trafficSources")} subtitle={breakdownSubtitle} rows={overview.trafficSources} t={t} cap={5} />
              <CompositionStrip title={t("stats.devices")} subtitle={breakdownSubtitle} rows={overview.devices} t={t} cap={4} />
              <CompositionStrip title={t("stats.countries")} subtitle={breakdownSubtitle} rows={overview.countries} t={t} cap={5} />
            </div>
          ) : (
            <div className="stx-panel p-3 min-h-32 flex items-center justify-center text-center text-sm text-base-content/45">
              {t("stats.noBreakdowns")}
            </div>
          )}
          {/* The channels column must not drive the row height: it absolutely fills its cell
              (height = breakdowns column) and scrolls inside, so no dead space on either side. */}
          <div className="relative xl:min-h-[24rem]">
            <TopChannelsPanel rows={overview.topChannels} />
          </div>
        </div>
      </div>
    </section>
  );
}

// The hero area chart: ink line + soft halftone fill, solid faint grid, square editorial
// tooltip, the best day marked with the accent dot.
function OverviewChart({
  chart,
  metric,
  peak,
  name,
}: {
  chart: { date: string; value: number }[];
  metric: OverviewMetric;
  peak: { date: string; value: number } | null;
  name: string;
}) {
  const gradientId = `stx-area-${useId().replace(/:/g, "")}`;
  return (
    <div className="h-72 w-full min-w-0">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={288}
        initialDimension={{ width: 320, height: 288 }}
      >
        <AreaChart data={chart} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--stx-area-from)" />
              <stop offset="100%" stopColor="var(--stx-area-to)" />
            </linearGradient>
          </defs>
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
            fontSize={11}
            width={46}
            allowDecimals={metric === "watch"}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--stx-axis)" }}
            tickFormatter={(value) => formatMetricValue(Number(value), metric)}
          />
          <Tooltip
            content={<ChartTip format={(v) => formatMetricValue(v, metric)} />}
            cursor={{ stroke: "var(--stx-axis)", strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="value"
            name={name}
            stroke="var(--stx-series)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 3.5, fill: "var(--stx-series)", stroke: "var(--stx-peak-ring)", strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {peak && (
            <ReferenceDot
              x={peak.date}
              y={peak.value}
              r={4.5}
              fill="var(--stx-peak-fill)"
              stroke="var(--stx-peak-ring)"
              strokeWidth={1.5}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const TOP_VIDEOS_CAP = 100;

export function TopVideosPanel({
  videos: allVideos,
  range,
  days,
}: {
  videos: OverviewTopVideo[];
  range: OverviewReportRange | null;
  days: number;
}) {
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
    <div className="stx-panel p-3 @container">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t("stats.topVideosAll")}</div>
          <div className="mt-0.5 text-xs text-base-content/50 truncate" title={reportRangeTitle(t, range, days)}>
            {reportRangeTitle(t, range, days)}
          </div>
        </div>
        {videos.length > 0 && (
          <span className="badge badge-ghost badge-sm stx-num shrink-0 whitespace-nowrap">
            {shown.length} / {videos.length}
          </span>
        )}
      </div>
      {videos.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-sm text-base-content/45 text-center px-4">
          {t("stats.noTopVideos")}
        </div>
      ) : (
        <div ref={listRef} className="space-y-2 max-h-80 overflow-auto pr-1">
          {shown.map((v, index) => (
            <div
              key={`${v.accountId}:${v.videoId}`}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] @[24rem]:grid-cols-[1.25rem_4rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg bg-base-100/70 p-2 hover:bg-base-100"
            >
              <RankBadge rank={index + 1} />
              <a
                href={`https://www.youtube.com/shorts/${v.videoId}`}
                target="_blank"
                rel="noreferrer"
                className="relative hidden h-9 w-16 shrink-0 overflow-hidden rounded bg-base-300 @[24rem]:block"
                title={t("stats.openOnYoutube")}
                tabIndex={-1}
              >
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-base-content/30">
                    <AppIcon name="video" size={16} />
                  </span>
                )}
              </a>
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
                <div className="text-sm font-semibold stx-num">{fmt(v.views)}</div>
                <div className="text-[11px] text-base-content/45">
                  {t("stats.views").toLowerCase()} · {formatWatchMinutes(v.watchMinutes)}
                </div>
              </div>
            </div>
          ))}
          {videos.length > visible && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
        </div>
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
    <aside className="card bg-base-100 border border-base-300 xl:absolute xl:inset-0">
      <div className="card-body p-4 gap-3 xl:min-h-0">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold">{t("stats.topChannels")}</div>
          {ranked.some((r) => !r.hasAnalytics) && (
            <span className="badge badge-ghost badge-sm shrink-0">{t("stats.totalFallbackShort")}</span>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="text-sm text-base-content/45 py-6 text-center">{t("stats.noTopChannels")}</div>
        ) : (
          <div ref={listRef} className="space-y-1.5 max-h-[24rem] overflow-auto pr-1 xl:max-h-none xl:min-h-0 xl:flex-1">
            {ranked.map((r, index) => {
              const pct = Math.max(3, Math.round((r.mainViews / maxViews) * 100));
              return (
                <div
                  key={r.accountId}
                  className={`rounded-lg border px-2.5 py-2 ${
                    r.hasAnalytics ? "bg-base-200/45 border-base-300" : "bg-base-200/20 border-base-300/70"
                  }`}
                >
                  <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5">
                    <RankBadge rank={index + 1} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <Link
                          to={`/accounts/${r.accountId}`}
                          className="text-sm font-medium truncate link-hover"
                          title={r.channelTitle}
                        >
                          {r.channelTitle}
                        </Link>
                        {r.ytChannelId && (
                          <a
                            href={`https://www.youtube.com/channel/${r.ytChannelId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-xs btn-square shrink-0 -my-0.5 text-base-content/40 hover:text-base-content"
                            title={t("stats.openOnYoutube")}
                            aria-label={t("stats.openOnYoutube")}
                          >
                            <AppIcon name="external" size={12} />
                          </a>
                        )}
                      </div>
                      <div className="truncate text-xs text-base-content/45">
                        {r.ownerUsername ? `@${r.ownerUsername} · ` : ""}
                        {r.hasAnalytics ? (
                          <>
                            {formatWatchMinutes(r.watchMinutes)} · {formatSeconds(r.avgViewDuration)} ·{" "}
                            <span className={r.subscribersNet > 0 ? "text-success" : r.subscribersNet < 0 ? "text-error" : ""}>
                              {signed(r.subscribersNet)}
                            </span>
                          </>
                        ) : (
                          t("stats.totalFallbackShort")
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold leading-none stx-num">{fmt(r.mainViews)}</div>
                      <div className="text-[10px] uppercase tracking-wide text-base-content/45">
                        {r.hasAnalytics ? t("stats.periodShort") : t("stats.totalShort")}
                      </div>
                    </div>
                  </div>
                  <div className="h-0.5 rounded-full bg-base-300/70 overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full ${r.hasAnalytics ? "bg-primary" : "bg-base-content/25"}`}
                      style={{ width: `${pct}%` }}
                    />
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
