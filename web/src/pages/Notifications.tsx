import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { apiClient, type NotificationItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";

type Scope = "mine" | "all";
type Status = "open" | "unread" | "all";

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useT();
  const isAdmin = user?.role === "admin";
  const [scope, setScope] = useState<Scope>("mine");
  const [status, setStatus] = useState<Status>("open");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const effectiveScope = isAdmin ? scope : "mine";

  function notifyChanged() {
    window.dispatchEvent(new CustomEvent("notifications:changed"));
  }

  function load() {
    setLoading(true);
    setError("");
    apiClient
      .notifications({ scope: effectiveScope, status, limit: 100 })
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
    // effectiveScope/status are the real query dimensions; user role only gates the scope selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope, status]);

  async function deleteItem(id: number) {
    await apiClient.deleteNotification(id);
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
              onClick={() => setScope("mine")}
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
      ) : items.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <AppIcon name="notifications" className="text-base-content/30" size={40} />
            <p className="text-base-content/60">{t("notifications.empty")}</p>
          </div>
        </div>
      ) : (
        <div className={`space-y-3 ${loading ? "opacity-60" : ""}`}>
          {items.map((n) => (
            <article
              key={n.id}
              className={`card bg-base-100 border ${!n.readAt ? "border-primary/60" : "border-base-300"}`}
            >
              <div className="card-body gap-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-sm ${severityClass(n.severity)}`}>{severityText(n.severity, t)}</span>
                      {!n.readAt ? (
                        <span className="badge badge-sm badge-primary">{t("notifications.newBadge")}</span>
                      ) : null}
                      {n.count > 1 && (
                        <span className="badge badge-sm badge-outline">{t("notifications.count", { n: n.count })}</span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold leading-tight">{n.title}</h2>
                    <div className="text-xs text-base-content/50 flex items-center gap-2 flex-wrap">
                      <span>{t("notifications.lastSeen")}: {fmtTime(n.lastSeenAt)}</span>
                      {n.firstSeenAt !== n.lastSeenAt && (
                        <span>{t("notifications.firstSeen")}: {fmtTime(n.firstSeenAt)}</span>
                      )}
                      {effectiveScope === "all" && (
                        <span>{t("notifications.user")}: {n.username || `#${n.userId}`}</span>
                      )}
                      {n.accountId != null && (
                        <span>
                          {t("notifications.channel")}:{" "}
                          <Link to={`/accounts/${n.accountId}`} className="link">
                            {n.accountName || `#${n.accountId}`}
                          </Link>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn btn-ghost btn-sm text-error gap-1" onClick={() => deleteItem(n.id)}>
                      <Trash2 size={14} /> {t("notifications.delete")}
                    </button>
                  </div>
                </div>

                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{n.message}</p>

                {n.solution && (
                  <div className="rounded-md border border-base-300 bg-base-200/50 p-3 text-sm">
                    <div className="font-medium mb-1">{t("notifications.solution")}</div>
                    <div className="whitespace-pre-wrap break-words">{n.solution}</div>
                    {n.actionUrl && (
                      <a
                        className="btn btn-outline btn-sm gap-1 mt-3"
                        href={n.actionUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={14} /> {t("notifications.openFix")}
                      </a>
                    )}
                  </div>
                )}

                {n.context && (
                  <div className="text-xs text-base-content/40">
                    {t("notifications.context")}: {n.context}
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

function severityClass(severity: string): string {
  if (severity === "error") return "badge-error";
  if (severity === "warning") return "badge-warning";
  return "badge-info";
}

function severityText(severity: string, t: (key: string) => string): string {
  if (severity === "error") return t("notifications.severityError");
  if (severity === "warning") return t("notifications.severityWarning");
  return t("notifications.severityInfo");
}

function fmtTime(iso: string): string {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("ru-RU");
}
