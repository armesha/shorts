import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Bot,
  KeyRound,
  MonitorPlay,
  Check,
  AlertTriangle,
  Upload,
  Trash2,
  Users,
  Plus,
  Lock,
} from "lucide-react";
import {
  apiClient,
  ApiError,
  type AppStatus,
  type AppSettings,
  type AdminUser,
  type DeckInfo,
  type UserDeckRow,
} from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const redirectUrl = `${window.location.origin}/api/youtube/callback`;

  useEffect(() => {
    apiClient.status().then(setStatus).catch(() => {});
    apiClient
      .settings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить настройки"));
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setBusy(true);
    try {
      const text = await f.text();
      setSettings(await apiClient.uploadGoogleKey(text));
      apiClient.status().then(setStatus).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить ключ");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function removeKey() {
    if (!confirm("Удалить свой Google-ключ? Каналы перестанут постить, пока не загрузишь новый.")) return;
    setError("");
    setBusy(true);
    try {
      setSettings(await apiClient.removeGoogleKey());
      apiClient.status().then(setStatus).catch(() => {});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить ключ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-base-content/60">Твой Google-ключ, система{isAdmin ? " и пользователи" : ""}</p>
      </header>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <KeyRound className="text-primary" size={18} />
            <h2 className="card-title text-base">Мой ключ Google (client_secret.json)</h2>
            {settings &&
              (settings.hasGoogleKey ? (
                <span className="badge badge-success badge-sm">загружен</span>
              ) : (
                <span className="badge badge-warning badge-sm">не загружен</span>
              ))}
          </div>

          <div className="text-sm text-base-content/70 space-y-2">
            <p>Чтобы постить на свои YouTube-каналы, нужен твой OAuth-ключ Google. По шагам:</p>
            <ol className="list-decimal list-inside space-y-1 text-base-content/80 marker:text-primary marker:font-semibold">
              <li>
                Открой{" "}
                <a
                  className="link link-primary"
                  href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  YouTube Data API v3
                </a>{" "}
                → нажми <b>Enable</b>.
              </li>
              <li>
                Перейди в{" "}
                <a
                  className="link link-primary"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Credentials
                </a>{" "}
                → <b>Create credentials → OAuth client ID</b>.
              </li>
              <li>
                <b>Application type → Web application</b> (именно Web, <u>не Desktop</u> — иначе адрес ниже
                не примется).
              </li>
              <li>
                Раздел <b>Authorized redirect URIs</b> → <b>+ ADD URI</b> → вставь адрес ниже 👇
              </li>
              <li>
                <b>Create</b> → <b>Download JSON</b> → загрузи его кнопкой ниже.
              </li>
            </ol>
            <p className="text-xs text-base-content/50">
              Если приложение в режиме «Testing» — добавь свою почту в <b>OAuth consent screen → Test
              users</b>, иначе Google не пустит. После загрузки нового ключа переподключи каналы заново.
            </p>
          </div>
          <code className="block bg-base-200 rounded p-2 text-xs break-all">{redirectUrl}</code>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn btn-primary btn-sm gap-2">
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Upload size={16} />}
              {settings?.hasGoogleKey ? "Заменить ключ" : "Загрузить client_secret.json"}
              <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={busy} />
            </label>
            {settings?.hasGoogleKey && (
              <button className="btn btn-ghost btn-sm text-error gap-1" onClick={removeKey} disabled={busy}>
                <Trash2 size={14} /> Удалить ключ
              </button>
            )}
          </div>
          {error && (
            <div className="text-error text-sm flex items-center gap-1">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <p className="text-xs text-base-content/50">
            Ключ хранится на сервере под твоим аккаунтом и другим не виден. Файл наружу не отдаётся.
          </p>
        </div>
      </section>

      <ChangePassword />

      {isAdmin && <AdminUsers />}

      <Row icon={<Bot />} title="Движок генерации" value="Claude Code (headless)" ok />
      <Row icon={<MonitorPlay />} title="Рендерер" value={status?.chromePath ?? "—"} ok />
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
    setRows((rs) => rs.map((r) => (r.userId === row.userId ? { ...r, hidden: nextHidden } : r)));
    try {
      await apiClient.setUserDecks(row.userId, nextHidden);
    } catch {
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
          <h2 className="card-title text-base">Пользователи и паки</h2>
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
            <p className="text-sm font-medium mb-2">Кто какие паки видит</p>
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

// Self-service password change — any logged-in user changes their OWN password.
function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = cur.length > 0 && next.length >= 6 && next === confirm;

  async function submit() {
    setMsg(null);
    if (next !== confirm) return setMsg({ ok: false, text: "Новый пароль и подтверждение не совпадают" });
    if (next.length < 6) return setMsg({ ok: false, text: "Новый пароль — минимум 6 символов" });
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || data?.error) {
        setMsg({ ok: false, text: data?.error || "Не удалось сменить пароль" });
        return;
      }
      setMsg({ ok: true, text: "Пароль изменён. Теперь его знаешь только ты — администратору он неизвестен." });
      setCur("");
      setNext("");
      setConfirm("");
    } catch {
      setMsg({ ok: false, text: "Ошибка сети" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2">
          <Lock className="text-primary" size={18} />
          <h2 className="card-title text-base">Смена пароля</h2>
        </div>
        <p className="text-sm text-base-content/70">
          Поменяй пароль, который выдал администратор, на свой — знать его будешь только ты.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="form-control w-44">
            <span className="label-text">Текущий пароль</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="form-control w-44">
            <span className="label-text">Новый (≥6)</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="form-control w-44">
            <span className="label-text">Повтори новый</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button className="btn btn-primary btn-sm gap-1" onClick={submit} disabled={busy || !valid}>
            {busy ? <span className="loading loading-spinner loading-sm" /> : <KeyRound size={14} />}
            Сменить пароль
          </button>
        </div>
        {msg && (
          <div className={`text-sm flex items-center gap-1 ${msg.ok ? "text-success" : "text-error"}`}>
            {msg.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {msg.text}
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ icon, title, value, ok }: { icon: ReactNode; title: string; value: string; ok?: boolean }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body flex-row items-center gap-4 py-4">
        <div className="text-primary">{icon}</div>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-base-content/60 break-all">{value}</div>
        </div>
        <span className={`badge ${ok ? "badge-success" : "badge-error"} badge-sm`}>{ok ? "OK" : "—"}</span>
      </div>
    </div>
  );
}
