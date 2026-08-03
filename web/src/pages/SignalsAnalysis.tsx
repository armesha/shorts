import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, Bot, CircleDollarSign, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  apiClient,
  type SignalPaperPosition,
  type SignalPortfolioPoint,
  type SignalStrategyAudit,
  type SignalStrategyAuditItem,
  type SignalsResponse,
} from "../lib/api";
import { useT } from "../lib/i18n";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatUsd(value: number | null | undefined, signed = false): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const formatted = moneyFormatter.format(value);
  return signed && value > 0 ? `+${formatted}` : formatted;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function lifecycleLabel(t: Translate, state: SignalStrategyAuditItem["lifecycleState"]): string {
  return t(`signals.audit.lifecycle.${state}`);
}

function normalizedStatus(position: SignalPaperPosition): string {
  return position.status.trim().toLowerCase();
}

function isBlocked(position: SignalPaperPosition): boolean {
  return normalizedStatus(position) === "blocked_risk";
}

function isClosed(position: SignalPaperPosition): boolean {
  return ["closed", "stopped", "stopped_out", "stop_loss", "exited", "sold"].includes(normalizedStatus(position));
}

function isActive(position: SignalPaperPosition): boolean {
  return !isBlocked(position) && !isClosed(position);
}

function SummaryMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="text-xs text-base-content/50">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-base-content/45">{hint}</div>}
    </div>
  );
}

function PositionFlow({ active, closed, blocked }: { active: number; closed: number; blocked: number }) {
  const { t } = useT();
  const total = Math.max(active + closed + blocked, 1);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-base-200" role="img" aria-label={t("signals.analysis.positionFlowAria", { active, closed, blocked })}>
        {active > 0 && <div className="bg-primary/70" style={{ width: `${active / total * 100}%` }} />}
        {closed > 0 && <div className="bg-base-content/35" style={{ width: `${closed / total * 100}%` }} />}
        {blocked > 0 && <div className="bg-base-content/15" style={{ width: `${blocked / total * 100}%` }} />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><span className="mr-1.5 inline-block size-2 rounded-full bg-primary/70" />{t("signals.analysis.active")}: <b className="tabular-nums">{active}</b></div>
        <div><span className="mr-1.5 inline-block size-2 rounded-full bg-base-content/35" />{t("signals.analysis.closed")}: <b className="tabular-nums">{closed}</b></div>
        <div><span className="mr-1.5 inline-block size-2 rounded-full bg-base-content/15" />{t("signals.analysis.blocked")}: <b className="tabular-nums">{blocked}</b></div>
      </div>
    </div>
  );
}

function PnlBreakdown({ positions, totalPnl }: { positions: SignalPaperPosition[]; totalPnl: number }) {
  const { t } = useT();
  const priced = positions.filter((position) => typeof position.pnlUsd === "number" && Number.isFinite(position.pnlUsd));
  const winners = priced.filter((position) => (position.pnlUsd ?? 0) > 0);
  const losers = priced.filter((position) => (position.pnlUsd ?? 0) < 0);
  const grossProfit = winners.reduce((sum, position) => sum + (position.pnlUsd ?? 0), 0);
  const grossLoss = losers.reduce((sum, position) => sum + (position.pnlUsd ?? 0), 0);
  const maximum = Math.max(grossProfit, Math.abs(grossLoss), 1);

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("signals.analysis.currentResult")}</h2>
          <p className="mt-0.5 text-xs text-base-content/50">{t("signals.analysis.floatingPnlNote")}</p>
        </div>
        <div className={`text-2xl font-semibold tabular-nums ${totalPnl > 0 ? "text-success" : totalPnl < 0 ? "text-error" : ""}`}>
          {formatUsd(totalPnl, true)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)]">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span>{t("signals.analysis.inProfit", { count: winners.length })}</span>
              <b className="tabular-nums text-success">{formatUsd(grossProfit, true)}</b>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-base-200">
              <div className="h-full rounded-full bg-success/70" style={{ width: `${grossProfit / maximum * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span>{t("signals.analysis.inLoss", { count: losers.length })}</span>
              <b className="tabular-nums text-error">{formatUsd(grossLoss)}</b>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-base-200">
              <div className="h-full rounded-full bg-error/65" style={{ width: `${Math.abs(grossLoss) / maximum * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="rounded-md bg-base-200/60 p-3">
          <div className="text-xs text-base-content/50">{t("signals.analysis.withoutPrice")}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{positions.length - priced.length}</div>
          <p className="mt-2 text-xs leading-relaxed text-base-content/55">{t("signals.analysis.closedAmountUnknown")}</p>
        </div>
      </div>
    </section>
  );
}

function PortfolioChart({ history, currentValue }: { history: SignalPortfolioPoint[]; currentValue: number | null | undefined }) {
  const { t } = useT();
  const points = [...history];
  if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
    const last = points.at(-1);
    if (!last || Math.abs(last.valueUsd - currentValue) > 0.005) {
      points.push({ at: new Date().toISOString(), valueUsd: currentValue });
    }
  }
  if (points.length < 2) return null;
  const values = points.map((point) => point.valueUsd);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const width = 720;
  const height = 180;
  const padding = 12;
  const coordinates = points.map((point, index) => {
    const x = padding + index * (width - padding * 2) / Math.max(points.length - 1, 1);
    const y = height - padding - (point.valueUsd - minimum) * (height - padding * 2) / range;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `${padding},${height - padding} ${coordinates.join(" ")} ${width - padding},${height - padding}`;
  const start = points[0];
  const end = points.at(-1)!;

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t("signals.analysis.portfolioChart")}</h2>
          <p className="mt-0.5 text-xs text-base-content/50">{t("signals.analysis.portfolioChartSubtitle")}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-base-content/50">{t("signals.analysis.portfolioNow")}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{formatUsd(currentValue)}</div>
        </div>
      </div>
      <svg className="mt-4 h-44 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("signals.analysis.portfolioChartAria", { start: formatUsd(start.valueUsd), end: formatUsd(end.valueUsd) })}>
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" opacity="0.12" />
        <polygon points={area} fill="currentColor" opacity="0.08" />
        <polyline points={coordinates.join(" ")} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary" />
        <circle cx={coordinates.at(-1)!.split(",")[0]} cy={coordinates.at(-1)!.split(",")[1]} r="4" className="fill-primary" />
      </svg>
      <div className="flex justify-between gap-4 text-xs text-base-content/50">
        <span>{formatDateTime(start.at)}</span>
        <span>{formatDateTime(end.at)}</span>
      </div>
    </section>
  );
}

function analysisScore(item: SignalStrategyAuditItem): number {
  if (item.lifecycleState === "closed" || item.lifecycleState === "stopped") return 100;
  if (item.lifecycleState === "body_out") return 90;
  if (item.takeProfits.some((target) => target.status === "hit")) return 80;
  if (item.positionStatus === "blocked_risk") return 70;
  if (item.correctionAction === "manual_review") return 50;
  return 0;
}

function SelectedAnalysis({ audit }: { audit: SignalStrategyAudit }) {
  const { t } = useT();
  const items = [...audit.items]
    .sort((first, second) => analysisScore(second) - analysisScore(first))
    .slice(0, 4);

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-semibold">{t("signals.analysis.selectedTitle")}</h2>
        <p className="mt-0.5 text-xs text-base-content/50">{t("signals.analysis.selectedSubtitle")}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item, index) => {
          const hitTargets = item.takeProfits.filter((target) => target.status === "hit");
          return (
            <article key={item.contract} className="rounded-lg border border-base-300 bg-base-100 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium"><span className="rounded-full bg-base-200 p-1.5 text-base-content/60"><CircleDollarSign size={15} /></span>{t("signals.analysis.tradeNumber", { number: index + 1 })}</div>
                <span className="badge badge-sm badge-ghost whitespace-nowrap">{lifecycleLabel(t, item.lifecycleState)}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed">{item.brief}</p>
              {hitTargets.length > 0 && (
                <p className="mt-2 text-xs font-medium">{t("signals.analysis.hitTargets", { targets: hitTargets.map((target) => target.target).join(", ") })}</p>
              )}
              {item.correctionAction !== "none" && (
                <p className="mt-2 border-t border-base-200 pt-2 text-xs leading-relaxed text-base-content/55">{item.correctionReason}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BlockedReasons({ audit }: { audit: SignalStrategyAudit }) {
  const { t } = useT();
  const blocked = audit.items.filter((item) => item.positionStatus === "blocked_risk");
  if (!blocked.length) return null;
  return (
    <section className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{t("signals.analysis.blockedReasons")}</h2>
        <p className="mt-0.5 text-xs text-base-content/50">{t("signals.analysis.blockedReasonsSubtitle")}</p>
      </div>
      <div className="divide-y divide-base-200">
        {blocked.map((item, index) => (
          <div key={item.contract} className="flex gap-3 px-4 py-3 sm:px-5">
            <span className="mt-0.5 rounded-full bg-base-200 p-1.5 text-base-content/60"><CircleDollarSign size={15} /></span>
            <div className="text-sm leading-relaxed text-base-content/70">{t("signals.analysis.blockedTrade", { number: index + 1 })}: {item.riskManagement}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function SignalsAnalysis() {
  const { t } = useT();
  const [response, setResponse] = useState<SignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const next = await apiClient.signals();
      setResponse(next);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = response?.available ? response.snapshot : undefined;
  const audit = snapshot?.recentAudit;
  const positionStats = useMemo(() => {
    const positions = snapshot?.positions ?? [];
    return {
      active: positions.filter(isActive),
      closed: positions.filter(isClosed),
      blocked: positions.filter(isBlocked),
    };
  }, [snapshot]);

  return (
    <div className="route-page space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/signals" className="mb-2 inline-flex items-center gap-1 text-sm text-base-content/55 hover:text-base-content">
            <ArrowLeft size={15} />{t("signals.analysis.back")}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><BarChart3 className="text-primary" />{t("signals.analysis.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-base-content/60">{t("signals.analysis.subtitle")}</p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => void load(true)} disabled={loading || refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />{t("common.refresh")}
        </button>
      </header>

      {error && <div className="alert alert-error"><AlertTriangle size={18} /><span>{t("signals.loadError")}</span></div>}

      {loading && !response ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-24 rounded-lg" />)}
        </div>
      ) : !response?.available ? (
        <section className="rounded-lg border border-dashed border-base-300 bg-base-100 p-10 text-center">
          <Bot className="mx-auto text-base-content/35" size={34} />
          <h2 className="mt-3 font-semibold">{t("signals.unavailableTitle")}</h2>
          <p className="mt-1 text-sm text-base-content/55">{t("signals.unavailableText")}</p>
        </section>
      ) : !audit || !snapshot ? (
        <section className="rounded-lg border border-dashed border-base-300 bg-base-100 p-10 text-center text-sm text-base-content/55">
          {t("signals.audit.empty")}
        </section>
      ) : (
        <>
          <div className="text-xs text-base-content/50">
            {t("signals.analysis.meta", {
              days: audit.periodDays,
              signals: audit.signalCount,
              threads: audit.threadCount,
              time: formatDateTime(audit.generatedAt),
            })}
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric label={t("signals.analysis.activePositions")} value={formatNumber(snapshot.summary.openPositionCount)} hint={t("signals.analysis.notClosedYet")} />
            <SummaryMetric label={t("signals.analysis.closedPositions")} value={formatNumber(positionStats.closed.length)} hint={t("signals.analysis.closedResultHint")} />
            <SummaryMetric label={t("signals.analysis.blockedPositions")} value={formatNumber(snapshot.summary.blockedRiskCount)} hint={t("signals.analysis.blockedHint")} />
            <SummaryMetric label={t("signals.analysis.currentPnl")} value={formatUsd(snapshot.summary.totalPnlUsd, true)} hint={t("signals.analysis.paperOnlyHint")} />
          </section>

          <section className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-5">
            <h2 className="font-semibold">{t("signals.analysis.positionFlow")}</h2>
            <p className="mb-4 mt-0.5 text-xs text-base-content/50">{t("signals.analysis.positionFlowSubtitle")}</p>
            <PositionFlow active={snapshot.summary.openPositionCount} closed={positionStats.closed.length} blocked={snapshot.summary.blockedRiskCount} />
          </section>

          <PnlBreakdown positions={positionStats.active} totalPnl={snapshot.summary.totalPnlUsd} />
          <PortfolioChart history={snapshot.portfolioHistory ?? []} currentValue={snapshot.summary.portfolioValueUsd} />
          <SelectedAnalysis audit={audit} />
          <BlockedReasons audit={audit} />
        </>
      )}
    </div>
  );
}
