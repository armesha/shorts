import type { NotificationItem } from "./api";

export interface NotificationGroup {
  key: string;
  items: NotificationItem[];
  ids: number[];
  severity: string;
  category: string;
  title: string;
  message: string;
  solution: string | null;
  actionUrl: string | null;
  count: number;
  unread: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  accountLabels: string[];
  userLabels: string[];
  sourceLabels: string[];
  contextLabels: string[];
}

export function groupNotifications(items: NotificationItem[]): NotificationGroup[] {
  const map = new Map<string, NotificationGroup>();
  for (const item of items) {
    const message = normalizeNotificationMessage(item.message);
    const key = [
      item.severity,
      item.category,
      item.title,
      message,
      item.solution || "",
      item.actionUrl || "",
      item.source || "",
    ].join("\u001f");
    const existing = map.get(key);
    const account = item.accountName || (item.accountId != null ? `#${item.accountId}` : "");
    const username = item.username || (item.userId != null ? `#${item.userId}` : "");
    const source = item.source || "";
    const context = item.context || "";
    if (!existing) {
      map.set(key, {
        key,
        items: [item],
        ids: [item.id],
        severity: item.severity,
        category: item.category,
        title: item.title,
        message,
        solution: item.solution,
        actionUrl: item.actionUrl,
        count: Math.max(1, item.count || 1),
        unread: !item.readAt,
        firstSeenAt: item.firstSeenAt,
        lastSeenAt: item.lastSeenAt,
        accountLabels: account ? [account] : [],
        userLabels: username ? [username] : [],
        sourceLabels: source ? [source] : [],
        contextLabels: context ? [context] : [],
      });
      continue;
    }
    existing.items.push(item);
    existing.ids.push(item.id);
    existing.count += Math.max(1, item.count || 1);
    existing.unread ||= !item.readAt;
    if (timeValue(item.firstSeenAt) < timeValue(existing.firstSeenAt)) existing.firstSeenAt = item.firstSeenAt;
    if (timeValue(item.lastSeenAt) > timeValue(existing.lastSeenAt)) existing.lastSeenAt = item.lastSeenAt;
    pushUnique(existing.accountLabels, account);
    pushUnique(existing.userLabels, username);
    pushUnique(existing.sourceLabels, source);
    pushUnique(existing.contextLabels, context);
  }
  return [...map.values()].sort((a, b) => timeValue(b.lastSeenAt) - timeValue(a.lastSeenAt));
}

export function notificationSeverityClass(severity: string): string {
  if (severity === "error") return "badge-error";
  if (severity === "warning") return "badge-warning";
  return "badge-info";
}

export function notificationSeverityText(severity: string, t: (key: string) => string): string {
  if (severity === "error") return t("notifications.severityError");
  if (severity === "warning") return t("notifications.severityWarning");
  return t("notifications.severityInfo");
}

export function formatNotificationTime(iso: string, detailed = false): string {
  return new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    ...(detailed ? { year: "numeric" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function compactNotificationText(text: string, max = 170): string {
  const first = text
    .replace(/\s+/g, " ")
    .replace(/\s+Откройте .+$/i, "")
    .replace(/\s+Open .+$/i, "")
    .trim();
  if (first.length <= max) return first;
  return `${first.slice(0, max - 1).trimEnd()}…`;
}

function normalizeNotificationMessage(message: string): string {
  return message
    .replace(/^Канал\s+[«"][^»"]+[»"]:\s*/i, "")
    .replace(/^Channel\s+[«"“][^»"”]+[»"”]:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUnique(target: string[], value: string) {
  if (value && !target.includes(value)) target.push(value);
}

function timeValue(iso: string): number {
  return Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`) || 0;
}
