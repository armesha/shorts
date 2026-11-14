import { useEffect, useState } from "react";
import { get, send } from "../lib/api/http";
import { confirmDialog } from "../lib/confirm";

type Marks = { SR?: boolean; SM?: boolean };
type Clip = { number: number; title: string; videoUrl: string; imageUrl?: string; duration: number; on_screen_hook?: string; caption_and_tags?: string; viral_score?: number; trigger?: string; marks?: Marks };
type Job = { id: string; title?: string; stage: string; status: string; error?: string; detectedMode?: "serial" | "highlights"; clips: Clip[]; marks?: Marks };
type State = { enabled: boolean; canManage: boolean; lastDay?: string; error?: string; jobs: Job[] };

export default function DailyCutting() {
  const [state, setState] = useState<State>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const load = () => get<State>("/video-cutting/daily").then(data => { setState(data); setError(""); }).catch(e => setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку."));
  useEffect(() => { void load(); window.addEventListener("cutting:changed", load); const timer = window.setInterval(load, 10000); return () => { window.removeEventListener("cutting:changed", load); window.clearInterval(timer); }; }, []);
  const action = async () => {
    setBusy(true); setError("");
    try { await send(`/video-cutting/daily/${state?.enabled ? "stop" : "start"}`, "POST", {}); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить расписание."); }
    finally { setBusy(false); }
  };
  if (!state) return error ? <p role="alert" className="text-sm text-error">{error}</p> : null;
  if (!state.canManage && !state.jobs.length) return null;
  const job = state.jobs.find(item => item.id === selected) || state.jobs[0];
  const setMark = async (id: string, part: number | null, mark: "SR" | "SM", checked: boolean) => {
    setBusy(true); setError("");
    try { await send(`/video-cutting/jobs/${id}/marks`, "POST", { part, mark, checked }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить отметку."); }
    finally { setBusy(false); }
  };
  const marks = (id: string, part: number | null, value?: Marks) => <fieldset className="flex shrink-0 gap-2" disabled={busy || !state.canManage} aria-label={part === null ? "Отметки публикации исходника" : `Отметки публикации части ${part}`}>
    {(["SR", "SM"] as const).map(mark => <label key={mark} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${value?.[mark] ? "border-green-700 bg-green-100 text-green-900" : mark === "SR" ? "border-amber-500 bg-amber-100 text-amber-950" : "border-sky-500 bg-sky-100 text-sky-950"}`}>
      <input type="checkbox" checked={!!value?.[mark]} onChange={e => void setMark(id, part, mark, e.target.checked)} className="checkbox checkbox-xs" aria-label={`${mark}: опубликовано вручную`} />{mark}
    </label>)}
  </fieldset>;
  const summaryMarks = (item: Job) => <div className="flex shrink-0 flex-wrap gap-2" aria-label="Отметки всех частей">
    {(["SR", "SM"] as const).map(mark => {
      const count = item.clips.filter(clip => clip.marks?.[mark]).length;
      const complete = item.clips.length > 0 && count === item.clips.length;
      return <span key={mark} className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${complete ? "border-green-700 bg-green-100 text-green-900" : mark === "SR" ? "border-amber-500 bg-amber-100 text-amber-950" : "border-sky-500 bg-sky-100 text-sky-950"}`} aria-label={`${mark}: отмечено ${count} из ${item.clips.length}`}>
        <input type="checkbox" checked={complete} readOnly tabIndex={-1} className="checkbox checkbox-xs pointer-events-none" aria-hidden="true" />{mark} {count}/{item.clips.length}
      </span>;
    })}
  </div>;
  const remove = async (part?: number) => {
    if (!job || !(await confirmDialog(part ? "Часть будет удалена из нарезки и галереи." : "Нарезка и её части будут удалены из галереи. Копии в библиотеках каналов останутся.", { title: part ? `Удалить часть ${part}?` : "Удалить нарезку?", confirmText: "Удалить", danger: true }))) return;
    setBusy(true); setError("");
    try { await send(`/video-cutting/jobs/${job.id}${part ? `/clips/${part}` : ""}`, "DELETE"); if (!part) setSelected(""); window.dispatchEvent(new Event("cutting:changed")); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось удалить нарезку."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-lg border border-base-300 bg-base-100 p-4 sm:p-5" aria-labelledby="daily-cutting-heading">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h2 id="daily-cutting-heading" className="text-lg font-semibold">Ежедневные нарезки</h2>
      {state.canManage && <button type="button" className="btn btn-outline" disabled={busy} onClick={action}>{state.enabled ? "Остановить" : "Включить"}</button>}
    </div>
    {(error || state.error) && <p role="alert" className="mt-3 text-sm text-error">{error || state.error}</p>}
    {state.jobs.length ? <div className="mt-4 space-y-4">
      <h3 className="text-sm font-semibold">Библиотека исходников</h3>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="group" aria-label="Выберите исходное видео">
        {state.jobs.map(item => <div key={item.id} className={`min-w-0 rounded-xl border p-3 ${job?.id === item.id ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"}`}>
          <div className="flex items-start gap-3"><button type="button" aria-pressed={job?.id === item.id} onClick={() => setSelected(item.id)} className="min-w-0 flex-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className="block break-words font-semibold">{item.title || "Видео в обработке"}</span>
            <span className={`mt-2 block text-sm ${item.status === "failed" ? "text-error" : "text-base-content/70"}`}>{item.stage}</span>
            <span className="mt-2 block text-xs text-base-content/60">Частей: {item.clips.length}</span>
          </button>{summaryMarks(item)}</div>
        </div>)}
      </div>
      <button type="button" className="btn btn-outline btn-error btn-sm" onClick={() => void remove()} disabled={busy || !job || !["completed", "failed", "cancelled"].includes(job.status)}>Удалить нарезку</button>
      {job?.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
      {job?.detectedMode && <p className="text-sm">Режим: {job.detectedMode === "serial" ? "сериал" : "лучшие моменты"}</p>}
      {job && !job.clips.length && <p className="text-sm">{job.stage}</p>}
      <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">{job?.clips.map(clip => <article key={clip.number} className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3"><h3 className="min-w-0 font-semibold">{clip.title}</h3>{marks(job.id, clip.number, clip.marks)}</div>
        {clip.viral_score != null && <p className="text-sm">Оценка потенциала: {clip.viral_score}/10</p>}
        <video className="max-h-[32rem] w-full bg-black" controls preload="metadata" src={clip.videoUrl} poster={clip.imageUrl} />
        {clip.caption_and_tags && <p className="whitespace-pre-wrap text-sm">{clip.caption_and_tags}</p>}
        <a className="link link-primary text-sm" href={clip.videoUrl} download>Скачать ролик</a>
        {clip.imageUrl && <a className="link link-primary ml-3 text-sm" href={clip.imageUrl} download>Скачать превью</a>}
        <button type="button" className="btn btn-ghost btn-error btn-sm ml-2" disabled={busy || !["completed", "failed", "cancelled"].includes(job.status)} onClick={() => void remove(clip.number)}>Удалить часть</button>
      </article>)}</div>
    </div> : <p className="mt-4 text-sm text-base-content/70">Готовых нарезок пока нет.</p>}
  </section>;
}
