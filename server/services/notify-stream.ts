// The SSE notification hub, moved VERBATIM from index.ts. HAZARD: the `notificationStreams` Set MUST be
// a SINGLE instance — index.ts builds ONE notifier via makeNotifier(db) and passes its emit/notify fns
// to BOTH the notification routes (which add/remove stream clients) AND statsRefreshHooks AND admin
// routes (adminSendNotification emits). NEVER `new Set()` in two places.
import type { Db, Account } from "../db.ts";
import { errorText, extractGoogleApiUrl, extractGoogleProjectId } from "./youtube-errors.ts";
import { sendBotMessage } from "../telegram.ts";

export type NotificationStreamClient = {
  userId: number;
  scopeAll: boolean;
  write: (chunk: string) => void;
};

export interface Notifier {
  notificationStreams: Set<NotificationStreamClient>;
  writeNotificationEvent: (client: NotificationStreamClient, event: string, data: unknown) => void;
  emitNotificationChange: (userId?: number | null) => void;
  notifyYouTubeAnalyticsIssue: (account: Account, err: unknown, analyticsError: string) => void;
  notifyStatsRefreshIssue: (account: Account, err: unknown, message: string) => void;
  /** Channel's YouTube token just died (must reconnect): post an inbox alert + DM the owner on Telegram. */
  notifyChannelDisconnected: (account: Account, reason: string) => Promise<void>;
}

export function makeNotifier(db: Db, opts: { botToken?: () => string } = {}): Notifier {
  const notificationStreams = new Set<NotificationStreamClient>();
  // Same source as telegram-routes: the bot token from env (overridable for tests).
  const botToken = opts.botToken ?? (() => (process.env.TELEGRAM_BOT_TOKEN || "").trim());

  function writeNotificationEvent(client: NotificationStreamClient, event: string, data: unknown) {
    try {
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      notificationStreams.delete(client);
    }
  }

  function emitNotificationChange(userId?: number | null) {
    const data = { userId: userId ?? null, at: new Date().toISOString() };
    for (const client of notificationStreams) {
      if (userId == null || client.scopeAll || client.userId === userId) {
        writeNotificationEvent(client, "notifications", data);
      }
    }
  }

  function notifyYouTubeAnalyticsIssue(account: Account, err: unknown, analyticsError: string) {
    if (account.userId == null) return;
    const raw = `${analyticsError}\n${errorText(err)}`;
    const disabled = /SERVICE_DISABLED|accessNotConfigured|has not been used|not enabled|disabled/i.test(raw);
    const projectId = extractGoogleProjectId(raw);
    const actionUrl =
      extractGoogleApiUrl(raw) ??
      (projectId
        ? `https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=${projectId}`
        : null);
    const channelName = account.ytChannelTitle || account.channelName || `#${account.id}`;
    const notification = db.upsertNotification({
      userId: account.userId,
      accountId: account.id,
      severity: "error",
      category: "youtube_analytics",
      title: disabled ? "YouTube Analytics API выключен" : "Проблема YouTube Analytics",
      message: `Канал «${channelName}»: ${analyticsError}`,
      solution: disabled
        ? "Откройте Google Cloud Console → APIs & Services → Library → YouTube Analytics API → Enable. Если API только что включили, подождите несколько минут и снова нажмите «Обновить статистику»."
        : "Проверьте Google-ключ владельца канала, доступы OAuth и подключение канала. После исправления нажмите «Обновить статистику» ещё раз.",
      actionUrl,
      dedupeKey: disabled
        ? `youtube-analytics-disabled:account=${account.id}:project=${projectId ?? "unknown"}`
        : `youtube-analytics-error:account=${account.id}:${analyticsError.slice(0, 120)}`,
      source: "server",
      context: `analytics refresh account=${account.id}`,
    });
    emitNotificationChange(notification.userId);
  }

  function notifyStatsRefreshIssue(account: Account, err: unknown, message: string) {
    if (account.userId == null) return;
    const channelName = account.ytChannelTitle || account.channelName || `#${account.id}`;
    const notification = db.upsertNotification({
      userId: account.userId,
      accountId: account.id,
      severity: "error",
      category: "youtube_stats",
      title: "Статистика YouTube не обновилась",
      message: `Канал «${channelName}»: ${message}`,
      solution:
        "Проверьте, что канал подключён к YouTube, Google-ключ владельца загружен в «Настройках», а в Google Cloud включён YouTube Data API v3. Потом обновите статистику снова.",
      actionUrl: null,
      dedupeKey: `youtube-stats-error:account=${account.id}:${message.slice(0, 120)}`,
      source: "server",
      context: `stats refresh account=${account.id}`,
    });
    emitNotificationChange(notification.userId);
  }

  // A channel's YouTube token was definitively rejected (revoked/expired) → it needs reconnecting.
  // Call ONLY on the healthy→broken edge (markAuthError returns that) so the owner is alerted once per
  // episode. Posts an in-app inbox notification (synchronously) and, if the owner linked Telegram, DMs
  // them via the bot (best-effort). The dashboard write happens before the first await, so even a
  // fire-and-forget caller (`void notifier.notifyChannelDisconnected(...)`) always gets the inbox alert.
  async function notifyChannelDisconnected(account: Account, reason: string): Promise<void> {
    if (account.userId == null) return;
    const channelName = account.ytChannelTitle || account.channelName || `#${account.id}`;
    const actionUrl = `/accounts/${account.id}`;
    const notification = db.upsertNotification({
      userId: account.userId,
      accountId: account.id,
      severity: "error",
      category: "youtube_auth",
      title: "Канал отвязался — нужно переподключить",
      message: `Канал «${channelName}»: ${reason}`,
      solution:
        "Откройте канал и нажмите «Переподключить», заново выдав доступ к YouTube. После этого автопостинг возобновится сам.",
      actionUrl,
      // One row per channel — re-disconnects after a reconnect reuse it (count bumps, gets un-resolved).
      dedupeKey: `youtube-auth-disconnected:account=${account.id}`,
      source: "server",
      context: `channel disconnected account=${account.id}`,
    });
    emitNotificationChange(notification.userId);

    // Telegram DM — only if the bot is configured AND the owner linked their Telegram. Best-effort.
    const token = botToken();
    if (!token) return;
    const owner = db.getUserById(account.userId);
    if (!owner?.telegramId) return;
    const base = (process.env.PUBLIC_BASE_URL || "https://shareboard.live").trim().replace(/\/+$/, "");
    const text =
      `⚠️ Канал отвязался — нужно переподключить\n\n` +
      `Канал: «${channelName}»\n` +
      `Причина: ${reason}\n\n` +
      `Откройте канал и нажмите «Переподключить»:\n` +
      `${base}${actionUrl}`;
    try {
      await sendBotMessage(token, owner.telegramId, text);
    } catch {
      /* best-effort — the in-app notification already covers it */
    }
  }

  return {
    notificationStreams,
    writeNotificationEvent,
    emitNotificationChange,
    notifyYouTubeAnalyticsIssue,
    notifyStatsRefreshIssue,
    notifyChannelDisconnected,
  };
}
