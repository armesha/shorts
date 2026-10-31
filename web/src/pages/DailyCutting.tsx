import { useEffect, useState } from "react";
import { get, send } from "../lib/api/http";

type Clip = { number: number; title: string; videoUrl: string; duration: number; on_screen_hook?: string; caption_and_tags?: string };
type Job = { id: string; title?: string; stage: string; status: string; error?: string; clips: Clip[] };
type State = { enabled: boolean; canManage: boolean; lastDay?: string; error?: string; jobs: Job[] };

export default function DailyCutting() {
  const [state, setState] = useState<State>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const load = () => get<State>("/video-cutting/daily").then(data => { setState(data); setError(""); }).catch(e => setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку."));
  useEffect(() => { void load(); const timer = window.setInterval(load, 10000); return () => window.clearInterval(timer); }, []);
  const action = async () => {
    setBusy(true); setError("");
    try { await send(`/video-cutting/daily/${state?.enabled ? "stop" : "start"}`, "POST", {}); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить расписание."); }
    finally { setBusy(false); }
  };
  if (!state) return error ? <p role="alert" className="text-sm text-error">{error}</p> : null;
  if (!state.canManage && !state.jobs.length) return null;
  const job = state.jobs.find(item => item.id === selected) || state.jobs[0];
  return <section className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-5" aria-labelledby="daily-cutting-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 id="daily-cutting-heading" className="text-lg font-semibold">Ежедневные нарезки</h2>
        <p className="mt-1 text-sm text-base-content/75">Одно исходное видео в день: популярные и недавние чередуются. Результаты сохраняются здесь.</p>
        <p className="mt-2 text-sm">Расписание: {state.enabled ? "включено" : "выключено"}{state.lastDay ? ` · последний выбор ${state.lastDay}` : ""}</p>
      </div>
      {state.canManage && <button type="button" className="btn btn-outline" disabled={busy} onClick={action}>{state.enabled ? "Остановить" : "Включить"}</button>}
    </div>
    {(error || state.error) && <p role="alert" className="mt-3 text-sm text-error">{error || state.error}</p>}
    {state.jobs.length ? <div className="mt-4 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="daily-cutting-job">Библиотека исходников</label>
      <select id="daily-cutting-job" className="select select-bordered w-full" value={job?.id || ""} onChange={e => setSelected(e.target.value)}>
        {state.jobs.map(item => <option key={item.id} value={item.id}>{item.title || "Видео в обработке"} · {item.stage}</option>)}
      </select>
      {job?.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
      {job && !job.clips.length && <p className="text-sm">{job.stage}</p>}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{job?.clips.map(clip => <article key={clip.number} className="min-w-0 space-y-2">
        <h3 className="font-semibold">{clip.title}</h3>
        <video className="max-h-[32rem] w-full bg-black" controls preload="metadata" src={clip.videoUrl} />
        {clip.caption_and_tags && <p className="whitespace-pre-wrap text-sm">{clip.caption_and_tags}</p>}
        <a className="link link-primary text-sm" href={clip.videoUrl} download>Скачать ролик</a>
      </article>)}</div>
    </div> : <p className="mt-4 text-sm text-base-content/70">Готовых нарезок пока нет.</p>}
  </section>;
}
