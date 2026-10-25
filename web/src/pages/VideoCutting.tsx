import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowDownToLine, ArrowUpRight, Scissors, X } from "lucide-react";
import { get, send } from "../lib/api/http";

type Part = {
  number: number;
  start: number;
  end: number;
  title: string;
  reason: string;
};
type Clip = Part & { videoUrl: string; duration: number };
type Job = {
  id: string;
  input: {
    url: string;
    mode: "manual" | "auto";
    count?: number;
    bannerId: string | null;
    subtitles: boolean;
    sponsorBlock?: boolean;
  };
  status:
    | "queued"
    | "downloading"
    | "analyzing"
    | "rendering"
    | "completed"
    | "failed"
    | "cancelled";
  stage: string;
  progress: number;
  createdAt: string;
  title?: string;
  duration?: number;
  plan?: Part[];
  clips: Clip[];
  error?: string;
  sponsorBlock?: {
    status: "disabled" | "checking" | "removed" | "not_found" | "unavailable";
    segments: { start: number; end: number }[];
    removedSeconds: number;
  };
};
type Workspace = { jobs: Job[]; banners: { id: string; name: string }[] };
const finished = (job: Job) =>
  ["completed", "failed", "cancelled"].includes(job.status);
function time(value: number) {
  const total = Math.max(0, Math.floor(value));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function VideoCutting() {
  const [workspace, setWorkspace] = useState<Workspace>({
    jobs: [],
    banners: [],
  });
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [count, setCount] = useState("5");
  const [bannerId, setBannerId] = useState("");
  const [subtitles, setSubtitles] = useState(true);
  const [sponsorBlock, setSponsorBlock] = useState(true);
  const [selected, setSelected] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const active = workspace.jobs.some((job) => !finished(job));
  const job =
    workspace.jobs.find((item) => item.id === selected) || workspace.jobs[0];
  const invalidCount =
    mode === "manual" &&
    (!/^\d+$/.test(count) || Number(count) < 2 || Number(count) > 30);

  useEffect(() => {
    let alive = true;
    const load = () =>
      get<Workspace>("/video-cutting")
        .then((data) => {
          if (alive) {
            setWorkspace(data);
            setLoadError("");
            setLoading(false);
          }
        })
        .catch((e) => {
          if (alive) {
            setLoadError(
              e instanceof Error ? e.message : "Не удалось обновить задачи.",
            );
            setLoading(false);
          }
        });
    void load();
    const timer = window.setInterval(load, active ? 3000 : 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [active, refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const next = await send<Job>("/video-cutting/jobs", "POST", {
        url,
        mode,
        ...(mode === "manual" ? { count: Number(count) } : {}),
        bannerId: bannerId || null,
        subtitles,
        sponsorBlock,
      });
      setWorkspace((current) => ({
        ...current,
        jobs: [next, ...current.jobs],
      }));
      setSelected(next.id);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось запустить нарезку.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function cancel() {
    if (!job) return;
    setCancelling(true);
    setError("");
    try {
      const next = await send<Job>(
        `/video-cutting/jobs/${job.id}/cancel`,
        "POST",
      );
      setWorkspace((current) => ({
        ...current,
        jobs: current.jobs.map((item) => (item.id === next.id ? next : item)),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отменить задачу.");
    } finally {
      setCancelling(false);
    }
  }
  function repeat() {
    if (!job) return;
    setUrl(job.input.url);
    setMode(job.input.mode);
    setCount(String(job.input.count || 5));
    setBannerId(job.input.bannerId || "");
    setSubtitles(job.input.subtitles);
    setSponsorBlock(job.input.sponsorBlock ?? true);
    setError("");
    document.getElementById("cutting-url")?.focus();
  }

  return (
    <div className="route-page space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Нарезка видео</h1>
          <p className="mt-2 max-w-2xl text-sm text-base-content/75">
            Вставьте ссылку. ИИ разделит видео на законченные смысловые части, а
            затем добавит ваш баннер.
          </p>
        </div>
        <Link to="/templates/montage" className="btn btn-ghost btn-sm">
          Ручной монтаж <ArrowUpRight size={16} />
        </Link>
      </header>
      {loadError && (
        <div
          role="alert"
          className="alert alert-error flex flex-wrap justify-between"
        >
          <span>{loadError}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          className="rounded-lg border border-base-300 bg-base-100 p-5 space-y-5"
        >
          <div className="space-y-2">
            <label
              htmlFor="cutting-url"
              className="block text-sm font-semibold"
            >
              Ссылка на видео YouTube
            </label>
            <input
              id="cutting-url"
              type="url"
              required
              maxLength={2048}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              className="input input-bordered w-full"
              disabled={submitting}
            />
            <p className="text-xs text-base-content/70">
              Обычное видео или Shorts, до 3 часов. Исходник скачивается
              автоматически.
            </p>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              Количество частей
            </legend>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                className="radio radio-primary radio-sm"
                name="cutting-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />
              Я укажу количество
            </label>
            {mode === "manual" && (
              <div className="pl-7">
                <label htmlFor="cutting-count" className="sr-only">
                  Сколько частей
                </label>
                <input
                  id="cutting-count"
                  type="number"
                  min={2}
                  max={30}
                  step={1}
                  required
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                  aria-describedby="cutting-count-hint"
                  aria-invalid={invalidCount}
                  className="input input-bordered w-24"
                />
                <span
                  id="cutting-count-hint"
                  className="ml-3 text-sm text-base-content/70"
                >
                  от 2 до 30
                </span>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                className="radio radio-primary radio-sm"
                name="cutting-mode"
                checked={mode === "auto"}
                onChange={() => setMode("auto")}
              />
              Пусть ИИ решит
            </label>
            <p className="text-xs leading-relaxed text-base-content/70">
              В обоих режимах границы выбираются по смене темы и завершённым
              фразам.
            </p>
          </fieldset>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="cutting-banner" className="text-sm font-semibold">
                Ваш баннер
              </label>
              <a href="/admin/banners" className="link text-xs">
                Библиотека баннеров
              </a>
            </div>
            <select
              id="cutting-banner"
              className="select select-bordered w-full"
              value={bannerId}
              onChange={(event) => setBannerId(event.target.value)}
            >
              <option value="">Без баннера</option>
              {workspace.banners.map((banner) => (
                <option key={banner.id} value={banner.id}>
                  {banner.name}
                </option>
              ))}
            </select>
            {bannerId && (
              <img
                alt="Выбранный баннер"
                src={`/api/circle-editor/banner-preview.png?id=${encodeURIComponent(bannerId)}`}
                className="max-h-36 w-full rounded bg-base-200 object-contain"
              />
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-sm"
              checked={sponsorBlock}
              onChange={(event) => setSponsorBlock(event.target.checked)}
            />
            Удалять рекламу (SponsorBlock)
          </label>
          <p className="text-xs leading-relaxed text-base-content/70">
            Удаляются только спонсорские вставки с подходящей{" "}
            <a
              href="https://sponsor.ajay.app/"
              target="_blank"
              rel="noreferrer"
              className="link"
            >
              разметкой SponsorBlock
            </a>
            . Если разметки нет, видео остаётся без изменений.
          </p>
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-primary checkbox-sm"
              checked={subtitles}
              onChange={(event) => setSubtitles(event.target.checked)}
            />
            Пословные субтитры
          </label>
          <p className="text-xs leading-relaxed text-base-content/70">
            Результат — вертикальные MP4, 1080 × 1920. Для смыслового анализа
            нужны доступные субтитры источника.
          </p>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={
              submitting || active || loading || !url.trim() || invalidCount
            }
            className="btn btn-primary w-full"
          >
            {submitting ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Scissors size={18} />
            )}{" "}
            {active ? "Обрабатывается текущая задача" : "Нарезать видео"}
          </button>
        </form>
        <section aria-label="Результат нарезки" className="min-w-0 space-y-5">
          {loading && !job ? (
            <div
              role="status"
              className="rounded-lg border border-base-300 bg-base-100 p-8"
            >
              Загрузка задач…
            </div>
          ) : !job ? (
            <div className="rounded-lg border border-dashed border-base-300 bg-base-100 px-6 py-12">
              <h2 className="text-lg font-semibold">
                Здесь появятся готовые части
              </h2>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-base-content/75">
                Добавьте ссылку слева и запустите нарезку. Можно закрыть
                страницу: задача продолжит выполняться, а результат сохранится
                здесь.
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-base-300 bg-base-100 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-semibold">
                      {job.title || "Новая нарезка"}
                    </h2>
                    <a
                      className="link mt-1 inline-block text-sm"
                      href={job.input.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть исходник{" "}
                      <ArrowUpRight size={13} className="inline" />
                    </a>
                  </div>
                  {!finished(job) && (
                    <button
                      type="button"
                      onClick={cancel}
                      disabled={cancelling}
                      className="btn btn-ghost btn-sm gap-1"
                    >
                      <X size={15} />
                      Отменить
                    </button>
                  )}
                </div>
                <div
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span
                    className={
                      job.status === "failed"
                        ? "text-error"
                        : job.status === "completed"
                          ? "text-success"
                          : ""
                    }
                  >
                    {job.stage}
                  </span>
                  <span className="tabular-nums text-base-content/70">
                    {job.clips.length} /{" "}
                    {job.plan?.length ||
                      (job.input.mode === "manual"
                        ? job.input.count
                        : "…")}{" "}
                    частей
                  </span>
                </div>
                {!finished(job) && (
                  <progress
                    className="progress progress-primary w-full"
                    value={job.progress}
                    max={100}
                    aria-label="Ход обработки"
                  />
                )}
                {job.sponsorBlock && (
                  <p className="text-xs leading-relaxed text-base-content/70">
                    {job.sponsorBlock.status === "removed"
                      ? `SponsorBlock: удалено рекламы — ${job.sponsorBlock.removedSeconds.toFixed(1)} с. Участков: ${job.sponsorBlock.segments.length}. Тайминги плана — после удаления рекламы.`
                      : job.sponsorBlock.status === "not_found"
                        ? "SponsorBlock: подходящая разметка рекламы не найдена."
                        : job.sponsorBlock.status === "unavailable"
                          ? "SponsorBlock недоступен. Удаление рекламы не выполнено."
                          : job.sponsorBlock.status === "disabled"
                            ? "Удаление рекламы выключено."
                            : "Проверяем разметку SponsorBlock…"}
                  </p>
                )}
                {(job.status === "failed" || job.status === "cancelled") && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={repeat}
                  >
                    Вернуть параметры в форму
                  </button>
                )}
                {job.plan && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      Смысловой план · {job.plan.length} частей
                    </summary>
                    <ol className="mt-3 divide-y divide-base-300">
                      {job.plan.map((part) => (
                        <li key={part.number} className="py-3">
                          <div className="flex flex-wrap justify-between gap-2 text-sm">
                            <strong>
                              {part.number}. {part.title}
                            </strong>
                            <span className="tabular-nums text-base-content/70">
                              {time(part.start)} — {time(part.end)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-base-content/70">
                            {part.reason}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              {!!job.clips.length && (
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {job.clips.map((clip) => (
                    <article
                      key={clip.number}
                      className="min-w-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden"
                    >
                      <video
                        src={clip.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain"
                      />
                      <div className="p-4 space-y-3">
                        <h3 className="text-sm font-semibold">
                          {clip.number}. {clip.title}
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs tabular-nums text-base-content/70">
                            {time(clip.duration)}
                          </span>
                          <a
                            href={clip.videoUrl}
                            download={`part-${clip.number}.mp4`}
                            className="btn btn-sm btn-ghost"
                          >
                            <ArrowDownToLine size={16} />
                            Скачать
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      {!!workspace.jobs.length && (
        <section className="border-t border-base-300 pt-5">
          <h2 className="mb-3 text-base font-semibold">Мои задачи</h2>
          <div className="divide-y divide-base-300">
            {workspace.jobs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={job?.id === item.id}
                onClick={() => setSelected(item.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-2 rounded px-3 py-3 text-left text-sm hover:bg-base-200 ${job?.id === item.id ? "bg-base-200" : ""}`}
              >
                <span className="min-w-0 break-words font-medium">
                  {item.title || "Новая нарезка"}
                </span>
                <span className="text-xs text-base-content/70">
                  {new Date(item.createdAt).toLocaleString("ru-RU", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}{" "}
                  · {item.stage}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
