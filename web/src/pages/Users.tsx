import { useEffect, useMemo, useState } from "react";
import { Users, Plus, Check, AlertTriangle, Crown, LogIn, Send, Infinity as InfinityIcon, Wand2, Search } from "lucide-react";
import { apiClient, ApiError, type AdminUser, type DeckInfo, type UserDeckRow, type PackSummary, type PackUsageItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isMainAdmin } from "../lib/authz";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { isMgsLegacyUser } from "../lib/accountLimits";

const DEFAULT_DAILY_KEY_CAP = 50;
const MGS_DAILY_KEY_CAP = 92;
const SUPER_ADMIN_DAILY_KEY_CAP = 100;
const dailyKeyCapForUser = (row: { userId: number; username: string; isSuperAdmin?: boolean }) =>
  row.isSuperAdmin ? SUPER_ADMIN_DAILY_KEY_CAP : isMgsLegacyUser({ id: row.userId, username: row.username }) ? MGS_DAILY_KEY_CAP : DEFAULT_DAILY_KEY_CAP;

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

function defaultNewVisibleFor(decks: DeckInfo[]): Set<string> {
  return new Set(decks.filter((d) => d.defaultForNewUser).map((d) => d.id));
}

function AdminUsers() {
  const { user, setUser } = useAuth();
  const { t } = useT();
  const canManageRights = isMainAdmin(user);
  const canManagePackVisibility = user?.role === "admin";
  const canManagePackOwners = user?.role === "admin";
  const canResetPackHistory = user?.role === "admin";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [rows, setRows] = useState<UserDeckRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [newVisible, setNewVisible] = useState<Set<string>>(new Set()); // opt-in packs granted to the next new user
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [packs, setPacks] = useState<PackSummary[]>([]); // все кастомные паки (админ видит все) — для назначения владельцев
  const [savingOwner, setSavingOwner] = useState<string | null>(null);
  const [resettingDeck, setResettingDeck] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<number | "">(""); // выбранный юзер в блоке «Сброс истории паков»
  const [resetItems, setResetItems] = useState<PackUsageItem[] | null>(null); // ВСЕ паки юзера: встроенные + кастомные (null = грузим)
  const [ownerErr, setOwnerErr] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<number | null>(null);
  const [togglingInfinite, setTogglingInfinite] = useState<number | null>(null); // «бесконечный пак» в полёте
  const [togglingCreator, setTogglingCreator] = useState<number | null>(null);
  const [noticeUserId, setNoticeUserId] = useState<number | "">("");
  const [noticeSeverity, setNoticeSeverity] = useState<"info" | "warning" | "error">("info");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [noticeSolution, setNoticeSolution] = useState("");
  const [noticeUrl, setNoticeUrl] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeState, setNoticeState] = useState<"idle" | "sent" | "error">("idle");
  const [noticeErr, setNoticeErr] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const loadUsers = () => apiClient.adminUsers().then(setUsers).catch(() => {});
  const loadMatrix = () => apiClient.adminUserDecks().then(setRows).catch(() => {});
  // Управление владельцами должно видеть ВСЕ кастомные паки; права редактирования всё равно проверяет сервер.
  const loadPacks = () => apiClient.adminPacks().then(setPacks).catch(() => {});
  // Деки/паки, которые ВООБЩЕ могут быть у обычного юзера (для формы создания и opt-in грантов):
  // обычные встроенные (opt-out), grantable admin-only и кастомные паки. Чисто admin-only — исключаем.
  const userDecks = decks.filter((d) => !d.adminOnly || d.grantable || d.pack);
  useEffect(() => {
    loadUsers();
    if (canManagePackVisibility) {
      loadMatrix();
      apiClient.adminDecks().then((items) => {
        setDecks(items);
        setNewVisible(defaultNewVisibleFor(items));
      }).catch(() => {});
    } else {
      setRows([]);
      setDecks([]);
    }
    if (canManagePackOwners) {
      loadPacks();
    } else {
      setPacks([]);
    }
  }, [canManagePackVisibility, canManagePackOwners]);

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
      // обычные встроенные паки — opt-out; кастомные и grantable admin-only built-in паки — opt-in.
      const nextRole = canManageRights ? role : "user";
      const hidden = canManageRights && nextRole !== "admin"
        ? userDecks.filter((d) => !d.pack && !d.grantable && !newVisible.has(d.id)).map((d) => d.id)
        : [];
      const grants = canManageRights && nextRole !== "admin"
        ? userAccessDecks.filter((d) => (d.pack || d.grantable) && newVisible.has(d.id)).map((d) => d.id)
        : [];
      const longVideoGrants = canManageRights && nextRole !== "admin"
        ? userLongVideoDecks.filter((d) => d.grantable && newVisible.has(d.id)).map((d) => d.id)
        : [];
      const u = await apiClient.createUser(username.trim(), password, nextRole, hidden);
      if (canManageRights && nextRole !== "admin") await apiClient.setUserDecks(u.id, hidden, grants, longVideoGrants);
      setCreated(t("users.created", { name: u.username, role: u.role === "admin" ? t("users.roleAdmin") : t("users.roleUser") }));
      setUsername("");
      setPassword("");
      setRole("user");
      setNewVisible(defaultNewVisibleFor(decks));
      loadUsers();
      if (canManagePackVisibility) loadMatrix();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("users.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  // Toggle one pack's visibility for a user (checked = visible). Optimistic; reverts on failure.
  // Главный админ видит всё по умолчанию → opt-out. Обычный админ тоже может менять эту строку
  // в матрице, но это не даёт ему роли, impersonate или сброс истории супер-админа.
  async function toggle(row: UserDeckRow, deckId: string, visible: boolean) {
    const isAdminRow = row.role === "admin";
    const deck = decks.find((d) => d.id === deckId);
    const customPack = !!deck?.pack || deckId.startsWith("pack:");
    const longVideoGrant = !row.isSuperAdmin && !isAdminRow && !!deck?.longVideo;
    const byGrant = !row.isSuperAdmin && !longVideoGrant && (customPack || (!isAdminRow && !!deck?.grantable));
    const nextHidden = byGrant || longVideoGrant
      ? row.hidden
      : visible
        ? row.hidden.filter((d) => d !== deckId)
        : [...new Set([...row.hidden, deckId])];
    const nextGrants = byGrant
      ? visible
        ? [...new Set([...row.grantedPacks, deckId])]
        : row.grantedPacks.filter((d) => d !== deckId)
      : row.grantedPacks;
    const nextLongVideoGrants = longVideoGrant
      ? visible
        ? [...new Set([...(row.grantedLongVideos ?? []), deckId])]
        : (row.grantedLongVideos ?? []).filter((d) => d !== deckId)
      : (row.grantedLongVideos ?? []);
    setSavingCell(`${row.userId}:${deckId}`);
    setSaveState("saving");
    setRows((rs) =>
      rs.map((r) =>
        r.userId === row.userId ? { ...r, hidden: nextHidden, grantedPacks: nextGrants, grantedLongVideos: nextLongVideoGrants } : r,
      ),
    );
    try {
      await apiClient.setUserDecks(row.userId, nextHidden, nextGrants, nextLongVideoGrants);
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
      loadMatrix();
    } finally {
      setSavingCell(null);
    }
  }

  async function resetDeckHistory(userId: number, username: string, deckId: string, deckName: string) {
    if (!canManageRights && rows.find((r) => r.userId === userId)?.isSuperAdmin) {
      setSaveState("error");
      return;
    }
    const label = `${username} / ${deckName}`;
    if (!window.confirm(t("users.resetDeckConfirm", { label }))) return;
    setResettingDeck(`${userId}:${deckId}`);
    setSaveState("saving");
    try {
      await apiClient.resetUserDeck(userId, deckId);
      setSaveState("saved");
      loadMatrix();
      refreshResetDecks(userId); // освежить «осталось N из T» в панели сброса
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
    } finally {
      setResettingDeck(null);
    }
  }

  // ВСЕ паки выбранного юзера (встроенные деки + кастомные паки), что он может использовать или уже
  // использовал — любой пак, из которого взяли хоть карту, уже «не полный». Источник —
  // /api/admin/users/:id/pack-usage (считает used и по КАСТОМНЫМ паками, не только встроенным декам).
  function refreshResetDecks(id: number) {
    apiClient.adminUserPackUsage(id).then((r) => setResetItems(r.items)).catch(() => setResetItems([]));
  }
  useEffect(() => {
    if (resetUserId === "") {
      setResetItems(null);
      return;
    }
    let alive = true;
    setResetItems(null); // спиннер, пока грузим нового юзера (без мигания прошлым)
    if (!canManageRights && rows.find((r) => r.userId === resetUserId)?.isSuperAdmin) {
      setResetItems([]);
      return;
    }
    if (canResetPackHistory) {
      apiClient
        .adminUserPackUsage(resetUserId)
        .then((r) => alive && setResetItems(r.items))
        .catch(() => alive && setResetItems([]));
    }
    return () => {
      alive = false;
    };
  }, [resetUserId, canResetPackHistory, canManageRights, rows]);

  async function impersonate(row: UserDeckRow) {
    const targetId = row.userId;
    if (!user || targetId === user.id) return;
    setImpersonatingId(targetId);
    try {
      const next = await apiClient.impersonateUser(targetId);
      setUser(next);
      window.location.assign("/statistics");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("users.impersonateFailed"));
    } finally {
      setImpersonatingId(null);
    }
  }

  async function setRowRole(row: UserDeckRow, nextRole: "admin" | "user") {
    if (!canManageRights || row.isSuperAdmin) return;
    setSavingCell(`role:${row.userId}`);
    setSaveState("saving");
    try {
      const res = await apiClient.setUserRole(row.userId, nextRole);
      setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, role: res.role, isSuperAdmin: res.isSuperAdmin } : r)));
      setUsers((us) => us.map((u) => (u.id === row.userId ? { ...u, role: res.role, isSuperAdmin: res.isSuperAdmin } : u)));
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (e) {
      setSaveState("error");
      setError(e instanceof ApiError ? e.message : t("users.saveFailedShort"));
      loadUsers();
      loadMatrix();
    } finally {
      setSavingCell(null);
    }
  }

  // «Бесконечный пак» (имитация) — вкл/выкл для юзера. Оптимистично; откат к серверу при ошибке.
  // ON → у юзера весь пак свободен, а планировщик крутит его очередь роликов по кругу.
  async function toggleInfinite(row: UserDeckRow) {
    const next = !row.infiniteSim;
    setTogglingInfinite(row.userId);
    setSaveState("saving");
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, infiniteSim: next } : r)));
    try {
      const res = await apiClient.setUserInfinitePacks(row.userId, next);
      setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, infiniteSim: res.enabled } : r)));
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
      loadMatrix(); // откат к серверному состоянию
    } finally {
      setTogglingInfinite(null);
    }
  }

  async function toggleCommercialCreator(row: UserDeckRow) {
    const next = !row.commercialCreator;
    setTogglingCreator(row.userId);
    setSaveState("saving");
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, commercialCreator: next } : r)));
    try {
      const res = await apiClient.setUserCommercialCreator(row.userId, next);
      setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, commercialCreator: res.enabled } : r)));
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
      loadMatrix();
    } finally {
      setTogglingCreator(null);
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

  const resetRows = canManageRights ? rows : rows.filter((r) => !r.isSuperAdmin);
  const accessDecks = decks.filter((d) => !d.longVideo);
  const longVideoAccessDecks = decks.filter((d) => d.longVideo);
  const userAccessDecks = userDecks.filter((d) => !d.longVideo);
  const userLongVideoDecks = userDecks.filter((d) => d.longVideo);
  const normalizedUserSearch = userSearch.trim().toLowerCase();
  const filteredUsers = useMemo(
    () =>
      normalizedUserSearch
        ? users.filter((u) => u.username.toLowerCase().includes(normalizedUserSearch))
        : users,
    [users, normalizedUserSearch],
  );
  const visibleUsers = filteredUsers;
  const visibleUserIds = useMemo(() => new Set(visibleUsers.map((u) => u.id)), [visibleUsers]);
  const visibleRows = rows.filter((r) => visibleUserIds.has(r.userId));

  const isCellVisible = (row: UserDeckRow, d: DeckInfo): boolean => {
    const isAdminRow = row.role === "admin";
    return row.isSuperAdmin
      ? !row.hidden.includes(d.id)
      : d.longVideo && !isAdminRow
        ? (row.grantedLongVideos ?? []).includes(d.id)
      : d.pack || (!isAdminRow && d.grantable)
        ? row.grantedPacks.includes(d.id)
        : !row.hidden.includes(d.id);
  };

  const renderAccessCells = (row: UserDeckRow, list: DeckInfo[]) =>
    list.map((d) => {
      const isAdminRow = row.role === "admin";
      if (!isAdminRow && d.adminOnly && !d.grantable && !d.pack)
        return (
          <td key={d.id} className="text-center text-base-content/25" title={t("users.cellAdminOnly")}>
            —
          </td>
        );
      const visible = isCellVisible(row, d);
      const used = row.used.includes(d.id);
      const st = row.deckStats?.[d.id];
      return (
        <td key={d.id} className="text-center align-middle">
          <label className="inline-flex flex-col items-center gap-0.5 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-sm checkbox-primary"
              checked={visible}
              disabled={!canManagePackVisibility || savingCell === `${row.userId}:${d.id}`}
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
    });

  return (
    <>
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
            {canManageRights && (
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
            )}
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={add}
              disabled={busy || !username.trim() || password.length < 3}
            >
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Plus size={14} />}
              {t("common.create")}
            </button>
          </div>

          {canManageRights && role !== "admin" && userDecks.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-base-content/60">
                {t("users.newUserPacksHint1")} <b>{t("users.newUserPacksHintNew")}</b> {t("users.newUserPacksHint2")}{" "}
                <b>{t("users.newUserPacksHintNothing")}</b> {t("users.newUserPacksHint3")}
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {userAccessDecks.map((d) => {
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
              {userLongVideoDecks.length > 0 && (
                <>
                  <div className="mt-2 text-xs font-medium text-base-content/60">{t("users.longVideoMatrixHeading")}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {userLongVideoDecks.map((d) => {
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
                </>
              )}
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
            <Users size={15} className="text-primary" /> {t("users.registeredHeading")}
          </p>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="input input-bordered input-sm flex min-w-0 items-center gap-2 sm:w-72">
              <Search size={14} className="text-base-content/45" />
              <input
                className="grow"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder={t("users.searchPlaceholder")}
                autoComplete="off"
              />
            </label>
            <div className="text-xs text-base-content/60">
              {t("users.searchSummary", { shown: filteredUsers.length, total: users.length })}
            </div>
          </div>
          <div className="max-h-40 overflow-auto overscroll-contain pr-1">
            <div className="flex flex-wrap gap-1.5">
            {visibleUsers.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1 rounded border border-base-300 px-2 py-1 text-xs">
                <span className="font-medium">{u.username}</span>
                {u.isSuperAdmin ? (
                  <span className="badge badge-primary badge-xs">{t("users.superAdmin")}</span>
                ) : u.role === "admin" ? (
                  <span className="badge badge-ghost badge-xs">{t("users.roleAdmin")}</span>
                ) : null}
                {u.locked && <span className="badge badge-error badge-xs">{t("users.locked")}</span>}
              </span>
            ))}
            {visibleUsers.length === 0 && (
              <span className="text-sm text-base-content/50">{t("users.searchEmpty")}</span>
            )}
            </div>
          </div>
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
        {canManagePackVisibility && rows.length > 0 && accessDecks.length > 0 && (
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
            <div className="max-h-[56rem] overflow-auto overscroll-contain rounded-lg border border-base-300">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 bg-base-100 border-r border-base-300">{t("users.colUser")}</th>
                    {accessDecks.map((d) => (
                      <th key={d.id} className="sticky top-0 z-20 bg-base-100 text-center whitespace-nowrap font-normal">
                        <span className="inline-flex items-center gap-1">
                          {d.adminOnly && !d.grantable && (
                            <AppIcon name="admin" size={11} className="text-primary/70" title={t("users.colAdminOnly")} />
                          )}
                          {d.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    return (
                      <tr key={row.userId}>
                        <td className="font-medium whitespace-nowrap sticky left-0 z-10 bg-base-100 border-r border-base-300">
                          <div className="flex items-center gap-1.5">
                            {row.role === "admin" && <AppIcon name="admin" size={13} className="text-primary" />}
                            {row.username}
                            {row.isSuperAdmin && <span className="badge badge-primary badge-xs">{t("users.superAdmin")}</span>}
                            {canManageRights && !row.isSuperAdmin && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs gap-1"
                                disabled={savingCell === `role:${row.userId}`}
                                onClick={() => setRowRole(row, row.role === "admin" ? "user" : "admin")}
                                title={row.role === "admin" ? t("users.makeUserTitle") : t("users.makeAdminTitle")}
                              >
                                {savingCell === `role:${row.userId}` ? (
                                  <span className="loading loading-spinner loading-xs" />
                                ) : row.role === "admin" ? (
                                  <Crown size={11} />
                                ) : (
                                  <Users size={11} />
                                )}
                                {row.role === "admin" ? t("users.roleAdmin") : t("users.roleUser")}
                              </button>
                            )}
                            {users.find((u) => u.id === row.userId)?.locked && (
                              <span className="badge badge-error badge-xs">{t("users.locked")}</span>
                            )}
                            {canManageRights && row.userId !== user?.id && (
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
                            {t("users.scheduledPerDay", {
                              n: row.scheduled,
                            })}
                            {" · " + t("users.keyDailyCap", { n: dailyKeyCapForUser(row) })}
                            {row.library > 0 ? " · " + t("users.inLibrary", { n: row.library }) : ""}
                          </div>
                          {canManageRights && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <button
                                type="button"
                                className={`btn btn-xs gap-1 ${row.commercialCreator ? "btn-primary" : "btn-ghost border border-base-300 opacity-70"}`}
                                disabled={togglingCreator === row.userId}
                                onClick={() => toggleCommercialCreator(row)}
                                title="Commercial Creator доступ к /creator"
                              >
                                {togglingCreator === row.userId ? <span className="loading loading-spinner loading-xs" /> : <Wand2 size={11} />}
                                {row.commercialCreator ? "Creator: вкл" : "Creator"}
                              </button>
                              <button
                                type="button"
                                className={`btn btn-xs gap-1 ${row.infiniteSim ? "btn-primary" : "btn-ghost border border-base-300 opacity-70"}`}
                                disabled={togglingInfinite === row.userId}
                                onClick={() => toggleInfinite(row)}
                                title={t("users.infiniteSimTitle")}
                              >
                                {togglingInfinite === row.userId ? (
                                  <span className="loading loading-spinner loading-xs" />
                                ) : (
                                  <InfinityIcon size={11} />
                                )}
                                {row.infiniteSim ? t("users.infiniteSimOn") : t("users.infiniteSimOff")}
                              </button>
                            </div>
                          )}
                        </td>
                        {renderAccessCells(row, accessDecks)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-base-content/50 mt-1">
              {t("users.matrixFooter")}
            </p>
          </div>
        )}

        {canManagePackVisibility && rows.length > 0 && longVideoAccessDecks.length > 0 && (
          <div className="border-t border-base-300 pt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              {t("users.longVideoMatrixHeading")}
            </p>
            <div className="max-h-[32rem] overflow-auto overscroll-contain rounded-lg border border-base-300">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-30 bg-base-100 border-r border-base-300">{t("users.colUser")}</th>
                    {longVideoAccessDecks.map((d) => (
                      <th key={d.id} className="sticky top-0 z-20 bg-base-100 text-center whitespace-nowrap font-normal">
                        <span className="inline-flex items-center gap-1">
                          {d.adminOnly && !d.grantable && (
                            <AppIcon name="admin" size={11} className="text-primary/70" title={t("users.colAdminOnly")} />
                          )}
                          {d.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.userId}>
                      <td className="font-medium whitespace-nowrap sticky left-0 z-10 bg-base-100 border-r border-base-300">
                        <div className="flex items-center gap-1.5">
                          {row.role === "admin" && <AppIcon name="admin" size={13} className="text-primary" />}
                          {row.username}
                          {row.isSuperAdmin && <span className="badge badge-primary badge-xs">{t("users.superAdmin")}</span>}
                        </div>
                      </td>
                      {renderAccessCells(row, longVideoAccessDecks)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-base-content/50 mt-1">{t("users.longVideoMatrixFooter")}</p>
          </div>
        )}

        {/* Владельцы паков: у пака 0+ владельцев — они редактируют пак (имя/язык/карточки) на /cards. */}
        {canManagePackOwners && packs.length > 0 && (
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
                          {users.filter((u) => !u.isSuperAdmin).map((u) => {
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
                          {!p.owners.some((id) => users.some((u) => u.id === id && !u.isSuperAdmin)) && (
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

    {/* Сброс истории паков — отдельный блок (вынесен из тесной матрицы): выбери юзера → */}
    {/* сбрось «использованные» карточки нужного пака; генерация снова берёт его с начала. */}
    {canResetPackHistory && rows.length > 0 && (
      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div>
            <h2 className="card-title text-base flex items-center gap-2">
              <AppIcon name="refresh" size={16} className="text-primary" /> {t("users.resetHeading")}
            </h2>
            <p className="text-sm text-base-content/60">{t("users.resetHint")}</p>
          </div>
          <select
            className="select select-bordered select-sm w-full max-w-xs"
            value={resetUserId === "" ? "" : String(resetUserId)}
            onChange={(e) => setResetUserId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">{t("users.resetPickUser")}</option>
            {[...resetRows].sort((a, b) => b.usedTotal - a.usedTotal).map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.username}
                {r.role === "admin" ? ` · ${t("users.roleAdmin")}` : ""} ({r.usedTotal})
              </option>
            ))}
          </select>
          {(() => {
            const resetRow = resetRows.find((r) => r.userId === resetUserId);
            if (!resetRow) return null; // юзер ещё не выбран
            if (resetItems === null)
              return <span className="loading loading-spinner loading-sm" />; // грузим список паков
            if (resetItems.length === 0)
              return <p className="text-sm text-base-content/60">{t("users.resetEmpty")}</p>;
            const list = [...resetItems].sort((a, b) => b.used - a.used); // использованные — наверх
            return (
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((d) => {
                  const key = `${resetRow.userId}:${d.id}`;
                  const canReset = d.used > 0; // полный пак сбрасывать нечего
                  const low = d.available < Math.min(50, Math.ceil(d.total / 2)); // «краснеть» при реальном истощении, не путать маленький свежий пак
                  return (
                    <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1">
                          {d.pack && (
                            <span className="badge badge-ghost badge-xs shrink-0" title={t("users.resetPackTagTitle")}>
                              {t("users.resetPackTag")}
                            </span>
                          )}
                          <span className="truncate text-sm font-medium" title={d.name}>
                            {d.name}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={`btn btn-ghost btn-xs shrink-0 gap-1 ${canReset ? "text-error" : ""}`}
                          title={canReset ? t("users.resetDeckTitle") : t("users.resetNothing")}
                          disabled={!canReset || resettingDeck === key}
                          onClick={() => resetDeckHistory(resetRow.userId, resetRow.username, d.id, d.name)}
                        >
                          {resettingDeck === key ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <AppIcon name="refresh" size={12} />
                          )}
                          {t("users.resetBtn")}
                        </button>
                      </div>
                      <progress
                        className={`progress h-1.5 ${low ? "progress-error" : "progress-primary"}`}
                        value={d.used}
                        max={d.total || 1}
                      />
                      <div className={`text-[11px] ${low ? "font-semibold text-error" : "text-base-content/60"}`}>
                        {t("users.resetStats", { used: d.used, available: d.available, total: d.total })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>
    )}
    </>
  );
}
