import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Thermometer,
  Fan,
  Activity,
  Film,
  Bug,
  Tv,
  Rocket,
  Server,
  Bot,
  MonitorPlay,
} from "lucide-react";
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
import { apiClient, type SystemStatus, type AppStatus } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

// The page polls every 5s, and pauses polling whenever the tab is hidden — so when nobody is
// looking, the server does zero monitoring work (the answer to "это не нагрузит сервер?").
const POLL_MS = 5000;

export default function System() {
  const { t } = useT();
  const { user } = useAuth();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const d = await apiClient.system();
        if (stopped) return;
        setData(d);
        setError(false);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (stopped) return;
        console.error("[Сервер] запрос /system упал:", e);
        setError(true);
      }
    };
    const start = () => {
      if (timer.current != null) return;
      void tick();
      timer.current = window.setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (timer.current != null) {
        clearInterval(timer.current);
        timer.current = undefined;
      }
    };
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      stopped = true;
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Engine/renderer config (admin-only card below) — one cheap fetch, no polling.
  useEffect(() => {
    apiClient.status().then(setStatus).catch(() => {});
  }, []);

  const now = data?.now;
  const hardware = data?.hardware;
  const idle = data ? data.active.render === 0 && data.active.upload === 0 : true;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("system.title")}</h1>
          <p className="text-base-content/60">
            {t("system.subtitle", { n: POLL_MS / 1000 })}
          </p>
        </div>
        {updatedAt && (
          <div className="text-sm text-base-content/50 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
            {t("system.updated", { ago: timeAgo(updatedAt) })}
          </div>
        )}
      </header>

      {error && <div className="alert alert-error text-sm py-2">{t("system.loadError")}</div>}

      {!data ? (
        !error && (
          <div className="py-16 text-center">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        )
      ) : (
        <>
          {/* System resources */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <Gauge
              icon={<Cpu />}
              label={t("system.cpu")}
              value={`${now!.cpuPct}%`}
              pct={now!.cpuPct}
              hint={
                now!.loadavg[0] > 0
                  ? `load ${now!.loadavg.map((n) => n.toFixed(2)).join(" / ")} · ${t("system.cores", { n: now!.cpuCount })}`
                  : `${t("system.avgOver", { n: now!.sampleSec })} · ${t("system.cores", { n: now!.cpuCount })}`
              }
            />
            {hardware?.tempC != null ? (
              <Gauge
                icon={<Thermometer />}
                label={t("system.temperature")}
                value={fmtTemp(hardware.tempC)}
                pct={Math.max(0, Math.min(100, Math.round(hardware.tempC)))}
                hint={temperatureHint(hardware, t)}
              />
            ) : (
              <Stat
                icon={<Thermometer />}
                label={t("system.temperature")}
                value="—"
                hint={t("system.temperatureUnavailable")}
              />
            )}
            <Gauge
              icon={<MemoryStick />}
              label={t("system.memory")}
              value={`${now!.memPct}%`}
              pct={now!.memPct}
              hint={t("system.memoryHint", {
                used: fmtMb(now!.memUsedMb),
                total: fmtMb(now!.memTotalMb),
                proc: fmtMb(now!.rssMb),
              })}
            />
            <Gauge
              icon={<HardDrive />}
              label={t("system.disk")}
              value={`${now!.diskPct}%`}
              pct={now!.diskPct}
              hint={t("system.diskHint", { free: fmtMb(now!.diskFreeMb), total: fmtMb(now!.diskTotalMb) })}
            />
            <Stat
              icon={<Clock />}
              label={t("system.uptime")}
              value={fmtUptime(now!.uptimeSec)}
              hint={`${now!.platform} · Node ${now!.nodeVersion}`}
            />
            <Stat
              icon={<Fan />}
              label={t("system.fan")}
              value={hardware?.fanRpm != null ? fmtRpm(hardware.fanRpm) : "—"}
              hint={hardware?.fanRpm != null ? t("system.fanHint") : t("system.fanUnavailable")}
            />
          </div>

          {/* Pipeline activity + domain counters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body py-5 gap-2">
                <div className="flex items-center gap-2 text-base-content/60 text-sm">
                  <Activity size={18} className={idle ? "" : "text-primary"} />
                  {t("system.pipelineActivity")}
                </div>
                {idle ? (
                  <div className="text-xl font-bold text-base-content/50">{t("system.idle")}</div>
                ) : (
                  <div className="flex gap-4">
                    <div>
                      <div className="text-2xl font-bold leading-none">{data.active.render}</div>
                      <div className="text-xs text-base-content/60 mt-1">{t("system.renders")}</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold leading-none">{data.active.upload}</div>
                      <div className="text-xs text-base-content/60 mt-1">{t("system.uploads")}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Stat
              icon={<Film />}
              label={t("system.videoQueue")}
              value={fmt(data.domain.videosQueued)}
              hint={t("system.videoQueueHint")}
            />
            <Stat
              icon={<Tv />}
              label={t("system.channels")}
              value={`${data.domain.accountsConnected} / ${data.domain.accountsTotal}`}
              hint={t("system.channelsHint", { n: data.domain.accountsEnabled })}
            />
            <Stat
              icon={<Bug />}
              label={t("system.errors24h")}
              value={fmt(data.domain.errors24h)}
              hint={t("system.errorsTotalHint", { n: fmt(data.domain.errorsTotal) })}
              danger={data.domain.errors24h > 0}
            />
          </div>

          {/* Scheduler heartbeat — proof the per-minute auto-poster is alive */}
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body py-4 flex-row items-center gap-4 flex-wrap">
              <div className="bg-primary/10 text-primary rounded-full w-11 h-11 flex items-center justify-center shrink-0">
                <Rocket size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{t("system.autopost")}</div>
                <div className="text-sm text-base-content/60">
                  {data.scheduler.lastTickAt
                    ? t("system.lastCheck", { ago: timeAgo(data.scheduler.lastTickAt) })
                    : t("system.neverTicked")}
                  {data.scheduler.lastPostAt
                    ? ` · ${t("system.lastPost", { ago: timeAgo(data.scheduler.lastPostAt) })}`
                    : ` · ${t("system.noPostsYet")}`}
                </div>
              </div>
              <SchedulerBadge lastTickAt={data.scheduler.lastTickAt} nowMs={updatedAt ?? 0} />
            </div>
          </div>

          {/* Engine / renderer config — admin only (moved here from Настройки) */}
          {user?.role === "admin" && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
                <div className="font-semibold">{t("system.config")}</div>
                <ConfigRow
                  icon={<Bot size={18} />}
                  title={t("system.engine")}
                  value={status?.llm || "Claude Code (headless)"}
                />
                <ConfigRow
                  icon={<MonitorPlay size={18} />}
                  title={t("system.renderer")}
                  value={status?.chromePath ?? "—"}
                />
              </div>
            </div>
          )}

          {/* History chart (in-memory ring, ~24h) */}
          <HistoryChart history={data.history} />
        </>
      )}
    </div>
  );
}

function HistoryChart({ history }: { history: SystemStatus["history"] }) {
  const { t } = useT();
  if (history.length < 2) {
    return (
      <div className="card bg-base-100 border border-base-300 border-dashed">
        <div className="card-body items-center text-center py-12">
          <Server className="text-base-content/30" size={36} />
          <p className="text-base-content/60 max-w-md">{t("system.historyEmpty")}</p>
        </div>
      </div>
    );
  }
  const cpuKey = t("system.chartCpu");
  const ramKey = t("system.chartRam");
  const tempKey = t("system.chartTemp");
  const hasTemp = history.some((p) => p.tempC != null);
  const data = history.map((p) => ({
    t: new Date(p.t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    [cpuKey]: p.cpu,
    [ramKey]: p.memPct,
    [tempKey]: p.tempC,
  }));
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("system.loadOverTime")}</div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="t" fontSize={12} tickMargin={6} minTickGap={40} />
              <YAxis fontSize={12} width={40} domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={cpuKey} stroke="#6419e6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey={ramKey} stroke="#1d4ed8" strokeWidth={2} dot={false} />
              {hasTemp && (
                <Line
                  type="monotone"
                  dataKey={tempKey}
                  stroke="#dc2626"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function SchedulerBadge({ lastTickAt, nowMs }: { lastTickAt: number | null; nowMs: number }) {
  const { t } = useT();
  // The cron fires every minute; if the last tick is older than ~3 min, something is wrong.
  if (!lastTickAt) return <span className="badge badge-ghost badge-sm">{t("system.waiting")}</span>;
  const stale = nowMs - lastTickAt > 3 * 60_000;
  return stale ? (
    <span className="badge badge-warning badge-sm">{t("system.stale")}</span>
  ) : (
    <span className="badge badge-success badge-sm">{t("system.active")}</span>
  );
}

function Gauge({
  icon,
  label,
  value,
  pct,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  pct: number;
  hint?: string;
}) {
  const color = pct >= 90 ? "progress-error" : pct >= 70 ? "progress-warning" : "progress-success";
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body py-5 gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-base-content/60">{label}</span>
          <span className="text-base-content/40">{icon}</span>
        </div>
        <div className="text-3xl font-bold leading-none">{value}</div>
        <progress className={`progress ${color} w-full h-2`} value={pct} max={100} />
        {hint && <div className="text-xs text-base-content/50">{hint}</div>}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body py-5 gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-base-content/60">{label}</span>
          <span className={danger ? "text-error" : "text-base-content/40"}>{icon}</span>
        </div>
        <div className={`text-3xl font-bold leading-none ${danger ? "text-error" : ""}`}>{value}</div>
        {hint && <div className="text-xs text-base-content/50">{hint}</div>}
      </div>
    </div>
  );
}

function ConfigRow({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-primary shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-base-content/60">{title}</div>
        <div className="font-medium break-all">{value}</div>
      </div>
      <span className="badge badge-success badge-sm">OK</span>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

// MB → human ("512 МБ" / "3.4 ГБ").
function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ГБ`;
  return `${fmt(Math.round(mb))} МБ`;
}

function fmtTemp(c: number): string {
  return `${c.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} °C`;
}

function fmtRpm(rpm: number): string {
  return `${fmt(rpm)} RPM`;
}

function temperatureHint(
  hardware: SystemStatus["hardware"],
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const parts: string[] = [];
  if (hardware.cpuTempC != null) parts.push(t("system.cpuTemp", { n: fmtTemp(hardware.cpuTempC) }));
  if (hardware.gpuTempC != null) parts.push(t("system.gpuTemp", { n: fmtTemp(hardware.gpuTempC) }));
  return parts.length ? parts.join(" · ") : hardware.tempLabel || t("system.temperatureAvailable");
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м`;
  return `${sec}с`;
}

function timeAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  return `${Math.floor(hr / 24)} дн назад`;
}
