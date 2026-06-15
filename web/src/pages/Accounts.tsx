import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Tv, Clapperboard, Clock, CheckCircle2, AlertTriangle, Send, ArrowUp, ArrowDown, X } from "lucide-react";
import { apiClient, type Account, type AppStatus } from "../lib/api";

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionErr, setActionErr] = useState("");
  const [queue, setQueue] = useState<Record<number, number>>({});
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
        setAccounts(a);
        a.forEach((acc) =>
          apiClient
            .videos(acc.id)
            .then((v) => setQueue((q) => ({ ...q, [acc.id]: v.length })))
            .catch(() => {}),
        );
      })
      .catch(() => setLoadError(true));
    apiClient.status().then(setStatus).catch(() => setLoadError(true));
  }, []);

  async function addAccount() {
    setCreating(true);
    try {
      const a = await apiClient.createAccount();
      navigate(`/accounts/${a.id}`);
    } catch (e) {
      setActionErr("Не удалось создать канал: " + String(e));
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
      until === 0 ? "сейчас" : h && m ? `через ${h} ч ${m} мин` : h ? `через ${h} ч` : `через ${m} мин`;
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
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Каналы</h1>
          <p className="text-base-content/60">Обзор и YouTube-каналы — в одном месте</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} loadError={loadError} />
          <button className="btn btn-primary gap-2" onClick={addAccount} disabled={creating}>
            {creating ? <span className="loading loading-spinner loading-sm" /> : <Plus size={18} />}
            Добавить канал
          </button>
        </div>
      </header>

      {actionErr && (
        <div className="alert alert-error text-sm" role="alert">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">{actionErr}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setActionErr("")} aria-label="Скрыть">
            <X size={14} />
          </button>
        </div>
      )}

      {showLowAlert && (
        <div className="alert alert-warning shadow-sm flex items-start gap-2">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold">Скоро закончатся ролики</span> — меньше чем на день у:{" "}
            {lowChannels.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link to={`/accounts/${a.id}`} className="link font-medium">
                  {a.channelName}
                </Link>{" "}
                <span className="text-base-content/60">
                  ({queue[a.id] === 0 ? "нет видео" : `${queue[a.id]} в очереди`})
                </span>
              </span>
            ))}
            . Сгенерируйте ещё, чтобы канал не простаивал.
          </div>
          <button
            className="btn btn-ghost btn-xs btn-square"
            onClick={dismissLowAlert}
            aria-label="Скрыть"
            title="Скрыть. Вернётся, если в зоне риска окажется другой канал."
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Tv />} label="Каналов" value={accounts.length} />
        <Stat icon={<Send />} label="Видео в сутки" value={perDay} />
        <Stat icon={<Clapperboard />} label="Загружено сегодня" value={uploadsToday} />
        <Stat
          icon={<Clock />}
          label={nextRun.rel ? `Ближайший запуск · ${nextRun.rel}` : "Ближайший запуск"}
          value={nextRun.time}
        />
      </div>

      {accounts.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <Tv className="text-base-content/30" size={40} />
            <p className="text-base-content/60">
              Пока нет каналов. Добавьте первый — и настройте тему, язык и расписание.
            </p>
            <button className="btn btn-primary btn-sm gap-2 mt-2" onClick={addAccount} disabled={creating}>
              <Plus size={16} /> Добавить канал
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-base-content/60">Сортировка по запасу дней</span>
            <button
              className="btn btn-sm btn-outline btn-square"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              aria-label="Перевернуть сортировку по остатку дней"
              title={
                sortDir === "asc"
                  ? "Сейчас: заканчивающиеся сверху. Нажмите — наоборот."
                  : "Сейчас: с запасом сверху. Нажмите — наоборот."
              }
            >
              {sortDir === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shownAccounts.map((a) => (
            <Link
              key={a.id}
              to={`/accounts/${a.id}`}
              className="card bg-base-100 border border-base-300 hover:border-primary transition-colors"
            >
              <div className="card-body">
                <div className="flex items-center gap-3">
                  {a.avatar ? (
                    <img
                      src={a.avatar}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border border-base-300 shrink-0 bg-base-200"
                    />
                  ) : (
                    <div className="bg-primary/10 text-primary rounded-full w-12 h-12 flex items-center justify-center shrink-0">
                      <Tv size={22} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{a.channelName}</div>
                    <div className="text-sm text-base-content/60">
                      {a.theme || "тема не задана"} · {a.lang.toUpperCase()}
                    </div>
                  </div>
                  {a.status === "connected" ? (
                    <span className="badge badge-success badge-sm">подключён</span>
                  ) : (
                    <span className="badge badge-warning badge-sm">нужна авторизация</span>
                  )}
                </div>
                <div className="mt-3 text-sm text-base-content/70">
                  Расписание:{" "}
                  <span className="font-medium text-base-content">{a.schedule.join(", ")}</span>
                </div>
                <QueueInfo count={queue[a.id]} schedule={a.schedule} enabled={a.enabled} />
                {a.ytChannelId && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(`https://www.youtube.com/channel/${a.ytChannelId}`, "_blank");
                    }}
                    className="btn btn-ghost btn-xs gap-1 mt-2 w-fit text-error"
                    title="Открыть канал на YouTube"
                  >
                    ▶ Открыть на YouTube ↗
                  </button>
                )}
              </div>
            </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Per-channel queue size + runway (how many days the library lasts at its posting rate).
function QueueInfo({ count, schedule, enabled }: { count?: number; schedule: string[]; enabled: boolean }) {
  if (count == null) return <div className="mt-2 text-xs text-base-content/40">очередь…</div>;
  const perDay = enabled ? schedule.length : 0;
  return (
    <div className="mt-2 text-sm flex items-center gap-3 flex-wrap">
      <span>
        🎬 В очереди: <b>{count}</b> видео
      </span>
      {perDay === 0 ? (
        <span className="text-base-content/50">расписание не задано</span>
      ) : (
        (() => {
          const days = Math.ceil(count / perDay);
          const cls = days <= 0 ? "text-error" : days < 3 ? "text-warning" : "text-success";
          return (
            <span className={cls}>
              ⏳ хватит на ~{days} дн. ({perDay}/день){days < 3 ? " — пора пополнить!" : ""}
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

function StatusBadge({ status, loadError }: { status: AppStatus | null; loadError: boolean }) {
  if (status && !status.credsConfigured) {
    return (
      <div className="badge badge-error gap-1 badge-lg">
        <AlertTriangle size={14} /> Нет ключа Google
      </div>
    );
  }
  if (!status) {
    return loadError ? (
      <div className="badge badge-warning gap-1 badge-lg">
        <AlertTriangle size={14} /> Не удалось загрузить
      </div>
    ) : (
      <div className="badge badge-ghost badge-lg">…</div>
    );
  }
  return (
    <div className="badge badge-success gap-1 badge-lg">
      <CheckCircle2 size={14} /> Google подключён
    </div>
  );
}
