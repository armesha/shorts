import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  apiClient,
  type StatRow,
  type StatPoint,
  type PlatformSummary,
  type YoutubeAnalyticsPayload,
  type YoutubeDailyPoint,
  type YoutubeDemographicsRow,
  type YoutubeSharingRow,
} from "../../lib/api";
import { AppIcon } from "../../components/AppIcon";
import { BrandIcon } from "../../components/BrandIcon";
import { compactNumber, parseUtc } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { cleanDisplayText } from "../../lib/text";
import {
  fmt,
  shortDate,
  formatWatchMinutes,
  formatSeconds,
  genderLabel,
  sharingLabel,
  trimTrailingEmptyDays,
} from "../../lib/statsFormat";
import { reportRangeTitle } from "./overview";
import { ChartTip, CompositionStrip, DeltaChip, LedgerStrip, Sparkline } from "./viz";

type MetricKey = "subscribers" | "views" | "videos";
type T = (key: string, vars?: Record<string, string | number>) => string;

export function ChannelCard({
  row,
  isAdmin,
  avatar,
  days,
  source,
}: {
  row: StatRow;
  isAdmin: boolean;
  avatar?: string | null;
  days: number;
  source: "analytics" | "data";
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<StatPoint[] | null>(null);

  useEffect(() => {
    if (open && source === "data" && points == null) {
      apiClient
        .statsHistory(row.accountId)
        .then(setPoints)
        .catch((e) => {
          console.error(`[Статистика] история канала #${row.accountId}:`, e);
          setPoints([]);
        });
    }
  }, [open, points, row.accountId, source]);

  const title = row.ytChannelTitle || row.channelName;
  const subtitle = !row.connected
    ? t("stats.notConnectedYt")
    : row.latest
      ? t("stats.updatedAgo", { ago: timeAgo(row.latest.takenAt, t) })
      : t("stats.noSnapshots");
  const youtubeUrl = row.ytChannelId ? `https://www.youtube.com/channel/${row.ytChannelId}` : null;
  // Header sparkline: the channel's daily period views (unfinalized zero tail trimmed).
  const sparkValues = trimTrailingEmptyDays(row.analytics.daily, (p) => p.views === 0).map((p) => p.views);
  const avatarNode = avatar ? (
    <img
      src={avatar}
      alt=""
      className="w-11 h-11 rounded-full object-cover border border-base-300 bg-base-200 shrink-0"
    />
  ) : (
    <div className="bg-primary/10 text-primary rounded-full w-11 h-11 flex items-center justify-center shrink-0">
      <AppIcon name="analytics" size={20} />
    </div>
  );

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          {youtubeUrl ? (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full transition hover:opacity-80"
              title={t("stats.openOnYoutube")}
              aria-label={t("stats.openOnYoutube")}
            >
              {avatarNode}
            </a>
          ) : (
            avatarNode
          )}
          <div className="flex-1 min-w-0">
            {youtubeUrl ? (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold truncate link-hover block w-fit max-w-full"
                title={t("stats.openOnYoutube")}
              >
                {title}
              </a>
            ) : (
              <div className="font-semibold truncate">{title}</div>
            )}
            <div className="text-sm text-base-content/60 truncate">
              {isAdmin && row.ownerUsername ? (
                <span className="text-base-content/80">@{row.ownerUsername}</span>
              ) : null}
              {isAdmin && row.ownerUsername ? " · " : ""}
              {subtitle}
            </div>
          </div>
          {source === "analytics" && sparkValues.length > 1 && (
            <div className="hidden sm:block w-32 shrink-0" title={t("stats.viewsForDays", { n: days })}>
              <Sparkline values={sparkValues} height={30} className="w-full" />
            </div>
          )}
          {row.error ? (
            <span className="badge badge-error badge-sm" title={row.error}>
              {t("stats.badgeError")}
            </span>
          ) : !row.connected ? (
            <span className="badge badge-warning badge-sm">{t("stats.badgeNotConnected")}</span>
          ) : (
            youtubeUrl && (
              <a
                href={youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-xs text-error"
                title={t("stats.openOnYoutube")}
              >
                <BrandIcon name="youtube" size={14} />
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

        {source === "data" && (
          <div className="stx-panel stx-src-data grid grid-cols-3 divide-x divide-base-300/70 py-2.5">
            <Metric label={t("stats.subscribers")} value={row.latest?.subscribers} delta={delta(row, "subscribers")} t={t} />
            <Metric label={t("stats.views")} value={row.latest?.views} delta={delta(row, "views")} t={t} />
            <Metric label={t("stats.videos")} value={row.latest?.videos} delta={delta(row, "videos")} t={t} />
          </div>
        )}

        {source === "analytics" && row.analytics.summary.views > 0 && (
          <div className="stx-quiet-row text-sm">
            <span>
              <span className="stx-num font-bold">{fmt(row.analytics.summary.views)}</span>{" "}
              <span className="stx-cap">{t("stats.viewsForDays", { n: days })}</span>
            </span>
            <span title={t("stats.hookRateHint")} className="cursor-help">
              <span className="stx-num font-bold">
                {((row.analytics.summary.engagedViews / row.analytics.summary.views) * 100).toFixed(0)}%
              </span>{" "}
              <span className="stx-cap">{t("stats.hookRate")}</span>
            </span>
            <span>
              <span className="stx-num font-bold">{formatWatchMinutes(row.analytics.summary.watchMinutes)}</span>{" "}
              <span className="stx-cap">{t("stats.watchTime")}</span>
            </span>
            <span>
              <span className="stx-num font-bold">{fmt(row.analytics.summary.engagedViews)}</span>{" "}
              <span className="stx-cap">{t("stats.engagedViews")}</span>
            </span>
            <span>
              <span className="stx-num font-bold">{formatSeconds(row.analytics.summary.avgViewDuration)}</span>{" "}
              <span className="stx-cap">{t("stats.avgDuration")}</span>
            </span>
          </div>
        )}

        <button
          className="btn btn-ghost btn-sm gap-1 w-fit"
          onClick={() => setOpen((v) => !v)}
          disabled={
            source === "data"
              ? !row.latest
              : !row.analytics.error && row.analytics.summary.views <= 0 && row.analytics.topVideos.length === 0
          }
        >
          <AppIcon name="analytics" size={15} />
          {open ? t("stats.hideChart") : source === "data" ? t("stats.showChart") : t("stats.showDetails")}
          <AppIcon name="chevron-right" size={15} className={open ? "rotate-90 transition-transform" : "transition-transform"} />
        </button>

        {open && (
          <div className="space-y-4">
            {source === "data" ? (
              <ChannelHistory points={points} />
            ) : (
              <ChannelAnalytics analytics={row.analytics} days={days} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelAnalytics({ analytics, days }: { analytics: YoutubeAnalyticsPayload; days: number }) {
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
      {analytics.days !== 90 && (
        <div className="text-xs text-base-content/45">{t("stats.breakdownPeriodNote")}</div>
      )}
      <ChannelDailyCharts daily={analytics.daily} />
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
                {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="w-16 h-9 object-cover rounded bg-base-300" />}
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
        <CompositionStrip
          title={t("stats.trafficSources")}
          subtitle={reportRangeTitle(t, analytics.reportRanges?.trafficSources ?? null, days)}
          rows={analytics.trafficSources}
          t={t}
          cap={5}
        />
        <CompositionStrip
          title={t("stats.devices")}
          subtitle={reportRangeTitle(t, analytics.reportRanges?.devices ?? null, days)}
          rows={analytics.devices}
          t={t}
          cap={4}
        />
        <CompositionStrip
          title={t("stats.countries")}
          subtitle={reportRangeTitle(t, analytics.reportRanges?.countries ?? null, days)}
          rows={analytics.countries}
          t={t}
          cap={5}
        />
        <Demographics rows={analytics.demographics} />
        <Sharing rows={analytics.sharing} />
      </div>
    </div>
  );
}

// Per-channel daily Analytics charts — views + watch hours as two aligned small multiples
// (same shape as the Data API history pair). The unfinalized zero tail is trimmed like the
// header sparkline so the last days don't fake a crash to zero.
function ChannelDailyCharts({ daily }: { daily: YoutubeDailyPoint[] }) {
  const { t } = useT();
  const trimmed = trimTrailingEmptyDays(daily, (p) => p.views === 0);
  if (trimmed.length < 2) return null;
  const data = trimmed.map((p) => ({
    t: shortDate(p.date),
    views: p.views,
    watch: Math.round((p.watchMinutes / 60) * 10) / 10,
  }));
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <HistoryChart data={data} dataKey="views" name={t("stats.metricViews")} color="var(--stx-series)" />
      <HistoryChart data={data} dataKey="watch" name={t("stats.watchHours")} color="var(--stx-series-2)" />
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
    <div className="stx-panel p-3">
      <div className="font-semibold text-sm mb-2">{t("stats.demographics")}</div>
      <div className="space-y-1.5">
        {top.map((r) => (
          <div key={`${r.ageGroup}:${r.gender}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-2.5 text-sm">
            <span className="min-w-0 truncate text-base-content/75">
              {r.ageGroup.replace(/^age/, "")} · {genderLabel(r.gender, t)}
            </span>
            <span className="h-2 overflow-hidden bg-base-300/60">
              <span
                className="block h-full"
                style={{ width: `${Math.round((r.viewerPercentage / max) * 100)}%`, background: "var(--stx-series)" }}
              />
            </span>
            <span className="stx-num text-right text-sm font-semibold">{r.viewerPercentage.toFixed(1)}%</span>
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
  const top = rows.slice(0, 6);
  const max = Math.max(1, ...top.map((r) => r.shares));
  return (
    <div className="stx-panel p-3">
      <div className="font-semibold text-sm mb-2">{t("stats.sharing")}</div>
      <div className="space-y-1.5">
        {top.map((r) => {
          const pct = total > 0 ? Math.round((r.shares / total) * 100) : 0;
          return (
            <div key={r.service} className="grid grid-cols-[7.5rem_minmax(0,1fr)_5rem] items-center gap-2.5 text-sm">
              <span className="min-w-0 truncate text-base-content/75">{sharingLabel(r.service)}</span>
              <span className="h-2 overflow-hidden bg-base-300/60">
                <span
                  className="block h-full"
                  style={{ width: `${Math.round((r.shares / max) * 100)}%`, background: "var(--stx-series)" }}
                />
              </span>
              <span className="stx-num text-right text-sm font-semibold">
                {fmt(r.shares)}
                <span className="ml-1 inline-block w-8 text-right text-xs text-base-content/40">{pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Snapshot history as two aligned small multiples (subscribers / views) — one metric per axis,
// no dual-axis chart.
function ChannelHistory({ points }: { points: StatPoint[] | null }) {
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <HistoryChart data={data} dataKey="subscribers" name={t("stats.subscribers")} color="var(--stx-series)" srcData />
      <HistoryChart data={data} dataKey="views" name={t("stats.views")} color="var(--stx-series-2)" srcData />
    </div>
  );
}

function HistoryChart({
  data,
  dataKey,
  name,
  color,
  srcData,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  name: string;
  color: string;
  /** Data API panels carry the hatched stx-src-data material; Analytics ones stay plain. */
  srcData?: boolean;
}) {
  const gradientId = `stx-hist-${useId().replace(/:/g, "")}`;
  return (
    <div className={`stx-panel p-3 ${srcData ? "stx-src-data" : ""}`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{name}</span>
        <span
          className="inline-block h-2 w-2 shrink-0"
          style={{ background: color }}
          aria-hidden="true"
        />
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.14} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--stx-grid)" />
            <XAxis
              dataKey="t"
              fontSize={11}
              tickMargin={6}
              minTickGap={28}
              tickLine={false}
              axisLine={{ stroke: "var(--stx-grid)" }}
              tick={{ fill: "var(--stx-axis)" }}
            />
            <YAxis
              fontSize={11}
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--stx-axis)" }}
              tickFormatter={(value) => compactNumber(Number(value))}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={<ChartTip format={(v) => compactNumber(v)} />}
              cursor={{ stroke: "var(--stx-axis)", strokeDasharray: "3 3" }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              name={name}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: "var(--stx-peak-ring)", strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Metric({ label, value, delta, t }: { label: string; value?: ReactNode; delta: number | null; t: T }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-3">
      <div className="stx-cap truncate">{label}</div>
      <div className="stx-num text-xl font-bold leading-tight">
        {value == null ? "—" : typeof value === "number" ? fmt(value) : value}
      </div>
      <DeltaChip delta={delta} t={t} />
    </div>
  );
}

export function AnalyticsFootnote({ rows }: { rows: StatRow[] }) {
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

// Platform-wide production totals — one compact strip, the same numbers for every user.
export function PlatformBand({ s }: { s: PlatformSummary }) {
  const { t } = useT();
  return (
    <LedgerStrip
      tag={
        <span className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
          <BrandIcon name="youtube" size={16} className="text-primary" />
          {t("stats.platTitle")}
        </span>
      }
      items={[
        { label: t("stats.platQueued"), value: fmt(s.queued) },
        { label: t("stats.platUploaded"), value: fmt(s.published) },
        { label: t("stats.platScheduled"), value: fmt(s.scheduled) },
        { label: t("stats.platChannels"), value: `${fmt(s.channelsConnected)} / ${fmt(s.channels)}` },
      ]}
      trailing={<span className="ml-auto text-xs text-base-content/40">{t("stats.platHint")}</span>}
    />
  );
}

export function Empty({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300 border-dashed">
      <div className="card-body items-center text-center py-16">
        {icon && <AppIcon name="analytics" className="text-base-content/30" size={40} />}
        <p className="text-base-content/60 max-w-md">{text}</p>
      </div>
    </div>
  );
}

function delta(row: StatRow, key: MetricKey): number | null {
  if (!row.latest || !row.prev) return null;
  return row.latest[key] - row.prev[key];
}

function timeAgo(iso: string, t: T): string {
  const then = new Date(parseUtc(iso)).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return t("stats.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("stats.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("stats.hoursAgo", { n: hr });
  return t("stats.daysAgo", { n: Math.floor(hr / 24) });
}
