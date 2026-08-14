// In-bot channel statistics for @shotsrecoverybot. The bot is already account-linked via
// users.telegram_id, so a Telegram user maps to an app user (admin or not). This mirrors the website's
// Statistics tab: a linked user sees + refreshes THEIR OWN channels; an admin additionally gets an
// «Все каналы» toggle to view + refresh everyone's. Like the website, metric sources are kept
// visually separate: «Analytics» (period metrics, 7/30/90 дн tabs) vs «Data API» (lifetime public
// counters) — separate blockquote blocks on the summary and source tabs on the channel card.
// Navigation is inline keyboards edited in place (no chat spam); the refresh button still updates
// BOTH YouTube Data totals and the YouTube Analytics bundle via the shared refreshAccountStats()
// — same 15-min/6-h TTL cache as the web, so it stays light.
import type { Db, Account, UserAuth } from "../db.ts";
import type { ClientCreds } from "./youtube.ts";
import {
  refreshAccountStats,
  parseUtcMs,
  type RefreshHooks,
  type SnapshotAnalyticsFields,
} from "./stats-refresh.ts";
import {
  sendBotMessage,
  editMessageText,
  answerCallbackQuery,
  type InlineKeyboard,
  type InlineKeyboardButton,
} from "../telegram.ts";

// ---- Incoming Telegram shapes this module reads (exported so the webhook router types match) -------
export interface BotFrom {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}
export interface BotMessage {
  text?: string;
  from?: BotFrom;
  chat?: { id?: number };
  message_id?: number;
}
export interface BotCallbackQuery {
  id: string;
  data?: string;
  from?: BotFrom;
  message?: BotMessage;
}

export interface BotStatsDeps {
  db: Db;
  botToken: () => string;
  accountCreds: (account: Account) => ClientCreds | null;
  redirectUri: string;
  /** index.ts youtubeAnalyticsRange — window ending 2 days ago, `days` wide. */
  analyticsRange: (days: number) => { from: string; to: string };
  /** index.ts summarizeStoredAnalytics, bound to its db. */
  summarizeStored: (accountId: number, from: string, to: string) => SnapshotAnalyticsFields;
  /** index.ts ytErrorMessage. */
  formatStatsError: (err: unknown) => string;
  refreshHooks: RefreshHooks;
}

type Scope = "mine" | "all";
type BotScreen = "home" | "stats" | "circles" | "settings" | "help";
// Metric source, mirroring the website's /statistics tabs: "an" = YouTube Analytics (period
// metrics), "data" = public Data API lifetime counters. Encoded in callback_data as "a"/"d".
type Src = "an" | "data";

const PAGE_SIZE = 8;
const PERIODS = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;
const REFRESH_DAYS = 90; // refresh always pulls the WIDE 90-day analytics window (matches the route)

const NOT_LINKED =
  "Этот Telegram не привязан к аккаунту Shorts Factory.\n\n" +
  "Войдите на сайте паролем и привяжите Telegram в Настройках — после этого здесь появится статистика ваших каналов.";
const PREF_LABELS: Record<"channelAlerts" | "quotaWarnings" | "postFailures" | "postSuccess" | "generationDone", string> = {
  channelAlerts: "Канал требует действия",
  quotaWarnings: "Лимиты и API",
  postFailures: "Ошибки публикации",
  postSuccess: "Успешные публикации",
  generationDone: "Генерация и очередь",
};
const DIGEST_LABELS = { off: "выкл", daily: "ежедневно", weekly: "еженедельно" } as const;

// ---- Formatting (HTML parse mode) -----------------------------------------------------------------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bold = (s: string) => `<b>${esc(s)}</b>`;
const intFmt = (n: number) => Math.round(n || 0).toLocaleString("ru-RU");
const truncBtn = (s: string) => Array.from(s).slice(0, 48).join(""); // cap by code points (no surrogate split)

function deltaFmt(n: number): string {
  if (!n) return "";
  return ` (${n > 0 ? "+" : "−"}${intFmt(Math.abs(n))})`;
}
function durationFmt(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function watchTimeFmt(minutes: number): string {
  const m = Math.max(0, minutes || 0);
  return m >= 60 ? `${intFmt(m / 60)} ч` : `${intFmt(m)} мин`;
}
function relTime(iso: string | null | undefined): string {
  const t = parseUtcMs(iso);
  if (!t) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ч назад`;
  return `${Math.floor(hr / 24)} дн назад`;
}
function ruDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const [y, mo, da] = ymd.split("-");
  return y && mo && da ? `${da}.${mo}.${y}` : ymd;
}
function clampDays(v: string | undefined): number {
  const n = Number(v);
  return (PERIODS as readonly number[]).includes(n) ? n : DEFAULT_DAYS;
}
function parseSrc(v: string | undefined): Src {
  return v === "d" ? "data" : "an";
}
const srcCode = (src: Src) => (src === "data" ? "d" : "a");
const quote = (lines: string[]) => `<blockquote>${lines.join("\n")}</blockquote>`;
const cap = (s: string) => `<i>${esc(s)}</i>`;

export function makeBotStats(deps: BotStatsDeps) {
  const { db, botToken, accountCreds, redirectUri, analyticsRange, summarizeStored, formatStatsError, refreshHooks } = deps;
  const baseUrl = () => (process.env.PUBLIC_BASE_URL || "https://shareboard.live").trim().replace(/\/+$/, "");
  const siteUrl = (path: string) => `${baseUrl()}${path}`;

  // Access mirror of the website's visibleAccounts(): «all» is admin-only; everyone else sees own.
  const visibleAccounts = (user: UserAuth, scope: Scope): Account[] =>
    scope === "all" && user.role === "admin" ? db.listAccounts() : db.listAccountsByUser(user.id);
  const normScope = (user: UserAuth, raw: string | undefined): Scope =>
    raw === "all" && user.role === "admin" ? "all" : "mine";

  const send = (chatId: number, text: string, keyboard?: InlineKeyboard) =>
    sendBotMessage(botToken(), chatId, text, { parseMode: "HTML", replyMarkup: keyboard });
  const edit = (chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) =>
    editMessageText(botToken(), chatId, messageId, text, { parseMode: "HTML", replyMarkup: keyboard });

  function homeView(user: UserAuth): { text: string; keyboard: InlineKeyboard } {
    const accounts = visibleAccounts(user, "mine");
    const connected = accounts.filter((a) => a.status === "connected").length;
    const prefs = db.getTelegramPreferences(user.id);
    const text =
      `${bold("🎬 Shorts Factory")}\n` +
      `${cap(`Аккаунт: ${user.username}`)}\n\n` +
      quote([
        `📺 Каналов: ${bold(String(accounts.length))} · подключено: ${connected}`,
        `🔔 Уведомления: ${prefs.channelAlerts || prefs.quotaWarnings || prefs.postFailures ? "включены" : "выключены"}`,
        `📈 Дайджест: ${DIGEST_LABELS[prefs.statsDigest]}`,
      ]) +
      `\nВыберите нужное действие кнопками ниже.`;
    return {
      text,
      keyboard: {
        inline_keyboard: [
          [{ text: "⭕ Добавить Telegram-кружок", callback_data: "s:circles" }],
          [
            { text: "📊 Статистика", callback_data: "s:sum:mine" },
            { text: "🔔 Уведомления", callback_data: "s:settings" },
          ],
          [
            { text: "🎛 Панель", web_app: { url: siteUrl("/tg") } },
            { text: "🎬 Редактор", url: siteUrl("/circles") },
          ],
          [{ text: "❔ Помощь", callback_data: "s:help" }],
        ],
      },
    };
  }

  function circlesView(user: UserAuth, note?: string): { text: string; keyboard: InlineKeyboard } {
    const text =
      `${bold("⭕ Добавить Telegram-кружок")}\n` +
      `${cap(`Аккаунт: ${user.username}`)}\n\n` +
      `Отправьте или перешлите ${bold("в этот чат")} готовый видеокружок.\n\n` +
      quote([
        "1. Выберите кружок в Telegram.",
        "2. Отправьте или перешлите его боту.",
        "3. Дождитесь сообщения «Кружок добавлен».",
      ]) +
      `\nПосле загрузки кружок появится только в вашей библиотеке редактора.` +
      (note ? `\n\n${esc(note)}` : "");
    return {
      text,
      keyboard: {
        inline_keyboard: [
          [{ text: "🎬 Открыть редактор кружков", url: siteUrl("/circles") }],
          [
            { text: "📊 Статистика", callback_data: "s:sum:mine" },
            { text: "🏠 Главное меню", callback_data: "s:home" },
          ],
        ],
      },
    };
  }

  function helpView(): { text: string; keyboard: InlineKeyboard } {
    const text =
      `${bold("Что умеет бот")}\n\n` +
      `• ${bold("/menu")} — главный экран с быстрыми действиями.\n` +
      `• ${bold("/circles")} — добавить видеокружок и открыть редактор.\n` +
      `• ${bold("/stats")} — статистика каналов: вкладка ${bold("Analytics")} (метрики за 7/30/90 дней) и вкладка ${bold("Data API")} (публичные счётчики за всё время) — как на сайте.\n` +
      `• ${bold("/settings")} — настройка уведомлений прямо в Telegram.\n` +
      `• Бот присылает критичные сообщения: отвязался канал, проблемы YouTube API/Analytics, лимиты и ошибки, если категории включены.\n\n` +
      `Кнопки редактируют это же сообщение, поэтому чат не засоряется.`;
    return {
      text,
      keyboard: {
        inline_keyboard: [
          [{ text: "⭕ Добавить кружок", callback_data: "s:circles" }],
          [
            { text: "🏠 Меню", callback_data: "s:home" },
            { text: "🔔 Настройки", callback_data: "s:settings" },
          ],
        ],
      },
    };
  }

  function settingsView(user: UserAuth, note?: string): { text: string; keyboard: InlineKeyboard } {
    const prefs = db.getTelegramPreferences(user.id);
    const on = (v: boolean) => (v ? "✅" : "⬜");
    const text =
      `${bold("🔔 Настройки уведомлений")}\n` +
      `Аккаунт: ${esc(user.username)}\n\n` +
      `${on(prefs.channelAlerts)} ${PREF_LABELS.channelAlerts}\n` +
      `${on(prefs.quotaWarnings)} ${PREF_LABELS.quotaWarnings}\n` +
      `${on(prefs.postFailures)} ${PREF_LABELS.postFailures}\n` +
      `${on(prefs.postSuccess)} ${PREF_LABELS.postSuccess}\n` +
      `${on(prefs.generationDone)} ${PREF_LABELS.generationDone}\n` +
      `📈 Дайджест: ${DIGEST_LABELS[prefs.statsDigest]}` +
      (note ? `\n\n${esc(note)}` : "");
    return {
      text,
      keyboard: {
        inline_keyboard: [
          [
            { text: `${on(prefs.channelAlerts)} Канал`, callback_data: "s:pref:channelAlerts" },
            { text: `${on(prefs.quotaWarnings)} API/лимиты`, callback_data: "s:pref:quotaWarnings" },
          ],
          [
            { text: `${on(prefs.postFailures)} Ошибки`, callback_data: "s:pref:postFailures" },
            { text: `${on(prefs.postSuccess)} Успехи`, callback_data: "s:pref:postSuccess" },
          ],
          [{ text: `${on(prefs.generationDone)} Генерация`, callback_data: "s:pref:generationDone" }],
          [{ text: `📈 Дайджест: ${DIGEST_LABELS[prefs.statsDigest]}`, callback_data: "s:digest" }],
          [
            { text: "🏠 Меню", callback_data: "s:home" },
            { text: "📊 Статистика", callback_data: "s:sum:mine" },
          ],
        ],
      },
    };
  }

  // Sum subscribers/views/videos across the scope's channels, each from its latest snapshot.
  function channelTotals(accounts: Account[]): { subscribers: number; views: number; videos: number } {
    let subscribers = 0;
    let views = 0;
    let videos = 0;
    for (const a of accounts) {
      const s = db.latestSnapshot(a.id);
      if (!s) continue;
      subscribers += s.subscribers;
      views += s.views;
      videos += s.videos;
    }
    return { subscribers, views, videos };
  }

  // Home / focus screen of the stats section. Mirrors the website's /statistics split:
  // an «Analytics · N дн» block (period metrics) and a separate «Data API · за всё время»
  // block (public lifetime counters), each in its own blockquote.
  function summaryView(user: UserAuth, scope: Scope, days: number, note?: string): { text: string; keyboard: InlineKeyboard } {
    const accounts = visibleAccounts(user, scope);
    const isAdmin = user.role === "admin";
    const scopeLabel = scope === "all" ? "Все каналы" : "Мои каналы";
    const homeBtn: InlineKeyboardButton = { text: "🏠 Меню", callback_data: "s:home" };
    const toggle: InlineKeyboardButton | null = isAdmin
      ? { text: scope === "all" ? "👤 Мои каналы" : "🌐 Все каналы", callback_data: `s:sum:${scope === "all" ? "mine" : "all"}:${days}` }
      : null;

    if (accounts.length === 0) {
      let text = `${bold("📊 Статистика")} · ${esc(scopeLabel)}\n\nНет каналов для показа.`;
      if (note) text += `\n\n${esc(note)}`;
      return { text, keyboard: { inline_keyboard: toggle ? [[toggle], [homeBtn]] : [[homeBtn]] } };
    }

    // Analytics: sum the stored per-day rows over the chosen window across the scope's channels.
    const range = analyticsRange(days);
    const an = { views: 0, watchMinutes: 0, gained: 0, lost: 0 };
    for (const a of accounts) {
      const s = summarizeStored(a.id, range.from, range.to);
      an.views += s.views;
      an.watchMinutes += s.watchMinutes;
      an.gained += s.subscribersGained;
      an.lost += s.subscribersLost;
    }
    const net = an.gained - an.lost;
    const anLines =
      an.views || an.watchMinutes
        ? [
            `Просмотры: ${bold(intFmt(an.views))}`,
            `Время просмотра: ${watchTimeFmt(an.watchMinutes)}`,
            `Подписки: +${intFmt(an.gained)} / −${intFmt(an.lost)}${net ? ` (${net > 0 ? "+" : "−"}${intFmt(Math.abs(net))})` : ""}`,
          ]
        : ["Пока нет данных за период — нажмите «Обновить все»."];

    const t = channelTotals(accounts);
    let text =
      `${bold("📊 Статистика")} · ${esc(scopeLabel)}\n` +
      `${cap(`Каналов: ${accounts.length}`)}\n\n` +
      `${bold(`📈 Analytics · ${days} дн`)}\n` +
      quote(anLines) +
      `\n${bold("🗄 Data API · за всё время")}\n` +
      quote([
        `Подписчики: ${bold(intFmt(t.subscribers))}`,
        `Просмотры: ${bold(intFmt(t.views))}`,
        `Видео: ${intFmt(t.videos)}`,
      ]);
    if (note) text += `\n\n${esc(note)}`;

    const rows: InlineKeyboardButton[][] = [
      PERIODS.map((p) => ({ text: p === days ? `• ${p} дн` : `${p} дн`, callback_data: `s:sum:${scope}:${p}` })),
      [{ text: "📋 Список каналов", callback_data: `s:list:${scope}:0` }],
    ];
    const controls: InlineKeyboardButton[] = [];
    if (accounts.some((a) => a.status === "connected"))
      controls.push({ text: "🔄 Обновить все", callback_data: `s:rfall:${scope}:${days}` });
    if (toggle) controls.push(toggle);
    if (controls.length) rows.push(controls);
    rows.push([homeBtn]);

    return { text, keyboard: { inline_keyboard: rows } };
  }

  // Channel picker: per-channel buttons + pagination, reached from the summary's «Список каналов».
  function listView(user: UserAuth, scope: Scope, page: number): { text: string; keyboard: InlineKeyboard } {
    const accounts = visibleAccounts(user, scope);
    const scopeLabel = scope === "all" ? "Все каналы" : "Мои каналы";
    const back: InlineKeyboardButton = { text: "◀ К сводке", callback_data: `s:sum:${scope}` };

    if (accounts.length === 0) {
      return {
        text: `${bold("📋 Каналы")}\nРежим: ${esc(scopeLabel)}\n\nНет каналов для показа.`,
        keyboard: { inline_keyboard: [[back]] },
      };
    }

    const pages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
    const p = Math.min(Math.max(0, page), pages - 1);
    const slice = accounts.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
    const rows: InlineKeyboardButton[][] = [];
    for (const a of slice) {
      const name = a.ytChannelTitle || a.channelName || `#${a.id}`;
      const icon = a.status === "connected" ? "📺" : "🚫";
      rows.push([{ text: truncBtn(`${icon} ${name}`), callback_data: `s:ch:${a.id}:${scope}:${DEFAULT_DAYS}:a` }]);
    }
    if (pages > 1) {
      const nav: InlineKeyboardButton[] = [];
      if (p > 0) nav.push({ text: "◀", callback_data: `s:list:${scope}:${p - 1}` });
      nav.push({ text: `${p + 1}/${pages}`, callback_data: "s:noop" });
      if (p < pages - 1) nav.push({ text: "▶", callback_data: `s:list:${scope}:${p + 1}` });
      rows.push(nav);
    }
    rows.push([back, { text: "🏠 Меню", callback_data: "s:home" }]);

    const text =
      `${bold("📋 Каналы")} · ${esc(scopeLabel)}\n` +
      `${cap(`Каналов: ${accounts.length}${pages > 1 ? ` · стр. ${p + 1}/${pages}` : ""}`)}\n\n` +
      `Выберите канал:`;
    return { text, keyboard: { inline_keyboard: rows } };
  }

  // Channel-card keyboard. Top row = source tabs (Analytics | Data API), like the tabs on the
  // website's /statistics; the period row only makes sense on the Analytics tab.
  function cardKeyboard(a: Account, scope: Scope, days: number, src: Src, canRefresh: boolean): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [
      [
        { text: src === "an" ? "• 📈 Analytics" : "📈 Analytics", callback_data: `s:ch:${a.id}:${scope}:${days}:a` },
        { text: src === "data" ? "• 🗄 Data API" : "🗄 Data API", callback_data: `s:ch:${a.id}:${scope}:${days}:d` },
      ],
    ];
    if (src === "an")
      rows.push(PERIODS.map((p) => ({ text: p === days ? `• ${p} дн` : `${p} дн`, callback_data: `s:ch:${a.id}:${scope}:${p}:a` })));
    const actions: InlineKeyboardButton[] = [];
    if (canRefresh) actions.push({ text: "🔄 Обновить", callback_data: `s:rf:${a.id}:${scope}:${days}:${srcCode(src)}` });
    if (a.ytChannelId) actions.push({ text: "▶️ YouTube", url: `https://www.youtube.com/channel/${a.ytChannelId}` });
    if (actions.length) rows.push(actions);
    rows.push([
      { text: "◀ Каналы", callback_data: `s:list:${scope}:0` },
      { text: "🏠 Меню", callback_data: "s:home" },
    ]);
    return { inline_keyboard: rows };
  }

  // One channel, one source per screen: «Analytics» shows the period metrics, «Data API» the
  // lifetime public counters (with deltas vs the previous snapshot) — same split as the website.
  function channelCard(user: UserAuth, a: Account, scope: Scope, days: number, src: Src, note?: string): { text: string; keyboard: InlineKeyboard } {
    const name = a.ytChannelTitle || a.channelName || `#${a.id}`;
    const lines: string[] = [`📺 ${bold(name)}`];

    if (scope === "all" && user.role === "admin" && a.userId != null) {
      const owner = db.getUserById(a.userId);
      if (owner) lines.push(cap(`Владелец: ${owner.username}`));
    }
    if (note) lines.push(`\n⚠️ ${esc(note)}`);

    if (a.status !== "connected") {
      lines.push(`\n🚫 Канал не подключён к YouTube.`);
      return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, src, false) };
    }

    const { latest, prev } = db.twoLatestSnapshots(a.id);
    if (!latest) {
      lines.push(`\nНет данных. Нажмите «🔄 Обновить».`);
      return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, src, true) };
    }

    if (src === "data") {
      // --- Data API: lifetime public counters + delta vs previous snapshot ---
      lines.push("", bold("🗄 Data API · за всё время"));
      lines.push(
        quote([
          `Подписчики: ${bold(intFmt(latest.subscribers))}${deltaFmt(prev ? latest.subscribers - prev.subscribers : 0)}`,
          `Просмотры: ${bold(intFmt(latest.views))}${deltaFmt(prev ? latest.views - prev.views : 0)}`,
          `Видео: ${intFmt(latest.videos)}${deltaFmt(prev ? latest.videos - prev.videos : 0)}`,
        ]),
      );
      lines.push(cap(`Публичные счётчики канала · дельта — к прошлому снимку`));
      lines.push("", `🕒 Обновлено: ${relTime(latest.takenAt)}`);
      return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, src, true) };
    }

    // --- Analytics: YouTube Analytics API, summarized over the chosen period from stored daily rows ---
    const range = analyticsRange(days);
    const sum = summarizeStored(a.id, range.from, range.to);
    lines.push("", bold(`📈 Analytics · ${days} дн`));
    if (latest.analyticsStatus === "error") {
      lines.push(quote([`⚠️ ${esc(latest.analyticsError || "ошибка аналитики")}`]));
    } else if (!sum.views && !sum.watchMinutes) {
      lines.push(quote(["Пока нет данных аналитики за период."]));
    } else {
      const net = sum.subscribersGained - sum.subscribersLost;
      const netStr = net ? ` (${net > 0 ? "+" : "−"}${intFmt(Math.abs(net))})` : "";
      lines.push(
        quote([
          `Просмотры: ${bold(intFmt(sum.views))}`,
          `Время просмотра: ${watchTimeFmt(sum.watchMinutes)}`,
          `Ср. просмотр: ${durationFmt(sum.avgViewDuration)} (${Math.round(sum.avgViewPercentage || 0)}%)`,
          `Лайки · комменты · репосты: ${intFmt(sum.likes)} · ${intFmt(sum.comments)} · ${intFmt(sum.shares)}`,
          `Подписки: +${intFmt(sum.subscribersGained)} / −${intFmt(sum.subscribersLost)}${netStr}`,
        ]),
      );
    }
    lines.push(cap(`Метрики YouTube Analytics за выбранный период`));
    if (latest.analyticsStatus && latest.analyticsStatus !== "error") {
      lines.push("", `🕒 Обновлено: ${relTime(latest.analyticsTakenAt)}${latest.dataThrough ? ` · данные по ${ruDate(latest.dataThrough)}` : ""}`);
    }

    return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, src, true) };
  }

  async function refreshOne(a: Account): Promise<string | undefined> {
    if (a.status !== "connected") return undefined;
    const res = await refreshAccountStats({
      db,
      account: a,
      creds: accountCreds(a),
      refreshToken: db.getRefreshToken(a.id),
      redirectUri,
      analyticsRange: analyticsRange(REFRESH_DAYS),
      summarizeStored,
      formatStatsError,
      hooks: refreshHooks,
    });
    return res.error ?? undefined;
  }

  // ---- /menu, /stats, /settings, /help or /start (no token): open the in-bot UI ----
  async function entry(msg: BotMessage, screen: BotScreen = "home"): Promise<void> {
    const chatId = msg.chat?.id;
    if (chatId == null) return;
    const tgId = msg.from?.id != null ? String(msg.from.id) : "";
    const user = tgId ? db.getUserByTelegramId(tgId) : null;
    if (!user) {
      await send(chatId, NOT_LINKED, {
        inline_keyboard: [
          [
            { text: "🔐 Войти", url: siteUrl("/login") },
            { text: "✨ Создать аккаунт", url: siteUrl("/register") },
          ],
        ],
      });
      return;
    }
    const v = (() => {
      switch (screen) {
        case "stats":
          return summaryView(user, "mine", DEFAULT_DAYS);
        case "circles":
          return circlesView(user);
        case "settings":
          return settingsView(user);
        case "help":
          return helpView();
        default:
          return homeView(user);
      }
    })();
    await send(chatId, v.text, v.keyboard);
  }

  // ---- Inline-keyboard button press (callback_query). Always answers; edits the message in place. ----
  async function callback(cbq: BotCallbackQuery): Promise<void> {
    const data = cbq.data ?? "";
    const chatId = cbq.message?.chat?.id;
    const messageId = cbq.message?.message_id;
    const tgId = cbq.from?.id != null ? String(cbq.from.id) : "";
    const user = tgId ? db.getUserByTelegramId(tgId) : null;
    const ack = (text?: string, alert?: boolean) => answerCallbackQuery(botToken(), cbq.id, { text, showAlert: alert });

    if (!data.startsWith("s:")) return void (await ack());
    if (!user) {
      await ack("Аккаунт не привязан", true);
      if (chatId != null && messageId != null) await edit(chatId, messageId, NOT_LINKED);
      return;
    }
    if (chatId == null || messageId == null) return void (await ack());

    const parts = data.split(":");
    const action = parts[1] ?? "";
    const showSummary = async (scope: Scope, days: number, note?: string) => {
      const v = summaryView(user, scope, days, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showList = async (scope: Scope, page = 0) => {
      const v = listView(user, scope, page);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showCard = async (a: Account, scope: Scope, days: number, src: Src, note?: string) => {
      const v = channelCard(user, a, scope, days, src, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showHome = async () => {
      const v = homeView(user);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showSettings = async (note?: string) => {
      const v = settingsView(user, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showHelp = async () => {
      const v = helpView();
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showCircles = async (note?: string) => {
      const v = circlesView(user, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };

    try {
      if (action === "noop") return void (await ack());

      if (action === "home") {
        await ack();
        return void (await showHome());
      }

      if (action === "help") {
        await ack();
        return void (await showHelp());
      }

      if (action === "circles") {
        await ack();
        return void (await showCircles());
      }

      if (action === "settings") {
        await ack();
        return void (await showSettings());
      }

      if (action === "pref") {
        const key = parts[2] as keyof typeof PREF_LABELS;
        if (!Object.prototype.hasOwnProperty.call(PREF_LABELS, key)) return void (await ack());
        const prefs = db.getTelegramPreferences(user.id);
        db.updateTelegramPreferences(user.id, { ...prefs, [key]: !prefs[key] });
        await ack("Сохранено");
        return void (await showSettings("Сохранено."));
      }

      if (action === "digest") {
        const prefs = db.getTelegramPreferences(user.id);
        const next = prefs.statsDigest === "weekly" ? "daily" : prefs.statsDigest === "daily" ? "off" : "weekly";
        db.updateTelegramPreferences(user.id, { ...prefs, statsDigest: next });
        await ack("Сохранено");
        return void (await showSettings("Дайджест обновлён."));
      }

      if (action === "sum") {
        await ack();
        return void (await showSummary(normScope(user, parts[2]), clampDays(parts[3])));
      }

      if (action === "list") {
        await ack();
        return void (await showList(normScope(user, parts[2]), Number(parts[3]) || 0));
      }

      if (action === "ch") {
        const scope = normScope(user, parts[3]);
        const a = visibleAccounts(user, scope).find((x) => x.id === Number(parts[2]));
        if (!a) {
          await ack("Канал недоступен", true);
          return void (await showList(scope, 0));
        }
        await ack();
        return void (await showCard(a, scope, clampDays(parts[4]), parseSrc(parts[5])));
      }

      if (action === "rf") {
        const scope = normScope(user, parts[3]);
        const days = clampDays(parts[4]);
        const src = parseSrc(parts[5]);
        const a = visibleAccounts(user, scope).find((x) => x.id === Number(parts[2]));
        if (!a) {
          await ack("Канал недоступен", true);
          return void (await showList(scope, 0));
        }
        await ack("Обновляю…");
        const note = await refreshOne(a);
        const fresh = db.getAccount(a.id) ?? a; // re-read: a refresh may update title/avatar
        return void (await showCard(fresh, scope, days, src, note));
      }

      if (action === "rfall") {
        const scope = normScope(user, parts[2]);
        const days = clampDays(parts[3]);
        const targets = visibleAccounts(user, scope).filter((a) => a.status === "connected");
        await ack(targets.length ? `Обновляю ${targets.length}…` : "Нет подключённых каналов");
        if (targets.length) {
          const failed = (await Promise.all(targets.map(refreshOne))).filter(Boolean).length;
          await showSummary(scope, days, `✅ Обновлено: ${targets.length - failed}/${targets.length} · только что`);
        }
        return;
      }

      await ack();
    } catch {
      await ack("Ошибка, попробуйте ещё раз", true);
    }
  }

  return { entry, callback };
}
