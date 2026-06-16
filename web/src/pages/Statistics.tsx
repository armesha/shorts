import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Users, Eye, Film, RefreshCw, TrendingUp, TrendingDown, ChevronDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
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
import { apiClient, type StatRow, type StatPoint, type UserAnalytics } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

type Scope = "mine" | "all";
type MetricKey = "subscribers" | "views" | "videos";
type SortKey = "name" | "subscribers" | "views" | "videos" | "delta";
const PAGE_SIZE = 10;

// Persisted filters — restore the last-used filter/sort on the next visit.
const STORE_KEY = "statsFilters.v1";
type SavedFilters = {
  search?: string;
  sortKey?: SortKey;
  sortDir?: "asc" | "desc";
  ownerFilter?: string;
  onlyConnected?: boolean;
  scope?: Scope;
};
function loadFilters(): SavedFilters {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as SavedFilters;
  } catch {
    return {};
  }
}

export default function Statistics() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [saved] = useState(loadFilters); // last-used filters (localStorage), restored on mount
  const [rows, setRows] = useState<StatRow[]>([]);
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null); // own publishing activity
  const [scope, setScope] = useState<Scope>(saved.scope ?? "mine");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<number, string | null | undefined>>({});
  // Controls (persisted): search, sort, owner filter, only-connected (default ON), pagination.
  const [search, setSearch] = useState(saved.search ?? "");
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey ?? "subscribers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir ?? "desc");
  const [ownerFilter, setOwnerFilter] = useState(saved.ownerFilter ?? "");
  const [onlyConnected, setOnlyConnected] = useState(saved.onlyConnected ?? true);
  const [page, setPage] = useState(1);

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
        setError(t("stats.loadError"));
      })
      .finally(() => setLoading(false));
  }, [scope]);

  // Channel avatars by accountId (for the cards).
  useEffect(() => {
    apiClient
      .accounts(scope === "all" ? "all" : undefined)
      .then((a) => setAvatarMap(Object.fromEntries(a.map((x) => [x.id, x.avatar]))))
      .catch(() => {});
  }, [scope]);

  // Own publishing analytics (always the user's OWN channels, independent of the admin scope toggle).
  useEffect(() => {
    apiClient.analytics().then(setAnalytics).catch(() => {});
  }, []);

  // Any filter/sort/scope change → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, scope]);

  // Persist the active filters so the next visit/reload restores them.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ search, sortKey, sortDir, ownerFilter, onlyConnected, scope }),
      );
    } catch {
      /* localStorage unavailable — ignore */
    }
  }, [search, sortKey, sortDir, ownerFilter, onlyConnected, scope]);

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
          text: t("stats.refreshPartial", { ok: connected.length - failed.length, total: connected.length, failed: failed.length }),
        });
      } else if (connected.length === 0) {
        setResult({ ok: false, text: t("stats.refreshNoneConnected") });
      } else {
        setResult({ ok: true, text: t("stats.refreshOk", { n: connected.length }) });
      }
    } catch (e) {
      console.error("[Статистика] запрос /stats/refresh упал:", e);
      setError(t("stats.refreshError"));
      setResult({ ok: false, text: t("stats.refreshErrorBanner") });
    } finally {
      setRefreshing(false);
    }
  }

  const owners = useMemo(
    () => [...new Set(rows.map((r) => r.ownerUsername).filter((x): x is string => !!x))].sort(),
    [rows],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyConnected && !r.connected) return false;
      if (ownerFilter && r.ownerUsername !== ownerFilter) return false;
      if (q && !`${r.ytChannelTitle || r.channelName} ${r.ownerUsername || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, ownerFilter, onlyConnected]);
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: StatRow): number | string => {
      if (sortKey === "name") return (r.ytChannelTitle || r.channelName || "").toLowerCase();
      if (sortKey === "delta") return r.latest && r.prev ? r.latest.subscribers - r.prev.subscribers : -Infinity;
      return r.latest ? r.latest[sortKey] : -Infinity;
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }, [filtered, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const paged = sorted.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          if (r.latest) {
            acc.subscribers += r.latest.subscribers;
            acc.views += r.latest.views;
          }
          return acc;
        },
        { subscribers: 0, views: 0 },
      ),
    [filtered],
  );
  const connectedCount = filtered.filter((r) => r.connected).length;
  const anyData = rows.some((r) => r.latest);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("nav.statistics")}</h1>
          <p className="text-base-content/60">{t("stats.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="join">
              <button
                className={`btn btn-sm join-item ${scope === "mine" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScope("mine")}
              >
                {t("stats.scopeMine")}
              </button>
              <button
                className={`btn btn-sm join-item ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScope("all")}
              >
                {t("stats.scopeAll")}
              </button>
            </div>
          )}
          <button className="btn btn-primary gap-2" onClick={refresh} disabled={refreshing || loading}>
            {refreshing ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <RefreshCw size={18} />
            )}
            {t("stats.refreshData")}
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
        <Stat icon={<Users />} label={t("stats.totalSubscribers")} value={fmt(totals.subscribers)} />
        <Stat icon={<Eye />} label={t("stats.totalViews")} value={fmt(totals.views)} />
        <Stat icon={<Film />} label={t("stats.channelsConnected")} value={`${connectedCount} / ${filtered.length}`} />
      </div>

      {analytics &&
        analytics.summary.published + analytics.summary.scheduled + analytics.summary.failed + analytics.summary.queuedVideos > 0 && (
          <section className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <h2 className="card-title text-base">{t("stats.publishActivity")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.published")}</div>
                  <div className="text-2xl font-bold text-success">{fmt(analytics.summary.published)}</div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.scheduled")}</div>
                  <div className="text-2xl font-bold">{fmt(analytics.summary.scheduled)}</div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.failed")}</div>
                  <div className={`text-2xl font-bold ${analytics.summary.failed > 0 ? "text-error" : ""}`}>
                    {fmt(analytics.summary.failed)}
                  </div>
                </div>
                <div className="rounded-xl border border-base-300 p-3">
                  <div className="text-xs text-base-content/60">{t("stats.queued")}</div>
                  <div className="text-2xl font-bold">{fmt(analytics.summary.queuedVideos)}</div>
                </div>
              </div>
              {analytics.daily.length > 1 && (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="published" name={t("stats.published")} stroke="#16a34a" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="scheduled" name={t("stats.scheduled")} stroke="#605dff" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="failed" name={t("stats.failed")} stroke="#dc2626" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </section>
        )}

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <Empty text={t("stats.emptyNoChannels")} />
      ) : !anyData ? (
        <Empty
          icon
          text={t("stats.emptyNoData")}
        />
      ) : (
        <>
          {/* Controls: search / sort / direction / owner filter / only-connected */}
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body py-3 flex-row flex-wrap items-center gap-2">
              <input
                className="input input-bordered input-sm w-full sm:w-56"
                placeholder={t("stats.searchPlaceholder")}
                aria-label={t("stats.searchAria")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="select select-bordered select-sm"
                aria-label={t("stats.sortBy")}
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="subscribers">{t("stats.subscribers")}</option>
                <option value="views">{t("stats.views")}</option>
                <option value="videos">{t("stats.videos")}</option>
                <option value="delta">{t("stats.subscribersGrowth")}</option>
                <option value="name">{t("stats.name")}</option>
              </select>
              <button
                className="btn btn-sm btn-ghost gap-1"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                title={t("stats.sortDirection")}
              >
                {sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
                {sortDir === "asc" ? t("stats.ascending") : t("stats.descending")}
              </button>
              {isAdmin && scope === "all" && owners.length > 1 && (
                <select
                  className="select select-bordered select-sm"
                  aria-label={t("stats.owner")}
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                >
                  <option value="">{t("stats.allOwners")}</option>
                  {owners.map((o) => (
                    <option key={o} value={o}>
                      @{o}
                    </option>
                  ))}
                </select>
              )}
              <label className="label cursor-pointer gap-2 text-sm py-0">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={onlyConnected}
                  onChange={(e) => setOnlyConnected(e.target.checked)}
                />
                {t("stats.onlyConnected")}
              </label>
              <span className="text-xs text-base-content/50 ml-auto">{t("stats.channelCount", { n: sorted.length })}</span>
            </div>
          </div>

          {sorted.length === 0 ? (
            <Empty text={t("stats.emptyNoMatch")} />
          ) : (
            <div className="space-y-4">
              {paged.map((r) => (
                <ChannelCard key={r.accountId} row={r} isAdmin={!!isAdmin} avatar={avatarMap[r.accountId]} />
              ))}
            </div>
          )}

          {sorted.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={clampedPage <= 1}
                aria-label={t("common.back")}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-base-content/60">
                {t("common.page")} {clampedPage} {t("common.of")} {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={clampedPage >= totalPages}
                aria-label={t("common.forward")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelCard({ row, isAdmin, avatar }: { row: StatRow; isAdmin: boolean; avatar?: string | null }) {
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
              <BarChart3 size={20} />
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
          <Metric label={t("stats.subscribers")} value={row.latest?.subscribers} delta={delta(row, "subscribers")} t={t} />
          <Metric label={t("stats.views")} value={row.latest?.views} delta={delta(row, "views")} t={t} />
          <Metric label={t("stats.videos")} value={row.latest?.videos} delta={delta(row, "videos")} t={t} />
        </div>

        <button
          className="btn btn-ghost btn-sm gap-1 w-fit"
          onClick={() => setOpen((v) => !v)}
          disabled={!row.latest}
        >
          <TrendingUp size={15} />
          {open ? t("stats.hideChart") : t("stats.showChart")}
          <ChevronDown size={15} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>

        {open && <ChannelChart points={points} />}
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
          <YAxis yAxisId="left" fontSize={12} width={48} />
          <YAxis yAxisId="right" orientation="right" fontSize={12} width={48} />
          <Tooltip />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="subscribers" name={t("stats.subscribers")} stroke="#6419e6" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="views" name={t("stats.views")} stroke="#0ea5e9" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Metric({ label, value, delta, t }: { label: string; value?: number; delta: number | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="rounded-lg bg-base-200/60 p-3">
      <div className="text-xs text-base-content/60">{label}</div>
      <div className="text-xl font-bold leading-tight">{value == null ? "—" : fmt(value)}</div>
      <DeltaBadge delta={delta} t={t} />
    </div>
  );
}

function DeltaBadge({ delta, t }: { delta: number | null; t: (key: string, vars?: Record<string, string | number>) => string }) {
  if (delta == null) return <div className="text-xs text-base-content/40 mt-0.5">{t("stats.firstSnapshot")}</div>;
  if (delta === 0) return <div className="text-xs text-base-content/40 mt-0.5">{t("stats.noChange")}</div>;
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

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const then = new Date(parseUtc(iso)).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return t("stats.justNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("stats.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("stats.hoursAgo", { n: hr });
  return t("stats.daysAgo", { n: Math.floor(hr / 24) });
}
