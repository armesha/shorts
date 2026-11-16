import { useEffect, useState } from "react";
import { get } from "../lib/api/http";

type Clip = { number: number; title?: string; videoUrl?: string };
type Job = { id: string; title?: string; status: string; clips: Clip[] };

export default function ReadyShorts() {
  const [clips, setClips] = useState<{ key: string; title: string; url: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => get<{ jobs: Job[] }>("/video-cutting").then((data) => {
      if (!alive) return;
      const next = data.jobs.flatMap((job) => job.clips.flatMap((clip) => clip.videoUrl ? [{
        key: `${job.id}-${clip.number}`,
        title: clip.title || job.title || "Нарезка",
        url: clip.videoUrl,
      }] : []));
      setClips(next.slice(0, 12));
      setError("");
    }).catch((reason) => {
      if (alive) setError(reason instanceof Error ? reason.message : "Не удалось загрузить шорты.");
    });
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return <div className="mt-4 space-y-2">
    <h3 className="text-base font-semibold">Уже нарезанные шорты</h3>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    {clips.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {clips.map((clip) => <figure key={clip.key} className="space-y-1">
        <video controls preload="metadata" src={clip.url} className="aspect-[9/16] w-full rounded-lg bg-black" />
        <figcaption className="truncate text-sm">{clip.title}</figcaption>
      </figure>)}
    </div> : <p className="text-sm text-base-content/70">Готовые ролики появятся здесь. Свежий кусок эфира ещё пишется.</p>}
  </div>;
}
