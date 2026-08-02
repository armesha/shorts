import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bot, Check, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import {
  apiClient,
  type RecentSignal,
  type SignalPaperPosition,
  type SignalsControlStatus,
  type SignalsHealthState,
  type SignalsResponse,
  type SignalsSettings,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { isMainAdmin } from "../lib/authz";
import { useT } from "../lib/i18n";

const POLL_MS = 15_000;

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type SettingsField = keyof SignalsSettings;
type SettingsDraft = Record<SettingsField, string>;
type SettingsError = "number" | "integer" | "range" | "lowConfidenceOverMax" | "defaultOverMax" | "maxOverExposure" | "dailyOverMonthly";
type SettingsValidation = {
  values: SignalsSettings | null;
  errors: Partial<Record<SettingsField, SettingsError>>;
};

const SETTINGS_FIELDS: Array<{
  key: SettingsField;
  labelKey: string;
  min: number;
  max: number;
  step: number | "any";
  integer?: boolean;
}> = [
  { key: "initialBankrollUsd", labelKey: "signals.settings.initialBankroll", min: 1, max: 1_000_000, step: "any" },
  { key: "lowConfidencePercent", labelKey: "signals.settings.lowConfidence", min: 0, max: 100, step: "any" },
  { key: "defaultPositionPercent", labelKey: "signals.settings.defaultPosition", min: 0, max: 100, step: "any" },
  { key: "maxPositionPercent", labelKey: "signals.settings.maxPosition", min: 0, max: 100, step: "any" },
  { key: "maxTotalExposurePercent", labelKey: "signals.settings.maxExposure", min: 0, max: 100, step: "any" },
  { key: "maxOpenPositions", labelKey: "signals.settings.maxOpenPositions", min: 1, max: 100, step: 1, integer: true },
  { key: "dailyAiLimitUsd", labelKey: "signals.settings.dailyAiLimit", min: 0, max: 50, step: "any" },
  { key: "monthlyAiLimitUsd", labelKey: "signals.settings.monthlyAiLimit", min: 0, max: 1_000, step: "any" },
];

function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? moneyFormatter.format(value) : "—";
}

function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

function formatRangeNumber(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function formatMultiple(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}×`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const plain = value.includes("T") ? value : value.replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(plain);
  const date = new Date(hasZone ? plain : `${plain}Z`);
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

function statusClass(status: string | null | undefined): string {
  const normalized = status?.trim().toLowerCase() ?? "";
  if (["open", "active", "detected", "tracked", "valid"].includes(normalized)) return "badge-success";
  if (["closed", "expired", "rejected", "invalid", "failed"].includes(normalized)) return "badge-warning";
  return "badge-ghost";
}

function healthClass(state: SignalsHealthState): string {
  if (state === "running") return "badge-success";
  if (state === "starting") return "badge-warning";
  if (state === "failed" || state === "stopped") return "badge-error";
  return "badge-ghost";
}

function controlClass(status: SignalsControlStatus): string {
  if (status === "applied") return "badge-success";
  if (status === "invalid") return "badge-error";
  if (status === "unavailable") return "badge-warning";
  return "badge-ghost";
}

function healthLabel(t: Translate, state: SignalsHealthState): string {
  return t(`signals.health.${state}`);
}

function controlLabel(t: Translate, status: SignalsControlStatus): string {
  return t(`signals.control.${status}`);
}

function settingsToDraft(settings: SignalsSettings): SettingsDraft {
  return {
    initialBankrollUsd: String(settings.initialBankrollUsd),
    lowConfidencePercent: String(settings.lowConfidencePercent),
    defaultPositionPercent: String(settings.defaultPositionPercent),
    maxPositionPercent: String(settings.maxPositionPercent),
    maxTotalExposurePercent: String(settings.maxTotalExposurePercent),
    maxOpenPositions: String(settings.maxOpenPositions),
    dailyAiLimitUsd: String(settings.dailyAiLimitUsd),
    monthlyAiLimitUsd: String(settings.monthlyAiLimitUsd),
  };
}

function settingsKey(settings: SignalsSettings): string {
  return SETTINGS_FIELDS.map((field) => `${field.key}:${settings[field.key]}`).join("|");
}

function parseStrictNumber(value: string, integer = false): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

function validateSettings(draft: SettingsDraft): SettingsValidation {
  const values: Partial<SignalsSettings> = {};
  const errors: SettingsValidation["errors"] = {};

  for (const field of SETTINGS_FIELDS) {
    const value = parseStrictNumber(draft[field.key], field.integer);
    if (value == null) {
      errors[field.key] = field.integer ? "integer" : "number";
      continue;
    }
    if (value < field.min || value > field.max) {
      errors[field.key] = "range";
      continue;
    }
    values[field.key] = value;
  }

  if (Object.keys(errors).length > 0) return { values: null, errors };
  const result = values as SignalsSettings;
  if (result.lowConfidencePercent > result.maxPositionPercent) {
    errors.lowConfidencePercent = "lowConfidenceOverMax";
    errors.maxPositionPercent = "lowConfidenceOverMax";
  }
  if (result.defaultPositionPercent > result.maxPositionPercent) {
    errors.defaultPositionPercent = "defaultOverMax";
    if (!errors.maxPositionPercent) errors.maxPositionPercent = "defaultOverMax";
  }
  if (result.maxPositionPercent > result.maxTotalExposurePercent) {
    if (!errors.maxPositionPercent) errors.maxPositionPercent = "maxOverExposure";
    errors.maxTotalExposurePercent = "maxOverExposure";
  }
  if (result.dailyAiLimitUsd > result.monthlyAiLimitUsd) {
    errors.dailyAiLimitUsd = "dailyOverMonthly";
    errors.monthlyAiLimitUsd = "dailyOverMonthly";
  }
  return Object.keys(errors).length > 0 ? { values: null, errors } : { values: result, errors };
}

function settingsMatch(first: SignalsSettings, second: SignalsSettings): boolean {
  return SETTINGS_FIELDS.every((field) => first[field.key] === second[field.key]);
}

function settingsErrorText(error: SettingsError | undefined, field: SettingsField, t: Translate): string | null {
  if (!error) return null;
  if (error === "number") return t("signals.settings.invalidNumber");
  if (error === "integer") return t("signals.settings.integer");
  if (error === "range") {
    const limits = SETTINGS_FIELDS.find((item) => item.key === field);
    return limits ? t("signals.settings.range", { min: formatRangeNumber(limits.min), max: formatRangeNumber(limits.max) }) : t("signals.settings.invalidNumber");
  }
  if (error === "lowConfidenceOverMax") return t("signals.settings.lowConfidenceOverMax");
  if (error === "defaultOverMax") return t("signals.settings.defaultOverMax");
  if (error === "maxOverExposure") return t("signals.settings.maxOverExposure");
  return t("signals.settings.dailyOverMonthly");
}

function PnlValue({ value }: { value: number | null | undefined }) {
  const color = typeof value === "number" && value > 0 ? "text-success" : typeof value === "number" && value < 0 ? "text-error" : "text-base-content";
  return <span className={`font-semibold tabular-nums ${color}`}>{formatUsd(value)}</span>;
}

function PositionRows({ positions }: { positions: SignalPaperPosition[] }) {
  const { t } = useT();
  if (!positions.length) {
    return <div className="px-4 py-12 text-center text-sm text-base-content/60">{t("signals.positionsEmpty")}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm lg:table-md">
        <thead>
          <tr>
            <th>{t("signals.contractChain")}</th>
            <th>{t("signals.status")}</th>
            <th>{t("signals.openedDetected")}</th>
            <th>{t("signals.positionRisk")}</th>
            <th>{t("signals.prices")}</th>
            <th>{t("signals.pnl")}</th>
            <th>{t("signals.updated")}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position, index) => (
            <tr key={`${position.contract}:${position.chain ?? ""}:${position.openedAt ?? ""}:${index}`}>
              <td>
                <div className="max-w-48 truncate font-medium" title={position.contract}>{position.contract}</div>
                <div className="mt-0.5 text-xs text-base-content/55">{position.chain || "—"}</div>
              </td>
              <td><span className={`badge badge-sm ${statusClass(position.status)}`}>{position.status}</span></td>
              <td className="whitespace-nowrap text-xs text-base-content/65">
                <div>{formatDateTime(position.openedAt)}</div>
                <div className="mt-0.5">{formatDateTime(position.detectedAt)}</div>
              </td>
              <td className="whitespace-nowrap text-xs">
                <div className="font-medium">{formatUsd(position.notionalUsd)}</div>
                <div className="mt-0.5 text-base-content/55">{formatPercent(position.riskPercent)}</div>
              </td>
              <td className="whitespace-nowrap text-xs">
                <div>{formatUsd(position.entryPriceUsd)}</div>
                <div className="mt-0.5 text-base-content/55">{formatUsd(position.currentPriceUsd)} · {formatMultiple(position.multiple)}</div>
              </td>
              <td className="whitespace-nowrap"><PnlValue value={position.pnlUsd} /></td>
              <td className="whitespace-nowrap text-xs text-base-content/65">{formatDateTime(position.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentSignalRows({ signals }: { signals: RecentSignal[] }) {
  const { t } = useT();
  if (!signals.length) {
    return <div className="px-4 py-12 text-center text-sm text-base-content/60">{t("signals.recentEmpty")}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm lg:table-md">
        <thead>
          <tr>
            <th>{t("signals.detected")}</th>
            <th>{t("signals.status")}</th>
            <th>{t("signals.contractChain")}</th>
            <th>{t("signals.contracts")}</th>
            <th>{t("signals.classification")}</th>
            <th>{t("signals.confidence")}</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal, index) => (
            <tr key={`${signal.detectedAt ?? ""}:${signal.chain ?? ""}:${index}`}>
              <td className="whitespace-nowrap text-xs text-base-content/65">{formatDateTime(signal.detectedAt)}</td>
              <td><span className={`badge badge-sm ${statusClass(signal.status)}`}>{signal.status}</span></td>
              <td className="text-sm">{signal.chain || "—"}</td>
              <td>
                <div className="max-w-72 truncate text-sm" title={signal.contracts.join(", ")}>{signal.contracts.join(", ") || "—"}</div>
              </td>
              <td className="text-sm text-base-content/70">{signal.classification || "—"}</td>
              <td className="whitespace-nowrap text-sm tabular-nums">{formatConfidence(signal.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Signals() {
  const { t } = useT();
  const { user } = useAuth();
  const [response, setResponse] = useState<SignalsResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const hasStartedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const mountedRef = useRef(true);
  const settingsDraftTouchedRef = useRef(false);
  const loadRef = useRef<(manual?: boolean) => Promise<void>>(async () => {});

  const load = useCallback(async (manual = false) => {
    if (requestInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    requestInFlightRef.current = true;
    const initial = !hasStartedRef.current;
    hasStartedRef.current = true;
    if (initial) setInitialLoading(true);
    if (manual && !initial) setManualRefreshing(true);
    try {
      const next = await apiClient.signals();
      if (!mountedRef.current) return;
      setResponse(next);
      setError(false);
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      requestInFlightRef.current = false;
      if (!mountedRef.current) return;
      if (initial) setInitialLoading(false);
      if (manual && !initial) setManualRefreshing(false);
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false;
        window.setTimeout(() => {
          if (mountedRef.current && !document.hidden) void loadRef.current();
        }, 0);
      }
    }
  }, []);
  loadRef.current = load;

  useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      if (timer != null) return;
      void load();
      timer = window.setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer == null) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const onVisibilityChange = () => (document.hidden ? stop() : start());

    mountedRef.current = true;
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) start();
    return () => {
      mountedRef.current = false;
      refreshQueuedRef.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  const snapshot = response?.available ? response.snapshot : null;
  const summary = snapshot?.summary;
  const canManageSettings = isMainAdmin(user);
  const currentSettings = snapshot?.settings ?? null;
  const currentSettingsKey = currentSettings ? settingsKey(currentSettings) : "";

  useEffect(() => {
    if (!canManageSettings || !currentSettings || settingsDraftTouchedRef.current) return;
    setSettingsDraft(settingsToDraft(currentSettings));
  }, [canManageSettings, currentSettingsKey]);

  const settingsValidation = useMemo(() => (settingsDraft ? validateSettings(settingsDraft) : null), [settingsDraft]);
  const settingsDirty = !!(snapshot?.settings && settingsValidation?.values && !settingsMatch(settingsValidation.values, snapshot.settings));

  function changeSettingsField(field: SettingsField, value: string) {
    settingsDraftTouchedRef.current = true;
    setSettingsMessage(null);
    setSettingsDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function saveSettings() {
    if (!settingsValidation?.values) return;
    setSettingsSaving(true);
    setSettingsMessage(null);
    try {
      const result = await apiClient.updateSignalsSettings(settingsValidation.values);
      if (!result.accepted) {
        setSettingsMessage({ ok: false, text: t("signals.settings.notAccepted") });
        return;
      }
      // Accepted only means the bot received desired state; the next snapshot is the source of truth.
      settingsDraftTouchedRef.current = false;
      setSettingsMessage({ ok: true, text: t("signals.settings.accepted") });
      void load();
    } catch {
      setSettingsMessage({ ok: false, text: t("signals.settings.saveError") });
    } finally {
      setSettingsSaving(false);
    }
  }

  return (
    <div className="route-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity className="text-primary" />{t("signals.title")}</h1>
          <p className="mt-1 max-w-3xl text-base-content/60">{t("signals.subtitle")}</p>
          {snapshot?.generatedAt && <p className="mt-2 text-xs text-base-content/50">{t("signals.snapshotAt", { time: formatDateTime(snapshot.generatedAt) })}</p>}
        </div>
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => void load(true)} disabled={initialLoading || manualRefreshing}>
          <RefreshCw size={16} className={manualRefreshing ? "animate-spin" : ""} />{t("common.refresh")}
        </button>
      </header>

      {error && <div className="alert alert-error"><AlertTriangle size={18} /><span>{t("signals.loadError")}</span></div>}

      {initialLoading && !response ? (
        <div className="flex justify-center py-16"><LoaderCircle className="animate-spin text-primary" size={30} /></div>
      ) : response && !response.available ? (
        <section className="card border border-dashed border-base-300 bg-base-100">
          <div className="card-body items-center py-14 text-center">
            <Bot size={38} className="text-base-content/35" />
            <h2 className="mt-2 font-semibold">{response.reason === "stale" ? t("signals.staleTitle") : t("signals.unavailableTitle")}</h2>
            <p className="max-w-xl text-sm text-base-content/60">{response.reason === "stale" ? t("signals.staleText") : t("signals.unavailableText")}</p>
          </div>
        </section>
      ) : summary && snapshot ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric icon={<Activity size={18} />} label={t("signals.signalCount")} value={formatNumber(summary.signalCount)} />
            <Metric icon={<ShieldCheck size={18} />} label={t("signals.paperPositions")} value={formatNumber(summary.paperPositionCount)} />
            <Metric icon={<Activity size={18} />} label={t("signals.notional")} value={formatUsd(summary.totalNotionalUsd)} />
            <Metric icon={<Bot size={18} />} label={t("signals.portfolioValue")} value={formatUsd(summary.portfolioValueUsd)} />
            <Metric icon={<Activity size={18} />} label={t("signals.safePnl")} value={<PnlValue value={summary.totalPnlUsd} />} />
            <Metric
              icon={<Bot size={18} />}
              label={t("signals.aiToday")}
              value={formatUsd(summary.todayAiSpendUsd)}
              hint={t("signals.ofLimit", { spent: formatUsd(summary.todayAiSpendUsd), limit: formatUsd(summary.dailyAiLimitUsd) })}
            />
            <Metric
              icon={<Bot size={18} />}
              label={t("signals.aiMonth")}
              value={formatUsd(summary.monthAiSpendUsd)}
              hint={t("signals.ofLimit", { spent: formatUsd(summary.monthAiSpendUsd), limit: formatUsd(summary.monthlyAiLimitUsd) })}
            />
          </section>

          <section className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <div className="flex items-start gap-2">
                <ShieldCheck size={19} className="mt-0.5 text-primary" />
                <div>
                  <h2 className="font-semibold">{t("signals.serviceStatusTitle")}</h2>
                  <p className="mt-1 text-sm text-base-content/60">{t("signals.serviceStatusSubtitle")}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatusMetric label={t("signals.healthState")} value={<span className={`badge ${healthClass(snapshot.health.state)}`}>{healthLabel(t, snapshot.health.state)}</span>} />
                <StatusMetric label={t("signals.controlStatus")} value={<span className={`badge ${controlClass(snapshot.controlStatus)}`}>{controlLabel(t, snapshot.controlStatus)}</span>} />
                <StatusMetric label={t("signals.restartCount")} value={formatNumber(snapshot.health.restartCount)} />
                <StatusMetric label={t("signals.lastExitCode")} value={snapshot.health.lastExitCode == null ? "—" : String(snapshot.health.lastExitCode)} />
              </div>
              <div className="text-xs text-base-content/55">{t("signals.lastMessageAt", { time: formatDateTime(snapshot.lastMessageAt) })}</div>
            </div>
          </section>

          {canManageSettings && settingsDraft && (
            <section className="card border border-base-300 bg-base-100 shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-2">
                    <Bot size={19} className="mt-0.5 text-primary" />
                    <div>
                      <h2 className="font-semibold">{t("signals.settings.title")}</h2>
                      <p className="mt-1 text-sm text-base-content/60">{t("signals.settings.subtitle")}</p>
                    </div>
                  </div>
                  <span className="badge badge-outline">{t("signals.settings.superAdminOnly")}</span>
                </div>

                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveSettings();
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {SETTINGS_FIELDS.map((field) => {
                      const errorText = settingsErrorText(settingsValidation?.errors[field.key], field.key, t);
                      return (
                        <label className="form-control" key={field.key}>
                          <span className="label-text mb-1 text-xs font-medium">{t(field.labelKey)}</span>
                          <input
                            type="number"
                            inputMode={field.integer ? "numeric" : "decimal"}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            className={`input input-bordered input-sm tabular-nums ${errorText ? "input-error" : ""}`}
                            value={settingsDraft[field.key]}
                            disabled={settingsSaving}
                            aria-invalid={errorText ? true : undefined}
                            onChange={(event) => changeSettingsField(field.key, event.target.value)}
                          />
                          <span className={`mt-1 min-h-4 text-xs ${errorText ? "text-error" : "text-base-content/50"}`}>
                            {errorText || t("signals.settings.rangeHint", { min: formatRangeNumber(field.min), max: formatRangeNumber(field.max) })}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-base-content/55">{t("signals.settings.applyNote")}</p>
                    <button className="btn btn-primary btn-sm gap-2" type="submit" disabled={settingsSaving || !settingsDirty || !settingsValidation?.values}>
                      {settingsSaving ? <span className="loading loading-spinner loading-xs" /> : <Check size={15} />}
                      {t("common.save")}
                    </button>
                  </div>
                </form>

                {settingsMessage && (
                  <div className={`alert py-2 text-sm ${settingsMessage.ok ? "alert-success" : "alert-error"}`} role="status">
                    {settingsMessage.ok ? <Check size={17} /> : <AlertTriangle size={17} />}
                    <span>{settingsMessage.text}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-1 p-0">
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <h2 className="font-semibold">{t("signals.positionsTitle")}</h2>
                <p className="mt-1 text-sm text-base-content/60">{t("signals.positionsSubtitle")}</p>
              </div>
              <PositionRows positions={snapshot.positions} />
            </div>
          </section>

          <section className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-1 p-0">
              <div className="px-4 pt-4 sm:px-5 sm:pt-5">
                <h2 className="font-semibold">{t("signals.recentTitle")}</h2>
                <p className="mt-1 text-sm text-base-content/60">{t("signals.recentSubtitle")}</p>
              </div>
              <RecentSignalRows signals={snapshot.recentSignals} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <article className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-base-content/60">{icon}<span>{label}</span></div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-base-content/55">{hint}</div>}
    </article>
  );
}

function StatusMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-base-200 bg-base-200/35 p-3">
      <div className="text-xs text-base-content/55">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
