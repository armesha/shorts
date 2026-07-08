import cron from "node-cron";
import type { Db, TelegramDigestFrequency, UserAuth } from "../db.ts";
import { sendBotMessage } from "../telegram.ts";
import { addDays } from "./analytics-range.ts";
import { normalizeTimeZone } from "./timezone.ts";
import { buildUserAnalytics } from "./user-analytics.ts";

export const DEFAULT_TELEGRAM_DIGEST_TIME = "09:00";
export const DEFAULT_TELEGRAM_DIGEST_CRON = "*/15 * * * *";

type SendResult = { ok: boolean; error?: string; messageId?: number };
type SendMessage = (chatId: string | number, text: string) => Promise<SendResult>;

export interface TelegramDigestPeriod {
  frequency: Exclude<TelegramDigestFrequency, "off">;
  from: string;
  to: string;
  key: string;
  label: string;
  localDay: string;
  localTime: string;
  timeZone: string;
}

export interface TelegramDigestCycleResult {
  userId: number;
  username: string;
  frequency: Exclude<TelegramDigestFrequency, "off">;
  periodKey: string;
  sent: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramDigestScheduler {
  stop: () => void;
}

export interface TelegramDigestOptions {
  db: Db;
  botToken?: () => string;
  sendMessage?: SendMessage;
  now?: () => Date;
  sendTime?: string;
  cronExpression?: string;
  baseUrl?: () => string;
  log?: (message: string) => void;
}

function normalizeDigestTime(raw: string | undefined): string {
  const value = String(raw ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : DEFAULT_TELEGRAM_DIGEST_TIME;
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function localDigestParts(now: Date, rawTimeZone: unknown): {
  day: string;
  hhmm: string;
  weekday: string;
  timeZone: string;
} {
  const timeZone = normalizeTimeZone(rawTimeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = getPart(parts, "hour") === "24" ? "00" : getPart(parts, "hour").padStart(2, "0");
  const minute = getPart(parts, "minute").padStart(2, "0");
  return {
    day: `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`,
    hhmm: `${hour}:${minute}`,
    weekday: getPart(parts, "weekday"),
    timeZone,
  };
}

export function telegramDigestPeriod(
  frequency: TelegramDigestFrequency,
  now: Date,
  rawTimeZone: unknown,
  rawSendTime = DEFAULT_TELEGRAM_DIGEST_TIME,
): TelegramDigestPeriod | null {
  if (frequency === "off") return null;
  const sendTime = normalizeDigestTime(rawSendTime);
  const local = localDigestParts(now, rawTimeZone);
  if (local.hhmm < sendTime) return null;

  if (frequency === "daily") {
    const to = addDays(local.day, -1);
    return {
      frequency,
      from: to,
      to,
      key: `daily:${to}`,
      label: ruPeriodLabel(to, to),
      localDay: local.day,
      localTime: local.hhmm,
      timeZone: local.timeZone,
    };
  }

  if (local.weekday !== "Mon") return null;
  const to = addDays(local.day, -1);
  const from = addDays(local.day, -7);
  return {
    frequency,
    from,
    to,
    key: `weekly:${from}:${to}`,
    label: ruPeriodLabel(from, to),
    localDay: local.day,
    localTime: local.hhmm,
    timeZone: local.timeZone,
  };
}

export function telegramDigestSentSettingKey(userId: number, frequency: Exclude<TelegramDigestFrequency, "off">): string {
  return `telegramDigest.sent.${frequency}.user.${userId}`;
}

function fmt(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("ru-RU");
}

function signed(n: number): string {
  const value = Math.round(Number(n) || 0);
  return value > 0 ? `+${fmt(value)}` : fmt(value);
}

function ruDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return y && m && d ? `${d}.${m}.${y}` : ymd;
}

function ruPeriodLabel(from: string, to: string): string {
  return from === to ? ruDate(to) : `${ruDate(from)} - ${ruDate(to)}`;
}

function baseUrl(opts?: TelegramDigestOptions): string {
  return (opts?.baseUrl?.() || process.env.PUBLIC_BASE_URL || "https://shareboard.live").trim().replace(/\/+$/, "");
}

function userChannelTotals(db: Db, userId: number): {
  channels: number;
  connected: number;
  subscribers: number;
  views: number;
  videos: number;
} {
  const accounts = db.listAccountsByUser(userId);
  let subscribers = 0;
  let views = 0;
  let videos = 0;
  for (const account of accounts) {
    const snapshot = db.latestSnapshot(account.id);
    if (!snapshot) continue;
    subscribers += snapshot.subscribers;
    views += snapshot.views;
    videos += snapshot.videos;
  }
  return {
    channels: accounts.length,
    connected: accounts.filter((account) => account.status === "connected").length,
    subscribers,
    views,
    videos,
  };
}

export function buildTelegramDigestText(db: Db, user: UserAuth, period: TelegramDigestPeriod, opts?: TelegramDigestOptions): string {
  const data = buildUserAnalytics(db, user.id, { from: period.from, to: period.to });
  const summary = data.summary;
  const totals = userChannelTotals(db, user.id);
  const hasAnalyticsRows = data.youtubeDaily.length > 0;
  const title = period.frequency === "daily" ? "Ежедневный дайджест" : "Еженедельный дайджест";
  const url = `${baseUrl(opts)}/statistics`;

  const lines = [
    `📈 ${title} Shorts Factory`,
    `Аккаунт: ${user.username}`,
    `Период: ${period.label}`,
    "",
    `Каналы: ${fmt(totals.channels)} · подключено: ${fmt(totals.connected)}`,
    `Публикации: ${fmt(summary.published)} опубликовано · ${fmt(summary.scheduled)} запланировано · ${fmt(summary.failed)} ошибок`,
    `Библиотека: ${fmt(summary.queuedVideos)} готовых видео`,
    "",
  ];

  if (hasAnalyticsRows) {
    lines.push(
      `YouTube за период: ${fmt(summary.views)} просмотров · ${fmt(summary.engagedViews)} вовлечённых`,
      `Подписчики за период: ${signed(summary.subscribersGained - summary.subscribersLost)} · лайки: ${fmt(summary.likes)} · комментарии: ${fmt(summary.comments)} · шеры: ${fmt(summary.shares)}`,
    );
    if (summary.dataThrough) lines.push(`Данные Analytics по: ${ruDate(summary.dataThrough)}`);
  } else {
    lines.push("YouTube Analytics: данных за период пока нет.");
  }

  lines.push(
    "",
    `Текущие итоги: ${fmt(totals.subscribers)} подписчиков · ${fmt(totals.views)} просмотров · ${fmt(totals.videos)} видео`,
    `Открыть статистику: ${url}`,
  );

  return lines.join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function runTelegramDigestCycle(opts: TelegramDigestOptions): Promise<TelegramDigestCycleResult[]> {
  const now = opts.now?.() ?? new Date();
  const token = (opts.botToken?.() ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token && !opts.sendMessage) return [];
  const send = opts.sendMessage ?? ((chatId: string | number, text: string) => sendBotMessage(token, chatId, text));
  const sendTime = normalizeDigestTime(opts.sendTime ?? process.env.TELEGRAM_DIGEST_TIME);
  const results: TelegramDigestCycleResult[] = [];

  for (const user of opts.db.listUsers()) {
    if (!user.telegramId) continue;
    const prefs = opts.db.getTelegramPreferences(user.id);
    const period = telegramDigestPeriod(prefs.statsDigest, now, user.timezone, sendTime);
    if (!period) continue;

    const settingKey = telegramDigestSentSettingKey(user.id, period.frequency);
    if (opts.db.getSetting(settingKey) === period.key) continue;

    try {
      const text = buildTelegramDigestText(opts.db, user, period, opts);
      const res = await send(user.telegramId, text);
      if (res.ok) {
        opts.db.setSetting(settingKey, period.key);
        opts.log?.(`[telegram-digest] sent ${period.frequency} to ${user.username} (${period.key})`);
        results.push({
          userId: user.id,
          username: user.username,
          frequency: period.frequency,
          periodKey: period.key,
          sent: true,
          messageId: res.messageId,
        });
      } else {
        const error = res.error || "Telegram sendMessage failed";
        opts.log?.(`[telegram-digest] failed ${period.frequency} to ${user.username}: ${error}`);
        results.push({ userId: user.id, username: user.username, frequency: period.frequency, periodKey: period.key, sent: false, error });
      }
    } catch (err) {
      const error = errorMessage(err);
      opts.log?.(`[telegram-digest] failed ${period.frequency} to ${user.username}: ${error}`);
      results.push({ userId: user.id, username: user.username, frequency: period.frequency, periodKey: period.key, sent: false, error });
    }
  }

  return results;
}

export function startTelegramDigestScheduler(opts: TelegramDigestOptions): TelegramDigestScheduler {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runTelegramDigestCycle(opts);
    } finally {
      running = false;
    }
  };
  const task = cron.schedule(opts.cronExpression ?? process.env.TELEGRAM_DIGEST_CRON ?? DEFAULT_TELEGRAM_DIGEST_CRON, () => {
    void run().catch((err) => opts.log?.(`[telegram-digest] cycle failed: ${errorMessage(err)}`));
  });
  void run().catch((err) => opts.log?.(`[telegram-digest] cycle failed: ${errorMessage(err)}`));
  return { stop: () => task.stop() };
}
