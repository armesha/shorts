import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, Bot, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  apiClient,
  type SignalStrategyAudit,
  type SignalStrategyAuditItem,
  type SignalsResponse,
} from "../lib/api";
import { useT } from "../lib/i18n";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function formatNumber(value: number): string {
  return numberFormatter.format(value);
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

function compactText(value: string | null, maximum = 72): string {
  if (!value) return "—";
  const firstSentence = value.split(/(?<=[.!?])\s/)[0]?.trim() || value.trim();
  return firstSentence.length > maximum ? `${firstSentence.slice(0, maximum - 1).trimEnd()}…` : firstSentence;
}

function compactRisk(value: string): string {
  const percent = value.match(/\d+(?:[.,]\d+)?%/)?.[0];
  const dollars = value.match(/\$\d+(?:[.,]\d+)?/)?.[0];
  return [percent, dollars].filter(Boolean).join(" · ") || compactText(value, 48);
}

function lifecycleLabel(t: Translate, state: SignalStrategyAuditItem["lifecycleState"]): string {
  return t(`signals.audit.lifecycle.${state}`);
}

function ComparisonBar({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  const { t } = useT();
  const maximum = Math.max(before, after, 1);
  const beforeWidth = `${Math.max((before / maximum) * 100, before > 0 ? 8 : 0)}%`;
  const afterWidth = `${Math.max((after / maximum) * 100, after > 0 ? 8 : 0)}%`;
  return (
    <article className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="font-semibold tabular-nums">{formatNumber(before)} → {formatNumber(after)}</span>
      </div>
      <div className="mt-4 space-y-3" role="img" aria-label={`${label}: ${before} → ${after}`}>
        <div className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-2 text-xs text-base-content/55">
          <span>{t("signals.analysis.before")}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-base-200">
            <div className="h-full rounded-full bg-base-content/25" style={{ width: beforeWidth }} />
          </div>
          <span className="text-right tabular-nums">{before}</span>
        </div>
        <div className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-2 text-xs text-base-content/55">
          <span>{t("signals.analysis.after")}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-base-200">
            <div className="h-full rounded-full bg-primary/75" style={{ width: afterWidth }} />
          </div>
          <span className="text-right font-semibold tabular-nums text-base-content">{after}</span>
        </div>
      </div>
    </article>
  );
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

function AuditTable({ audit }: { audit: SignalStrategyAudit }) {
  const { t } = useT();
  return (
    <section className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3 sm:px-5">
        <h2 className="font-semibold">{t("signals.analysis.tableTitle")}</h2>
        <p className="mt-0.5 text-xs text-base-content/50">{t("signals.analysis.tableSubtitle")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>{t("signals.analysis.contract")}</th>
              <th>{t("signals.status")}</th>
              <th>{t("signals.audit.rm")}</th>
              <th>{t("signals.audit.takeProfits")}</th>
              <th>{t("signals.audit.stopLoss")}</th>
              <th>{t("signals.audit.principal")}</th>
            </tr>
          </thead>
          <tbody>
            {audit.items.map((item) => (
              <tr key={item.contract}>
                <td>
                  <div className="max-w-44 truncate font-mono text-xs font-medium" title={item.contract}>{item.contract}</div>
                  <div className="mt-0.5 text-[11px] text-base-content/45">{item.chain || "—"}</div>
                </td>
                <td className="whitespace-nowrap">
                  <span className="badge badge-sm badge-ghost">{lifecycleLabel(t, item.lifecycleState)}</span>
                </td>
                <td className="whitespace-nowrap font-medium tabular-nums" title={item.riskManagement}>{compactRisk(item.riskManagement)}</td>
                <td className="min-w-36 text-xs">
                  {item.takeProfits.length
                    ? item.takeProfits.map((target) => `${target.target} · ${t(`signals.audit.tp.${target.status}`)}`).join("; ")
                    : "—"}
                </td>
                <td className="max-w-48 text-xs" title={item.stopLoss || undefined}>{compactText(item.stopLoss)}</td>
                <td className="max-w-56 text-xs" title={item.principalRemoval || undefined}>{compactText(item.principalRemoval)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

  const audit = response?.available ? response.snapshot.recentAudit : undefined;

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
      ) : !audit ? (
        <section className="rounded-lg border border-dashed border-base-300 bg-base-100 p-10 text-center text-sm text-base-content/55">
          {t("signals.audit.empty")}
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryMetric label={t("signals.analysis.period")} value={t("signals.analysis.days", { days: audit.periodDays })} hint={formatDateTime(audit.generatedAt)} />
            <SummaryMetric label={t("signals.audit.signalCount")} value={formatNumber(audit.signalCount)} />
            <SummaryMetric label={t("signals.audit.threadCount")} value={formatNumber(audit.threadCount)} />
            <SummaryMetric label={t("signals.audit.model")} value={audit.reviewModel} hint={t("signals.aiCodexMode")} />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <ComparisonBar label={t("signals.audit.needsReview")} before={audit.needsReviewBefore} after={audit.needsReviewAfter} />
            <ComparisonBar label={t("signals.audit.blockedRisk")} before={audit.blockedBefore} after={audit.blockedAfter} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <SummaryMetric label={t("signals.audit.corrected")} value={formatNumber(audit.correctedCount)} />
            <SummaryMetric label={t("signals.analysis.lifecycleUpdates")} value={formatNumber(audit.lifecycleUpdates)} />
          </section>

          <AuditTable audit={audit} />
        </>
      )}
    </div>
  );
}
