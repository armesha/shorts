import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, type Account, type AppStatus } from "../lib/api";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { useT } from "../lib/i18n";
import { fmtCacheTime, readCache, writeCache } from "../lib/cache";

const ACCOUNTS_CACHE_KEY = "sf.accounts.v1";
type AccountsCache = {
  accounts: Account[];
  status: AppStatus | null;
  queue: Record<number, number>;
};

export default function Accounts() {
  const { t } = useT();
  const cached = readCache<AccountsCache>(ACCOUNTS_CACHE_KEY);
  const [accounts, setAccounts] = useState<Account[]>(cached?.value.accounts ?? []);
  const [status, setStatus] = useState<AppStatus | null>(cached?.value.status ?? null);
  const [loadError, setLoadError] = useState(false);
  const [cacheSavedAt, setCacheSavedAt] = useState(cached?.savedAt ?? "");
  const [creating, setCreating] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [queue, setQueue] = useState<Record<number, number>>(cached?.value.queue ?? {});
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
    apiClient
      .accounts()
      .then((a) => {
        setLoadError(false);
        setAccounts(a);
        a.forEach((acc) =>
          apiClient
            .videos(acc.id)
            .then((v) => setQueue((q) => ({ ...q, [acc.id]: v.length })))
            .catch(() => {}),
        );
      })
      .catch(() => setLoadError(true));
    apiClient.status().then((s) => {
      setLoadError(false);
      setStatus(s);
    }).catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!accounts.length && !status && !Object.keys(queue).length) return;
    writeCache(ACCOUNTS_CACHE_KEY, { accounts, status, queue });
    setCacheSavedAt(new Date().toISOString());
  }, [accounts, status, queue]);

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

  // Days of video left = count / posts-per-day (continuous; <1 → runs dry within a day).
  // null = not applicable (no schedule, or counts still loading) → never flagged as low.
  const runwayDays = (a: Account): number | null => {
    const slots = a.enabled ? a.schedule.length : 0;
    const count = queue[a.id];
    if (slots === 0 || count == null) return null;
    return count / slots;
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

  // Always sorted by days-of-video-left; the arrow button flips direction. No-schedule/loading last.
  const shownAccounts = [...accounts].sort((a, b) => {
    const ra = runwayDays(a);
    const rb = runwayDays(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return sortDir === "asc" ? ra - rb : rb - ra;
  });

  return (
    <div className="space-y-6">
      <GoogleKeyNotice status={status} loadError={loadError} />

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
                  ({queue[a.id] === 0 ? t("accounts.noVideos") : t("accounts.inQueueN", { n: queue[a.id] })})
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
                    <img
                      src={a.avatar}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border border-base-300 shrink-0 bg-base-200"
                    />
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
                  {a.status === "connected" ? (
                    <span className="badge badge-success badge-sm">{t("accounts.connected")}</span>
                  ) : (
                    <span className="badge badge-warning badge-sm">{t("accounts.needsAuth")}</span>
                  )}
                </div>
                <div className="mt-3 text-sm text-base-content/70">
                  {t("accounts.schedule")}{" "}
                  <span className="font-medium text-base-content">{a.schedule.join(", ")}</span>
                </div>
                <QueueInfo count={queue[a.id]} schedule={a.schedule} enabled={a.enabled} />
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

// Per-channel queue size + runway (how many days the library lasts at its posting rate).
function QueueInfo({ count, schedule, enabled }: { count?: number; schedule: string[]; enabled: boolean }) {
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
          const days = Math.ceil(count / perDay);
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
