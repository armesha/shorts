import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Users, Eye, Film, RefreshCw, TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
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
import { apiClient, type StatRow, type StatPoint } from "../lib/api";
import { useAuth } from "../lib/auth";

type Scope = "mine" | "all";
type MetricKey = "subscribers" | "views" | "videos";

export default function Statistics() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<StatRow[]>([]);
  const [scope, setScope] = useState<Scope>("mine");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Auto-dismiss the success/result banner after a few seconds.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiClient
      .stats(scope)
      .then(setRows)
      .catch((e) => {
        console.error("[Статистика] запрос /stats упал:", e);
        setError("Не удалось загрузить статистику (подробности в консоли F12)");
      })
      .finally(() => setLoading(false));
  }, [scope]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiClient.refreshStats(scope);
      setRows(r);
      const connected = r.filter((x) => x.connected);
      const failed = r.filter((x) => x.error);
      if (failed.length) {
        console.error(
          `[Статистика] ошибки обновления у ${failed.length} канал(ов):`,
          failed.map((x) => ({ канал: x.ytChannelTitle || x.channelName, ошибка: x.error })),
        );
        setResult({
          ok: false,
          text: `Обновлено ${connected.length - failed.length} из ${connected.length} · с ошибками: ${failed.length} (детали — в карточках и в консоли F12)`,
        });
      } else if (connected.length === 0) {
        setResult({ ok: false, text: "Нет подключённых каналов для обновления" });
      } else {
        setResult({ ok: true, text: `Успешно обновлено каналов: ${connected.length}` });
      }
    } catch (e) {
      console.error("[Статистика] запрос /stats/refresh упал:", e);
      setError("Не удалось обновить данные (подробности в консоли F12)");
      setResult({ ok: false, text: "Не удалось обновить — запрос к серверу упал (см. F12)" });
    } finally {
      setRefreshing(false);
    }
  }

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          if (r.latest) {
            acc.subscribers += r.latest.subscribers;
            acc.views += r.latest.views;
          }
          return acc;
        },
        { subscribers: 0, views: 0 },
      ),
    [rows],
  );
  const connectedCount = rows.filter((r) => r.connected).length;
  const anyData = rows.some((r) => r.latest);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Статистика</h1>
          <p className="text-base-content/60">Подписчики и просмотры каналов · изменения и динамика</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="join">
              <button
                className={`btn btn-sm join-item ${scope === "mine" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScope("mine")}
              >
                Мои
              </button>
              <button
                className={`btn btn-sm join-item ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScope("all")}
              >
                Все каналы
              </button>
            </div>
          )}
          <button className="btn btn-primary gap-2" onClick={refresh} disabled={refreshing || loading}>
            {refreshing ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <RefreshCw size={18} />
            )}
            Обновить данные
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error text-sm py-2">{error}</div>}
      {result && (
        <div className={`alert text-sm py-2 ${result.ok ? "alert-success" : "alert-warning"}`}>
          <span>
            {result.ok ? "✓ " : "⚠ "}
            {result.text}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={<Users />} label="Подписчиков всего" value={fmt(totals.subscribers)} />
        <Stat icon={<Eye />} label="Просмотров всего" value={fmt(totals.views)} />
        <Stat icon={<Film />} label="Каналов подключено" value={`${connectedCount} / ${rows.length}`} />
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <Empty text="Нет каналов для показа. Подключите канал на странице «Каналы»." />
      ) : !anyData ? (
        <Empty
          icon
          text="Данных пока нет. Нажмите «Обновить данные» — мы сделаем первый снимок статистики каналов. Повторяйте периодически, и накопится динамика для графика."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <ChannelCard key={r.accountId} row={r} isAdmin={!!isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ row, isAdmin }: { row: StatRow; isAdmin: boolean }) {
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
    ? "не подключён к YouTube"
    : row.latest
      ? `обновлено ${timeAgo(row.latest.takenAt)}`
      : "нет снимков — нажмите «Обновить данные»";

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-primary/10 text-primary rounded-full w-11 h-11 flex items-center justify-center shrink-0">
            <BarChart3 size={20} />
          </div>
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
              ошибка
            </span>
          ) : !row.connected ? (
            <span className="badge badge-warning badge-sm">нет подключения</span>
          ) : (
            row.ytChannelId && (
              <a
                href={`https://www.youtube.com/channel/${row.ytChannelId}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs text-error"
                title="Открыть канал на YouTube"
              >
                ↗ YouTube
              </a>
            )
          )}
        </div>

        {row.error && (
          <div className="alert alert-error py-2 text-xs">
            <span>⚠ {row.error}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Metric label="Подписчики" value={row.latest?.subscribers} delta={delta(row, "subscribers")} />
          <Metric label="Просмотры" value={row.latest?.views} delta={delta(row, "views")} />
          <Metric label="Видео" value={row.latest?.videos} delta={delta(row, "videos")} />
        </div>

        <button
          className="btn btn-ghost btn-sm gap-1 w-fit"
          onClick={() => setOpen((v) => !v)}
          disabled={!row.latest}
        >
          <TrendingUp size={15} />
          {open ? "Скрыть график" : "График динамики"}
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>

        {open && <ChannelChart points={points} />}
      </div>
    </div>
  );
}

function ChannelChart({ points }: { points: StatPoint[] | null }) {
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
        Нужно минимум 2 снимка для графика. Жмите «Обновить данные» периодически — динамика накопится.
      </div>
    );
  }
  const data = points.map((p) => ({
    t: new Date(parseUtc(p.takenAt)).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    }),
    Подписчики: p.subscribers,
    Просмотры: p.views,
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="t" fontSize={12} tickMargin={6} />
          <YAxis yAxisId="left" fontSize={12} width={48} />
          <YAxis yAxisId="right" orientation="right" fontSize={12} width={48} />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="Подписчики" stroke="#6419e6" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="Просмотры" stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value, delta }: { label: string; value?: number; delta: number | null }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="text-xl font-bold leading-tight">{value == null ? "—" : fmt(value)}</div>
      <DeltaBadge delta={delta} />
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <div className="text-xs text-base-content/40 mt-0.5">первый снимок</div>;
  if (delta === 0) return <div className="text-xs text-base-content/40 mt-0.5">без изменений</div>;
  const up = delta > 0;
  return (
    <div className={`text-xs mt-0.5 flex items-center gap-0.5 ${up ? "text-success" : "text-error"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : "−"}
      {fmt(Math.abs(delta))}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body flex-row items-center gap-4 py-5">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-sm text-base-content/60 mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function Empty({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300 border-dashed">
      <div className="card-body items-center text-center py-16">
        {icon && <BarChart3 className="text-base-content/30" size={40} />}
        <p className="text-base-content/60 max-w-md">{text}</p>
      </div>
    </div>
  );
}

function delta(row: StatRow, key: MetricKey): number | null {
  if (!row.latest || !row.prev) return null;
  return row.latest[key] - row.prev[key];
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

// SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker; parse it as UTC.
function parseUtc(s: string): string {
  return s.includes("T") ? s : s.replace(" ", "T") + "Z";
}

function timeAgo(iso: string): string {
  const then = new Date(parseUtc(iso)).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  return `${Math.floor(hr / 24)} дн назад`;
}
