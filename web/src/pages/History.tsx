import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { apiClient, type HistoryItem, type AdminUser, type Account } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdminLike, isAdminRole, roleLabelKey } from "../lib/authz";
import { useT } from "../lib/i18n";
import { cleanDisplayText } from "../lib/text";
import { formatDateTime } from "../lib/format";

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
  const { t } = useT();
  const { user } = useAuth();
  const canViewAll = isAdminLike(user);
  const canMutateAll = isAdminRole(user);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);

  // «Только с ошибками» — ролики, что в итоге не выложились (доступно всем, не только админу).
  const [onlyErrors, setOnlyErrors] = useState(false);

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

  // Accounts (for channel avatars + admin channel filter) + admin user list.
  useEffect(() => {
    apiClient.accounts(canViewAll ? "all" : undefined).then(setAllAccounts).catch(() => {});
    if (canViewAll) apiClient.adminUsers().then(setUsers).catch(() => {});
  }, [canViewAll]);
  const avatarMap = useMemo(
    () => Object.fromEntries(allAccounts.map((a) => [a.id, a.avatar])) as Record<number, string | null | undefined>,
    [allAccounts],
  );
  const youtubeUrlMap = useMemo(
    () =>
      Object.fromEntries(
        allAccounts.map((a) => [a.id, a.ytChannelId ? `https://www.youtube.com/channel/${a.ytChannelId}` : null]),
      ) as Record<number, string | null>,
    [allAccounts],
  );

  const historyScopeParams = useCallback((): {
    scope?: "mine" | "all";
    userId?: number;
    accountId?: number;
  } => {
    const params: { scope?: "mine" | "all"; userId?: number; accountId?: number } = {};
    if (canViewAll && scopeAll) {
      if (accountId !== "") params.accountId = Number(accountId);
      else if (userId !== "") params.userId = Number(userId);
      else params.scope = "all";
    }
    return params;
  }, [canViewAll, scopeAll, userId, accountId]);

  const load = useCallback(
    (p: number) => {
      setLoading(true);
      setError(null);
      const params: {
        scope?: "mine" | "all";
        userId?: number;
        accountId?: number;
        onlyErrors?: boolean;
        page?: number;
        pageSize?: number;
      } = { ...historyScopeParams(), page: p, pageSize: PAGE_SIZE };
      if (onlyErrors) params.onlyErrors = true;
      apiClient
        .history(params)
        .then((r) => {
          setItems(r.items);
          setTotal(r.total);
          setPage(r.page);
        })
        .catch(() => setError(t("history.loadFailed")))
        .finally(() => setLoading(false));
    },
    [historyScopeParams, onlyErrors, t],
  );

  const clearFailedItems = useCallback(async () => {
    if (scopeAll && !canMutateAll) return;
    if (!window.confirm(t("history.clearErrorsConfirm"))) return;
    setClearingErrors(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiClient.clearHistoryErrors(historyScopeParams());
      setNotice(t("history.clearErrorsDone", { n: res.removed }));
      load(1);
    } catch {
      setError(t("history.clearErrorsFailed"));
    } finally {
      setClearingErrors(false);
    }
  }, [canMutateAll, historyScopeParams, load, scopeAll, t]);

  // Reload from page 1 whenever the filter changes.
  useEffect(() => {
    load(1);
  }, [load]);

  // Channels for the channel dropdown (narrowed to the picked user, if any).
  const channelOptions = useMemo(
    () => allAccounts.filter((a) => userId === "" || a.userId === Number(userId)),
    [allAccounts, userId],
  );

  const showOwner = canViewAll && scopeAll;
  const canClearErrors = !scopeAll || canMutateAll;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("history.title")}</h1>
          <p className="text-base-content/60">{t("history.subtitle")}</p>
        </div>
        {!loading && <span className="text-sm text-base-content/50">{t("history.total", { n: total })}</span>}
      </header>

      {/* Filter bar: admin scope (Мои/Все + user/channel) only for admins; «Только с ошибками» — for everyone. */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-3 flex-row flex-wrap items-center gap-3">
          {canViewAll && (
            <>
              <div className="join">
                <button
                  className={`btn btn-sm join-item ${!scopeAll ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => {
                    setScopeAll(false);
                    setUserId("");
                    setAccountId("");
                  }}
                >
                  {t("history.scopeMine")}
                </button>
                <button
                  className={`btn btn-sm join-item ${scopeAll ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setScopeAll(true)}
                >
                  {t("common.all")}
                </button>
              </div>

              {scopeAll && (
                <>
                  <select
                    className="select select-bordered select-sm"
                    aria-label={t("history.user")}
                    value={userId === "" ? "" : String(userId)}
                    onChange={(e) => {
                      setUserId(e.target.value === "" ? "" : Number(e.target.value));
                      setAccountId("");
                    }}
                  >
                    <option value="">{t("history.allUsers")}</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}
                        {u.role !== "user" ? ` (${t(roleLabelKey(u.role))})` : ""}
                      </option>
                    ))}
                  </select>

                  <select
                    className="select select-bordered select-sm"
                    aria-label={t("history.channel")}
                    value={accountId === "" ? "" : String(accountId)}
                    onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">{t("history.allChannels")}</option>
                    {channelOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.ytChannelTitle || a.channelName}
                        {a.userId != null && userName.get(a.userId) ? ` — ${userName.get(a.userId)}` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canClearErrors && (
              <button
                type="button"
                className="btn btn-sm btn-error gap-1"
                onClick={clearFailedItems}
                disabled={clearingErrors || loading || (onlyErrors && total === 0)}
                title={t("history.clearErrorsTitle")}
              >
                {clearingErrors ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />}
                {t("history.clearErrors")}
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm gap-1 ${onlyErrors ? "btn-error" : "btn-ghost"}`}
              onClick={() => setOnlyErrors((v) => !v)}
              aria-pressed={onlyErrors}
            >
              <AlertTriangle size={14} /> {t("history.onlyErrors")}
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success">
          <span>{notice}</span>
        </div>
      )}

      {error ? (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : loading && !items.length ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div className={`card bg-base-100 border border-base-300 ${loading ? "opacity-60 transition" : ""}`}>
          <div className="card-body">
            {items.length === 0 ? (
              <div className="text-center text-base-content/50 py-12">
                {onlyErrors ? t("history.emptyErrors") : t("history.empty")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("history.colTitle")}</th>
                      <th>{t("history.channel")}</th>
                      {showOwner && <th>{t("history.colOwner")}</th>}
                      <th>{t("history.colPublished")}</th>
                      <th>{t("history.colStatus")}</th>
                      <th>{t("history.colVideo")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((h) => {
                      const url = watchUrl(h);
                      const youtubeUrl = youtubeUrlMap[h.accountId];
                      const avatar = avatarMap[h.accountId];
                      return (
                        <tr key={h.id}>
                          <td className="font-medium">{cleanDisplayText(h.title)}</td>
                          <td>
                            <span className="flex items-center gap-2">
                              {avatar && (
                                youtubeUrl ? (
                                  <a
                                    href={youtubeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={t("stats.openOnYoutube")}
                                    aria-label={t("stats.openOnYoutube")}
                                    className="shrink-0 rounded-full transition hover:opacity-80"
                                  >
                                    <img
                                      src={avatar}
                                      alt=""
                                      className="w-6 h-6 rounded-full object-cover bg-base-200"
                                    />
                                  </a>
                                ) : (
                                  <img
                                    src={avatar}
                                    alt=""
                                    className="w-6 h-6 rounded-full object-cover bg-base-200 shrink-0"
                                  />
                                )
                              )}
                              <span className="truncate">{h.channelName || `#${h.accountId}`}</span>
                            </span>
                          </td>
                          {showOwner && (
                            <td className="text-base-content/70">{h.ownerUsername || "—"}</td>
                          )}
                          {/* Опубликовано: время публикации, а для невышедших (failed) — время ошибки (createdAt). */}
                          <td className="text-base-content/70 whitespace-nowrap">
                            {formatDateTime(h.publishedAt ?? h.createdAt)}
                          </td>
                          <td>
                            <span className={`badge badge-sm ${statusClass(h.status)}`}>{h.status}</span>
                            {h.error && (
                              <div
                                className="text-xs text-error/80 mt-1 max-w-[22rem] whitespace-pre-wrap break-words"
                                title={h.error}
                              >
                                {h.error}
                              </div>
                            )}
                          </td>
                          <td>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="link link-primary inline-flex items-center gap-1 whitespace-nowrap"
                              >
                                <ExternalLink size={14} /> {t("history.watch")}
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
                  aria-label={t("common.back")}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-base-content/60">
                  {t("history.pageOf", { page, total: totalPages })}
                </span>
                <button
                  className="btn btn-sm btn-ghost btn-square"
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages || loading}
                  aria-label={t("common.forward")}
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
