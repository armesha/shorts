import { useEffect, useState } from "react";
import { Users, Plus, Check, AlertTriangle, Crown, LogIn, Send } from "lucide-react";
import { apiClient, ApiError, type AdminUser, type DeckInfo, type UserDeckRow, type PackSummary } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";

// Admin-only section: create accounts + control which packs each user sees.
export default function UsersPage() {
  const { user } = useAuth();
  const { t } = useT();
  if (user?.role !== "admin") {
    return (
      <div className="alert alert-warning max-w-xl">
        <AlertTriangle size={18} />
        <span>{t("users.adminOnly")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <p className="text-base-content/60">{t("users.subtitle")}</p>
      </header>
      <AdminUsers />
    </div>
  );
}

function AdminUsers() {
  const { user, setUser } = useAuth();
  const { t } = useT();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [rows, setRows] = useState<UserDeckRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [newVisible, setNewVisible] = useState<Set<string>>(new Set()); // packs GRANTED to the new user (default: none)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [packs, setPacks] = useState<PackSummary[]>([]); // все кастомные паки (админ видит все) — для назначения владельцев
  const [savingOwner, setSavingOwner] = useState<string | null>(null);
  const [ownerErr, setOwnerErr] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [noticeUserId, setNoticeUserId] = useState<number | "">("");
  const [noticeSeverity, setNoticeSeverity] = useState<"info" | "warning" | "error">("info");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeSolution, setNoticeSolution] = useState("");
  const [noticeUrl, setNoticeUrl] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeState, setNoticeState] = useState<"idle" | "sent" | "error">("idle");
  const [noticeErr, setNoticeErr] = useState("");

  const loadUsers = () => apiClient.adminUsers().then(setUsers).catch(() => {});
  const loadMatrix = () => apiClient.adminUserDecks().then(setRows).catch(() => {});
  const loadPacks = () => apiClient.packs().then(setPacks).catch(() => {});
  useEffect(() => {
    loadUsers();
    loadMatrix();
    loadPacks();
    apiClient.adminDecks().then(setDecks).catch(() => {});
  }, []);

  // Добавить/убрать владельца пака (только админ). Шлём ВЕСЬ массив владельцев; пусто = без владельца.
  // Оптимистично + ВИДИМАЯ ошибка с откатом (без «тихого возврата» — частая жалоба).
  async function toggleOwner(p: PackSummary, userId: number) {
    const next = p.owners.includes(userId)
      ? p.owners.filter((x) => x !== userId)
      : [...p.owners, userId];
    setSavingOwner(p.id);
    setOwnerErr(null);
    setPacks((cur) => cur.map((x) => (x.id === p.id ? { ...x, owners: next } : x)));
    try {
      const r = await apiClient.setPackOwners(p.id, next);
      // Сервер возвращает канон (админы отброшены) — синхронизируем локально.
      setPacks((cur) => cur.map((x) => (x.id === p.id ? { ...x, owners: r.owners } : x)));
      loadMatrix(); // владелец влияет на колонку грантов в матрице
    } catch (e) {
      setOwnerErr(e instanceof ApiError ? e.message : t("users.ownerSaveFailed"));
      loadPacks(); // откат к серверному состоянию
    } finally {
      setSavingOwner(null);
    }
  }

  async function add() {
    setError("");
    setCreated("");
    setBusy(true);
    try {
      // встроенные паки — opt-out (скрываем неотмеченные); кастомные паки — opt-in (грантим отмеченные)
      const hidden = role === "admin" ? [] : decks.filter((d) => !d.pack && !newVisible.has(d.id)).map((d) => d.id);
      const grants = role === "admin" ? [] : decks.filter((d) => d.pack && newVisible.has(d.id)).map((d) => d.id);
      const u = await apiClient.createUser(username.trim(), password, role, hidden);
      if (grants.length) await apiClient.setUserDecks(u.id, hidden, grants);
      setCreated(t("users.created", { name: u.username, role: u.role === "admin" ? t("users.roleAdmin") : t("users.roleUser") }));
      setUsername("");
      setPassword("");
      setRole("user");
      setNewVisible(new Set());
      loadUsers();
      loadMatrix();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("users.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Toggle one pack's visibility for a user (checked = visible). Optimistic; reverts on failure.
  async function toggle(row: UserDeckRow, deckId: string, visible: boolean) {
    if (row.role === "admin") return;
    const isPack = deckId.startsWith("pack:"); // паки — opt-in (гранты); встроенные — opt-out (hidden)
    const nextHidden = isPack
      ? row.hidden
      : visible
        ? row.hidden.filter((d) => d !== deckId)
        : [...new Set([...row.hidden, deckId])];
    const nextGrants = isPack
      ? visible
        ? [...new Set([...row.grantedPacks, deckId])]
        : row.grantedPacks.filter((d) => d !== deckId)
      : row.grantedPacks;
    setSavingCell(`${row.userId}:${deckId}`);
    setSaveState("saving");
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, hidden: nextHidden, grantedPacks: nextGrants } : r)));
    try {
      await apiClient.setUserDecks(row.userId, nextHidden, nextGrants);
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
      loadMatrix();
    } finally {
      setSavingCell(null);
    }
  }

  async function impersonate(row: UserDeckRow) {
    const targetId = row.userId;
    if (!user || targetId === user.id) return;
    setImpersonatingId(targetId);
    try {
      const next = await apiClient.impersonateUser(targetId);
      setUser(next);
      window.location.href = "/statistics";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("users.impersonateFailed"));
    } finally {
      setImpersonatingId(null);
    }
  }

  async function sendNotice() {
    if (!noticeUserId || !noticeMessage.trim()) return;
    setNoticeBusy(true);
    setNoticeState("idle");
    setNoticeErr("");
    try {
      await apiClient.adminSendNotification(noticeUserId, {
        severity: noticeSeverity,
        title: noticeTitle.trim(),
        message: noticeMessage.trim(),
        solution: noticeSolution.trim(),
        actionUrl: noticeUrl.trim(),
      });
      setNoticeState("sent");
      setNoticeTitle("");
      setNoticeMessage("");
      setNoticeSolution("");
      setNoticeUrl("");
      window.dispatchEvent(new CustomEvent("notifications:changed"));
      window.setTimeout(() => setNoticeState((s) => (s === "sent" ? "idle" : s)), 2500);
    } catch (e) {
      setNoticeState("error");
      setNoticeErr(e instanceof ApiError ? e.message : t("users.notifyFailed"));
    } finally {
      setNoticeBusy(false);
    }
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Users className="text-primary" size={18} />
          <h2 className="card-title text-base">{t("users.usersHeading")}</h2>
          <span className="badge badge-ghost badge-sm">{users.length}</span>
        </div>

        {/* Create a user (optionally pre-hiding some packs) */}
        <div>
          <p className="text-sm text-base-content/70 mb-2">
            {t("users.createHint")}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="form-control w-40">
              <span className="label-text">{t("users.loginLabel")}</span>
              <input
                className="input input-bordered input-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="form-control w-44">
              <span className="label-text">{t("users.passwordLabel")}</span>
              <input
                type="password"
                className="input input-bordered input-sm font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="form-control w-40">
              <span className="label-text">{t("users.roleLabel")}</span>
              <select
                className="select select-bordered select-sm"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">{t("users.roleUser")}</option>
                <option value="admin">{t("users.roleAdmin")}</option>
              </select>
            </label>
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={add}
              disabled={busy || !username.trim() || password.length < 6}
            >
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Plus size={14} />}
              {t("common.create")}
            </button>
          </div>

          {role !== "admin" && decks.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-base-content/60">
                {t("users.newUserPacksHint1")} <b>{t("users.newUserPacksHintNew")}</b> {t("users.newUserPacksHint2")}{" "}
                <b>{t("users.newUserPacksHintNothing")}</b> {t("users.newUserPacksHint3")}
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {decks.map((d) => {
                  const granted = newVisible.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      title={granted ? t("users.newPackVisibleTitle") : t("users.newPackHiddenTitle")}
                      className={`btn btn-xs gap-1 ${granted ? "btn-primary" : "btn-ghost border border-base-300 line-through opacity-60"}`}
                      onClick={() =>
                        setNewVisible((s) => {
                          const n = new Set(s);
                          if (granted) n.delete(d.id);
                          else n.add(d.id);
                          return n;
                        })
                      }
                    >
                      {granted ? <Check size={11} /> : null} {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {created && (
            <div className="text-success text-sm flex items-center gap-1 mt-2">
              <Check size={14} /> {created}
            </div>
          )}
          {error && (
            <div className="text-error text-sm flex items-center gap-1 mt-2">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="border-t border-base-300 pt-3">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <Send size={15} className="text-primary" /> {t("users.notifyHeading")}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(160px,220px)_140px_1fr] gap-2">
            <label className="form-control">
              <span className="label-text">{t("users.notifyUser")}</span>
              <select
                className="select select-bordered select-sm"
                value={noticeUserId === "" ? "" : String(noticeUserId)}
                onChange={(e) => setNoticeUserId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">{t("users.notifyPickUser")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}{u.role === "admin" ? ` (${t("common.admin")})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text">{t("users.notifySeverity")}</span>
              <select
                className="select select-bordered select-sm"
                value={noticeSeverity}
                onChange={(e) => setNoticeSeverity(e.target.value as "info" | "warning" | "error")}
              >
                <option value="info">{t("notifications.severityInfo")}</option>
                <option value="warning">{t("notifications.severityWarning")}</option>
                <option value="error">{t("notifications.severityError")}</option>
              </select>
            </label>
            <label className="form-control">
              <span className="label-text">{t("users.notifyTitle")}</span>
              <input
                className="input input-bordered input-sm"
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                placeholder={t("users.notifyTitlePlaceholder")}
              />
            </label>
            <label className="form-control md:col-span-3">
              <span className="label-text">{t("users.notifyMessage")}</span>
              <textarea
                className="textarea textarea-bordered min-h-24"
                value={noticeMessage}
                onChange={(e) => setNoticeMessage(e.target.value)}
                placeholder={t("users.notifyMessagePlaceholder")}
              />
            </label>
            <label className="form-control md:col-span-2">
              <span className="label-text">{t("users.notifySolution")}</span>
              <input
                className="input input-bordered input-sm"
                value={noticeSolution}
                onChange={(e) => setNoticeSolution(e.target.value)}
                placeholder={t("users.notifySolutionPlaceholder")}
              />
            </label>
            <label className="form-control">
              <span className="label-text">{t("users.notifyUrl")}</span>
              <input
                className="input input-bordered input-sm"
                value={noticeUrl}
                onChange={(e) => setNoticeUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={sendNotice}
              disabled={noticeBusy || !noticeUserId || !noticeMessage.trim()}
            >
              {noticeBusy ? <span className="loading loading-spinner loading-sm" /> : <Send size={14} />}
              {t("users.notifySend")}
            </button>
            {noticeState === "sent" && (
              <span className="text-success text-sm inline-flex items-center gap-1">
                <Check size={14} /> {t("users.notifySent")}
              </span>
            )}
            {noticeState === "error" && (
              <span className="text-error text-sm inline-flex items-center gap-1">
                <AlertTriangle size={14} /> {noticeErr}
              </span>
            )}
          </div>
        </div>

        {/* Visibility matrix: users × packs (checkbox = visible; «исп.» = already used) */}
        {rows.length > 0 && decks.length > 0 && (
          <div className="border-t border-base-300 pt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              {t("users.matrixHeading")}
              {saveState === "saving" && (
                <span className="text-xs font-normal text-base-content/50 inline-flex items-center gap-1">
                  <span className="loading loading-spinner loading-xs" /> {t("users.saving")}
                </span>
              )}
              {saveState === "saved" && (
                <span className="text-xs font-normal text-success inline-flex items-center gap-1">
                  <Check size={12} /> {t("common.saved")}
                </span>
              )}
              {saveState === "error" && (
                <span className="text-xs font-normal text-error inline-flex items-center gap-1">
                  <AlertTriangle size={12} /> {t("users.saveFailedShort")}
                </span>
              )}
            </p>
            <div className="overflow-x-auto rounded-lg border border-base-300">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-base-100 border-r border-base-300">{t("users.colUser")}</th>
                    {decks.map((d) => (
                      <th key={d.id} className="text-center whitespace-nowrap font-normal">
                        {d.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.userId}>
                      <td className="font-medium whitespace-nowrap sticky left-0 z-10 bg-base-100 border-r border-base-300">
                        <div className="flex items-center gap-1.5">
                          {row.role === "admin" && <AppIcon name="admin" size={13} className="text-primary" />}
                          {row.username}
                          {users.find((u) => u.id === row.userId)?.locked && (
                            <span className="badge badge-error badge-xs">{t("users.locked")}</span>
                          )}
                          {row.userId !== user?.id && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs gap-1 ml-auto"
                              disabled={impersonatingId === row.userId}
                              onClick={() => impersonate(row)}
                              title={t("users.impersonateTitle")}
                            >
                              {impersonatingId === row.userId ? (
                                <span className="loading loading-spinner loading-xs" />
                              ) : (
                                <LogIn size={11} />
                              )}
                              {t("users.impersonate")}
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] font-normal text-base-content/50">
                          {(() => {
                            const au = users.find((u) => u.id === row.userId);
                            return au?.createdAt
                              ? t("users.sinceDate", { date: new Date(au.createdAt).toLocaleDateString("ru-RU") }) + " · "
                              : "";
                          })()}
                          {t("users.scheduledPerDay", { n: row.scheduled, limit: row.role !== "admin" ? "/100" : "" })}
                          {row.library > 0 ? " · " + t("users.inLibrary", { n: row.library }) : ""}
                        </div>
                      </td>
                      {decks.map((d) => {
                        if (row.role === "admin")
                          return (
                            <td key={d.id} className="text-center text-base-content/40">
                              {t("users.cellAll")}
                            </td>
                          );
                        const visible = d.pack ? row.grantedPacks.includes(d.id) : !row.hidden.includes(d.id);
                        const used = row.used.includes(d.id);
                        const st = row.deckStats?.[d.id];
                        return (
                          <td key={d.id} className="text-center align-middle">
                            <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-sm checkbox-primary"
                                checked={visible}
                                disabled={savingCell === `${row.userId}:${d.id}`}
                                onChange={(e) => toggle(row, d.id, e.target.checked)}
                              />
                              {used &&
                                (st ? (
                                  <span
                                    className={`text-[10px] leading-none ${st.available < 50 ? "text-error font-semibold" : "text-base-content/60"}`}
                                    title={t("users.statTooltip", { available: st.available, total: st.total, posted: st.posted, used: st.used })}
                                  >
                                    {st.available}
                                  </span>
                                ) : (
                                  <span className="text-[10px] leading-none text-success" title={t("users.inUse")}>
                                    {t("users.usedShort")}
                                  </span>
                                ))}
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-base-content/50 mt-1">
              {t("users.matrixFooter")}
            </p>
          </div>
        )}

        {/* Владельцы паков: у пака 0+ владельцев — они редактируют пак (имя/язык/карточки) на /cards. Админ во владельцы не пишется. */}
        {packs.length > 0 && (
          <div className="border-t border-base-300 pt-3">
            <p className="text-sm font-medium mb-1 flex items-center gap-2">
              <Crown size={15} className="text-primary" /> {t("users.ownersHeading")}
            </p>
            <p className="text-xs text-base-content/50 mb-2">
              {t("users.ownersHint")}
            </p>
            {ownerErr && (
              <div className="alert alert-error text-sm mb-2 py-2">
                <AlertTriangle size={16} />
                <span>{ownerErr}</span>
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-base-300">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-base-100 border-r border-base-300">{t("users.colPack")}</th>
                    <th>{t("users.colLang")}</th>
                    <th>{t("users.colOwners")}</th>
                    <th className="text-right">{t("users.colCards")}</th>
                  </tr>
                </thead>
                <tbody>
                  {packs.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium whitespace-nowrap sticky left-0 z-10 bg-base-100 border-r border-base-300">
                        {p.name}
                      </td>
                      <td className="uppercase text-base-content/70">{p.lang}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {users.filter((u) => u.role !== "admin").map((u) => {
                            const on = p.owners.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                className={`btn btn-xs ${on ? "btn-primary" : "btn-ghost border border-base-300 opacity-70"}`}
                                disabled={savingOwner === p.id}
                                onClick={() => toggleOwner(p, u.id)}
                                title={on ? t("users.ownerOnTitle") : t("users.ownerOffTitle")}
                              >
                                {on ? <Check size={11} /> : null} {u.username}
                              </button>
                            );
                          })}
                          {!p.owners.some((id) => users.some((u) => u.id === id && u.role !== "admin")) && (
                            <span className="text-base-content/40 text-xs italic">{t("users.noOwner")}</span>
                          )}
                          {savingOwner === p.id && <span className="loading loading-spinner loading-xs" />}
                        </div>
                      </td>
                      <td className="text-right">{p.cards}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
