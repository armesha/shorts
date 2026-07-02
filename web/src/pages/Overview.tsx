import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  apiClient,
  type Account,
  type AdminAnalytics,
  type AppStatus,
  type ChannelTotals,
  type ErrorLogItem,
  type HistoryPage,
  type LowDeckRow,
  type NotificationItem,
  type PlatformSummary,
} from "../lib/api";
import { AppIcon } from "../components/AppIcon";
import { compactNumber } from "../lib/format";
import { cleanDisplayText } from "../lib/text";
import { useT } from "../lib/i18n";
import { fmtCacheTime, readCache, writeCache } from "../lib/cache";

type AttentionTone = "error" | "warning" | "info";
type OverviewData = {
  accounts: Account[];
  summary: PlatformSummary | null;
  analytics: AdminAnalytics | null;
  notifications: NotificationItem[];
  history: HistoryPage | null;
  lowDecks: LowDeckRow[];
  status: AppStatus | null;
  errors: ErrorLogItem[];
};

const EMPTY_DATA: OverviewData = {
  accounts: [],
  summary: null,
  analytics: null,
  notifications: [],
  history: null,
  lowDecks: [],
  status: null,
  errors: [],
};
const OVERVIEW_CACHE_KEY = "sf.adminOverview.v1";

export default function Overview() {
  const { t } = useT();
  const cached = useMemo(() => readCache<OverviewData>(OVERVIEW_CACHE_KEY), []);
  const [data, setData] = useState<OverviewData>(cached?.value ?? EMPTY_DATA);
  const [cacheSavedAt, setCacheSavedAt] = useState(cached?.savedAt ?? "");
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");

  // Audience totals (subscribers/views/videos summed across channels) with an independent Мои/Все
  // toggle — loaded separately from the big dashboard fetch so the headline numbers appear fast and
  // toggling is snappy. Default «Мои» — admin sees their OWN channels first; toggle for all-channels.
  const [audScope, setAudScope] = useState<"mine" | "all">("mine");
  const [totals, setTotals] = useState<ChannelTotals | null>(null);
  const [totalsLoading, setTotalsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setTotalsLoading(true);
    apiClient
      .statsTotals(audScope)
      .then((d) => alive && setTotals(d))
      .catch(() => {})
      .finally(() => {
        if (alive) setTotalsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [audScope]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const results = await Promise.allSettled([
        apiClient.accounts("all"),
        apiClient.summary(),
        apiClient.adminAnalytics(),
        apiClient.notifications({ scope: "all", status: "open", limit: 6 }),
        apiClient.history({ scope: "all", page: 1, pageSize: 6 }),
        apiClient.adminLowDecks(),
        apiClient.status(),
        apiClient.errors(),
      ]);
      if (!alive) return;
      const failed = results.some((r) => r.status === "rejected");
      const fallback = readCache<OverviewData>(OVERVIEW_CACHE_KEY)?.value ?? data;
      const next: OverviewData = {
        accounts: pick<Account[]>(results, 0, fallback.accounts),
        summary: pick<PlatformSummary | null>(results, 1, fallback.summary),
        analytics: pick<AdminAnalytics | null>(results, 2, fallback.analytics),
        notifications: pick<NotificationItem[]>(results, 3, fallback.notifications),
        history: pick<HistoryPage | null>(results, 4, fallback.history),
        lowDecks: pick<LowDeckRow[]>(results, 5, fallback.lowDecks),
        status: pick<AppStatus | null>(results, 6, fallback.status),
        errors: pick<ErrorLogItem[]>(results, 7, fallback.errors),
      };
      setData(next);
      writeCache(OVERVIEW_CACHE_KEY, next);
      setCacheSavedAt(new Date().toISOString());
      if (failed) setError(t("overview.partialLoadCached"));
      setLoading(false);
    }
    load().catch((e) => {
      if (!alive) return;
      setError(cacheSavedAt ? t("overview.offlineCache", { time: fmtCacheTime(cacheSavedAt) }) : String(e));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [t]);

  const nextRun = useMemo(() => getNextRun(data.accounts, t), [data.accounts, t]);
  const connected = data.accounts.filter((a) => a.status === "connected" || a.ytChannelId).length;
  const perDay = data.accounts.filter((a) => a.enabled).reduce((sum, a) => sum + a.schedule.length, 0);
  const topRunway = (data.analytics?.runway ?? [])
    .filter((r) => r.enabled && r.runwayDays != null)
    .sort((a, b) => (a.runwayDays ?? 9999) - (b.runwayDays ?? 9999))
    .slice(0, 5);
  const notConnected = data.accounts.filter((a) => a.status !== "connected" && !a.ytChannelId).slice(0, 4);
  const attention = buildAttention(data, notConnected.length, t);
  const recentItems = data.history?.items ?? [];
  const failedToday = data.analytics?.summary.failed ?? data.summary?.failed ?? 0;

  return (
    <div className="space-y-3">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold text-primary">{t("overview.kicker")}</div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t("overview.title")}</h1>
          <p className="text-sm text-base-content/60 max-w-3xl">{t("overview.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/studio" className="btn btn-sm admin-action-secondary gap-2">
            <AppIcon name="studio" size={17} />
            {t("overview.generate")}
          </Link>
          <Link to="/clip-demos" className="btn btn-sm admin-action-secondary gap-2">
            <AppIcon name="clips" size={17} />
            {t("nav.clipdemos")}
          </Link>
          <Link to="/statistics" className="btn btn-sm admin-action-quiet gap-2">
            <AppIcon name="analytics" size={17} />
            {t("nav.statistics")}
          </Link>
        </div>
      </header>

      {error && (
        <div className="alert alert-warning text-sm">
          <AppIcon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      {cacheSavedAt && !loading && (
        <div className="text-xs text-base-content/45">
          {t("overview.cacheHint", { time: fmtCacheTime(cacheSavedAt) })}
        </div>
      )}

      <AudienceSummary scope={audScope} onScope={setAudScope} totals={totals} loading={totalsLoading} t={t} />

      {loading ? (
        <OverviewSkeleton />
      ) : (
        <>
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <MetricCard
              icon="queue"
              tone="blue"
              label={t("overview.queue")}
              value={compactNumber(data.summary?.queued ?? data.analytics?.summary.queuedVideos ?? 0)}
              detail={t("overview.perDay", { n: perDay })}
              to="/channels"
            />
            <MetricCard
              icon="video"
              tone="green"
              label={t("overview.published")}
              value={compactNumber(data.summary?.published ?? data.analytics?.summary.published ?? 0)}
              detail={t("overview.failed", { n: failedToday })}
              to="/history"
            />
            <MetricCard
              icon="accounts"
              tone="gray"
              label={t("overview.channels")}
              value={`${connected} / ${data.accounts.length}`}
              detail={t("overview.connected")}
              to="/channels"
            />
            <MetricCard
              icon="time"
              tone="amber"
              label={t("overview.nextRun")}
              value={nextRun.time}
              detail={nextRun.rel || t("overview.noSchedule")}
              to="/channels"
            />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.72fr)] gap-3">
            <div className="space-y-3 min-w-0">
              <Panel
                title={t("overview.attentionTitle")}
                subtitle={t("overview.attentionSubtitle")}
                action={<Link to="/notifications" className="admin-inline-action">{t("overview.openInbox")}</Link>}
              >
                {attention.length === 0 ? (
                  <EmptyInline icon="check" text={t("overview.noAttention")} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {attention.map((item, i) => (
                      <Link
                        key={`${item.title}-${i}`}
                        to={item.to}
                        className={`rounded-md border px-3 py-2 hover:bg-base-200/60 transition-colors ${toneBorder(item.tone)}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`rounded-md p-1.5 shrink-0 ${toneIcon(item.tone)}`}>
                            <AppIcon name={item.icon} size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-tight truncate">{item.title}</span>
                            <span className="block text-xs text-base-content/60 mt-0.5 truncate">{item.detail}</span>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title={t("overview.publishFlow")}
                subtitle={t("overview.publishFlowSubtitle")}
                action={<Link to="/history" className="admin-inline-action">{t("overview.allHistory")}</Link>}
              >
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                  <FlowChip label={t("overview.flowQueued")} value={data.summary?.queued ?? 0} tone="info" />
                  <FlowChip label={t("overview.flowScheduled")} value={data.summary?.scheduled ?? 0} tone="neutral" />
                  <FlowChip label={t("overview.flowPublished")} value={data.summary?.published ?? 0} tone="success" />
                  <FlowChip label={t("overview.flowFailed")} value={data.summary?.failed ?? 0} tone="error" />
                </div>
                {recentItems.length === 0 ? (
                  <EmptyInline icon="history" text={t("overview.noRecent")} />
                ) : (
                  <div className="divide-y divide-base-300">
                    {recentItems.map((item) => (
                      <div key={item.id} className="py-2 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-md bg-base-200 border border-base-300 flex items-center justify-center text-primary shrink-0">
                          <AppIcon name="video" size={15} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{cleanDisplayText(item.title)}</div>
                          <div className="text-xs text-base-content/55 truncate">
                            {item.channelName || `#${item.accountId}`} · {fmtTime(item.publishedAt || item.createdAt)}
                          </div>
                        </div>
                        <span className={`badge badge-sm ${statusBadge(item.status)}`}>{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-3 min-w-0">
              <Panel
                title={t("overview.runwayTitle")}
                subtitle={t("overview.runwaySubtitle")}
                action={<Link to="/library" className="admin-inline-action">{t("nav.library")}</Link>}
              >
                {topRunway.length === 0 ? (
                  <EmptyInline icon="check" text={t("overview.runwayOk")} />
                ) : (
                  <div className="space-y-2">
                    {topRunway.map((r) => {
                      const pct = Math.max(4, Math.min(100, ((r.runwayDays ?? 0) / 14) * 100));
                      const danger = (r.runwayDays ?? 99) < 3;
                      return (
                        <Link key={r.accountId} to={`/accounts/${r.accountId}`} className="block rounded-md border border-base-300 px-3 py-2 hover:bg-base-200/60">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{r.channelName}</div>
                              <div className="text-xs text-base-content/55">
                                {t("overview.runwayMeta", { queued: r.queued, perDay: r.postsPerDay })}
                              </div>
                            </div>
                            <div className={`text-sm font-bold ${danger ? "text-error" : "text-success"}`}>
                              {formatDays(r.runwayDays)}
                            </div>
                          </div>
                          <div className="mt-1.5 h-1.5 rounded-full bg-base-300 overflow-hidden">
                            <div className={`h-full ${danger ? "bg-error" : "bg-success"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel
                title={t("overview.systemTitle")}
                subtitle={t("overview.systemSubtitle")}
                action={<Link to="/system" className="admin-inline-action">{t("nav.server")}</Link>}
              >
                <div className="space-y-2">
                  <StatusLine
                    label={t("overview.googleKey")}
                    ok={!!data.status?.credsConfigured}
                    good={t("overview.connected")}
                    bad={t("overview.needsSetup")}
                  />
                  <StatusLine
                    label={t("overview.notifications")}
                    ok={data.notifications.length === 0}
                    good={t("overview.clear")}
                    bad={t("overview.openCount", { n: data.notifications.length })}
                  />
                  <StatusLine
                    label={t("overview.serverErrors")}
                    ok={data.errors.length === 0}
                    good={t("overview.clear")}
                    bad={t("overview.openCount", { n: data.errors.length })}
                  />
                </div>
              </Panel>

              <Panel title={t("overview.packRiskTitle")} subtitle={t("overview.packRiskSubtitle")}>
                {data.lowDecks.length === 0 ? (
                  <EmptyInline icon="check" text={t("overview.packRiskOk")} />
                ) : (
                  <div className="space-y-1.5">
                    {data.lowDecks.slice(0, 5).map((p) => (
                      <Link key={`${p.userId}-${p.deckId}`} to="/library" className="block rounded-md border border-base-300 px-3 py-2 hover:bg-base-200/60">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{p.deckName}</span>
                          <span className="badge badge-warning badge-sm">{p.available}</span>
                        </div>
                        <div className="text-xs text-base-content/55 mt-1">{p.username} · {t("overview.cardsLeft")}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function pick<T>(results: PromiseSettledResult<unknown>[], index: number, fallback: T): T {
  const item = results[index];
  return item?.status === "fulfilled" ? (item.value as T) : fallback;
}

function buildAttention(data: OverviewData, notConnectedCount: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  const items: { title: string; detail: string; tone: AttentionTone; to: string; icon: "warning" | "notifications" | "accounts" | "packs" | "errors" }[] = [];
  if (data.notifications.length) {
    items.push({
      title: t("overview.attentionNotifications", { n: data.notifications.length }),
      detail: data.notifications[0]?.title || t("overview.attentionNotificationsDetail"),
      tone: data.notifications.some((n) => n.severity === "error") ? "error" : "warning",
      to: "/notifications",
      icon: "notifications",
    });
  }
  if (data.errors.length) {
    items.push({
      title: t("overview.attentionErrors", { n: data.errors.length }),
      detail: data.errors[0]?.message || t("overview.attentionErrorsDetail"),
      tone: "error",
      to: "/errors",
      icon: "errors",
    });
  }
  if (notConnectedCount) {
    items.push({
      title: t("overview.attentionAuth", { n: notConnectedCount }),
      detail: t("overview.attentionAuthDetail"),
      tone: "warning",
      to: "/channels",
      icon: "accounts",
    });
  }
  if (data.lowDecks.length) {
    items.push({
      title: t("overview.attentionPacks", { n: data.lowDecks.length }),
      detail: data.lowDecks[0]?.deckName || t("overview.attentionPacksDetail"),
      tone: "warning",
      to: "/library",
      icon: "packs",
    });
  }
  return items.slice(0, 4);
}

function AudienceSummary({
  scope,
  onScope,
  totals,
  loading,
  t,
}: {
  scope: "mine" | "all";
  onScope: (s: "mine" | "all") => void;
  totals: ChannelTotals | null;
  loading: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold leading-tight">{t("overview.audienceTitle")}</h2>
            <p className="text-xs text-base-content/55 mt-0.5">{t("overview.audienceHint", { n: totals?.withData ?? 0 })}</p>
          </div>
          <div className="join shrink-0">
            <button
              className={`btn btn-xs join-item ${scope === "mine" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onScope("mine")}
            >
              {t("stats.scopeMine")}
            </button>
            <button
              className={`btn btn-xs join-item ${scope === "all" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => onScope("all")}
            >
              {t("stats.scopeAll")}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <BigStat icon="analytics" tone="blue" label={t("stats.totalViews")} value={totals?.views ?? 0} loading={loading} />
          <BigStat icon="accounts" tone="green" label={t("stats.totalSubscribers")} value={totals?.subscribers ?? 0} loading={loading} />
          <BigStat icon="video" tone="gray" label={t("stats.videos")} value={totals?.videos ?? 0} loading={loading} />
        </div>
      </div>
    </section>
  );
}

function BigStat({
  icon,
  tone,
  label,
  value,
  loading,
}: {
  icon: "analytics" | "accounts" | "video";
  tone: "blue" | "green" | "gray" | "amber";
  label: string;
  value: number;
  loading: boolean;
}) {
  const exact = value.toLocaleString("ru-RU");
  return (
    <div className="rounded-md border border-base-300 p-3 flex items-center gap-3">
      <div className={`rounded-md p-2 shrink-0 ${metricTone(tone)}`}>
        <AppIcon name={icon} size={18} />
      </div>
      <div className="min-w-0">
        {loading ? (
          <div className="skeleton h-7 w-24 rounded" />
        ) : (
          <div className="text-xl sm:text-2xl font-bold leading-none tabular-nums truncate" title={exact}>
            {exact}
          </div>
        )}
        <div className="text-xs font-semibold mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  tone,
  label,
  value,
  detail,
  to,
}: {
  icon: "queue" | "video" | "accounts" | "time";
  tone: "blue" | "green" | "gray" | "amber";
  label: string;
  value: string | number;
  detail: string;
  to: string;
}) {
  return (
    <Link to={to} className="card bg-base-100 border border-base-300 hover:border-primary/45 transition-colors">
      <div className="card-body p-3">
        <div className="flex items-center gap-3">
          <div className={`rounded-md p-1.5 shrink-0 ${metricTone(tone)}`}>
            <AppIcon name={icon} size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold leading-none">{value}</div>
            <div className="text-xs font-semibold mt-1 truncate">{label}</div>
            <div className="text-xs text-base-content/55 mt-0.5 truncate">{detail}</div>
          </div>
          <AppIcon name="chevron-right" size={14} className="text-base-content/35 shrink-0" />
        </div>
      </div>
    </Link>
  );
}

function metricTone(tone: "blue" | "green" | "gray" | "amber"): string {
  if (tone === "green") return "bg-success/10 text-success";
  if (tone === "amber") return "bg-warning/10 text-warning";
  if (tone === "gray") return "bg-base-200 text-base-content/65";
  return "bg-info/10 text-info";
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h2 className="text-sm font-bold leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-base-content/55 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function FlowChip({ label, value, tone }: { label: string; value: number; tone: "info" | "neutral" | "success" | "error" }) {
  const color =
    tone === "success" ? "text-success bg-success/10" : tone === "error" ? "text-error bg-error/10" : tone === "info" ? "text-primary bg-primary/10" : "text-base-content bg-base-200";
  return (
    <div className={`rounded-md border border-base-300 p-2 ${color}`}>
      <div className="text-lg font-bold leading-none">{compactNumber(value)}</div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}

function EmptyInline({ icon, text }: { icon: "check" | "history"; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-base-300 p-3 text-center text-base-content/55">
      <AppIcon name={icon} size={18} className="mx-auto mb-1 text-base-content/35" />
      <div className="text-sm">{text}</div>
    </div>
  );
}

function StatusLine({ label, ok, good, bad }: { label: string; ok: boolean; good: string; bad: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-base-300 px-3 py-1.5">
      <span className="text-xs text-base-content/70">{label}</span>
      <span className={`badge badge-sm ${ok ? "badge-success" : "badge-warning"}`}>{ok ? good : bad}</span>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.72fr)] gap-3">
        <div className="skeleton h-56 rounded-lg" />
        <div className="skeleton h-56 rounded-lg" />
      </div>
    </div>
  );
}

function toneBorder(tone: AttentionTone): string {
  if (tone === "error") return "border-error/35";
  if (tone === "warning") return "border-warning/35";
  return "border-info/35";
}

function toneIcon(tone: AttentionTone): string {
  if (tone === "error") return "bg-error/10 text-error";
  if (tone === "warning") return "bg-warning/10 text-warning";
  return "bg-info/10 text-info";
}

function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (/fail|error|ошиб|skip|пропущ/.test(s)) return "badge-error";
  if (/publish|posted|success|готов|опубликов/.test(s)) return "badge-success";
  return "badge-ghost";
}

function formatDays(days: number | null): string {
  if (days == null) return "—";
  if (days < 1) return "<1 д.";
  return `${Math.ceil(days)} д.`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNextRun(accounts: Account[], t: (key: string, vars?: Record<string, string | number>) => string) {
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const mins = accounts
    .filter((a) => a.enabled)
    .flatMap((a) => a.schedule)
    .map((slot) => {
      const [h, m] = slot.split(":").map(Number);
      return h * 60 + m;
    })
    .filter((m) => Number.isFinite(m));
  if (!mins.length) return { time: "—", rel: "" };
  const up = mins.filter((m) => m > cur).sort((a, b) => a - b);
  const n = up.length ? up[0] : Math.min(...mins);
  const until = (n - cur + 1440) % 1440;
  const h = Math.floor(until / 60);
  const m = until % 60;
  const rel =
    until === 0
      ? t("accounts.now")
      : h && m
        ? t("accounts.inHM", { h, m })
        : h
          ? t("accounts.inH", { h })
          : t("accounts.inM", { m });
  return {
    time: `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
    rel,
  };
}
