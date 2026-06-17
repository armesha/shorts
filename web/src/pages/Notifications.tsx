import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { apiClient, type AdminUser, type NotificationItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import {
  compactNotificationText,
  formatNotificationTime,
  groupNotifications,
  notificationSeverityClass,
  notificationSeverityText,
  type NotificationGroup,
} from "../lib/notificationGroups";

type Scope = "mine" | "all";
type Status = "open" | "unread" | "all";

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === "admin";
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState<Status>("open");
  const [userFilter, setUserFilter] = useState("all");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const groups = groupNotifications(items);

  const effectiveScope = isAdmin ? scope : "mine";

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent("notifications:changed"));
  }

  function load() {
    setLoading(true);
    setError("");
    apiClient
      .notifications({
        scope: effectiveScope,
        status,
        userId: effectiveScope === "all" && userFilter !== "all" ? userFilter : undefined,
        limit: 100,
      })
      .then(async (next) => {
        setItems(next);
        const unreadIds = next.filter((n) => !n.readAt).map((n) => n.id);
        // Seeing your own notification is enough to mark it read. Admin "all users" view must not
        // clear other users' unread state.
        if (effectiveScope === "mine" && unreadIds.length) {
          await Promise.all(unreadIds.map((id) => apiClient.readNotification(id).catch(() => null)));
          notifyChanged();
          if (status === "unread") setItems([]);
          else {
            const readAt = new Date().toISOString();
            setItems((cur) => cur.map((n) => (unreadIds.includes(n.id) ? { ...n, readAt } : n)));
          }
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // effectiveScope/status/userFilter are the real query dimensions; user role only gates the scope selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope, status, userFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    apiClient.adminUsers().then(setUsers).catch(() => setUsers([]));
  }, [isAdmin]);

  async function deleteGroup(group: NotificationGroup) {
    await Promise.all(group.ids.map((id) => apiClient.deleteNotification(id).catch(() => null)));
    notifyChanged();
    load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t("notifications.title")}</h1>
          <p className="text-base-content/60">{t("notifications.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm gap-1" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {t("common.refresh")}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 flex-wrap">
        {isAdmin && (
          <div className="join">
            <button
              className={`btn btn-sm join-item ${scope === "mine" ? "btn-primary" : "btn-outline"}`}
              onClick={() => {
                setScope("mine");
                setUserFilter("all");
              }}
            >
              {t("notifications.scopeMine")}
            </button>
            <button
              className={`btn btn-sm join-item ${scope === "all" ? "btn-primary" : "btn-outline"}`}
              onClick={() => setScope("all")}
            >
              {t("notifications.scopeAll")}
            </button>
          </div>
        )}
        <select
          className="select select-bordered select-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          aria-label={t("notifications.status")}
        >
          <option value="open">{t("notifications.open")}</option>
          <option value="unread">{t("notifications.unread")}</option>
          <option value="all">{t("notifications.all")}</option>
        </select>
        {isAdmin && scope === "all" && (
          <select
            className="select select-bordered select-sm min-w-44"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            aria-label={t("notifications.userFilter")}
          >
            <option value="all">{t("notifications.scopeAll")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} · {u.role === "admin" ? t("common.admin") : t("common.user")}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <AlertTriangle size={18} />
          <span>{t("notifications.loadFailed")} {error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <AppIcon name="notifications" className="text-base-content/30" size={40} />
            <p className="text-base-content/60">{t("notifications.empty")}</p>
          </div>
        </div>
      ) : (
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          {groups.map((group) => (
            <article
              key={group.key}
              className={`card bg-base-100 border ${group.unread ? "border-primary/60" : "border-base-300"}`}
            >
              <div className="card-body gap-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-sm ${notificationSeverityClass(group.severity)}`}>{notificationSeverityText(group.severity, t)}</span>
                      {group.unread ? (
                        <span className="badge badge-sm badge-primary">{t("notifications.newBadge")}</span>
                      ) : null}
                      {group.items.length > 1 && (
                        <span className="badge badge-sm badge-outline">{t("notifications.grouped", { n: group.items.length })}</span>
                      )}
                      {group.count > group.items.length && (
                        <span className="badge badge-sm badge-outline">{t("notifications.count", { n: group.count })}</span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold leading-tight">{group.title}</h2>
                    <div className="text-xs text-base-content/50 flex items-center gap-2 flex-wrap">
                      <span>{t("notifications.lastSeen")}: {formatNotificationTime(group.lastSeenAt, true)}</span>
                      {group.firstSeenAt !== group.lastSeenAt && (
                        <span>{t("notifications.firstSeen")}: {formatNotificationTime(group.firstSeenAt, true)}</span>
                      )}
                      {effectiveScope === "all" && group.userLabels.length > 0 && (
                        <span>{t("notifications.users")}: {group.userLabels.slice(0, 5).join(", ")}</span>
                      )}
                      {group.accountLabels.length > 0 && (
                        <span>{t("notifications.channels")}: {group.accountLabels.slice(0, 8).join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-ghost btn-sm text-error gap-1" onClick={() => deleteGroup(group)}>
                      <Trash2 size={14} /> {t("notifications.delete")}
                    </button>
                  </div>
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{compactNotificationText(group.message, 260)}</p>

                {group.accountLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {group.items.slice(0, 10).map((n) =>
                      n.accountId != null ? (
                        <Link key={n.id} to={`/accounts/${n.accountId}`} className="badge badge-ghost badge-sm max-w-full truncate">
                          {n.accountName || `#${n.accountId}`}
                        </Link>
                      ) : null,
                    )}
                    {group.accountLabels.length > 10 && (
                      <span className="badge badge-outline badge-sm">
                        {t("notifications.more", { n: group.accountLabels.length - 10 })}
                      </span>
                    )}
                  </div>
                )}

                {group.solution && (
                  <div className="rounded-md border border-base-300 bg-base-200/50 p-3 text-sm">
                    <div className="font-medium mb-1">{t("notifications.solution")}</div>
                    <div className="whitespace-pre-wrap break-words">{group.solution}</div>
                    {group.actionUrl && (
                      <a
                        className="btn btn-outline btn-sm gap-1 mt-3"
                        href={group.actionUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} /> {t("notifications.openFix")}
                      </a>
                    )}
                  </div>
                )}

                {group.contextLabels.length > 0 && (
                  <div className="text-xs text-base-content/40">
                    {t("notifications.context")}: {group.contextLabels.slice(0, 3).join(" · ")}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
