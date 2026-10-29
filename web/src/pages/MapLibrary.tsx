import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw, Play, Square, Film } from "lucide-react";
import { get, send } from "../lib/api/http";

type Job = { id: string; kind: "sample" | "daily"; status: "queued" | "running" | "ready" | "failed"; stage: string; createdAt: string; finishedAt?: string; idea?: { title: string }; error?: string; attempts?: number };
type Library = { canGenerate?: boolean; campaign: { startedAt: string; endsAt: string; stoppedAt?: string; runs: { day: number; state: string }[] } | null; jobs: Job[] };
const time = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export default function MapLibrary() {
  const [data, setData] = useState<Library | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await get<Library>("/map-pipeline")); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку."); }
  }, []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const next = await get<Library>("/map-pipeline"); if (alive) { setData(next); setError(""); } }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : "Не удалось загрузить библиотеку."); }
    };
    void load(); const timer = window.setInterval(() => void load(), 10_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const act = async (action: "samples" | "start" | "stop") => {
    setBusy(true); setError("");
    try { const result = await send<Library>(`/map-pipeline/${action}`, "POST"); setData(previous => ({ ...result, canGenerate: previous?.canGenerate })); }
    catch (e) { setError(e instanceof Error ? e.message : "Действие не выполнено. Попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  const campaign = data?.campaign;
  const ended = !!campaign && Date.parse(campaign.endsAt) <= Date.now();
  const samples = data?.jobs.filter(j => j.kind === "sample") || [];
  const retry = samples.some(j => j.status === "failed" && (j.attempts || 0) < 3);
  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="space-y-3">
      <Link to="/templates/maps" className="btn btn-ghost btn-sm gap-2"><ArrowLeft size={16} />Редактор карт</Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Библиотека карт</h1>
        <button type="button" className="btn btn-ghost btn-sm gap-2" onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} />Обновить</button>
      </div>
      <p className="max-w-2xl text-base-content/75">Готовые ролики с озвучкой сохраняются здесь. Под баннер выделено неподвижное место. Публикация в соцсети не подключена.</p>
    </header>
    {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
    {!data && !error && <p role="status">Загрузка библиотеки…</p>}
    {data && <>
      <section className="space-y-4 border-y border-base-300 py-6" aria-labelledby="map-schedule-title">
        <h2 id="map-schedule-title" className="text-lg font-semibold">Одно видео в день · 30 дней</h2>
        {campaign ? <div className="space-y-2">
          <p className="font-medium">{campaign.stoppedAt ? "Расписание остановлено" : ended ? "Срок генерации завершён" : "Ежедневная генерация включена"}</p>
          <p className="text-sm text-base-content/75">Начало: {time(campaign.startedAt)}. Автоматическая остановка: {time(campaign.endsAt)}.</p>
          <p className="text-sm text-base-content/75">Готово по расписанию: {campaign.runs.filter(r => r.state === "ready").length} из 30. Два пробных ролика считаются отдельно.</p>
        </div> : <p className="text-sm text-base-content/75">После запуска срок фиксируется. Перезапуск сервиса и повторное нажатие не продлевают его.</p>}
        <div className="flex flex-wrap gap-3">
          {!campaign && data.canGenerate && <button className="btn btn-primary gap-2" type="button" disabled={busy} onClick={() => void act("start")}><Play size={16} />Запустить на 30 дней</button>}
          {campaign && !ended && !campaign.stoppedAt && <button className="btn btn-outline gap-2" type="button" disabled={busy} onClick={() => void act("stop")}><Square size={16} />Остановить расписание</button>}
          {data.canGenerate && (samples.length < 2 || retry) && <button className="btn btn-outline gap-2" type="button" disabled={busy} onClick={() => void act("samples")}><Film size={16} />{retry ? "Повторить неудачные пробные" : "Создать два пробных ролика"}</button>}
          {!data.canGenerate && <p className="text-sm text-base-content/75">Автоматическая генерация доступна администратору.</p>}
          {busy && <span className="self-center text-sm" role="status">Сохраняем…</span>}
        </div>
      </section>
      <section aria-labelledby="map-videos-title" className="space-y-5">
        <h2 id="map-videos-title" className="text-lg font-semibold">Видео <span className="text-base-content/65">{data.jobs.filter(j => j.status === "ready").length}</span></h2>
        {!data.jobs.length && <div className="py-12 text-center"><Film size={32} className="mx-auto mb-4 text-base-content/50" /><p className="font-medium">Здесь появятся готовые карты</p><p className="mt-2 text-sm text-base-content/70">Начните с двух пробных роликов или включите расписание.</p></div>}
        <div className="divide-y divide-base-300">
          {data.jobs.map((job, index) => <article key={job.id} className="flex flex-col gap-5 py-6 sm:flex-row">
            {job.status === "ready" && <video className="aspect-[9/16] w-full max-w-[240px] rounded-xl bg-neutral object-contain" controls preload="none" playsInline poster={`/api/map-pipeline/jobs/${job.id}/poster`} aria-label={job.idea?.title || "Видео с картой"}><source src={`/api/map-pipeline/jobs/${job.id}/video`} type="video/mp4" /></video>}
            <div className="min-w-0 flex-1 space-y-3">
              <h3 className="break-words text-lg font-semibold">{job.idea?.title || (job.kind === "sample" ? "Пробный ролик" : "Ежедневный ролик")}</h3>
              <p className="text-sm text-base-content/70">{job.kind === "sample" ? "Пробный" : "По расписанию"} · {time(job.createdAt)}</p>
              <p className={job.status === "failed" ? "text-error" : "text-base-content/80"} aria-live={index === 0 ? "polite" : "off"}>{job.stage}</p>
              {job.error && <p className="max-w-xl text-sm text-error">{job.error}</p>}
              {job.status === "ready" && <a className="btn btn-outline btn-sm gap-2" download href={`/api/map-pipeline/jobs/${job.id}/video`}><Download size={16} />Скачать MP4</a>}
              {(job.status === "queued" || job.status === "running") && <p className="text-sm text-base-content/65">Можно закрыть страницу — задача продолжит работать.</p>}
            </div>
          </article>)}
        </div>
      </section>
    </>}
  </div>;
}
