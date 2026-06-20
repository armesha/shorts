// In-bot channel statistics for @shotsrecoverybot. The bot is already account-linked via
// users.telegram_id, so a Telegram user maps to an app user (admin or not). This mirrors the website's
// Statistics tab: a linked user sees + refreshes THEIR OWN channels; an admin additionally gets an
// «Все каналы» toggle to view + refresh everyone's. Navigation is inline keyboards edited in place
// (no chat spam); one button refreshes BOTH YouTube Data totals and the YouTube Analytics bundle via
// the shared refreshAccountStats() — same 15-min/6-h TTL cache as the web, so it stays light.
import type { Db, Account, UserAuth } from "./db.ts";
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
} from "./telegram.ts";

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

const PAGE_SIZE = 8;
const PERIODS = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;
const REFRESH_DAYS = 90; // refresh always pulls the WIDE 90-day analytics window (matches the route)

const NOT_LINKED =
  "Этот Telegram не привязан к аккаунту Shorts Factory.\n\n" +
  "Войдите на сайте паролем и привяжите Telegram в Настройках — после этого здесь появится статистика ваших каналов.";

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

export function makeBotStats(deps: BotStatsDeps) {
  const { db, botToken, accountCreds, redirectUri, analyticsRange, summarizeStored, formatStatsError, refreshHooks } = deps;

  // Access mirror of the website's visibleAccounts(): «all» is admin-only; everyone else sees own.
  const visibleAccounts = (user: UserAuth, scope: Scope): Account[] =>
    scope === "all" && user.role === "admin" ? db.listAccounts() : db.listAccountsByUser(user.id);
  const normScope = (user: UserAuth, raw: string | undefined): Scope =>
    raw === "all" && user.role === "admin" ? "all" : "mine";

  const send = (chatId: number, text: string, keyboard?: InlineKeyboard) =>
    sendBotMessage(botToken(), chatId, text, { parseMode: "HTML", replyMarkup: keyboard });
  const edit = (chatId: number, messageId: number, text: string, keyboard?: InlineKeyboard) =>
    editMessageText(botToken(), chatId, messageId, text, { parseMode: "HTML", replyMarkup: keyboard });

  function listView(user: UserAuth, scope: Scope, page: number, note?: string): { text: string; keyboard: InlineKeyboard } {
    const accounts = visibleAccounts(user, scope);
    const isAdmin = user.role === "admin";
    const scopeLabel = scope === "all" ? "Все каналы" : "Мои каналы";
    const rows: InlineKeyboardButton[][] = [];
    let text: string;

    if (accounts.length === 0) {
      text = `${bold("📊 Статистика каналов")}\nРежим: ${esc(scopeLabel)}\n\nНет каналов для показа.`;
    } else {
      const pages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
      const p = Math.min(Math.max(0, page), pages - 1);
      const slice = accounts.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
      text =
        `${bold("📊 Статистика каналов")}\n` +
        `Режим: ${esc(scopeLabel)} · каналов: ${accounts.length}${pages > 1 ? ` · стр. ${p + 1}/${pages}` : ""}\n\n` +
        `Выберите канал:`;
      for (const a of slice) {
        const name = a.ytChannelTitle || a.channelName || `#${a.id}`;
        const icon = a.status === "connected" ? "📺" : "🚫";
        rows.push([{ text: truncBtn(`${icon} ${name}`), callback_data: `s:ch:${a.id}:${scope}:${DEFAULT_DAYS}` }]);
      }
      if (pages > 1) {
        const nav: InlineKeyboardButton[] = [];
        if (p > 0) nav.push({ text: "◀", callback_data: `s:list:${scope}:${p - 1}` });
        nav.push({ text: `${p + 1}/${pages}`, callback_data: "s:noop" });
        if (p < pages - 1) nav.push({ text: "▶", callback_data: `s:list:${scope}:${p + 1}` });
        rows.push(nav);
      }
    }

    if (note) text += `\n\n${esc(note)}`;

    const controls: InlineKeyboardButton[] = [];
    if (accounts.some((a) => a.status === "connected"))
      controls.push({ text: "🔄 Обновить все", callback_data: `s:rfall:${scope}:${page}` });
    if (isAdmin)
      controls.push({
        text: scope === "all" ? "👤 Мои каналы" : "🌐 Все каналы",
        callback_data: `s:list:${scope === "all" ? "mine" : "all"}:0`,
      });
    if (controls.length) rows.push(controls);

    return { text, keyboard: { inline_keyboard: rows } };
  }

  function cardKeyboard(a: Account, scope: Scope, days: number, canRefresh: boolean): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [];
    if (canRefresh) rows.push([{ text: "🔄 Обновить (data + analytics)", callback_data: `s:rf:${a.id}:${scope}:${days}` }]);
    rows.push(PERIODS.map((p) => ({ text: p === days ? `• ${p} дн` : `${p} дн`, callback_data: `s:ch:${a.id}:${scope}:${p}` })));
    rows.push([{ text: "◀ К списку", callback_data: `s:list:${scope}:0` }]);
    return { inline_keyboard: rows };
  }

  function channelCard(user: UserAuth, a: Account, scope: Scope, days: number, note?: string): { text: string; keyboard: InlineKeyboard } {
    const name = a.ytChannelTitle || a.channelName || `#${a.id}`;
    const lines: string[] = [`📺 ${bold(name)}`];

    if (scope === "all" && user.role === "admin" && a.userId != null) {
      const owner = db.getUserById(a.userId);
      if (owner) lines.push(`👤 ${esc(owner.username)}`);
    }
    if (note) lines.push(`\n⚠️ ${esc(note)}`);

    if (a.status !== "connected") {
      lines.push(`\n🚫 Канал не подключён к YouTube.`);
      return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, false) };
    }

    const { latest, prev } = db.twoLatestSnapshots(a.id);
    if (!latest) {
      lines.push(`\nНет данных. Нажмите «🔄 Обновить».`);
      return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, true) };
    }

    // --- Data (YouTube Data API totals + delta vs previous snapshot) ---
    lines.push("", bold("📊 Данные (YouTube)"));
    lines.push(`Подписчики: ${intFmt(latest.subscribers)}${deltaFmt(prev ? latest.subscribers - prev.subscribers : 0)}`);
    lines.push(`Просмотры: ${intFmt(latest.views)}${deltaFmt(prev ? latest.views - prev.views : 0)}`);
    lines.push(`Видео: ${intFmt(latest.videos)}${deltaFmt(prev ? latest.videos - prev.videos : 0)}`);

    // --- Analytics (YouTube Analytics API, summarized over the chosen period from stored daily rows) ---
    const range = analyticsRange(days);
    const sum = summarizeStored(a.id, range.from, range.to);
    lines.push("", bold(`📈 Аналитика · ${days} дн`));
    if (latest.analyticsStatus === "error") {
      lines.push(`⚠️ ${esc(latest.analyticsError || "ошибка аналитики")}`);
    } else if (!sum.views && !sum.watchMinutes) {
      lines.push("Пока нет данных аналитики за период.");
    } else {
      const net = sum.subscribersGained - sum.subscribersLost;
      const netStr = net ? ` (${net > 0 ? "+" : "−"}${intFmt(Math.abs(net))})` : "";
      lines.push(`Просмотры: ${intFmt(sum.views)}`);
      lines.push(`Время просмотра: ${watchTimeFmt(sum.watchMinutes)}`);
      lines.push(`Ср. просмотр: ${durationFmt(sum.avgViewDuration)} (${Math.round(sum.avgViewPercentage || 0)}%)`);
      lines.push(`Лайки · комменты · репосты: ${intFmt(sum.likes)} · ${intFmt(sum.comments)} · ${intFmt(sum.shares)}`);
      lines.push(`Подписки: +${intFmt(sum.subscribersGained)} / −${intFmt(sum.subscribersLost)}${netStr}`);
    }

    // --- Freshness ---
    lines.push("", `🕒 Данные: ${relTime(latest.takenAt)}`);
    if (latest.analyticsStatus && latest.analyticsStatus !== "error") {
      lines.push(`📈 Аналитика: ${relTime(latest.analyticsTakenAt)}${latest.dataThrough ? ` · по ${ruDate(latest.dataThrough)}` : ""}`);
    }

    return { text: lines.join("\n"), keyboard: cardKeyboard(a, scope, days, true) };
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

  // ---- /stats or /start (no token): open the menu on the user's OWN channels ----
  async function entry(msg: BotMessage): Promise<void> {
    const chatId = msg.chat?.id;
    if (chatId == null) return;
    const tgId = msg.from?.id != null ? String(msg.from.id) : "";
    const user = tgId ? db.getUserByTelegramId(tgId) : null;
    if (!user) {
      await send(chatId, NOT_LINKED);
      return;
    }
    const v = listView(user, "mine", 0);
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
    const showList = async (scope: Scope, page = 0, note?: string) => {
      const v = listView(user, scope, page, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };
    const showCard = async (a: Account, scope: Scope, days: number, note?: string) => {
      const v = channelCard(user, a, scope, days, note);
      await edit(chatId, messageId, v.text, v.keyboard);
    };

    try {
      if (action === "noop") return void (await ack());

      if (action === "home") {
        await ack();
        return void (await showList("mine", 0));
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
        return void (await showCard(a, scope, clampDays(parts[4])));
      }

      if (action === "rf") {
        const scope = normScope(user, parts[3]);
        const days = clampDays(parts[4]);
        const a = visibleAccounts(user, scope).find((x) => x.id === Number(parts[2]));
        if (!a) {
          await ack("Канал недоступен", true);
          return void (await showList(scope, 0));
        }
        await ack("Обновляю…");
        const note = await refreshOne(a);
        const fresh = db.getAccount(a.id) ?? a; // re-read: a refresh may update title/avatar
        return void (await showCard(fresh, scope, days, note));
      }

      if (action === "rfall") {
        const scope = normScope(user, parts[2]);
        const page = Number(parts[3]) || 0;
        const targets = visibleAccounts(user, scope).filter((a) => a.status === "connected");
        await ack(targets.length ? `Обновляю ${targets.length}…` : "Нет подключённых каналов");
        if (targets.length) {
          const failed = (await Promise.all(targets.map(refreshOne))).filter(Boolean).length;
          await showList(scope, page, `✅ Обновлено: ${targets.length - failed}/${targets.length} · только что`);
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
