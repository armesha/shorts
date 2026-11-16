import { useEffect, useState } from "react";
import { get, send } from "../lib/api/http";

type Marks = { SR?: boolean; SM?: boolean };
export type CuttingListJob = { id: string; title?: string; stage: string; status: string; clips: { marks?: Marks }[] };
type CuttingChannel = { name: string; url: string; builtin?: boolean };
type DailyState = { enabled: boolean; canManage: boolean; error?: string; pending?: { id: string; jobId?: string }; channels?: CuttingChannel[] };

export default function DailyCutting({ jobs, selected, onSelect }: { jobs: CuttingListJob[]; selected?: string; onSelect: (id: string) => void }) {
  const [state, setState] = useState<DailyState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [channelUrl, setChannelUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const running = jobs.find(job => !["completed", "failed", "cancelled"].includes(job.status));
  useEffect(() => {
    let alive = true;
    const load = () => get<DailyState>("/video-cutting/daily").then(data => { if (alive) setState(data); }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "Не удалось загрузить расписание."); });
    void load();
    window.addEventListener("cutting:changed", load);
    return () => { alive = false; window.removeEventListener("cutting:changed", load); };
  }, []);
  const toggle = async () => {
    setBusy(true); setError("");
    try { const next = await send<Pick<DailyState, "enabled" | "error">>(`/video-cutting/daily/${state?.enabled ? "stop" : "start"}`, "POST", {}); setState(current => current ? { ...current, ...next } : current); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить расписание."); }
    finally { setBusy(false); }
  };
  const runNow = async () => {
    setBusy(true); setError("");
    try {
      await send("/video-cutting/daily/run-now", "POST", {});
      window.dispatchEvent(new Event("cutting:changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось запустить нарезку."); }
    finally { setBusy(false); }
  };
  const addChannel = async () => {
    setBusy(true); setError("");
    try {
      const next = await send<DailyState>("/video-cutting/daily/channels", "POST", { url: channelUrl, name: channelName || undefined });
      setState(current => current ? { ...current, ...next } : next);
      setChannelUrl(""); setChannelName("");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось добавить канал."); }
    finally { setBusy(false); }
  };
  const removeChannel = async (url: string) => {
    setBusy(true); setError("");
    try {
      const next = await send<DailyState>("/video-cutting/daily/channels", "DELETE", { url });
      setState(current => current ? { ...current, ...next } : next);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось удалить канал."); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3" aria-labelledby="cutting-library-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="cutting-library-heading" className="text-lg font-semibold">Все нарезки</h2>
      {state?.canManage && <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !state.enabled || !!running} onClick={() => void runNow()}>Запустить нарезку сейчас</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void toggle()}>{state.enabled ? "Остановить ежедневный поиск" : "Включить ежедневный поиск"}</button>
      </div>}
    </div>
    {running && <p className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm" role="status">Сейчас: {running.title || "Видео в обработке"} — {running.stage}</p>}
    {!running && state?.pending && <p className="text-sm text-base-content/70" role="status">В очереди видео {state.pending.id}{state.pending.jobId ? "" : ", запуск ещё не создал задачу."}</p>}
    {(error || state?.error) && <p role="alert" className="text-sm text-error">{error || state?.error}</p>}
    {state?.canManage && <form className="grid gap-2 rounded-lg border border-base-300 bg-base-100 p-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]" onSubmit={event => { event.preventDefault(); void addChannel(); }}>
      <label className="sr-only" htmlFor="cutting-channel-url">Ссылка на канал YouTube</label>
      <input id="cutting-channel-url" type="url" required maxLength={300} value={channelUrl} onChange={event => setChannelUrl(event.target.value)} placeholder="https://www.youtube.com/@channel/videos" className="input input-bordered input-sm w-full" />
      <label className="sr-only" htmlFor="cutting-channel-name">Название канала</label>
      <input id="cutting-channel-name" type="text" maxLength={80} value={channelName} onChange={event => setChannelName(event.target.value)} placeholder="Название" className="input input-bordered input-sm w-full" />
      <button type="submit" className="btn btn-outline btn-sm" disabled={busy || !state.enabled}>Добавить канал</button>
    </form>}
    {!!state?.channels?.length && <ul className="flex flex-wrap gap-2" aria-label="Каналы нарезки">
      {state.channels.map(channel => <li key={channel.url} className="flex items-center gap-2 rounded-full border border-base-300 px-3 py-1 text-sm">
        <span>{channel.name}</span>
        {!channel.builtin && <button type="button" className="text-error" disabled={busy} onClick={() => void removeChannel(channel.url)}>Убрать</button>}
      </li>)}
    </ul>}
    {jobs.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="group" aria-label="Выберите нарезку">
      {jobs.map(job => <button key={job.id} type="button" aria-pressed={selected === job.id} onClick={() => onSelect(job.id)} className={`min-w-0 rounded-lg border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected === job.id ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}>
        <span className="block break-words font-semibold">{job.title || (job.status === "failed" ? "Не удалось обработать видео" : "Видео в обработке")}</span>
        <span className={`mt-1 block text-sm ${job.status === "failed" ? "text-error" : "text-base-content/70"}`}>{job.stage}</span>
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-base-content/70">
          <span>Частей: {job.clips.length}</span>
          {(["SR", "SM"] as const).map(mark => <span key={mark}>{mark}: {job.clips.filter(clip => clip.marks?.[mark]).length}/{job.clips.length}</span>)}
        </span>
      </button>)}
    </div> : <p className="text-sm text-base-content/70">Нарезок пока нет.</p>}
  </section>;
}
