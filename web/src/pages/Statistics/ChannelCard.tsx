import { useEffect, useState, type ReactNode } from "react";
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
  type PlatformSummary,
  type YoutubeAnalyticsPayload,
  type YoutubeDemographicsRow,
  type YoutubeSharingRow,
} from "../../lib/api";
import { AppIcon } from "../../components/AppIcon";
import { BrandIcon } from "../../components/BrandIcon";
import { compactNumber, parseUtc } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { cleanDisplayText } from "../../lib/text";
import { fmt, formatWatchMinutes, formatSeconds, genderLabel, sharingLabel } from "../../lib/statsFormat";
import { Breakdown } from "./StatsOverview";

type MetricKey = "subscribers" | "views" | "videos";
type T = (key: string, vars?: Record<string, string | number>) => string;

export function ChannelCard({ row, isAdmin, avatar, days }: { row: StatRow; isAdmin: boolean; avatar?: string | null; days: number }) {
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
      {analytics.days !== 90 && (
        <div className="text-xs text-base-content/45">{t("stats.breakdownPeriodNote")}</div>
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

function Metric({ label, value, delta, t }: { label: string; value?: ReactNode; delta: number | null; t: T }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="text-xl font-bold leading-tight">{value == null ? "—" : typeof value === "number" ? fmt(value) : value}</div>
      <DeltaBadge delta={delta} t={t} />
    </div>
  );
}

function DeltaBadge({ delta, t }: { delta: number | null; t: T }) {
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
          <BrandIcon name="youtube" size={16} className="text-primary" />
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
