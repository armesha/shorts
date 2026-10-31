import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { get, send } from "../lib/api/http";

type Job = { id: string; day: string; slot: number; state: "queued" | "running" | "ready" | "failed"; error?: string };
type Flagged = { messageId: number; verdict: "borderline" | "reject"; reasons?: string[] };
type Library = { enabled: boolean; running: boolean; configured: boolean; canGenerate: boolean; jobs: Job[]; flagged?: Flagged[] };
const states: Record<Job["state"], string> = { queued: "В очереди", running: "Готовим видео", ready: "Готово", failed: "Не удалось подготовить" };

export default function CircleLibrary() {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await get<Library>("/circle-pipeline")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку."); }
  }, []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 10_000); return () => clearInterval(timer); }, [refresh]);
  async function toggle() {
    if (!data) return;
    setBusy(true); setError("");
    try { await send(`/circle-pipeline/${data.enabled ? "stop" : "start"}`, "POST"); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить расписание."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="space-y-3">
      <Link to="/circles" className="btn btn-ghost btn-sm gap-2"><ArrowLeft size={16} />Редактор кружков</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Библиотека кружков</h1>
        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => void refresh()}><RefreshCw size={16} />Обновить</button>
      </div>
      <p className="max-w-2xl text-base-content/75">До двух роликов в день с выбранным шаблоном и баннером. Кадры и речь проверяются до сборки.</p>
    </header>
    {error && <div role="alert" className="alert alert-error">{error}</div>}
    {!data && !error && <p role="status">Загрузка библиотеки…</p>}
    {data && <>
      <section className="space-y-3 border-y border-base-300 py-6" aria-labelledby="circle-schedule-title">
        <h2 id="circle-schedule-title" className="text-lg font-semibold">Ежедневная генерация</h2>
        <p>{data.enabled ? "Расписание включено" : "Расписание остановлено"}{data.running ? " · Подготавливаем ролик" : ""}</p>
        {!data.configured && <p className="text-sm text-warning-content">Источник Telegram пока не подключён.</p>}
        <p className="text-sm text-base-content/70">Готовые ролики сохраняются здесь. Публикация не включается автоматически.</p>
        {data.canGenerate && <button type="button" className="btn btn-outline" disabled={busy || (!data.enabled && !data.configured)} onClick={() => void toggle()}>{data.enabled ? "Остановить" : "Запустить"}</button>}
      </section>
      {!!data.flagged?.length && <section className="space-y-3" aria-labelledby="circle-review-title">
        <h2 id="circle-review-title" className="text-lg font-semibold">Не прошли проверку · {data.flagged.length}</h2>
        <div className="divide-y divide-base-300">{data.flagged.map(item => <article key={item.messageId} className="space-y-2 py-4">
          <p className="font-medium">{item.verdict === "reject" ? "Отклонён" : "Нужна ручная проверка"}</p>
          {item.reasons?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-base-content/75">{[...new Set(item.reasons)].slice(0, 3).map(reason => <li key={reason}>{reason}</li>)}</ul> : null}
          <a className="link text-sm" href={`https://t.me/kruglyashiki/${item.messageId}`} target="_blank" rel="noreferrer">Открыть исходный кружок</a>
        </article>)}</div>
      </section>}
      <section className="space-y-4" aria-labelledby="circle-library-title">
        <h2 id="circle-library-title" className="text-lg font-semibold">Видео · {data.jobs.filter(job => job.state === "ready").length}</h2>
        {!data.jobs.length && <p className="py-8 text-base-content/70">Здесь появятся готовые ролики.</p>}
        <div className="divide-y divide-base-300">{data.jobs.map(job => <article key={job.id} className="flex flex-col gap-5 py-6 sm:flex-row">
          {job.state === "ready" && <video className="aspect-[9/16] w-full max-w-[240px] rounded-xl bg-neutral object-contain" controls preload="none" playsInline aria-label="Готовое видео с кружком"><source src={`/api/circle-pipeline/jobs/${job.id}/video`} type="video/mp4" /></video>}
          <div className="space-y-3"><h3 className="font-semibold">Ролик {job.slot + 1} · {job.day.split("-").reverse().join(".")}</h3>
            <p aria-live="polite" className={job.state === "failed" ? "text-error" : "text-base-content/75"}>{states[job.state]}</p>
            {job.error && <p className="text-sm text-error">{job.error}</p>}
            {job.state === "ready" && <a className="btn btn-outline btn-sm gap-2" download href={`/api/circle-pipeline/jobs/${job.id}/video`}><Download size={16} />Скачать MP4</a>}
          </div>
        </article>)}</div>
      </section>
    </>}
  </div>;
}
