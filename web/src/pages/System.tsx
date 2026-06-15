import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
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

// The page polls every 5s, and pauses polling whenever the tab is hidden — so when nobody is
// looking, the server does zero monitoring work (the answer to "это не нагрузит сервер?").
const POLL_MS = 5000;

export default function System() {
  const { user } = useAuth();
  const [data, setData] = useState<SystemStatus | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const d = await apiClient.system();
        if (stopped) return;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (stopped) return;
        console.error("[Сервер] запрос /system упал:", e);
        setError(
          "Не удалось загрузить состояние сервера. Если вкладка только что добавлена — серверу нужен перезапуск, чтобы появился маршрут /api/system (подробности в консоли F12).",
        );
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
  const idle = data ? data.active.render === 0 && data.active.upload === 0 : true;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Сервер</h1>
          <p className="text-base-content/60">
            Нагрузка и состояние · обновляется каждые {POLL_MS / 1000}с, пока вкладка открыта
          </p>
        </div>
        {updatedAt && (
          <div className="text-sm text-base-content/50 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-success animate-pulse" />
            обновлено {timeAgo(updatedAt)}
          </div>
        )}
      </header>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}

      {!data ? (
        !error && (
          <div className="py-16 text-center">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        )
      ) : (
        <>
          {/* System resources */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Gauge
              icon={<Cpu />}
              label="Процессор"
              value={`${now!.cpuPct}%`}
              pct={now!.cpuPct}
              hint={
                now!.loadavg[0] > 0
                  ? `load ${now!.loadavg.map((n) => n.toFixed(2)).join(" / ")} · ${now!.cpuCount} ядер`
                  : `среднее за ~${now!.sampleSec}с · ${now!.cpuCount} ядер`
              }
            />
            <Gauge
              icon={<MemoryStick />}
              label="Память (система)"
              value={`${now!.memPct}%`}
              pct={now!.memPct}
              hint={`${fmtMb(now!.memUsedMb)} из ${fmtMb(now!.memTotalMb)} · процесс ${fmtMb(now!.rssMb)}`}
            />
            <Gauge
              icon={<HardDrive />}
              label="Диск"
              value={`${now!.diskPct}%`}
              pct={now!.diskPct}
              hint={`свободно ${fmtMb(now!.diskFreeMb)} из ${fmtMb(now!.diskTotalMb)}`}
            />
            <Stat
              icon={<Clock />}
              label="Аптайм процесса"
              value={fmtUptime(now!.uptimeSec)}
              hint={`${now!.platform} · Node ${now!.nodeVersion}`}
            />
          </div>

          {/* Pipeline activity + domain counters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body py-5 gap-2">
                <div className="flex items-center gap-2 text-base-content/60 text-sm">
                  <Activity size={18} className={idle ? "" : "text-primary"} />
                  Активность пайплайна
                </div>
                {idle ? (
                  <div className="text-xl font-bold text-base-content/50">простаивает</div>
                ) : (
                  <div className="flex gap-4">
                    <div>
                      <div className="text-2xl font-bold leading-none">{data.active.render}</div>
                      <div className="text-xs text-base-content/60 mt-1">рендеров</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold leading-none">{data.active.upload}</div>
                      <div className="text-xs text-base-content/60 mt-1">загрузок</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Stat
              icon={<Film />}
              label="Очередь видео"
              value={fmt(data.domain.videosQueued)}
              hint="готовы к постингу (во всех каналах)"
            />
            <Stat
              icon={<Tv />}
              label="Каналы"
              value={`${data.domain.accountsConnected} / ${data.domain.accountsTotal}`}
              hint={`подключено · включено ${data.domain.accountsEnabled}`}
            />
            <Stat
              icon={<Bug />}
              label="Ошибки за 24ч"
              value={fmt(data.domain.errors24h)}
              hint={`всего в журнале: ${fmt(data.domain.errorsTotal)}`}
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
                <div className="font-semibold">Автопостинг (scheduler)</div>
                <div className="text-sm text-base-content/60">
                  {data.scheduler.lastTickAt
                    ? `последняя проверка ${timeAgo(data.scheduler.lastTickAt)}`
                    : "ещё не тикал (проверка раз в минуту)"}
                  {data.scheduler.lastPostAt
                    ? ` · последняя выкладка ${timeAgo(data.scheduler.lastPostAt)}`
                    : " · выкладок ещё не было"}
                </div>
              </div>
              <SchedulerBadge lastTickAt={data.scheduler.lastTickAt} />
            </div>
          </div>

          {/* Engine / renderer config — admin only (moved here from Настройки) */}
          {user?.role === "admin" && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
                <div className="font-semibold">Конфигурация</div>
                <ConfigRow
                  icon={<Bot size={18} />}
                  title="Движок генерации"
                  value={status?.llm || "Claude Code (headless)"}
                />
                <ConfigRow
                  icon={<MonitorPlay size={18} />}
                  title="Рендерер"
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
  if (history.length < 2) {
    return (
      <div className="card bg-base-100 border border-base-300 border-dashed">
        <div className="card-body items-center text-center py-12">
          <Server className="text-base-content/30" size={36} />
          <p className="text-base-content/60 max-w-md">
            История копится в памяти сервера (точка раз в ~30с, до 24ч). Скоро здесь будет график CPU и
            памяти. При перезапуске сервера история обнуляется — это нормально.
          </p>
        </div>
      </div>
    );
  }
  const data = history.map((p) => ({
    t: new Date(p.t).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    "CPU %": p.cpu,
    "RAM %": p.memPct,
  }));
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">Нагрузка во времени (последние ~24ч)</div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="t" fontSize={12} tickMargin={6} minTickGap={40} />
              <YAxis fontSize={12} width={40} domain={[0, 100]} unit="%" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="CPU %" stroke="#6419e6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="RAM %" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function SchedulerBadge({ lastTickAt }: { lastTickAt: number | null }) {
  // The cron fires every minute; if the last tick is older than ~3 min, something is wrong.
  if (!lastTickAt) return <span className="badge badge-ghost badge-sm">ожидание</span>;
  const stale = Date.now() - lastTickAt > 3 * 60_000;
  return stale ? (
    <span className="badge badge-warning badge-sm">давно не тикал</span>
  ) : (
    <span className="badge badge-success badge-sm">активен</span>
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
