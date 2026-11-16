import { useEffect, useState, type FormEvent } from "react";
import { get, send } from "../lib/api/http";

type Clip = { file: string; class: string; url: string };
type LiveState = { running: boolean; url: string; minutes: number; telegram: boolean; line: string; error: string; clips: Clip[] };

const MINUTES = [10, 12, 15] as const;
const CLASS_NAME: Record<string, string> = { first_look: "Взгляд", graphics: "Графика", clothing: "Одежда" };

export default function Gta6LiveCard() {
  const [state, setState] = useState<LiveState>();
  const [url, setUrl] = useState("");
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>(10);
  const [telegram, setTelegram] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => get<LiveState>("/gta6-live").then((data) => {
      if (!alive) return;
      setState(data);
      setUrl((current) => current || data.url);
      if (data.minutes === 10 || data.minutes === 12 || data.minutes === 15) setMinutes(data.minutes);
      setTelegram(data.telegram);
    }).catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "Не удалось загрузить эфир."); });
    void load();
    const timer = window.setInterval(() => { if (state?.running) void load(); }, 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [state?.running]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = state?.running
        ? await send<LiveState>("/gta6-live/stop", "POST")
        : await send<LiveState>("/gta6-live/start", "POST", { url, minutes, telegram });
      setState(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось изменить эфир.");
    } finally {
      setBusy(false);
    }
  };

  const shown = error || state?.error || "";
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4" aria-labelledby="gta6-live-title">
      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-center gap-2">
        <h2 id="gta6-live-title" className="mr-auto text-lg font-semibold">Эфир</h2>
        <input
          type="url"
          required={!state?.running}
          maxLength={2048}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="YouTube или Twitch"
          aria-label="Ссылка на эфир"
          className="input input-bordered min-w-0 w-full sm:w-auto sm:flex-1"
          disabled={busy || state?.running}
        />
        <div className="join" role="group" aria-label="Минуты">
          {MINUTES.map((value) => (
            <button
              key={value}
              type="button"
              className={`btn btn-sm join-item ${minutes === value ? "btn-active" : "btn-ghost"}`}
              aria-pressed={minutes === value}
              disabled={busy || state?.running}
              onClick={() => setMinutes(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="toggle toggle-sm" checked={telegram} disabled={busy || state?.running} onChange={(event) => setTelegram(event.target.checked)} />
          ТГ
        </label>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || (!state?.running && !url.trim())}>
          {state?.running ? "Стоп" : "Старт"}
        </button>
      </form>
      {state?.line && <p className="mt-3 text-sm">{state.line}</p>}
      {shown && <p role="alert" className="mt-2 text-sm text-error">{shown}</p>}
      {!!state?.clips.length && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {state.clips.map((clip) => (
            <video key={clip.file} controls preload="metadata" src={clip.url} aria-label={CLASS_NAME[clip.class] || "Клип"} className="aspect-[9/16] w-full rounded-lg bg-black" />
          ))}
        </div>
      )}
    </section>
  );
}
