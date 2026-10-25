import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Scissors,
  X,
  Check,
  ChevronDown,
  Plus,
  Trash2,
  ListPlus,
} from "lucide-react";
import { get, send } from "../lib/api/http";
import { confirmDialog } from "../lib/confirm";

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
  channelAdds?: { accountId: number; part: number; videoId: number }[];
  deletedParts?: number[];
  sponsorBlock?: {
    status: "disabled" | "checking" | "removed" | "not_found" | "unavailable";
    segments: { start: number; end: number }[];
    removedSeconds: number;
  };
};
type Workspace = {
  jobs: Job[];
  banners: { id: string; name: string }[];
  channels?: { id: number; name: string; platform: string }[];
};
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
  const [mode, setMode] = useState<"manual" | "auto">("auto");
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
  const [formExpanded, setFormExpanded] = useState(true);
  const initialLoad = useRef(false);
  const [channelId, setChannelId] = useState("");
  const [addingToChannel, setAddingToChannel] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [channelNotice, setChannelNotice] = useState("");
  const [deletingPart, setDeletingPart] = useState<number | null>(null);
  const channels = workspace.channels || [];
  const validChannel = channels.some(
    (channel) => String(channel.id) === channelId,
  );
  const active = workspace.jobs.some((job) => !finished(job));
  const job =
    workspace.jobs.find((item) => item.id === selected) || workspace.jobs[0];
  const invalidCount =
    mode === "manual" &&
    (!/^\d+$/.test(count) || Number(count) < 2 || Number(count) > 30);
  const alreadyAdded = (part: number) =>
    !!job?.channelAdds?.some(
      (row) => row.accountId === Number(channelId) && row.part === part,
    );
  const pendingClips =
    job?.clips.filter((clip) => !alreadyAdded(clip.number)) || [];
  useEffect(() => {
    setChannelError("");
    setChannelNotice("");
  }, [selected, channelId]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      get<Workspace>("/video-cutting")
        .then((data) => {
          if (alive) {
            setWorkspace(data);
            if (!initialLoad.current) {
              initialLoad.current = true;
              if (
                data.jobs.length &&
                !document
                  .getElementById("cutting-new")
                  ?.contains(document.activeElement)
              )
                setFormExpanded(false);
            }
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
      setFormExpanded(false);
      requestAnimationFrame(() =>
        document.getElementById("cutting-results")?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        }),
      );
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
  async function addToChannel(parts?: number[]) {
    if (!job || !validChannel) return;
    setAddingToChannel(true);
    setChannelError("");
    setChannelNotice("");
    try {
      const result = await send<{
        added: unknown[];
        existing: unknown[];
        job: Job;
      }>(`/video-cutting/jobs/${job.id}/channel`, "POST", {
        accountId: Number(channelId),
        ...(parts ? { parts } : {}),
      });
      setWorkspace((current) => ({
        ...current,
        jobs: current.jobs.map((item) =>
          item.id === result.job.id ? result.job : item,
        ),
      }));
      setChannelNotice(
        result.added.length
          ? `Добавлено частей в очередь канала: ${result.added.length}.`
          : "Эти части уже были добавлены на выбранный канал.",
      );
    } catch (e) {
      setChannelError(
        e instanceof Error ? e.message : "Не удалось добавить части на канал.",
      );
    } finally {
      setAddingToChannel(false);
    }
  }
  async function deletePart(part: number) {
    if (
      !job ||
      !(await confirmDialog(
        "Часть будет удалена из нарезки и галереи. Копии в библиотеках каналов останутся.",
        {
          title: `Удалить часть ${part}?`,
          confirmText: "Удалить часть",
          danger: true,
        },
      ))
    )
      return;
    setDeletingPart(part);
    setChannelError("");
    setChannelNotice("");
    try {
      const next = await send<Job>(
        `/video-cutting/jobs/${job.id}/clips/${part}`,
        "DELETE",
      );
      setWorkspace((current) => ({
        ...current,
        jobs: current.jobs.map((item) => (item.id === next.id ? next : item)),
      }));
    } catch (e) {
      setChannelError(
        e instanceof Error ? e.message : "Не удалось удалить часть.",
      );
    } finally {
      setDeletingPart(null);
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
    openNewForm();
  }
  function openNewForm() {
    setFormExpanded(true);
    requestAnimationFrame(() => {
      document.getElementById("cutting-new")?.scrollIntoView({
        block: "start",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
      document.getElementById("cutting-url")?.focus({ preventScroll: true });
      (
        document.getElementById("cutting-url") as HTMLInputElement | null
      )?.select();
    });
  }
  function chooseChannel() {
    document.getElementById("cutting-channel-panel")?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    document.getElementById("cutting-channel")?.focus({ preventScroll: true });
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
        {job && (
          <button
            type="button"
            className="btn btn-outline gap-2"
            onClick={openNewForm}
          >
            <Plus size={17} />
            Новая нарезка
          </button>
        )}
      </header>
      {!!workspace.jobs.length && (
        <section className="grid gap-3 rounded-lg border border-base-300 bg-base-100 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
          <div>
            <label htmlFor="cutting-job" className="block font-semibold">
              Мои нарезки
            </label>
            <p className="mt-1 text-xs text-base-content/70">
              Выберите видео, чтобы открыть его части
            </p>
          </div>
          <select
            id="cutting-job"
            value={job?.id || ""}
            onChange={(event) => setSelected(event.target.value)}
            disabled={addingToChannel || deletingPart !== null}
            className="select select-bordered w-full min-w-0 cursor-pointer"
          >
            {workspace.jobs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title || "Новая нарезка"} ·{" "}
                {new Date(item.createdAt).toLocaleString("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </option>
            ))}
          </select>
        </section>
      )}
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
      <div
        className={`grid items-start gap-6 ${formExpanded ? "xl:grid-cols-[360px_minmax(0,1fr)]" : ""}`}
      >
        <details
          open={formExpanded}
          hidden={!formExpanded && !!job}
          onToggle={(event) => setFormExpanded(event.currentTarget.open)}
          className="group rounded-lg border border-base-300 bg-base-100"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 select-none">
            <span>
              <span className="block font-semibold">Создать новую нарезку</span>
              <span className="mt-1 block text-xs text-base-content/70">
                Ссылка, количество частей и оформление
              </span>
            </span>
            <ChevronDown
              aria-hidden
              size={19}
              className="shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <form
            id="cutting-new"
            onSubmit={submit}
            className="border-t border-base-300 p-5 space-y-5 scroll-mt-20"
          >
            <div className="space-y-2">
              <label
                htmlFor="cutting-url"
                className="block text-sm font-semibold"
              >
                <span
                  aria-hidden="true"
                  className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-base-200 text-xs"
                >
                  1
                </span>
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
                <span
                  aria-hidden="true"
                  className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-base-200 text-xs"
                >
                  2
                </span>
                Количество частей
              </legend>
              <label
                className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-primary ${mode === "manual" ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary"}`}
              >
                <input
                  type="radio"
                  className="radio radio-primary radio-sm"
                  name="cutting-mode"
                  checked={mode === "manual"}
                  onChange={() => setMode("manual")}
                />
                <span>
                  <span className="block font-semibold">
                    Я укажу количество
                  </span>
                  <span className="mt-1 block text-xs text-base-content/70">
                    Точное число частей. Их длина зависит от видео
                  </span>
                </span>
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
              <label
                className={`flex cursor-pointer items-start gap-3 border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-primary ${mode === "auto" ? "border-primary bg-primary/10" : "border-base-300 hover:border-primary"}`}
              >
                <input
                  type="radio"
                  className="radio radio-primary radio-sm"
                  name="cutting-mode"
                  checked={mode === "auto"}
                  onChange={() => setMode("auto")}
                />
                <span>
                  <span className="block font-semibold">Пусть ИИ решит</span>
                  <span className="mt-1 block text-xs text-base-content/70">
                    Части примерно по 3 минуты, с границами по смыслу
                  </span>
                </span>
              </label>
              <p className="text-xs leading-relaxed text-base-content/70">
                Нарезка по смыслу: учитываются речь, главы и таймкоды автора.
                Длинную главу можно разделить, короткие — объединить.
              </p>
            </fieldset>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="cutting-banner"
                  className="text-sm font-semibold"
                >
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-base-200 text-xs"
                  >
                    3
                  </span>
                  Ваш баннер
                </label>
              </div>
              <select
                id="cutting-banner"
                className="select select-bordered w-full cursor-pointer"
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
              <a
                href="/admin/banners"
                className="btn btn-outline btn-sm w-full gap-2"
              >
                <Plus size={14} />
                Добавить или изменить баннер
              </a>
              {bannerId && (
                <img
                  alt="Выбранный баннер"
                  src={`/api/circle-editor/banner-preview.png?id=${encodeURIComponent(bannerId)}`}
                  className="max-h-36 w-full rounded bg-base-200 object-contain"
                />
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-3 border border-base-300 bg-base-200/50 p-3 text-sm hover:border-primary">
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
            <label className="flex cursor-pointer items-center gap-3 border border-base-300 bg-base-200/50 p-3 text-sm hover:border-primary">
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
                submitting ||
                active ||
                loading ||
                addingToChannel ||
                deletingPart !== null ||
                !url.trim() ||
                invalidCount
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
            <p className="text-xs text-base-content/70">
              {addingToChannel || deletingPart !== null
                ? "Дождитесь завершения операции с готовыми частями."
                : active
                  ? "Дождитесь готовности текущей нарезки или отмените её."
                  : !url.trim()
                    ? "Вставьте ссылку на видео, чтобы начать."
                    : invalidCount
                      ? "Укажите целое число от 2 до 30."
                      : "После запуска готовые части появятся справа или ниже."}
            </p>
          </form>
        </details>
        <section
          id="cutting-results"
          aria-label="Результат нарезки"
          className="min-w-0 space-y-5 scroll-mt-20"
        >
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
                    Части: {job.clips.length} /{" "}
                    {job.plan?.length ||
                      (job.input.mode === "manual" ? job.input.count : "…")}
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
                {!!job.deletedParts?.length && (
                  <p className="text-xs text-base-content/70">
                    Удалено частей: {job.deletedParts.length}.
                  </p>
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
                    Изменить настройки и повторить
                  </button>
                )}
                {job.plan && (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      Смысловой план ({job.plan.length})
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
                {!!job.clips.length && (
                  <div
                    id="cutting-channel-panel"
                    className="border-t border-base-300 pt-4 space-y-3 scroll-mt-6"
                  >
                    <label
                      htmlFor="cutting-channel"
                      className="block text-sm font-semibold"
                    >
                      Куда добавить готовые части?
                    </label>
                    {channels.length ? (
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <select
                          id="cutting-channel"
                          className={`select select-bordered w-full min-w-0 cursor-pointer ${!validChannel ? "border-primary" : "border-base-300"}`}
                          value={channelId}
                          onChange={(event) => setChannelId(event.target.value)}
                          disabled={addingToChannel || deletingPart !== null}
                          aria-describedby="cutting-channel-hint"
                        >
                          <option value="">Выберите подключённый канал</option>
                          {channels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                              {channel.name} ·{" "}
                              {channel.platform === "youtube"
                                ? "YouTube"
                                : channel.platform === "instagram"
                                  ? "Instagram"
                                  : "TikTok"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void addToChannel()}
                          disabled={
                            !validChannel ||
                            addingToChannel ||
                            deletingPart !== null ||
                            !pendingClips.length
                          }
                          className="btn btn-primary"
                        >
                          {addingToChannel
                            ? "Добавляем…"
                            : validChannel && !pendingClips.length
                              ? "Уже добавлено"
                              : `Добавить все (${pendingClips.length})`}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-base-content/70">
                        Нет подключённых каналов.{" "}
                        <Link to="/channels" className="link">
                          Подключить канал
                        </Link>
                      </p>
                    )}
                    <p
                      id="cutting-channel-hint"
                      className="text-sm leading-relaxed text-base-content/75"
                    >
                      {validChannel
                        ? `Канал выбран: «${channels.find((channel) => String(channel.id) === channelId)?.name}». Можно добавить все части или одну на карточке.`
                        : "Сначала выберите канал в списке выше. Затем добавьте все части или одну на карточке."}
                    </p>
                    <p className="text-xs text-base-content/70">
                      Части сохраняются в библиотеку. Публикация — вручную или
                      по расписанию канала.
                    </p>
                    {channelError && (
                      <p role="alert" className="text-sm text-error">
                        {channelError}
                      </p>
                    )}
                    {channelNotice && (
                      <p role="status" className="text-sm text-success">
                        {channelNotice}{" "}
                        <Link to={`/accounts/${channelId}`} className="link">
                          Открыть канал
                        </Link>
                      </p>
                    )}
                  </div>
                )}
              </div>
              {!!job.clips.length && (
                <h2 className="text-lg font-semibold">
                  Готовые части · {job.clips.length}
                </h2>
              )}
              {!!job.clips.length && (
                <div
                  className={`grid gap-4 sm:grid-cols-2 ${formExpanded ? "2xl:grid-cols-3" : "xl:grid-cols-3"}`}
                >
                  {job.clips.map((clip) => (
                    <article
                      key={clip.number}
                      className="min-w-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden"
                    >
                      <h3 className="border-b border-base-300 p-4 text-sm font-semibold">
                        {clip.number}. {clip.title}
                      </h3>
                      <video
                        src={clip.videoUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain"
                      />
                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs tabular-nums text-base-content/70">
                            {time(clip.duration)}
                          </span>
                          <a
                            href={clip.videoUrl}
                            download={`part-${clip.number}.mp4`}
                            className="btn btn-sm btn-outline"
                          >
                            <ArrowDownToLine size={16} />
                            Скачать
                          </a>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm w-full"
                          disabled={
                            !channels.length ||
                            addingToChannel ||
                            deletingPart !== null ||
                            alreadyAdded(clip.number)
                          }
                          onClick={() =>
                            validChannel
                              ? void addToChannel([clip.number])
                              : chooseChannel()
                          }
                        >
                          {alreadyAdded(clip.number) ? (
                            <>
                              <Check aria-hidden size={16} />
                              Добавлено на канал
                            </>
                          ) : validChannel ? (
                            <>
                              <ListPlus aria-hidden size={16} />
                              Добавить на канал
                            </>
                          ) : (
                            "Выбрать канал"
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm text-error w-full"
                          disabled={addingToChannel || deletingPart !== null}
                          onClick={() => void deletePart(clip.number)}
                        >
                          <Trash2 aria-hidden size={14} />
                          {deletingPart === clip.number
                            ? "Удаляем…"
                            : "Удалить часть"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
