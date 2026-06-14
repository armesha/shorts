import { useEffect, useState } from "react";
import { Users, Plus, Check, AlertTriangle } from "lucide-react";
import { apiClient, ApiError, type AdminUser, type DeckInfo, type UserDeckRow } from "../lib/api";
import { useAuth } from "../lib/auth";

// Admin-only section: create accounts + control which packs each user sees.
export default function UsersPage() {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="alert alert-warning max-w-xl">
        <AlertTriangle size={18} />
        <span>Раздел доступен только администратору.</span>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold">Пользователи и паки</h1>
        <p className="text-base-content/60">Аккаунты друзей и доступ к колодам</p>
      </header>
      <AdminUsers />
    </div>
  );
}

function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [decks, setDecks] = useState<DeckInfo[]>([]);
  const [rows, setRows] = useState<UserDeckRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [newHidden, setNewHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const loadUsers = () => apiClient.adminUsers().then(setUsers).catch(() => {});
  const loadMatrix = () => apiClient.adminUserDecks().then(setRows).catch(() => {});
  useEffect(() => {
    loadUsers();
    loadMatrix();
    apiClient.adminDecks().then(setDecks).catch(() => {});
  }, []);

  async function add() {
    setError("");
    setCreated("");
    setBusy(true);
    try {
      const hidden = role === "admin" ? [] : decks.filter((d) => newHidden.has(d.id)).map((d) => d.id);
      const u = await apiClient.createUser(username.trim(), password, role, hidden);
      setCreated(`Создан «${u.username}» (${u.role === "admin" ? "админ" : "пользователь"})`);
      setUsername("");
      setPassword("");
      setRole("user");
      setNewHidden(new Set());
      loadUsers();
      loadMatrix();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать пользователя");
    } finally {
      setBusy(false);
    }
  }

  // Toggle one pack's visibility for a user (checked = visible). Optimistic; reverts on failure.
  async function toggle(row: UserDeckRow, deckId: string, visible: boolean) {
    if (row.role === "admin") return;
    const nextHidden = visible
      ? row.hidden.filter((d) => d !== deckId)
      : [...new Set([...row.hidden, deckId])];
    setSavingCell(`${row.userId}:${deckId}`);
    setSaveState("saving");
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, hidden: nextHidden } : r)));
    try {
      await apiClient.setUserDecks(row.userId, nextHidden);
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch {
      setSaveState("error");
      loadMatrix();
    } finally {
      setSavingCell(null);
    }
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Users className="text-primary" size={18} />
          <h2 className="card-title text-base">Пользователи</h2>
          <span className="badge badge-ghost badge-sm">{users.length}</span>
        </div>

        {/* Create a user (optionally pre-hiding some packs) */}
        <div>
          <p className="text-sm text-base-content/70 mb-2">
            Создать аккаунт для друга. Он войдёт по логину/паролю и загрузит свой Google-ключ.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="form-control w-40">
              <span className="label-text">Логин</span>
              <input
                className="input input-bordered input-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="form-control w-44">
              <span className="label-text">Пароль (≥6)</span>
              <input
                type="password"
                className="input input-bordered input-sm font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="form-control w-40">
              <span className="label-text">Роль</span>
              <select
                className="select select-bordered select-sm"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">пользователь</option>
                <option value="admin">админ</option>
              </select>
            </label>
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={add}
              disabled={busy || !username.trim() || password.length < 6}
            >
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Plus size={14} />}
              Создать
            </button>
          </div>

          {role !== "admin" && decks.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-base-content/60">
                Доступные паки (по умолчанию все; сними отметку — скрыть у нового пользователя):
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {decks.map((d) => {
                  const visible = !newHidden.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`btn btn-xs gap-1 ${visible ? "btn-primary" : "btn-outline"}`}
                      onClick={() =>
                        setNewHidden((s) => {
                          const n = new Set(s);
                          if (visible) n.add(d.id);
                          else n.delete(d.id);
                          return n;
                        })
                      }
                    >
                      {visible && <Check size={11} />} {d.name}
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

        {/* Visibility matrix: users × packs (checkbox = visible; «исп.» = already used) */}
        {rows.length > 0 && decks.length > 0 && (
          <div className="border-t border-base-300 pt-3">
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              Кто какие паки видит
              {saveState === "saving" && (
                <span className="text-xs font-normal text-base-content/50 inline-flex items-center gap-1">
                  <span className="loading loading-spinner loading-xs" /> сохранение…
                </span>
              )}
              {saveState === "saved" && (
                <span className="text-xs font-normal text-success inline-flex items-center gap-1">
                  <Check size={12} /> сохранено
                </span>
              )}
              {saveState === "error" && (
                <span className="text-xs font-normal text-error inline-flex items-center gap-1">
                  <AlertTriangle size={12} /> не сохранилось
                </span>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Пользователь</th>
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
                      <td className="font-medium whitespace-nowrap">
                        {row.role === "admin" && <span className="text-primary">★ </span>}
                        {row.username}
                      </td>
                      {decks.map((d) => {
                        if (row.role === "admin")
                          return (
                            <td key={d.id} className="text-center text-base-content/40">
                              все
                            </td>
                          );
                        const visible = !row.hidden.includes(d.id);
                        const used = row.used.includes(d.id);
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
                              {used && (
                                <span className="text-[10px] leading-none text-success" title="пак уже используется">
                                  исп.
                                </span>
                              )}
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
              Галочка = пак виден пользователю. «исп.» = у пользователя уже есть канал/ролики на этом паке.
              Админ всегда видит все паки.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
