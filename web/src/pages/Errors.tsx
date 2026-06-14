import { Fragment, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, Trash2, Server, Monitor } from "lucide-react";
import { apiClient, type ErrorLogItem } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Errors() {
  const { user } = useAuth();
  const [items, setItems] = useState<ErrorLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  function load() {
    setLoading(true);
    apiClient
      .errors()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  // Errors page is admin-only (the route is also gated, this is belt-and-suspenders).
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  async function clear() {
    if (!confirm("Очистить весь журнал ошибок?")) return;
    await apiClient.clearErrors();
    load();
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Ошибки</h1>
          <p className="text-base-content/60">
            Журнал ошибок сервера и фронтенда · хранится 7 дней, чистится автоматически (до 1000 записей)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm gap-1" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Обновить
          </button>
          <button
            className="btn btn-ghost btn-sm text-error gap-1"
            onClick={clear}
            disabled={!items.length}
          >
            <Trash2 size={16} /> Очистить
          </button>
        </div>
      </header>

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <AlertTriangle className="text-base-content/30" size={40} />
            <p className="text-base-content/60">Ошибок нет — чисто 🎉</p>
          </div>
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body p-0">
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Откуда</th>
                    <th>Сообщение</th>
                    <th>Контекст</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((e) => (
                    <Fragment key={e.id}>
                      <tr
                        className={`hover ${e.detail ? "cursor-pointer" : ""}`}
                        onClick={() => e.detail && setExpanded(expanded === e.id ? null : e.id)}
                        title={e.detail ? "Нажми, чтобы показать детали" : ""}
                      >
                        <td className="whitespace-nowrap text-base-content/60 text-xs">
                          {fmtTime(e.createdAt)}
                        </td>
                        <td>
                          {e.source === "client" ? (
                            <span className="badge badge-sm badge-warning gap-1">
                              <Monitor size={11} /> фронт
                            </span>
                          ) : (
                            <span className="badge badge-sm badge-error gap-1">
                              <Server size={11} /> сервер
                            </span>
                          )}
                        </td>
                        <td className="font-medium">
                          <div className="max-w-md truncate" title={e.message}>{e.message}</div>
                        </td>
                        <td className="text-xs text-base-content/60">
                          <div className="max-w-[16rem] truncate" title={e.context ?? ""}>{e.context}</div>
                        </td>
                      </tr>
                      {expanded === e.id && e.detail && (
                        <tr>
                          <td colSpan={4} className="bg-base-200/50">
                            <pre className="text-xs whitespace-pre-wrap overflow-x-auto max-h-72 p-2">
                              {e.detail}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker; render in local time.
function fmtTime(iso: string): string {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("ru-RU");
}
