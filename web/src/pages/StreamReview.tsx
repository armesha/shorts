import { useEffect, useState, type FormEvent } from "react";
import { get, send } from "../lib/api/http";

type Rating = "interesting" | "maybe" | "boring";
type Clip = {
  slug: string;
  start: number;
  end: number;
  peak: number;
  title: string;
  reason: string;
  momentType: string;
  rating: Rating | null;
  note: string;
  userStart: number | null;
  userEnd: number | null;
};
type Job = {
  id: string;
  url: string;
  videoId: string;
  title: string;
  channel: string;
  duration: number;
  status: "queued" | "fetching" | "analyzing" | "ready" | "failed" | "cancelled";
  stage: string;
  error: string;
  clips: Clip[];
  createdAt: string;
};
type Board = { jobs: Job[] };

const MOMENT: Record<string, string> = {
  humor: "Юмор",
  reaction: "Реакция",
  failure: "Неудача",
  action: "Действие",
  opinion: "Мнение",
  scare: "Скример",
  mechanic: "Механика",
};
const RATING: { id: Rating; label: string }[] = [
  { id: "interesting", label: "Интересно" },
  { id: "maybe", label: "Сомнительно" },
  { id: "boring", label: "Скучно" },
];

function formatOffset(total: number) {
  const seconds = Math.max(0, Math.round(total));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((part) => String(part).padStart(2, "0")).join(":");
}

function parseOffset(value: string) {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)$/u.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function ClipCard({ clip, videoId, onSave }: { clip: Clip; videoId: string; onSave: (body: { slug: string; rating?: Rating | null; start?: number; end?: number; note?: string }) => Promise<void> }) {
  const signature = [clip.start, clip.end, clip.userStart ?? "", clip.userEnd ?? "", clip.rating ?? "", clip.note].join("|");
  const [startText, setStartText] = useState(formatOffset(clip.userStart ?? clip.start));
  const [endText, setEndText] = useState(formatOffset(clip.userEnd ?? clip.end));
  const [note, setNote] = useState(clip.note);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setStartText(formatOffset(clip.userStart ?? clip.start));
    setEndText(formatOffset(clip.userEnd ?? clip.end));
    setNote(clip.note);
  }, [signature, clip.end, clip.note, clip.start, clip.userEnd, clip.userStart]);
  const start = parseOffset(startText);
  const end = parseOffset(endText);
  const previewStart = start ?? clip.userStart ?? clip.start;
  const previewEnd = end ?? clip.userEnd ?? clip.end;

  const save = async (rating?: Rating | null) => {
    if (start == null || end == null) {
      setError("Время в формате 00:00:00.");
      return;
    }
    if (end <= start) {
      setError("Конец должен быть позже начала.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({ slug: clip.slug, rating: rating === undefined ? clip.rating : rating, start, end, note });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить оценку.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="grid gap-3 rounded-lg border border-base-300 bg-base-100 p-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
      <iframe
        title={clip.title}
        src={`https://www.youtube.com/embed/${encodeURIComponent(videoId)}?start=${Math.floor(previewStart)}&end=${Math.ceil(previewEnd)}&rel=0`}
        className="aspect-video w-full rounded-lg bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
      <div className="grid content-start gap-3">
        <div>
          <p className="text-sm text-base-content/60">{MOMENT[clip.momentType] || clip.momentType} · {formatOffset(clip.start)}–{formatOffset(clip.end)}</p>
          <h3 className="font-semibold">{clip.title}</h3>
          <p className="mt-1 text-sm">{clip.reason}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Оценка: ${clip.title}`}>
          {RATING.map((item) => (
            <button key={item.id} type="button" className={`btn btn-sm ${clip.rating === item.id ? "btn-primary" : "btn-outline"}`} disabled={busy} aria-pressed={clip.rating === item.id} onClick={() => void save(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Начало
            <input value={startText} onChange={(event) => setStartText(event.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="00:00:00" aria-label={`Начало ролика ${clip.title}`} className="input input-bordered font-mono" />
          </label>
          <label className="grid gap-1 text-sm">
            Конец
            <input value={endText} onChange={(event) => setEndText(event.target.value)} inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="00:00:00" aria-label={`Конец ролика ${clip.title}`} className="input input-bordered font-mono" />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          Почему так
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} rows={2} className="textarea textarea-bordered" aria-label={`Заметка к ролику ${clip.title}`} />
        </label>
        <button type="button" className="btn btn-sm w-fit" disabled={busy} onClick={() => void save()}>Сохранить границы</button>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </article>
  );
}

export default function StreamReview() {
  const [board, setBoard] = useState<Board>({ jobs: [] });
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const job = board.jobs.find((item) => item.id === selected) ?? board.jobs[0];

  useEffect(() => {
    let alive = true;
    const load = () => get<Board>("/stream-highlights").then((data) => { if (alive) setBoard(data); }).catch((reason) => {
      if (alive) setError(reason instanceof Error ? reason.message : "Не удалось загрузить разборы.");
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
      const next = await send<Board>("/stream-highlights", "POST", { url });
      setBoard(next);
      setSelected(next.jobs[0]?.id ?? "");
      setUrl("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось начать разбор.");
    } finally {
      setBusy(false);
    }
  };

  const saveClip = async (id: string, body: { slug: string; rating?: Rating | null; start?: number; end?: number; note?: string }) => {
    setBoard(await send<Board>(`/stream-highlights/${id}/review`, "POST", body));
  };

  const cancel = async (id: string) => {
    setBusy(true);
    setError("");
    try { setBoard(await send<Board>(`/stream-highlights/${id}/cancel`, "POST", {})); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось отменить разбор."); }
    finally { setBusy(false); }
  };

  const running = job?.status === "queued" || job?.status === "fetching" || job?.status === "analyzing";

  return (
    <section className="space-y-4" aria-labelledby="stream-review-title">
      <form onSubmit={(event) => void start(event)} className="rounded-lg border border-base-300 bg-base-100 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id="stream-review-title" className="text-2xl font-bold">Стримы</h1>
          <p className="mr-auto text-sm text-base-content/70">Разбор записи отдельно от сериальных нарезок. Публикации нет.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="url"
            required
            maxLength={2048}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Ссылка на запись YouTube"
            aria-label="Ссылка на запись"
            className="input input-bordered min-w-0 w-full sm:w-auto sm:flex-1"
            disabled={busy}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !url.trim()}>Разобрать</button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
      </form>
      {!!board.jobs.length && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Разборы">
          {board.jobs.map((item) => (
            <button key={item.id} type="button" className={`btn btn-sm ${item.id === job?.id ? "btn-primary" : "btn-outline"}`} aria-pressed={item.id === job?.id} onClick={() => setSelected(item.id)}>
              {item.title || "Новый разбор"}
            </button>
          ))}
        </div>
      )}
      {job && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{job.title || "Разбор записи"}</h2>
            {job.channel && <span className="text-sm text-base-content/70">{job.channel}</span>}
            <span className="text-sm text-base-content/70">{job.stage}</span>
            {running && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void cancel(job.id)}>Отменить</button>}
          </div>
          {job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
          {job.status === "ready" && !job.clips.length && <p className="text-sm text-base-content/70">В этой записи нет момента, который стоит отдать отдельным роликом.</p>}
          <div className="grid gap-4">
            {job.clips.map((clip) => <ClipCard key={clip.slug} clip={clip} videoId={job.videoId} onSave={(body) => saveClip(job.id, body)} />)}
          </div>
        </div>
      )}
    </section>
  );
}
