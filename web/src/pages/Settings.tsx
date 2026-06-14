import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { Bot, KeyRound, MonitorPlay, Check, AlertTriangle, Upload, Trash2, Lock } from "lucide-react";
import { apiClient, ApiError, type AppStatus, type AppSettings } from "../lib/api";

export default function Settings() {
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
        <p className="text-base-content/60">Твой Google-ключ и система</p>
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

      <Row icon={<Bot />} title="Движок генерации" value="Claude Code (headless)" ok />
      <Row icon={<MonitorPlay />} title="Рендерер" value={status?.chromePath ?? "—"} ok />
    </div>
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
