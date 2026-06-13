import { useEffect, useState, type ReactNode } from "react";
import { Bot, KeyRound, MonitorPlay, Save, Check, AlertTriangle } from "lucide-react";
import { apiClient, type AppStatus, type AppSettings } from "../lib/api";

export default function Settings() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiClient.status().then(setStatus).catch(() => {});
    apiClient
      .settings()
      .then((s) => {
        setSettings(s);
        setPath(s.googleClientSecretFile);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const s = await apiClient.updateSettings(path.trim());
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Файл по этому пути не найден — проверь путь.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="text-base-content/60">Система и интеграции</p>
      </header>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <KeyRound className="text-primary" size={18} />
            <h2 className="card-title text-base">Ключ Google (client-secret)</h2>
            {settings &&
              (settings.exists ? (
                <span className="badge badge-success badge-sm">файл найден</span>
              ) : (
                <span className="badge badge-error badge-sm">файл не найден</span>
              ))}
            {settings?.isDefault && <span className="badge badge-ghost badge-sm">по умолчанию</span>}
          </div>
          <span className="label-text">Полный путь к файлу ключа (.json)</span>
          <div className="join w-full">
            <input
              className="input input-bordered join-item flex-1 font-mono text-xs"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/home/.../client_secret_...apps.googleusercontent.com.json"
            />
            <button className="btn btn-primary join-item" onClick={save} disabled={saving}>
              {saving ? (
                <span className="loading loading-spinner loading-sm" />
              ) : saved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
          {error && (
            <div className="text-error text-sm flex items-center gap-1">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <p className="text-xs text-base-content/50">
            Файл должен существовать на диске. По умолчанию стоит твой захардкоженный путь — здесь его
            можно сменить на другой.
          </p>
        </div>
      </section>

      <Row icon={<Bot />} title="Движок генерации" value="Claude Code (headless)" ok />
      <Row icon={<MonitorPlay />} title="Рендерер" value={status?.chromePath ?? "—"} ok />
    </div>
  );
}

function Row({
  icon,
  title,
  value,
  ok,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body flex-row items-center gap-4 py-4">
        <div className="text-primary">{icon}</div>
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-sm text-base-content/60 break-all">{value}</div>
        </div>
        <span className={`badge ${ok ? "badge-success" : "badge-error"} badge-sm`}>
          {ok ? "OK" : "—"}
        </span>
      </div>
    </div>
  );
}
