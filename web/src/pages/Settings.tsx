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
import { apiClient, ApiError, type AppStatus, type AppSettings, type AdminUser } from "../lib/api";
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
    apiClient.settings().then(setSettings).catch(() => {});
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
    setBusy(true);
    try {
      setSettings(await apiClient.removeGoogleKey());
      apiClient.status().then(setStatus).catch(() => {});
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

          <p className="text-sm text-base-content/70">
            Чтобы постить на свои YouTube-каналы, нужен твой собственный OAuth-ключ. В{" "}
            <a
              className="link link-primary"
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>{" "}
            включи <b>YouTube Data API v3</b>, создай OAuth-клиент типа «Веб-приложение», добавь в нём
            этот redirect URI и скачай <code>client_secret.json</code>:
          </p>
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  const load = () => apiClient.adminUsers().then(setUsers).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setError("");
    setCreated("");
    setBusy(true);
    try {
      const u = await apiClient.createUser(username.trim(), password, role);
      setCreated(`Создан «${u.username}» (${u.role === "admin" ? "админ" : "пользователь"})`);
      setUsername("");
      setPassword("");
      setRole("user");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать пользователя");
    } finally {
      setBusy(false);
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

        <div className="flex flex-wrap gap-2">
          {users.map((u) => (
            <span key={u.id} className="badge badge-lg gap-1 py-3">
              {u.role === "admin" && <span className="text-primary text-xs font-bold">★</span>}
              {u.username}
              {u.locked && <Lock size={12} className="text-warning" />}
            </span>
          ))}
        </div>

        <div className="border-t border-base-300 pt-3">
          <p className="text-sm text-base-content/70 mb-2">
            Создать аккаунт для друга. Он войдёт по логину/паролю и загрузит свой Google-ключ.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="label-text">Логин</span>
              <input
                className="input input-bordered input-sm w-40 mt-1 block"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <span className="label-text">Пароль (≥6)</span>
              <input
                type="text"
                className="input input-bordered input-sm w-44 mt-1 block font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div>
              <span className="label-text">Роль</span>
              <select
                className="select select-bordered select-sm mt-1 block"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="user">пользователь</option>
                <option value="admin">админ</option>
              </select>
            </div>
            <button
              className="btn btn-primary btn-sm gap-1"
              onClick={add}
              disabled={busy || !username.trim() || password.length < 6}
            >
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Plus size={14} />}
              Создать
            </button>
          </div>
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
          <div>
            <span className="label-text">Текущий пароль</span>
            <input
              type="password"
              className="input input-bordered input-sm w-44 mt-1 block"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <span className="label-text">Новый (≥6)</span>
            <input
              type="password"
              className="input input-bordered input-sm w-44 mt-1 block"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <span className="label-text">Повтори новый</span>
            <input
              type="password"
              className="input input-bordered input-sm w-44 mt-1 block"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
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
