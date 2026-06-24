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
  const [manualDraft, setManualDraft] = useState({ maxFileMb: 40, uploadsPerHour: 100 });
  const [readinessDraft, setReadinessDraft] = useState({ minRunwayDays: 2.5 });
  const [manualSaving, setManualSaving] = useState(false);
  const [readinessSaving, setReadinessSaving] = useState(false);
  const [manualMsg, setManualMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [readinessMsg, setReadinessMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiClient.adminLimits();
      setData(next);
      setManualDraft({
        maxFileMb: next.manualVideo.maxFileMb,
        uploadsPerHour: next.manualVideo.uploadsPerHour,
      });
      setReadinessDraft({ minRunwayDays: next.readiness.minRunwayDays });
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

  async function saveManualLimits() {
    setManualSaving(true);
    setManualMsg(null);
    try {
      const saved = await apiClient.updateAdminManualVideoLimits(manualDraft);
      setData((cur) => (cur ? { ...cur, manualVideo: saved } : cur));
      setManualDraft({ maxFileMb: saved.maxFileMb, uploadsPerHour: saved.uploadsPerHour });
      setManualMsg({ ok: true, text: t("limits.manualSaved") });
    } catch (err) {
      setManualMsg({ ok: false, text: err instanceof Error ? err.message : t("limits.manualSaveFailed") });
    } finally {
      setManualSaving(false);
    }
  }

  async function saveReadinessLimits() {
    setReadinessSaving(true);
    setReadinessMsg(null);
    try {
      const saved = await apiClient.updateAdminReadinessLimits(readinessDraft);
      setData((cur) => (cur ? { ...cur, readiness: saved } : cur));
      setReadinessDraft({ minRunwayDays: saved.minRunwayDays });
      setReadinessMsg({ ok: true, text: t("limits.readinessSaved") });
    } catch (err) {
      setReadinessMsg({ ok: false, text: err instanceof Error ? err.message : t("limits.readinessSaveFailed") });
    } finally {
      setReadinessSaving(false);
    }
  }

  if (user?.role !== "admin") return <Navigate to="/" replace />;

  const totals = data?.totals;
  const used = totals?.characterCount;
  const limit = totals?.characterLimit;
  const remaining = totals?.remaining;
  const pct = totals?.usedPercent ?? 0;
  const manualDirty =
    !!data?.manualVideo &&
    (manualDraft.maxFileMb !== data.manualVideo.maxFileMb ||
      manualDraft.uploadsPerHour !== data.manualVideo.uploadsPerHour);
  const readinessDirty = !!data?.readiness && readinessDraft.minRunwayDays !== data.readiness.minRunwayDays;

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
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{t("limits.manualTitle")}</div>
                  <div className="text-sm text-base-content/60">
                    {t("limits.manualDesc", {
                      sec: data?.manualVideo.durationSec ?? 60,
                    })}
                  </div>
                </div>
                <span className="badge badge-ghost">{t("limits.manualAdminEditable")}</span>
              </div>
              <form
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveManualLimits();
                }}
              >
                <label className="form-control">
                  <span className="label-text text-xs mb-1">{t("limits.manualMaxFileMb")}</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="input input-bordered input-sm"
                    value={manualDraft.maxFileMb}
                    onChange={(e) =>
                      setManualDraft((cur) => ({
                        ...cur,
                        maxFileMb: Math.max(1, Math.min(200, Number(e.target.value) || 1)),
                      }))
                    }
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs mb-1">{t("limits.manualUploadsPerHour")}</span>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    className="input input-bordered input-sm"
                    value={manualDraft.uploadsPerHour}
                    onChange={(e) =>
                      setManualDraft((cur) => ({
                        ...cur,
                        uploadsPerHour: Math.max(1, Math.min(1000, Number(e.target.value) || 1)),
                      }))
                    }
                  />
                </label>
                <button className="btn btn-sm btn-primary" type="submit" disabled={manualSaving || !manualDirty}>
                  {manualSaving ? <span className="loading loading-spinner loading-xs" /> : null}
                  {t("common.save")}
                </button>
              </form>
              <div className="grid gap-2 sm:grid-cols-3 text-xs text-base-content/60">
                <span>{t("limits.manualCurrentSize", { n: fmt(data?.manualVideo.maxFileMb, lang) })}</span>
                <span>{t("limits.manualCurrentRate", { n: fmt(data?.manualVideo.uploadsPerHour, lang) })}</span>
                <span>{t("limits.manualHardCaps")}</span>
              </div>
              {manualMsg && (
                <div className={`alert py-2 text-sm ${manualMsg.ok ? "alert-success" : "alert-error"}`}>
                  <span>{manualMsg.text}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{t("limits.readinessTitle")}</div>
                  <div className="text-sm text-base-content/60">{t("limits.readinessDesc")}</div>
                </div>
                <span className="badge badge-ghost">{t("limits.manualAdminEditable")}</span>
              </div>
              <form
                className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveReadinessLimits();
                }}
              >
                <label className="form-control">
                  <span className="label-text text-xs mb-1">{t("limits.readinessMinDays")}</span>
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    className="input input-bordered input-sm"
                    value={readinessDraft.minRunwayDays}
                    onChange={(e) =>
                      setReadinessDraft({
                        minRunwayDays: Math.max(0.5, Math.min(30, Math.round((Number(e.target.value) || 0.5) * 10) / 10)),
                      })
                    }
                  />
                </label>
                <button className="btn btn-sm btn-primary" type="submit" disabled={readinessSaving || !readinessDirty}>
                  {readinessSaving ? <span className="loading loading-spinner loading-xs" /> : null}
                  {t("common.save")}
                </button>
              </form>
              <div className="text-xs text-base-content/60">
                {t("limits.readinessCurrent", { n: fmt(data?.readiness.minRunwayDays, lang) })}
              </div>
              {readinessMsg && (
                <div className={`alert py-2 text-sm ${readinessMsg.ok ? "alert-success" : "alert-error"}`}>
                  <span>{readinessMsg.text}</span>
                </div>
              )}
            </div>
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
