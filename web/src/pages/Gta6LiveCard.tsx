import { useEffect, useState, type FormEvent } from "react";
import { get, send } from "../lib/api/http";

type Clip = { file: string; class: string; url: string };
type Channel = {
  id: string;
  label: string;
  running: boolean;
  line: string;
  error: string;
  clips: Clip[];
};
type LiveState = { limit: number; used: number; channels: Channel[] };

const MINUTES = [10, 12, 15] as const;
const CLASS_NAME: Record<string, string> = { first_look: "Взгляд", graphics: "Графика", clothing: "Одежда" };

const HOUR_STREAMS = [
  { label: "LiveNOW FOX 24/7", url: "https://www.youtube.com/watch?v=C96oohpWBGw" },
  { label: "LiveNOW from FOX", url: "https://www.youtube.com/watch?v=0TtsQz8oOv4" },
];

export default function Gta6LiveCard() {
  const [state, setState] = useState<LiveState>();
  const [url, setUrl] = useState("");
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>(10);
  const [hour, setHour] = useState(true);
  const [telegram, setTelegram] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const full = (state?.used ?? 0) >= (state?.limit ?? 5);

  useEffect(() => {
    let alive = true;
    const load = () => get<LiveState>("/gta6-live").then((data) => { if (alive) setState(data); }).catch((reason) => {
      if (alive) setError(reason instanceof Error ? reason.message : "Не удалось загрузить эфир.");
    });
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const start = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await send<LiveState>("/gta6-live/start", "POST", { url, minutes, telegram, ...(hour && minutes === 10 ? { chunks: 6 } : {}) });
      setState(next);
      setUrl("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось начать эфир.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    setBusy(true);
    setError("");
    try { setState(await send<LiveState>("/gta6-live/stop", "POST", { id })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось остановить канал."); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4" aria-labelledby="gta6-live-title">
      <form onSubmit={(event) => void start(event)} className="flex flex-wrap items-center gap-2">
        <h2 id="gta6-live-title" className="text-lg font-semibold">Трансляции</h2>
        <span className="mr-auto text-sm tabular-nums text-base-content/70">{state?.used ?? 0}/{state?.limit ?? 5}</span>
        <input
          type="url"
          required
          maxLength={2048}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="YouTube или Twitch"
          aria-label="Ссылка на эфир"
          className="input input-bordered min-w-0 w-full sm:w-auto sm:flex-1"
          disabled={busy || full}
        />
        <div className="join" role="group" aria-label="Минуты">
          {MINUTES.map((value) => (
            <button key={value} type="button" className={`btn btn-sm join-item ${minutes === value ? "btn-active" : "btn-ghost"}`} aria-pressed={minutes === value} disabled={busy || full} onClick={() => setMinutes(value)}>{value}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="toggle toggle-sm" checked={telegram} disabled={busy || full} onChange={(event) => setTelegram(event.target.checked)} />
          ТГ
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="toggle toggle-sm" checked={hour} disabled={busy || full || minutes !== 10} onChange={(event) => setHour(event.target.checked)} />
          Час, каждые 10 мин, 3–5 нарезок
        </label>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || full || !url.trim()}>Старт</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {HOUR_STREAMS.map((stream) => (
          <button key={stream.url} type="button" className="btn btn-xs btn-outline" disabled={busy || full} onClick={() => { setUrl(stream.url); setMinutes(10); setHour(true); }}>{stream.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
      {!!state?.channels.length && (
        <ul className="mt-3 space-y-3">
          {state.channels.map((channel) => (
            <li key={channel.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{channel.label}</span>
                {channel.line && <span className="text-sm text-base-content/70">{channel.line}</span>}
                {channel.running && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void stop(channel.id)}>Стоп</button>}
              </div>
              {channel.error && <p role="alert" className="text-sm text-error">{channel.error}</p>}
              {!!channel.clips.length && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {channel.clips.map((clip) => (
                    <video key={clip.file} controls preload="metadata" src={clip.url} aria-label={`${channel.label}. ${CLASS_NAME[clip.class] || "Клип"}`} className="aspect-[9/16] w-full rounded-lg bg-black" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
