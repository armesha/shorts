import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { apiClient, type HistoryItem, type AdminUser, type Account } from "../lib/api";
import { useAuth } from "../lib/auth";

const PAGE_SIZE = 25;

// Колоризуем статус: «провал/ошибка» — красный, «опубликовано/готово» — зелёный, иначе — нейтральный.
function statusClass(s: string): string {
  const t = (s || "").toLowerCase();
  if (/fail|error|ошиб|отклон|skip|пропущ/.test(t)) return "badge-error";
  if (/publish|posted|success|\bok\b|выложен|опубликов|готов/.test(t)) return "badge-success";
  return "badge-ghost";
}

// «Посмотреть»: опубликованные → YouTube (Shorts), иначе локальный файл (если ещё не удалён).
function watchUrl(h: HistoryItem): string | null {
  if (h.youtubeId) return `https://www.youtube.com/shorts/${h.youtubeId}`;
  if (h.videoRel) return `/files/${h.videoRel}`;
  return null;
}

export default function History() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin filter: scope "Мои/Все" + optional narrowing by user, then channel.
  const [scopeAll, setScopeAll] = useState(false);
  const [userId, setUserId] = useState<number | "">(""); // "" = все пользователи
  const [accountId, setAccountId] = useState<number | "">(""); // "" = все каналы
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const userName = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of users) m.set(u.id, u.username);
    return m;
  }, [users]);

  // Load filter sources once (admins only).
  useEffect(() => {
    if (!isAdmin) return;
    apiClient.adminUsers().then(setUsers).catch(() => {});
    apiClient.accounts("all").then(setAllAccounts).catch(() => {});
  }, [isAdmin]);

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      setError(null);
      const params: {
        scope?: "mine" | "all";
        userId?: number;
        accountId?: number;
        page?: number;
        pageSize?: number;
      } = { page: p, pageSize: PAGE_SIZE };
      if (isAdmin && scopeAll) {
        if (accountId !== "") params.accountId = Number(accountId);
        else if (userId !== "") params.userId = Number(userId);
        else params.scope = "all";
      }
      apiClient
        .history(params)
        .then((r) => {
          setItems(r.items);
          setTotal(r.total);
          setPage(r.page);
        })
        .catch(() => setError("Не удалось загрузить историю"))
        .finally(() => setLoading(false));
    },
    [isAdmin, scopeAll, userId, accountId],
  );

  // Reload from page 1 whenever the filter changes.
  useEffect(() => {
    load(1);
  }, [load]);

  // Channels for the channel dropdown (narrowed to the picked user, if any).
  const channelOptions = useMemo(
    () => allAccounts.filter((a) => userId === "" || a.userId === Number(userId)),
    [allAccounts, userId],
  );

  const showOwner = isAdmin && scopeAll;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">История</h1>
          <p className="text-base-content/60">Сгенерированные и загруженные ролики</p>
        </div>
        {!loading && <span className="text-sm text-base-content/50">Всего: {total}</span>}
      </header>

      {/* Admin filter bar */}
      {isAdmin && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body py-3 flex-row flex-wrap items-center gap-3">
            <div className="join">
              <button
                className={`btn btn-sm join-item ${!scopeAll ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setScopeAll(false);
                  setUserId("");
                  setAccountId("");
                }}
              >
                Мои
              </button>
              <button
                className={`btn btn-sm join-item ${scopeAll ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setScopeAll(true)}
              >
                Все
              </button>
            </div>

            {scopeAll && (
              <>
                <select
                  className="select select-bordered select-sm"
                  aria-label="Пользователь"
                  value={userId === "" ? "" : String(userId)}
                  onChange={(e) => {
                    setUserId(e.target.value === "" ? "" : Number(e.target.value));
                    setAccountId("");
                  }}
                >
                  <option value="">Все пользователи</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.role === "admin" ? " (админ)" : ""}
                    </option>
                  ))}
                </select>

                <select
                  className="select select-bordered select-sm"
                  aria-label="Канал"
                  value={accountId === "" ? "" : String(accountId)}
                  onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}
                >
                  <option value="">Все каналы</option>
                  {channelOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.ytChannelTitle || a.channelName}
                      {a.userId != null && userName.get(a.userId) ? ` — ${userName.get(a.userId)}` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            {items.length === 0 ? (
              <div className="text-center text-base-content/50 py-12">Пока нет загруженных роликов</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Заголовок</th>
                      <th>Канал</th>
                      {showOwner && <th>Владелец</th>}
                      <th>Опубликовано</th>
                      <th>Статус</th>
                      <th>Видео</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((h) => {
                      const url = watchUrl(h);
                      return (
                        <tr key={h.id}>
                          <td className="font-medium">{h.title}</td>
                          <td>{h.channelName || `#${h.accountId}`}</td>
                          {showOwner && (
                            <td className="text-base-content/70">{h.ownerUsername || "—"}</td>
                          )}
                          <td className="text-base-content/70">
                            {h.publishedAt ? new Date(h.publishedAt).toLocaleString("ru-RU") : "—"}
                          </td>
                          <td>
                            <span className={`badge badge-sm ${statusClass(h.status)}`}>{h.status}</span>
                          </td>
                          <td>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="link link-primary inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <ExternalLink size={14} /> Посмотреть
                              </a>
                            ) : (
                              <span className="text-base-content/40">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 pt-3">
                <button
                  className="btn btn-sm btn-ghost btn-square"
                  onClick={() => load(page - 1)}
                  disabled={page <= 1 || loading}
                  aria-label="Назад"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-base-content/60">
                  стр. {page} из {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-ghost btn-square"
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages || loading}
                  aria-label="Вперёд"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
