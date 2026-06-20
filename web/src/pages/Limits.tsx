import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppIcon } from "../components/AppIcon";
import { apiClient, type AdminLimits, type AdminLimitsKey } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

export default function Limits() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const [data, setData] = useState<AdminLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiClient.adminLimits());
      setError(false);
    } catch (err) {
      console.error("[limits] /admin/limits failed", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (user?.role !== "admin") return <Navigate to="/" replace />;

  const totals = data?.totals;
  const used = totals?.characterCount;
  const limit = totals?.characterLimit;
  const remaining = totals?.remaining;
  const pct = totals?.usedPercent ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("limits.title")}</h1>
          <p className="text-base-content/60 max-w-2xl">{t("limits.subtitle")}</p>
        </div>
        <button className="btn btn-sm btn-outline gap-2" onClick={() => void load()} disabled={loading}>
          <AppIcon name="refresh" size={16} className={loading ? "animate-spin" : ""} />
          {t("limits.refresh")}
        </button>
      </header>

      {error && (
        <div className="alert alert-warning">
          <AppIcon name="warning" size={18} />
          <span>{t("limits.loadError")}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t("limits.keysConfigured")} value={fmt(totals?.configured, lang)} hint={t("limits.keysActive", { n: fmt(totals?.active, lang) })} />
            <Stat label={t("limits.monthUsed")} value={fmt(used, lang)} hint={t("limits.ofLimit", { n: fmt(limit, lang) })} />
            <Stat label={t("limits.remaining")} value={fmt(remaining, lang)} hint={t("limits.charactersHint")} />
            <Stat
              label={t("limits.problemKeys")}
              value={fmt((totals?.exhausted ?? 0) + (totals?.invalid ?? 0) + (totals?.rateLimited ?? 0) + (totals?.errors ?? 0) + (totals?.blocked ?? 0), lang)}
              hint={t("limits.problemKeysHint", {
                exhausted: fmt(totals?.exhausted, lang),
                invalid: fmt(totals?.invalid, lang),
                blocked: fmt(totals?.blocked, lang),
              })}
              danger={(totals?.invalid ?? 0) + (totals?.errors ?? 0) + (totals?.blocked ?? 0) > 0}
            />
          </div>

          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{t("limits.providerElevenLabs")}</div>
                  <div className="text-sm text-base-content/60">
                    {data?.updatedAt ? t("limits.updatedAt", { date: formatDate(data.updatedAt, lang) }) : t("limits.notUpdated")}
                  </div>
                </div>
                <span className="badge badge-ghost">{t("limits.quotaUnit")}</span>
              </div>
              <progress className="progress progress-primary h-2 w-full" value={pct} max={100} />
              <div className="flex justify-between gap-3 text-xs text-base-content/60">
                <span>{t("limits.usedPercent", { n: fmtPct(totals?.usedPercent, lang) })}</span>
                <span>{fmt(used, lang)} / {fmt(limit, lang)}</span>
              </div>

              {data?.keys.length ? (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>{t("limits.key")}</th>
                        <th>{t("limits.status")}</th>
                        <th>{t("limits.used")}</th>
                        <th>{t("limits.left")}</th>
                        <th>{t("limits.reset")}</th>
                        <th>{t("limits.tier")}</th>
                        <th>{t("limits.note")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.keys.map((row) => (
                        <tr key={row.index}>
                          <td className="font-mono text-xs whitespace-nowrap">{row.keyHint}</td>
                          <td><StatusBadge row={row} /></td>
                          <td className="whitespace-nowrap">{fmt(row.characterCount, lang)} / {fmt(row.characterLimit, lang)}</td>
                          <td className="whitespace-nowrap">{fmt(row.remaining, lang)}</td>
                          <td className="whitespace-nowrap">{formatDate(row.resetAt, lang)}</td>
                          <td className="whitespace-nowrap">{row.tier || "—"}</td>
                          <td className="max-w-sm truncate" title={row.error}>{row.error || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
                  {t("limits.noKeys")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ row }: { row: AdminLimitsKey }) {
  const { t } = useT();
  const map: Record<AdminLimitsKey["status"], string> = {
    ok: "badge-success",
    exhausted: "badge-warning",
    invalid: "badge-error",
    rate_limited: "badge-info",
    error: "badge-error",
    blocked: "badge-error",
  };
  return <span className={`badge badge-sm ${map[row.status]}`}>{t(`limits.status.${row.status}`)}</span>;
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint: string; danger?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body py-5 gap-2">
        <div className="text-sm text-base-content/60">{label}</div>
        <div className={`text-3xl font-bold leading-none ${danger ? "text-error" : ""}`}>{value}</div>
        <div className="text-xs text-base-content/50">{hint}</div>
      </div>
    </div>
  );
}

function fmt(value: number | null | undefined, lang: string): string {
  if (value == null) return "—";
  return value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US");
}

function fmtPct(value: number | null | undefined, lang: string): string {
  if (value == null) return "—";
  return `${value.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 1 })}%`;
}

function formatDate(value: string | null | undefined, lang: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // 24h always — en-US would otherwise render AM/PM
  });
}
