import { useEffect, useState } from "react";
import { get, send } from "../../lib/api/http";

type Status = { status: string; channelId: string | null; enabled: boolean; error: string | null; latest?: { day_key: string; state: string; url: string | null; error: string | null } | null };
const labels: Record<string, string> = { disconnected: "Не подключён", unchecked: "Cookies сохранены, проверьте вход", connected: "Вход подтверждён", needs_login: "Нужно обновить cookies" };

export default function CircleYouTubeCookieCard({ accountId, onConnected, canManage }: { accountId: number; onConnected: (value: boolean) => void; canManage: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [cookies, setCookies] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const base = `/circle-pipeline/youtube/${accountId}`;
  useEffect(() => { let active = true; void get<Status>(base).then(value => { if (active) { setStatus(value); onConnected(value.status === "connected"); } }).catch(() => {}); return () => { active = false; }; }, [base, onConnected]);
  async function action(kind: "cookies" | "verify" | "enable" | "disable" | "disconnect") {
    setBusy(true); setError("");
    try {
      const value = await send<Status>(`${base}/${kind}`, "POST", kind === "cookies" ? { cookies } : undefined);
      setStatus(value);
      onConnected(value.status === "connected");
      if (kind === "cookies") setCookies("");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить подключение."); }
    finally { setBusy(false); }
  }
  if (!status || (!canManage && status.status === "disconnected")) return null;
  return <section className="card border border-base-300 bg-base-100 mt-4">
    <div className="card-body gap-3">
      <h2 className="card-title text-base">YouTube для кружочков · cookies</h2>
      <p className="text-sm text-base-content/70">Отдельный ролик из библиотеки кружочков в 16:00 по Праге. Подключение использует браузерную сессию YouTube Studio.</p>
      <p className="text-sm"><b>{labels[status.status] || status.status}</b>{status.enabled ? " · расписание включено" : " · расписание выключено"}</p>
      {status.channelId && <a className="link link-primary text-sm" href={`https://www.youtube.com/channel/${status.channelId}`} target="_blank" rel="noreferrer">Открыть подтверждённый канал</a>}
      {(error || status.error) && <p role="alert" className="text-sm text-error">{error || status.error}</p>}
      {status.latest && <p className="text-sm text-base-content/70">Последняя отправка: {status.latest.day_key.split("-").reverse().join(".")} · {status.latest.state === "published" ? "опубликовано" : status.latest.state === "needs_review" ? "требует проверки" : status.latest.state === "uploading" ? "отправляется" : "не удалось"}{status.latest.error ? ` · ${status.latest.error}` : ""}</p>}
      {canManage && <details>
        <summary className="cursor-pointer text-sm font-medium">Загрузить или заменить cookies</summary>
        <div className="mt-3 space-y-3">
          <input type="file" accept=".json,application/json" className="file-input file-input-bordered file-input-sm w-full" aria-label="Файл cookies YouTube" onChange={event => {
            const file = event.target.files?.[0];
            if (file && file.size <= 512_000) void file.text().then(setCookies).catch(() => setError("Не удалось прочитать файл."));
            else if (file) setError("Файл должен быть не больше 500 КБ.");
          }} />
          <textarea className="textarea textarea-bordered w-full" rows={3} aria-label="Cookies YouTube" value={cookies} onChange={event => setCookies(event.target.value)} placeholder="JSON cookies" />
          <button type="button" className="btn btn-outline btn-sm" disabled={busy || !cookies.trim()} onClick={() => void action("cookies")}>Сохранить cookies</button>
        </div>
      </details>}
      {canManage && <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || status.status === "disconnected"} onClick={() => void action("verify")}>Проверить вход</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy || (!status.enabled && status.status !== "connected")} onClick={() => void action(status.enabled ? "disable" : "enable")}>{status.enabled ? "Выключить расписание" : "Включить расписание"}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy || status.status === "disconnected"} onClick={() => void action("disconnect")}>Отключить</button>
      </div>}
    </div>
  </section>;
}
