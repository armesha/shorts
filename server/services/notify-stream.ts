// The SSE notification hub, moved VERBATIM from index.ts. HAZARD: the `notificationStreams` Set MUST be
// a SINGLE instance — index.ts builds ONE notifier via makeNotifier(db) and passes its emit/notify fns
// to BOTH the notification routes (which add/remove stream clients) AND statsRefreshHooks AND admin
// routes (adminSendNotification emits). NEVER `new Set()` in two places.
import type { Db, Account } from "../db.ts";
import { errorText, extractGoogleApiUrl, extractGoogleProjectId } from "./youtube-errors.ts";

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
}

export function makeNotifier(db: Db): Notifier {
  const notificationStreams = new Set<NotificationStreamClient>();

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

  return {
    notificationStreams,
    writeNotificationEvent,
    emitNotificationChange,
    notifyYouTubeAnalyticsIssue,
    notifyStatsRefreshIssue,
  };
}
