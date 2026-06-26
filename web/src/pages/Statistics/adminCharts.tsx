import { type ReactNode } from "react";
import {
  Activity,
  BarChart3,
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
import type { AdminAnalytics as AdminAnalyticsData } from "../../lib/api";
import { compactNumber } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { fmt, signed, shortDate, formatSeconds, trimLeadingEmptyDays, trimTrailingEmptyDays } from "../../lib/statsFormat";

const CHART_COLORS = {
  published: "#2563eb",
  scheduled: "#f97316",
  failed: "#dc2626",
};

// Admin «Сводка» watch-time formatter. Differs from the shared lib/statsFormat one: this routes the
// 1..100 h band through compactNumber() (which integer-rounds <1000, so 1.5 h → "2 h"). Kept as-is to
// preserve the admin tab's exact output. Exported so adminTables.tsx uses the identical formatting.
export function formatWatchMinutes(n: number): string {
  if (n >= 6000) return `${compactNumber(Math.round(n / 60))} h`;
  if (n >= 60) return `${compactNumber(Math.round((n / 60) * 10) / 10)} h`;
  return `${Math.round(n).toLocaleString("ru-RU")} m`;
}

export function KpiGrid({ data }: { data: AdminAnalyticsData }) {
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

export function DailyChart({ data }: { data: AdminAnalyticsData["daily"] }) {
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

export function YoutubeChart({ data }: { data: AdminAnalyticsData["youtubeSeries"] }) {
  const { t } = useT();
  // Trim dead flat space at both ends: the unfinalized trailing day(s) fully, and the pre-history
  // leading run down to one anchor. Empty = all per-day deltas 0 (ignore cumulative subscribers/videos).
  const isEmpty = (p: AdminAnalyticsData["youtubeSeries"][number]) =>
    p.views === 0 &&
    p.watchMinutes === 0 &&
    p.engagedViews === 0 &&
    p.subscribersGained === 0 &&
    p.subscribersLost === 0;
  const series = trimLeadingEmptyDays(trimTrailingEmptyDays(data, isEmpty), isEmpty);
  if (series.length < 2) {
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
  const chart = series.map((p) => ({
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
