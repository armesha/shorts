import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, type Account, type AppStatus, type ContentCatalogItem, type OAuthClient } from "../lib/api";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { useT } from "../lib/i18n";
import { fmtCacheTime, readCache, writeCache } from "../lib/cache";
import { useAuth } from "../lib/auth";
import { isMainAdmin } from "../lib/authz";
import { langTag } from "../lib/deck";

const ChannelBlocks = lazy(() => import("./ChannelBlocks"));

const ACCOUNTS_CACHE_KEY = "sf.accounts.v2";
const DEFAULT_DAILY_KEY_CAP = 92; // Safer default for regular users.
const SUPER_ADMIN_DAILY_KEY_CAP = 100; // Main admin uses the full YouTube project quota.
type AccountSourceStat = {
  id: string;
  title: string;
  lang: string | null;
  available: number | null;
  total: number | null;
  queued: number;
  postsPerDay: number;
  runwayDays: number | null;
  warning: "empty_queue" | "no_free_cards" | null;
};
type AccountsCache = {
  accounts: Account[];
  status: AppStatus | null;
  queue: Record<number, number>;
  queueByDeck?: Record<number, Record<string, number>>;
};

function AccountsList({ onShowBlocks }: { onShowBlocks?: () => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const dailyKeyCap = isMainAdmin(user) ? SUPER_ADMIN_DAILY_KEY_CAP : DEFAULT_DAILY_KEY_CAP;
  const cached = readCache<AccountsCache>(ACCOUNTS_CACHE_KEY);
  const [accounts, setAccounts] = useState<Account[]>(cached?.value.accounts ?? []);
  const [status, setStatus] = useState<AppStatus | null>(cached?.value.status ?? null);
  const [loadError, setLoadError] = useState(false);
  const [cacheSavedAt, setCacheSavedAt] = useState(cached?.savedAt ?? "");
  const [creating, setCreating] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [queue, setQueue] = useState<Record<number, number>>(cached?.value.queue ?? {});
  const [queueByDeck, setQueueByDeck] = useState<Record<number, Record<string, number>>>(cached?.value.queueByDeck ?? {});
  const [catalog, setCatalog] = useState<ContentCatalogItem[]>([]);
  const [clients, setClients] = useState<OAuthClient[]>([]); // user's Google keys — show/group channels by key when >1
  // Sort channels by remaining-video runway (days left); direction remembered between visits.
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() =>
    localStorage.getItem("channelsRunwaySort") === "desc" ? "desc" : "asc",
  );
  // Which «low runway» alert the user already dismissed (by the exact set of low channels) — no spam.
  const [dismissedSig, setDismissedSig] = useState<string>(
    () => sessionStorage.getItem("lowRunwayDismissed") || "",
  );
  const navigate = useNavigate();

  useEffect(() => {
    try {
      localStorage.setItem("channelsRunwaySort", sortDir);
    } catch {
      /* private mode */
    }
  }, [sortDir]);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([apiClient.accounts(), apiClient.videoCounts()]).then(([accountsRes, countsRes]) => {
      if (!alive) return;
      if (accountsRes.status === "fulfilled") {
        setLoadError(false);
        setAccounts(accountsRes.value);
      } else {
        setLoadError(true);
      }
      if (countsRes.status === "fulfilled") {
        const totals: Record<number, number> = {};
        const byDeck: Record<number, Record<string, number>> = {};
        for (const row of countsRes.value.accounts) {
          totals[row.accountId] = row.total;
          byDeck[row.accountId] = row.byDeck;
        }
        setQueue(totals);
        setQueueByDeck(byDeck);
      }
    });
    apiClient.status().then((s) => {
      if (!alive) return;
      setLoadError(false);
      setStatus(s);
    }).catch(() => {
      if (alive) setLoadError(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    apiClient.youtubeClients().then((r) => setClients(r.clients)).catch(() => {});
    apiClient.contentCatalog().then((r) => setCatalog(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!accounts.length && !status && !Object.keys(queue).length) return;
    writeCache(ACCOUNTS_CACHE_KEY, { accounts, status, queue, queueByDeck });
    setCacheSavedAt(new Date().toISOString());
  }, [accounts, status, queue, queueByDeck]);

  async function addAccount() {
    setCreating(true);
    try {
      const a = await apiClient.createAccount();
      navigate(`/accounts/${a.id}`);
    } catch (e) {
      setActionErr(t("accounts.createFailed") + " " + String(e));
    } finally {
      setCreating(false);
    }
  }

  const uploadsToday = accounts.reduce((s, a) => s + a.uploadsToday, 0);
  // Posts per day (00:00–24:00) = sum of schedule slots across the user's ENABLED channels.
  const perDay = accounts.filter((a) => a.enabled).reduce((s, a) => s + a.schedule.length, 0);
  const nextRun = (() => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const mins = accounts
      .filter((a) => a.enabled)
      .flatMap((a) => a.schedule)
      .map((t) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      });
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
  })();

  const scheduledCountsByDeck = (a: Account): Record<string, number> => {
    const sources = sourceDeckIds(a);
    const counts: Record<string, number> = Object.fromEntries(sources.map((id) => [id, 0]));
    for (const [index, time] of (a.schedule ?? []).entries()) {
      const explicit = a.slotDecks?.[time];
      const deckId = explicit && sources.includes(explicit) ? explicit : sources[index % Math.max(1, sources.length)];
      if (deckId) counts[deckId] = (counts[deckId] ?? 0) + 1;
    }
    return counts;
  };

  const sourceDeckIds = (a: Account): string[] => {
    const ids = a.sourceDecks?.length ? a.sourceDecks : [a.lang].filter(Boolean);
    return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  };

  const effectiveQueuedVideos = (a: Account): number | null => {
    if (queue[a.id] == null) return null;
    const byDeck = queueByDeck[a.id];
    if (!byDeck) return queue[a.id];
    const sources = sourceDeckIds(a);
    if (!sources.length) return queue[a.id];
    return sources.reduce((sum, deckId) => sum + (byDeck[deckId] ?? 0), 0);
  };

  // Days of video left = how long the channel can keep posting from its current source decks.
  // Per-pack shortages remain visible below, but the scheduler falls back to other ready sources.
  // null = not applicable (no schedule, or counts still loading) → never flagged as low.
  const runwayDays = (a: Account): number | null => {
    if (!a.enabled || !a.schedule.length) return null;
    const queued = effectiveQueuedVideos(a);
    return queued == null ? null : queued / a.schedule.length;
  };

  // Channels about to run dry (< 1 day) — drives the alert and the «< 1 дня» filter.
  const lowChannels = accounts.filter((a) => {
    const r = runwayDays(a);
    return r != null && r < 1;
  });
  // Alert is state-derived (auto-disappears when nothing is low) and dismiss is keyed by the EXACT
  // set of low channels → dismissing hides it, but a NEW channel dropping low brings it back. No spam.
  const lowSig = lowChannels
    .map((a) => a.id)
    .sort((x, y) => x - y)
    .join(",");
  const showLowAlert = lowChannels.length > 0 && lowSig !== dismissedSig;
  const dismissLowAlert = () => {
    setDismissedSig(lowSig);
    try {
      sessionStorage.setItem("lowRunwayDismissed", lowSig);
    } catch {
      /* private mode */
    }
  };

  // Channels whose YouTube token got rejected (revoked/expired/401) — posting is dead until the user
  // reconnects. Driven by the backend `authError` flag set on the upload paths, not by history.
  const disconnectedChannels = accounts.filter((a) => a.authError);
  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item] as const)), [catalog]);
  const accountSourceStats = (account: Account): AccountSourceStat[] => {
    const ids = account.sourceDecks?.length ? account.sourceDecks : [account.lang].filter(Boolean);
    const queued = queueByDeck[account.id];
    const scheduled = scheduledCountsByDeck(account);
    return ids.map((id) => {
      const item = catalogById.get(id);
      const postsPerDay = account.enabled ? scheduled[id] ?? 0 : 0;
      const sourceQueued = queued?.[id] ?? 0;
      const available = item?.available ?? null;
      const warning =
        postsPerDay > 0 && sourceQueued <= 0
          ? "empty_queue"
          : postsPerDay > 0 && available != null && available <= 0
            ? "no_free_cards"
            : null;
      return {
        id,
        title: item?.title ?? id.replace(/^pack:/, ""),
        lang: item?.lang ?? account.channelLang ?? account.lang,
        available,
        total: item?.total ?? null,
        queued: sourceQueued,
        postsPerDay,
        runwayDays: queued && postsPerDay > 0 ? sourceQueued / postsPerDay : null,
        warning,
      };
    });
  };

  // Always sorted by days-of-video-left; the arrow button flips direction. No-schedule/loading last.
  const shownAccounts = [...accounts].sort((a, b) => {
    const ra = runwayDays(a);
    const rb = runwayDays(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return sortDir === "asc" ? ra - rb : rb - ra;
  });

  // Google-key grouping — only surfaced when the user actually has more than one key.
  const multiKey = clients.length > 1;
  const clientById = new Map(clients.map((c) => [c.id, c] as const));
  const perKeyStats = multiKey
    ? clients.map((c) => {
        const chans = accounts.filter((a) => a.oauthClientId === c.id);
        return {
          id: c.id,
          label: c.label,
          projectId: c.projectId,
          channels: chans.length,
          perDay: chans.filter((a) => a.enabled).reduce((s, a) => s + a.schedule.length, 0),
        };
      })
    : [];
  const noKeyChannels = multiKey ? accounts.filter((a) => !a.oauthClientId).length : 0;
  const keyTileCount = perKeyStats.length + (noKeyChannels > 0 ? 1 : 0);
  const keyGridClass =
    keyTileCount <= 1
      ? "grid gap-3"
      : keyTileCount === 2
        ? "grid gap-3 sm:grid-cols-2"
        : keyTileCount === 3
          ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          : keyTileCount === 4
            ? "grid gap-3 sm:grid-cols-2"
            : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="space-y-6">
      <GoogleKeyNotice status={status} loadError={loadError} />

      {disconnectedChannels.length > 0 && (
        <div className="alert alert-error shadow-sm flex items-start gap-2 py-2.5" role="alert">
          <AppIcon name="warning" size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1 text-sm leading-snug">
            <span className="font-semibold">{t("accounts.authErrorTitle")}</span> {t("accounts.authErrorLead")}{" "}
            {disconnectedChannels.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link to={`/accounts/${a.id}`} className="link font-medium">
                  {a.channelName}
                </Link>
              </span>
            ))}
            . {t("accounts.authErrorHint")}
          </div>
        </div>
      )}

      {loadError && cacheSavedAt && (
        <div className="alert alert-warning text-sm">
          <AppIcon name="warning" size={18} className="shrink-0" />
          <span>{t("accounts.offlineCache", { time: fmtCacheTime(cacheSavedAt) })}</span>
        </div>
      )}

      {actionErr && (
        <div className="alert alert-error text-sm" role="alert">
          <AppIcon name="warning" size={18} className="shrink-0" />
          <span className="flex-1">{actionErr}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setActionErr("")} aria-label={t("accounts.hide")}>
            <AppIcon name="close" size={14} />
          </button>
        </div>
      )}

      {showLowAlert && (
        <div className="alert alert-warning shadow-sm flex items-center gap-2 py-2.5">
          <AppIcon name="warning" size={18} className="shrink-0" />
          <div className="flex-1 text-sm leading-snug">
            <span className="font-semibold">{t("accounts.lowRunwayTitle")}</span> {t("accounts.lowRunwayLead")}{" "}
            {lowChannels.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link to={`/accounts/${a.id}`} className="link font-medium">
                  {a.channelName}
                </Link>{" "}
                <span className="text-base-content/60">
                  ({(effectiveQueuedVideos(a) ?? queue[a.id]) === 0 ? t("accounts.noVideos") : t("accounts.inQueueN", { n: effectiveQueuedVideos(a) ?? queue[a.id] })})
                </span>
              </span>
            ))}
            . {t("accounts.lowRunwayHint")}
          </div>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={dismissLowAlert}
            aria-label={t("accounts.hide")}
            title={t("accounts.dismissReappearHint")}
          >
            <AppIcon name="close" size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<AppIcon name="accounts" />} label={t("accounts.statChannels")} value={accounts.length} />
        <Stat icon={<AppIcon name="queue" />} label={t("accounts.statPerDay")} value={perDay} />
        <Stat icon={<AppIcon name="video" />} label={t("accounts.statUploadedToday")} value={uploadsToday} />
        <Stat
          icon={<AppIcon name="time" />}
          label={nextRun.rel ? `${t("accounts.statNextRun")} · ${nextRun.rel}` : t("accounts.statNextRun")}
          value={nextRun.time}
        />
      </div>

      {multiKey && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body py-4 gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <BrandIcon name="youtube" size={16} /> {t("accounts.byKeyTitle")}
            </div>
            <div className={keyGridClass}>
              {perKeyStats.map((k) => (
                <div key={k.id} className="rounded-lg border border-base-200 px-4 py-3">
                  <div className="font-medium text-sm truncate">{k.label}</div>
                  {k.projectId && <div className="text-xs text-base-content/45 truncate">{k.projectId}</div>}
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-2xl font-bold leading-none">{k.channels}</div>
                      <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.channels")}</div>
                    </div>
                    <div>
                      <div
                        className={`text-2xl font-bold leading-none ${
                          k.perDay > dailyKeyCap ? "text-error" : k.perDay > dailyKeyCap * 0.85 ? "text-warning" : ""
                        }`}
                      >
                        {k.perDay}/{dailyKeyCap}
                      </div>
                      <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.postsPerDayTotal")}</div>
                    </div>
                  </div>
                </div>
              ))}
              {noKeyChannels > 0 && (
                <div className="rounded-lg border border-dashed border-base-200 px-4 py-3">
                  <div className="font-medium text-sm text-base-content/60">{t("accounts.byKeyNoKey")}</div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold leading-none">{noKeyChannels}</div>
                    <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.channels")}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <AppIcon name="accounts" className="text-base-content/30" size={40} />
            <p className="text-base-content/60">
              {t("accounts.emptyState")}
            </p>
            <button className="btn btn-primary btn-sm gap-2 mt-2" onClick={addAccount} disabled={creating}>
              <AppIcon name="plus" size={16} /> {t("accounts.addChannel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-base-content/60">{t("accounts.sortByRunway")}</span>
              <button
                className="btn btn-sm btn-outline btn-square"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                aria-label={t("accounts.flipSort")}
                title={
                  sortDir === "asc"
                    ? t("accounts.sortLowFirst")
                    : t("accounts.sortHighFirst")
                }
              >
                <AppIcon name="chevron-right" size={16} className={sortDir === "asc" ? "-rotate-90" : "rotate-90"} />
              </button>
              {onShowBlocks && (
                <button className="btn btn-sm btn-outline gap-1" onClick={onShowBlocks}>
                  <AppIcon name="deck" size={15} />
                  {t("channelBlocks.blocksView")}
                </button>
              )}
            </div>
            <button className="btn btn-primary gap-2 w-full sm:w-auto" onClick={addAccount} disabled={creating}>
              {creating ? <span className="loading loading-spinner loading-sm" /> : <AppIcon name="plus" size={18} />}
              {t("accounts.addChannel")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shownAccounts.map((a) => (
            <div
              key={a.id}
              className="card bg-base-100 border border-base-300 hover:border-primary/45 hover:bg-base-100/90 transition-colors relative"
            >
              {/* Stretched-link overlay: whole card navigates, but it is NOT a parent of the
                  interactive YouTube link below — so that button can never trigger this navigation. */}
              <Link
                to={`/accounts/${a.id}`}
                aria-label={a.channelName}
                className="absolute inset-0 z-0 rounded-[inherit]"
              />
              <div className="card-body relative z-10 pointer-events-none">
                <div className="flex items-center gap-3">
                  {a.avatar ? (
                    a.ytChannelId ? (
                      <a
                        href={`https://www.youtube.com/channel/${a.ytChannelId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="pointer-events-auto shrink-0 rounded-full"
                        aria-label={t("account.openYouTubeChannel")}
                        title={t("account.openYouTubeChannel")}
                      >
                        <img
                          src={a.avatar}
                          alt=""
                          className="w-12 h-12 rounded-full object-cover border border-base-300 bg-base-200 transition hover:border-primary"
                        />
                      </a>
                    ) : (
                      <img
                        src={a.avatar}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border border-base-300 shrink-0 bg-base-200"
                      />
                    )
                  ) : (
                    <div className="bg-primary/10 text-primary rounded-full w-12 h-12 flex items-center justify-center shrink-0">
                      <AppIcon name="accounts" size={22} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{a.channelName}</div>
                    <div className="text-sm text-base-content/60">
                      {a.theme || t("accounts.noTheme")} · {a.lang.toUpperCase()}
                    </div>
                  </div>
                  {a.authError ? (
                    <span className="badge badge-error badge-sm gap-1" title={a.authError}>
                      <AppIcon name="warning" size={12} /> {t("accounts.reconnectBadge")}
                    </span>
                  ) : a.status === "connected" ? (
                    <span className="badge badge-success badge-sm">{t("accounts.connected")}</span>
                  ) : (
                    <span className="badge badge-warning badge-sm">{t("accounts.needsAuth")}</span>
                  )}
                </div>
                {a.authError && (
                  <div className="mt-2 text-xs text-error flex items-start gap-1.5">
                    <AppIcon name="warning" size={13} className="shrink-0 mt-0.5" />
                    <span>{a.authError}</span>
                  </div>
                )}
                <div className="mt-3 text-sm text-base-content/70">
                  {t("accounts.schedule")}{" "}
                  <span className="font-medium text-base-content">{a.schedule.join(", ")}</span>
                </div>
                <QueueInfo count={effectiveQueuedVideos(a) ?? queue[a.id]} runwayDays={runwayDays(a)} schedule={a.schedule} enabled={a.enabled} />
                <SourceInfo sources={accountSourceStats(a)} />
                {multiKey && a.oauthClientId && clientById.get(a.oauthClientId) && (
                  <div className="mt-2 text-xs text-base-content/45 flex items-center gap-1.5">
                    <BrandIcon name="youtube" size={12} className="shrink-0" />
                    <span className="truncate">
                      {clientById.get(a.oauthClientId)!.label}
                      {clientById.get(a.oauthClientId)!.projectId ? ` · ${clientById.get(a.oauthClientId)!.projectId}` : ""}
                    </span>
                  </div>
                )}
                {a.ytChannelId && (
                  <a
                    href={`https://www.youtube.com/channel/${a.ytChannelId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="btn btn-ghost btn-xs gap-1 mt-2 w-fit text-error pointer-events-auto relative z-20"
                    title={t("accounts.openOnYouTubeTitle")}
                  >
                    <BrandIcon name="youtube" size={14} />
                    {t("accounts.openOnYouTube")}
                    <AppIcon name="external" size={13} />
                  </a>
                )}
              </div>
            </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Accounts() {
  const { user } = useAuth();
  const [classic, setClassic] = useState(false);
  if (isMainAdmin(user) && !classic) {
    return (
      <Suspense fallback={<ChannelBlocksFallback />}>
        <ChannelBlocks onShowClassic={() => setClassic(true)} />
      </Suspense>
    );
  }
  return <AccountsList onShowBlocks={isMainAdmin(user) ? () => setClassic(false) : undefined} />;
}

function ChannelBlocksFallback() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="skeleton h-7 w-56 rounded mb-2" />
          <div className="skeleton h-4 w-80 max-w-full rounded" />
        </div>
        <div className="skeleton h-9 w-28 rounded-md" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
          <div className="skeleton h-10 rounded-md" />
          <div className="skeleton h-10 rounded-md" />
          <div className="skeleton h-10 rounded-md" />
          <div className="skeleton h-10 rounded-md" />
        </div>
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <div className="skeleton h-5 w-48 rounded mb-4" />
          <div className="skeleton h-72 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// Per-channel queue size + runway (how many days the library lasts at its posting rate).
function QueueInfo({ count, runwayDays, schedule, enabled }: { count?: number; runwayDays: number | null; schedule: string[]; enabled: boolean }) {
  const { t } = useT();
  if (count == null) return <div className="mt-2 text-xs text-base-content/40">{t("accounts.queueLoading")}</div>;
  const perDay = enabled ? schedule.length : 0;
  return (
    <div className="mt-2 text-sm flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5">
        <AppIcon name="queue" size={15} className="text-base-content/45" />
        {t("accounts.inQueue")} <b>{count}</b> {t("accounts.videos")}
      </span>
      {perDay === 0 ? (
        <span className="text-base-content/50">{t("accounts.noSchedule")}</span>
      ) : (
        (() => {
          const days = runwayDays == null ? null : Math.ceil(runwayDays);
          if (days == null) return null;
          const cls = days <= 0 ? "text-error" : days < 3 ? "text-warning" : "text-success";
          return (
            <span className={`inline-flex items-center gap-1.5 ${cls}`}>
              <AppIcon name="time" size={15} />
              {t("accounts.lastsDays", { days, perDay })}
              {days < 3 ? t("accounts.refillSoon") : ""}
            </span>
          );
        })()
      )}
    </div>
  );
}

function SourceInfo({ sources }: { sources: AccountSourceStat[] }) {
  const { t } = useT();
  if (!sources.length) return null;
  return (
    <div className="mt-3 rounded-md border border-base-200 bg-base-200/35 px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
        <AppIcon name="packs" size={12} />
        {t("accounts.sourcesTitle")}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => {
          const days = source.runwayDays == null ? null : Math.ceil(source.runwayDays);
          const warningTitle =
            source.warning === "empty_queue"
              ? t("accounts.sourceWarnEmpty", { deck: source.title, perDay: source.postsPerDay })
              : source.warning === "no_free_cards"
                ? t("accounts.sourceWarnNoFree", { deck: source.title })
                : "";
          return (
            <span key={source.id} className="badge badge-outline badge-sm max-w-full gap-1 py-3" title={warningTitle || source.title}>
              {source.lang && <span className="badge badge-ghost badge-xs">{langTag(source.lang)}</span>}
              <span className="max-w-36 truncate">{source.title}</span>
              {warningTitle && (
                <span className="inline-flex text-warning" aria-label={warningTitle}>
                  <AppIcon name="warning" size={16} />
                </span>
              )}
              <span className="opacity-60">
                · {t("accounts.sourceQueued", { n: source.queued })} ·{" "}
                {source.available == null
                  ? t("accounts.sourceAvailableUnknown")
                  : t("accounts.sourceAvailable", { n: source.available, total: source.total ?? "?" })}
                {days != null ? ` · ${t("accounts.sourceDays", { n: days })}` : ""}
              </span>
            </span>
          );
        })}
      </div>
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

function GoogleKeyNotice({ status, loadError }: { status: AppStatus | null; loadError: boolean }) {
  const { t } = useT();
  if (status?.credsConfigured) return null;
  if (!status && !loadError) return null;
  if (status && !status.credsConfigured) {
    return (
      <div className="alert alert-warning text-sm">
        <AppIcon name="warning" size={18} className="shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">{t("accounts.googleKeyRequiredTitle")}</div>
          <div className="text-base-content/70">{t("accounts.googleKeyRequiredHint")}</div>
        </div>
        <Link to="/settings" className="btn btn-sm btn-outline">
          {t("accounts.openSettings")}
        </Link>
      </div>
    );
  }
  return (
    <div className="alert alert-warning text-sm">
      <AppIcon name="warning" size={18} className="shrink-0" />
      <span>{t("accounts.statusLoadIssue")}</span>
    </div>
  );
}
