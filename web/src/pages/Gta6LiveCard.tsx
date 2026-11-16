import { useEffect, useState, type FormEvent } from "react";
import { get, send } from "../lib/api/http";

type Clip = { file: string; class: string; url: string };
type Channel = {
  id: string;
  url: string;
  label: string;
  minutes?: number;
  chunks?: number;
  cuts?: number;
  running: boolean;
  line: string;
  error: string;
  clips: Clip[];
};
type LiveState = { limit: number; used: number; channels: Channel[] };

const CLASS_NAME: Record<string, string> = { first_look: "Взгляд", graphics: "Графика", clothing: "Одежда" };
const clipsWord = (count: number) => count % 10 === 1 && count % 100 !== 11 ? "ролик" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "ролика" : "роликов";
const hoursWord = (count: number) => count % 10 === 1 && count % 100 !== 11 ? "час" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "часа" : "часов";
const SPANS = [30, 60, 120, 180];
const CHUNK_CHOICES = [5, 10, 15, 20, 30];

function formatSpan(total: number) {
  if (total < 60) return `${total} мин`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  const head = `${hours} ${hoursWord(hours)}`;
  return mins ? `${head} ${mins} мин` : head;
}

function formatClip(minutes: number, cuts: number) {
  const seconds = Math.max(1, Math.round((minutes * 60) / cuts));
  const whole = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!whole) return `${rest} сек`;
  if (!rest) return `${whole} мин`;
  return `${whole} мин ${rest} сек`;
}

const HOUR_STREAMS = [
  { label: "LiveNOW FOX 24/7", url: "https://www.youtube.com/watch?v=C96oohpWBGw" },
  { label: "LiveNOW from FOX", url: "https://www.youtube.com/watch?v=0TtsQz8oOv4" },
];

export default function Gta6LiveCard() {
  const [state, setState] = useState<LiveState>();
  const [url, setUrl] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [cuts, setCuts] = useState(4);
  const [chunks, setChunks] = useState(6);
  const [untilEnd, setUntilEnd] = useState(false);
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
      const next = await send<LiveState>("/gta6-live/start", "POST", untilEnd
        ? { url, minutes, telegram, cuts, untilEnd: true }
        : { url, minutes, telegram, chunks, cuts });
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

  const clipLength = formatClip(minutes, cuts);
  const sessionLength = formatSpan(minutes * chunks);
  const chooseSpan = (span: number) => {
    setUntilEnd(false);
    setChunks(Math.min(12, Math.max(1, Math.round(span / minutes))));
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="toggle toggle-sm" checked={telegram} disabled={busy || full} onChange={(event) => setTelegram(event.target.checked)} />
          ТГ
        </label>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || full || !url.trim()}>Старт</button>
      </form>
      <div className="join mt-4 flex w-full" role="group" aria-label="Сколько длится запись">
        <button type="button" className={`btn join-item btn-sm flex-1 ${untilEnd ? "btn-ghost" : "btn-primary"}`} aria-pressed={!untilEnd} disabled={busy || full} onClick={() => setUntilEnd(false)}>На время</button>
        <button type="button" className={`btn join-item btn-sm flex-1 ${untilEnd ? "btn-primary" : "btn-ghost"}`} aria-pressed={untilEnd} disabled={busy || full} onClick={() => setUntilEnd(true)}>До конца эфира</button>
      </div>
      <div className="mt-4 grid gap-4">
        <div className="grid gap-2 text-sm">
          <span className="flex justify-between gap-2"><span>Кусок эфира</span><span className="tabular-nums font-medium">{minutes} мин</span></span>
          <div className="flex flex-wrap gap-2">
            {CHUNK_CHOICES.map((value) => (
              <button key={value} type="button" className={`btn btn-xs ${minutes === value ? "btn-primary" : "btn-outline"}`} disabled={busy || full} aria-pressed={minutes === value} onClick={() => setMinutes(value)}>{value} мин</button>
            ))}
          </div>
          <input type="range" min={5} max={30} step={1} value={minutes} disabled={busy || full} aria-label="Длина куска в минутах" className="range range-xs range-primary" onChange={(event) => setMinutes(Number(event.target.value))} />
        </div>
        <label className="grid gap-1 text-sm">
          <span className="flex justify-between gap-2"><span>Длина ролика</span><span className="font-medium">около {clipLength}</span></span>
          <span className="flex justify-between text-xs text-base-content/60"><span>короче</span><span>длиннее</span></span>
          <input type="range" min={1} max={8} step={1} value={9 - cuts} disabled={busy || full} aria-label="Длина одного ролика" className="range range-xs range-primary" onChange={(event) => setCuts(9 - Number(event.target.value))} />
        </label>
        {untilEnd ? null : (
          <div className="grid gap-2 text-sm">
            <span className="flex justify-between gap-2"><span>Сколько писать</span><span className="font-medium">{sessionLength}</span></span>
            <div className="flex flex-wrap gap-2">
              {SPANS.map((span) => (
                <button key={span} type="button" className={`btn btn-xs ${minutes * chunks === span ? "btn-primary" : "btn-outline"}`} disabled={busy || full} aria-pressed={minutes * chunks === span} onClick={() => chooseSpan(span)}>{formatSpan(span)}</button>
              ))}
            </div>
            <input type="range" min={1} max={12} step={1} value={chunks} disabled={busy || full} aria-label="Сколько кусков записать" className="range range-xs range-primary" onChange={(event) => setChunks(Number(event.target.value))} />
          </div>
        )}
      </div>
      <div className="mt-3 rounded-lg bg-base-200 p-3 text-sm">
        <p className="font-medium">Ролик около {clipLength}</p>
        <p className="text-base-content/70">Каждые {minutes} мин — {cuts} {clipsWord(cuts)}. {untilEnd ? "Пишем, пока эфир не закончится." : `Вся запись около ${sessionLength}, до ${cuts * chunks} ${clipsWord(cuts * chunks)}.`}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {HOUR_STREAMS.map((stream) => (
          <button key={stream.url} type="button" className="btn btn-xs btn-outline" disabled={busy || full} onClick={() => { setUrl(stream.url); setMinutes(10); setCuts(4); setChunks(6); setUntilEnd(false); }}>{stream.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
      {!!state?.channels.length && (
        <ul className="mt-3 space-y-3">
          {state.channels.map((channel) => (
            <li key={channel.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <a className="link min-w-0 flex-1 truncate font-medium" href={channel.url} target="_blank" rel="noreferrer">{channel.label}</a>
                {channel.line && <span className="text-sm text-base-content/70">{channel.line}</span>}
                {channel.running && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void stop(channel.id)}>Стоп</button>}
              </div>
              {!!channel.minutes && !!channel.cuts && (
                <p className="text-sm text-base-content/70">Ролик около {formatClip(channel.minutes, channel.cuts)}. {channel.chunks ? `Запись около ${formatSpan(channel.minutes * channel.chunks)}.` : "До конца эфира."}</p>
              )}
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
