import { useEffect, useState } from "react";
import { get, send } from "../lib/api/http";

type Marks = { SR?: boolean; SM?: boolean };
export type CuttingListJob = { id: string; title?: string; stage: string; status: string; clips: { marks?: Marks }[] };
type DailyState = { enabled: boolean; canManage: boolean; error?: string };

export default function DailyCutting({ jobs, selected, onSelect }: { jobs: CuttingListJob[]; selected?: string; onSelect: (id: string) => void }) {
  const [state, setState] = useState<DailyState>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  return <section className="space-y-3" aria-labelledby="cutting-library-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="cutting-library-heading" className="text-lg font-semibold">Все нарезки</h2>
      {state?.canManage && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void toggle()}>{state.enabled ? "Остановить ежедневный поиск" : "Включить ежедневный поиск"}</button>}
    </div>
    {(error || state?.error) && <p role="alert" className="text-sm text-error">{error || state?.error}</p>}
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
