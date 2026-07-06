import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../AppIcon";
import { apiClient, type AuthUser, type NotificationItem } from "../../lib/api";
import {
  compactNotificationText,
  formatNotificationTime,
  groupNotifications,
  notificationSeverityClass,
  notificationSeverityText,
  type NotificationGroup,
} from "../../lib/notificationGroups";
import { isAdminRole } from "../../lib/authz";

export function NotificationDropdown({
  user,
  unread,
  bump,
  t,
}: {
  user: AuthUser;
  unread: number;
  bump: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const groups = groupNotifications(items);

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent("notifications:changed"));
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await apiClient.notifications({ scope: "mine", status: "open", limit: 40 });
      setItems(next);
      const unreadIds = next.filter((n) => !n.readAt).map((n) => n.id);
      if (unreadIds.length) {
        await Promise.all(unreadIds.map((id) => apiClient.readNotification(id).catch(() => null)));
        notifyChanged();
        const readAt = new Date().toISOString();
        setItems((cur) => cur.map((n) => (unreadIds.includes(n.id) ? { ...n, readAt } : n)));
      }
    } catch {
      setError(t("notifications.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteGroup(group: NotificationGroup) {
    await Promise.all(group.ids.map((id) => apiClient.deleteNotification(id).catch(() => null)));
    setItems((cur) => cur.filter((n) => !group.ids.includes(n.id)));
    notifyChanged();
  }

  async function markGroupUnread(group: NotificationGroup) {
    await Promise.all(group.ids.map((id) => apiClient.unreadNotification(id).catch(() => null)));
    setItems((cur) => cur.map((n) => (group.ids.includes(n.id) ? { ...n, readAt: null } : n)));
    notifyChanged();
  }

  function cancelClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function close() {
    cancelClose();
    if (detailsRef.current) detailsRef.current.open = false;
  }

  function openOnHover() {
    cancelClose();
    if (detailsRef.current && !detailsRef.current.open) {
      detailsRef.current.open = true;
      load();
    }
  }

  // Закрываем не сразу, а с небольшой задержкой, чтобы курсор успел
  // перейти с колокольчика на панель (иначе зазор между ними её гасит).
  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (detailsRef.current) detailsRef.current.open = false;
    }, 220);
  }

  useEffect(() => cancelClose, []);

  return (
    <details
      ref={detailsRef}
      className="notification-dropdown dropdown dropdown-end"
      data-no-route-transition
      onMouseEnter={openOnHover}
      onMouseLeave={scheduleClose}
      onToggle={(e) => {
        if (e.currentTarget.open) load();
      }}
    >
      <summary
        className={`notification-bell btn btn-sm btn-square relative admin-action-quiet ${unread > 0 ? "has-unread" : ""} ${bump ? "is-bumping" : ""}`}
        role="button"
        aria-haspopup="menu"
        aria-label={t("nav.notifications")}
        title={t("nav.notifications")}
      >
        <AppIcon name="notifications" size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 badge badge-xs badge-primary border-base-100">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </summary>

      <div className="notification-dropdown-panel dropdown-content mt-2">
        <div className="flex items-start justify-between gap-3 border-b border-base-300 px-3 py-2.5">
          <div>
            <div className="text-sm font-bold">{t("notifications.title")}</div>
            <div className="text-xs text-base-content/50">{t("notifications.dropdownSubtitle")}</div>
          </div>
          <button className="btn btn-ghost btn-xs btn-square" onClick={load} disabled={loading} aria-label={t("common.refresh")}>
            <AppIcon name="refresh" size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {isAdminRole(user) && (
          <Link to="/notifications" onClick={close} className="admin-inline-action mx-3 mt-2 inline-flex">
            {t("notifications.adminCenter")}
          </Link>
        )}

        <div className="max-h-[min(70vh,34rem)] overflow-y-auto px-2 py-2">
          {error && (
            <div className="alert alert-error py-2 text-xs">
              <AppIcon name="warning" size={14} />
              <span>{error}</span>
            </div>
          )}
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-base-content/50">
              <span className="loading loading-spinner loading-sm text-primary" />
            </div>
          ) : groups.length === 0 ? (
            <div className="py-9 text-center">
              <AppIcon name="notifications" className="mx-auto mb-2 text-base-content/25" size={28} />
              <div className="text-sm text-base-content/55">{t("notifications.empty")}</div>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map((group) => (
                <article key={group.key} className={`notification-mini-card ${group.unread ? "is-new" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`badge badge-xs ${notificationSeverityClass(group.severity)}`}>{notificationSeverityText(group.severity, t)}</span>
                        {group.unread && <span className="badge badge-primary badge-xs">{t("notifications.newBadge")}</span>}
                        {group.items.length > 1 && (
                          <span className="badge badge-outline badge-xs">
                            {t("notifications.grouped", { n: group.items.length })}
                          </span>
                        )}
                        {group.count > group.items.length && <span className="badge badge-outline badge-xs">x{group.count}</span>}
                      </div>
                      <div className="mt-1 text-sm font-semibold leading-snug break-words">{group.title}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-xs btn-square text-error shrink-0"
                      onClick={() => deleteGroup(group)}
                      title={t("notifications.delete")}
                      aria-label={t("notifications.delete")}
                    >
                      <AppIcon name="trash" size={13} />
                    </button>
                  </div>

                  <div className="notification-message-preview mt-1 text-xs leading-relaxed text-base-content/70">
                    {compactNotificationText(group.message, 110)}
                  </div>

                  {group.accountLabels.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {group.accountLabels.slice(0, 3).map((label) => (
                        <span key={label} className="badge badge-ghost badge-xs max-w-full truncate">
                          {label}
                        </span>
                      ))}
                      {group.accountLabels.length > 3 && (
                        <span className="badge badge-outline badge-xs">
                          {t("notifications.more", { n: group.accountLabels.length - 3 })}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-base-content/45">
                    <span>{formatNotificationTime(group.lastSeenAt)}</span>
                    <span className="truncate">
                      {group.items.length === 1 && group.items[0].accountId ? (
                        <Link to={`/accounts/${group.items[0].accountId}`} onClick={close} className="link">
                          {group.accountLabels[0] || `#${group.items[0].accountId}`}
                        </Link>
                      ) : group.sourceLabels.length ? (
                        group.sourceLabels[0]
                      ) : null}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    {group.actionUrl && (
                      <a className="admin-inline-action inline-flex text-xs" href={group.actionUrl} target="_blank" rel="noreferrer">
                        {t("notifications.howToFix")}
                      </a>
                    )}
                    {!group.unread && (
                      <button className="admin-inline-action inline-flex text-xs" onClick={() => markGroupUnread(group)}>
                        {t("notifications.markUnread")}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
