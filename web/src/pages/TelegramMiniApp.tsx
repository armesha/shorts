import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  MonitorPlay,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { apiClient, ApiError, type TelegramMiniPanel, type TelegramPreferences } from "../lib/api";

type Tab = "overview" | "channels" | "settings";
type TelegramPrefKey = "channelAlerts" | "quotaWarnings" | "postFailures" | "postSuccess" | "generationDone";

interface TelegramWebApp {
  initData?: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  ready?: () => void;
  expand?: () => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  HapticFeedback?: {
    impactOccurred?: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred?: (type: "error" | "success" | "warning") => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const PREFS: { key: TelegramPrefKey; label: string }[] = [
  { key: "channelAlerts", label: "Канал" },
  { key: "quotaWarnings", label: "API" },
  { key: "postFailures", label: "Ошибки" },
  { key: "postSuccess", label: "Успехи" },
  { key: "generationDone", label: "Генерация" },
];

const DIGESTS: { value: TelegramPreferences["statsDigest"]; label: string }[] = [
  { value: "off", label: "выкл" },
  { value: "daily", label: "день" },
  { value: "weekly", label: "неделя" },
];

function applyTelegramTheme(tg?: TelegramWebApp) {
  const p = tg?.themeParams ?? {};
  const root = document.documentElement;
  root.style.setProperty("--tg-mini-bg", p.bg_color || (tg?.colorScheme === "dark" ? "#17212b" : "#f4f6f8"));
  root.style.setProperty("--tg-mini-surface", p.secondary_bg_color || (tg?.colorScheme === "dark" ? "#232e3c" : "#ffffff"));
  root.style.setProperty("--tg-mini-text", p.text_color || (tg?.colorScheme === "dark" ? "#f5f7fb" : "#111827"));
  root.style.setProperty("--tg-mini-muted", p.hint_color || "#70808f");
  root.style.setProperty("--tg-mini-link", p.link_color || "#2563eb");
  root.style.setProperty("--tg-mini-button", p.button_color || "#2563eb");
  root.style.setProperty("--tg-mini-button-text", p.button_text_color || "#ffffff");
}

function formatInt(n: number): string {
  return Math.round(n || 0).toLocaleString("ru-RU");
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "нет данных";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "нет данных";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function openUrl(url: string) {
  const href = new URL(url, window.location.origin).toString();
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(href);
  else window.open(href, "_blank", "noopener,noreferrer");
}

export default function TelegramMiniApp() {
  const [tab, setTab] = useState<Tab>("overview");
  const [panel, setPanel] = useState<TelegramMiniPanel | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData || "";

  useEffect(() => {
    applyTelegramTheme(tg);
    tg?.ready?.();
    tg?.expand?.();

    let alive = true;
    void apiClient
      .telegramInfo()
      .then((info) => {
        if (alive) setBotUsername(info.bot);
      })
      .catch(() => {});

    async function boot() {
      setLoading(true);
      setError("");
      try {
        const data = initData ? await apiClient.telegramMiniAuth(initData) : await apiClient.telegramMiniPanel();
        if (alive) setPanel(data);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setError("Откройте панель из привязанного Telegram-бота.");
        } else {
          setError(err instanceof Error ? err.message : "Не удалось открыть панель");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void boot();
    return () => {
      alive = false;
    };
  }, [tg]);

  const enabledPrefs = useMemo(() => {
    if (!panel) return 0;
    return PREFS.filter((item) => panel.preferences[item.key]).length;
  }, [panel]);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      setPanel(initData ? await apiClient.telegramMiniAuth(initData) : await apiClient.telegramMiniPanel());
      tg?.HapticFeedback?.impactOccurred?.("light");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setLoading(false);
    }
  }

  async function savePreferences(next: TelegramPreferences) {
    if (!panel || saving) return;
    const prev = panel.preferences;
    setPanel({ ...panel, preferences: next });
    setSaving(true);
    try {
      const saved = initData
        ? await apiClient.updateTelegramMiniPreferences(initData, next)
        : await apiClient.updateTelegramPreferences(next);
      setPanel((current) => (current ? { ...current, preferences: saved } : current));
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (err) {
      setPanel((current) => (current ? { ...current, preferences: prev } : current));
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      tg?.HapticFeedback?.notificationOccurred?.("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !panel) {
    return <div className="tg-mini tg-mini--loading">Загрузка панели…</div>;
  }

  if (error && !panel) {
    const botUrl = botUsername ? `https://t.me/${botUsername}?start=menu` : "";
    return (
      <main className="tg-mini">
        <section className="tg-empty">
          <AlertTriangle size={28} />
          <h1>Откройте в Telegram</h1>
          <p>
            Эта панель входит через Telegram. Откройте бота и нажмите кнопку «Панель» в меню.
          </p>
          <div className="tg-empty__actions">
            {botUrl && (
              <button className="tg-btn tg-btn--primary" type="button" onClick={() => openUrl(botUrl)}>
                Открыть бота
              </button>
            )}
            <button className="tg-btn tg-btn--ghost" type="button" onClick={() => openUrl("/settings")}>
              Привязать Telegram
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!panel) return null;

  return (
    <main className="tg-mini">
      <header className="tg-head">
        <div>
          <div className="tg-kicker">Shorts Factory</div>
          <h1>@{panel.user.username}</h1>
        </div>
        <button className="tg-icon-btn" type="button" onClick={refresh} aria-label="Обновить" disabled={loading}>
          <RefreshCw size={18} className={loading ? "tg-spin" : ""} />
        </button>
      </header>

      {error && <div className="tg-alert">{error}</div>}

      <section className="tg-metrics" aria-label="Сводка">
        <Metric label="Каналы" value={`${panel.summary.connected}/${panel.summary.accounts}`} />
        <Metric label="Просмотры" value={formatInt(panel.summary.views)} />
        <Metric label="Подписчики" value={formatInt(panel.summary.subscribers)} />
        <Metric label="События" value={formatInt(panel.summary.openNotifications)} />
      </section>

      <nav className="tg-tabs" aria-label="Разделы">
        <TabButton active={tab === "overview"} icon={<BarChart3 size={16} />} onClick={() => setTab("overview")}>
          Сводка
        </TabButton>
        <TabButton active={tab === "channels"} icon={<MonitorPlay size={16} />} onClick={() => setTab("channels")}>
          Каналы
        </TabButton>
        <TabButton active={tab === "settings"} icon={<Settings2 size={16} />} onClick={() => setTab("settings")}>
          Настройки
        </TabButton>
      </nav>

      {tab === "overview" && (
        <Overview
          panel={panel}
          enabledPrefs={enabledPrefs}
          onOpenChannels={() => setTab("channels")}
          onOpenSettings={() => setTab("settings")}
        />
      )}
      {tab === "channels" && <Channels panel={panel} />}
      {tab === "settings" && (
        <SettingsPanel panel={panel} saving={saving} onSave={savePreferences} />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="tg-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function TabButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={`tg-tab ${active ? "tg-tab--active" : ""}`} type="button" onClick={onClick}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

function Overview({
  panel,
  enabledPrefs,
  onOpenChannels,
  onOpenSettings,
}: {
  panel: TelegramMiniPanel;
  enabledPrefs: number;
  onOpenChannels: () => void;
  onOpenSettings: () => void;
}) {
  const top = panel.notifications.slice(0, 3);
  return (
    <section className="tg-stack">
      <div className="tg-row-list">
        <button className="tg-action" type="button" onClick={onOpenChannels}>
          <MonitorPlay size={18} />
          <span>
            <b>Каналы</b>
            <small>{formatInt(panel.summary.videos)} видео в каналах</small>
          </span>
        </button>
        <button className="tg-action" type="button" onClick={onOpenSettings}>
          <Bell size={18} />
          <span>
            <b>Уведомления</b>
            <small>{enabledPrefs} категорий включено</small>
          </span>
        </button>
      </div>

      <section className="tg-panel">
        <div className="tg-section-title">Последние события</div>
        {top.length ? (
          <div className="tg-list">
            {top.map((n) => (
              <div key={n.id} className={`tg-notice tg-notice--${n.severity}`}>
                <b>{n.title}</b>
                <span>{n.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="tg-muted-box">Открытых событий нет.</div>
        )}
      </section>
    </section>
  );
}

function Channels({ panel }: { panel: TelegramMiniPanel }) {
  if (!panel.accounts.length) {
    return <div className="tg-muted-box">Каналов пока нет.</div>;
  }
  return (
    <section className="tg-list">
      {panel.accounts.map((a) => {
        const connected = a.status === "connected";
        return (
          <article key={a.id} className="tg-channel">
            <div className="tg-channel__top">
              <div className="tg-channel__name">
                <span className={`tg-dot ${connected ? "tg-dot--ok" : "tg-dot--warn"}`} />
                <b>{a.name}</b>
              </div>
              {a.youtubeUrl && (
                <button className="tg-link-btn" type="button" onClick={() => openUrl(a.youtubeUrl!)}>
                  <MonitorPlay size={15} />
                  YouTube
                </button>
              )}
            </div>
            <div className="tg-channel__meta">
              <span>{connected ? "подключён" : "нужен вход"}</span>
              <span>{a.enabled ? "активен" : "пауза"}</span>
              <span>{a.scheduleCount}/день</span>
            </div>
            <div className="tg-channel__stats">
              <span>{formatInt(a.stats?.views ?? 0)} просмотров</span>
              <span>{formatInt(a.stats?.subscribers ?? 0)} подписчиков</span>
              <span>{shortDate(a.stats?.takenAt)}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function SettingsPanel({
  panel,
  saving,
  onSave,
}: {
  panel: TelegramMiniPanel;
  saving: boolean;
  onSave: (next: TelegramPreferences) => void;
}) {
  const prefs = panel.preferences;
  return (
    <section className="tg-stack">
      <div className="tg-panel">
        <div className="tg-section-title">Сообщения</div>
        <div className="tg-toggle-grid">
          {PREFS.map((item) => {
            const checked = prefs[item.key];
            return (
              <button
                key={item.key}
                type="button"
                className={`tg-toggle ${checked ? "tg-toggle--on" : ""}`}
                onClick={() => onSave({ ...prefs, [item.key]: !checked })}
                disabled={saving}
                aria-pressed={checked}
              >
                <span>{item.label}</span>
                {checked ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="tg-panel">
        <div className="tg-section-title">Дайджест</div>
        <div className="tg-segment">
          {DIGESTS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={prefs.statsDigest === item.value ? "tg-segment__item tg-segment__item--active" : "tg-segment__item"}
              onClick={() => onSave({ ...prefs, statsDigest: item.value })}
              disabled={saving}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
