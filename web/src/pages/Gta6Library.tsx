import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, get, send } from "../lib/api/http";
import { confirmDialog } from "../lib/confirm";

const API = "/gta6-live/library";
const YOUTUBE_API = "/creator/gta6-youtube";
const CLIPS_PER_PAGE = 12;
const SORT_OPTIONS = [
  { id: "newest", label: "Сначала свежие" },
  { id: "oldest", label: "Сначала старые" },
] as const;
const BANNERS = [
  { id: "shortrobot", label: "Shortrobot" },
  { id: "simka", label: "SIMKA VPN" },
] as const;

type Banner = (typeof BANNERS)[number]["id"];
type Sort = (typeof SORT_OPTIONS)[number]["id"];
type PublicationFilter = "all" | "posted" | "unposted";
type Clip = { id: string; title: string; createdAt: string; published: boolean; duration?: number };
const sourceLabels: Record<string, string> = {
  "twitch.tv/steel": "Стилл",
  "twitch.tv/jolygames": "Шевцов",
  "youtube.com/ijJXKz-1YnE": "Swich Games",
};

const sourceName = (clip: Clip) => sourceLabels[clip.title] ?? clip.title;

type Publication = {
  clipId: string;
  banner: Banner;
  state: "uploading" | "submitted" | "published" | "review" | "failed";
  url: string | null;
  error: string | null;
  commentStatus: "pending" | "posted" | "unconfirmed" | null;
};
type YouTubeAccount = { id: number; name: string; channelId: string };
type YouTubeState = {
  accounts: YouTubeAccount[];
  targets: { banner: Banner; accountId: number; channelId: string }[];
  publications: Publication[];
  automation?: { banner: Banner; enabled: number; initialRemaining: number; nextAt: number; error: string | null }[];
};

function isUploading(publication?: Publication) {
  return publication?.state === "uploading" || publication?.state === "submitted";
}

function showDuration(duration: number) {
  const seconds = Math.floor(duration);
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60];
  if (seconds >= 3600) parts.unshift(Math.floor(seconds / 3600));
  return parts.map((part, index) => index ? String(part).padStart(2, "0") : String(part)).join(":");
}

function Gta6ClipCard({ clip, busy, youtube, onUpdate, onPublish }: {
  clip: Clip;
  busy: boolean;
  youtube?: YouTubeState;
  onUpdate: (clip: Clip, published?: boolean) => void;
  onPublish: (clip: Clip, banner: Banner, target: YouTubeAccount) => void;
}) {
  const [banner, setBanner] = useState<Banner>("shortrobot");
  const [canLoadPreview, setCanLoadPreview] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>();
  const [preview, setPreview] = useState<{ banner: Banner; url: string; duration?: number }>();
  const player = useRef<HTMLDivElement>(null);
  const src = `/api${API}/${clip.id}/${banner}`;
  const name = sourceName(clip);
  const titleId = `gta6-clip-${clip.id}`;
  const targetId = youtube?.targets.find(item => item.banner === banner)?.accountId;
  const target = youtube?.accounts.find(account => account.id === targetId);
  const publication = youtube?.publications.find(item => item.clipId === clip.id && item.banner === banner);
  const uploading = youtube?.publications.some(item => item.clipId === clip.id && isUploading(item));
  const date = new Date(clip.createdAt).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const currentPreview = preview?.banner === banner ? preview : undefined;
  const duration = clip.duration ?? currentPreview?.duration ?? videoDuration;
  useEffect(() => {
    const element = player.current;
    if (!element || canLoadPreview) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setCanLoadPreview(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [canLoadPreview]);
  useEffect(() => {
    if (!canLoadPreview) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function loadPreview() {
      const response = await fetch(`/api/creator/gta6-previews/${clip.id}/${banner}`, { signal: controller.signal });
      if (!response.ok) return;
      const data = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(data);
      const duration = Number(response.headers.get("X-Clip-Duration"));
      setPreview({ banner, url: objectUrl, duration: duration > 0 ? duration : undefined });
    }
    void loadPreview().catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [banner, canLoadPreview, clip.id]);

  return (
    <article aria-labelledby={titleId} className="min-w-0 border border-base-300 bg-base-100">
      <div ref={player} className="relative bg-black">
        <video src={src} controls playsInline preload="none" aria-label={`Ролик ${name}`}
          poster={currentPreview?.url}
          onLoadedMetadata={event => {
            if (Number.isFinite(event.currentTarget.duration)) setVideoDuration(event.currentTarget.duration);
          }}
          className="mx-auto block aspect-[9/16] max-h-[420px] w-full object-contain" />
        {duration != null && duration > 0 && (
          <span className="pointer-events-none absolute right-2 top-2 bg-black/80 px-2 py-1 text-xs tabular-nums text-white" aria-label={`Длительность ${showDuration(duration)}`}>
            {showDuration(duration)}
          </span>
        )}
      </div>
      <div className="space-y-2 px-3 py-2">
        <div className="space-y-1">
          <h2 id={titleId} className="break-words text-sm font-semibold">{name}</h2>
          <time dateTime={clip.createdAt} className="text-xs tabular-nums text-base-content/70">{date}</time>
        </div>
        <div className="join flex w-full" role="group" aria-label="Баннер">
          {BANNERS.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={banner === id} onClick={() => setBanner(id)}
              className={`btn btn-sm join-item min-h-11 flex-1 px-2 ${banner === id ? "btn-neutral" : "btn-outline"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm" checked={clip.published}
              disabled={busy} onChange={(event) => onUpdate(clip, event.target.checked)} />
            Выложено
          </label>
          <a className="btn btn-ghost btn-square min-h-11 min-w-11"
            href={src} download={`gta6-${clip.id.slice(0, 8)}-${banner}.mp4`}
            aria-label="Скачать MP4" title="Скачать MP4"><Download size={18} aria-hidden="true" /></a>
          <button type="button" className="btn btn-ghost btn-square min-h-11 min-w-11 text-error"
            disabled={busy || uploading} onClick={() => onUpdate(clip)}
            aria-label="Удалить ролик" title="Удалить ролик"><Trash2 size={18} aria-hidden="true" /></button>
        </div>
        {publication?.url && (publication.state === "published" || publication.state === "review") ? (
          <a className="link text-sm" href={publication.url} target="_blank" rel="noreferrer">
            {publication.state === "published" ? "Смотреть на YouTube" : "Проверить на YouTube"}
          </a>
        ) : isUploading(publication) ? (
          <p className="text-sm" role="status">Отправляется на YouTube…</p>
        ) : duration === undefined || duration <= 180 ? (
          <button type="button" className="btn btn-outline btn-sm w-full min-h-11" disabled={busy || !target}
            title={target ? undefined : "Выберите канал YouTube для этого баннера"}
            onClick={() => { if (target) onPublish(clip, banner, target); }}>
            Выложить на YouTube
          </button>
        ) : null}
        {publication?.error && <p className="text-sm text-error" role="status">{publication.error}</p>}
        {publication?.commentStatus === "unconfirmed" && <p className="text-sm" role="status">Комментарий не подтверждён.</p>}
      </div>
    </article>
  );
}

export default function Gta6Library() {
  const [clips, setClips] = useState<Clip[]>();
  const [youtube, setYoutube] = useState<YouTubeState>();
  const [youtubeError, setYoutubeError] = useState<"waiting" | "unavailable">();
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [source, setSource] = useState("");
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const controls = useRef<HTMLDivElement>(null);
  const sources = [...new Set(clips?.map(sourceName))].sort((a, b) => a.localeCompare(b, "ru-RU"));
  const activeSource = sources.includes(source) ? source : "";
  const postedIds = new Set(youtube?.publications.filter(item => item.state === "published").map(item => item.clipId));
  const filteredClips = (clips ?? []).filter(clip => {
    const posted = clip.published || postedIds.has(clip.id);
    return (!activeSource || sourceName(clip) === activeSource) &&
      (publicationFilter === "all" || (publicationFilter === "posted") === posted);
  }).sort((a, b) => sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
  const pageCount = Math.max(1, Math.ceil(filteredClips.length / CLIPS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * CLIPS_PER_PAGE;
  const pageClips = filteredClips.slice(start, start + CLIPS_PER_PAGE);

  function changePage(nextPage: number) {
    setPage(nextPage);
    controls.current?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    if (busy) return;
    let active = true;
    async function load() {
      try {
        const result = await get<{ clips: Clip[] }>(API);
        if (active) {
          setClips(result.clips);
          setLoadError("");
        }
      } catch {
        if (active) setLoadError("Не удалось загрузить ролики.");
      }
    }
    async function loadYouTube() {
      try {
        const state = await get<YouTubeState>(YOUTUBE_API);
        if (active) { setYoutube(state); setYoutubeError(undefined); }
      } catch (error) {
        if (active) setYoutubeError(error instanceof ApiError && error.status === 404 ? "waiting" : "unavailable");
      }
    }
    function refresh() { void load(); void loadYouTube(); }
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [busy, reload]);

  async function updateClip(clip: Clip, published?: boolean) {
    const remove = published === undefined;
    if (remove && !await confirmDialog("Удалить обе версии ролика из этой библиотеки?", {
      title: "Удалить ролик",
      confirmText: "Удалить",
      danger: true,
    })) return;
    setBusy(true);
    setActionError("");
    try {
      const path = `${API}/${clip.id}`;
      if (remove) {
        await send(path, "DELETE");
        setClips((items) => items?.filter((item) => item.id !== clip.id));
      } else {
        const result = await send<{ published: boolean }>(path, "PATCH", { published });
        setClips((items) => items?.map((item) => item.id === clip.id ? { ...item, published: result.published } : item));
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось сохранить изменение.");
    } finally {
      setBusy(false);
    }
  }

  async function setTarget(banner: Banner, accountId: number | null) {
    setBusy(true);
    setActionError("");
    try { setYoutube(await send<YouTubeState>(`${YOUTUBE_API}/target`, "PUT", { banner, accountId })); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Не удалось сохранить канал."); }
    finally { setBusy(false); }
  }

  async function setAutomation(banner: Banner, enabled: boolean) {
    setBusy(true);
    setActionError("");
    try { setYoutube(await send<YouTubeState>(`${YOUTUBE_API}/automation`, "PUT", { banner, enabled })); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Не удалось сохранить расписание."); }
    finally { setBusy(false); }
  }

  async function publishClip(clip: Clip, banner: Banner, target: YouTubeAccount) {
    const label = BANNERS.find(item => item.id === banner)?.label;
    if (!await confirmDialog(`Опубликовать версию ${label} на канале «${target.name}»?`, {
      title: "Выложить на YouTube",
      confirmText: "Выложить",
    })) return;
    setBusy(true);
    setActionError("");
    try {
      setYoutube(await send<YouTubeState>(`${YOUTUBE_API}/${clip.id}/${banner}`, "POST", { accountId: target.id, channelId: target.channelId }));
    }
    catch (error) { setActionError(error instanceof Error ? error.message : "Не удалось отправить ролик."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link to="/library" className="btn btn-ghost btn-sm pl-0 gap-2">
          <ArrowLeft size={16} aria-hidden="true" /> Библиотека
        </Link>
        <h1 className="text-2xl font-bold">Нарезка GTA 6</h1>
      </header>
      <details className="border border-base-300 bg-base-100 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium">Каналы YouTube</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {BANNERS.map(({ id, label }) => {
            const automation = youtube?.automation?.find(job => job.banner === id);
            const target = youtube?.targets.find(item => item.banner === id);
            return (
              <div key={id} className="grid min-w-0 max-w-full gap-1">
                <label className="grid gap-1">
                  {label}
                  <select className="select select-bordered select-sm w-full min-h-11" disabled={busy || !youtube?.accounts.length}
                    value={target?.accountId ?? ""}
                    onChange={event => void setTarget(id, event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Выбрать канал</option>
                    {youtube?.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" className="checkbox checkbox-sm" disabled={busy || !youtube?.automation}
                    checked={automation?.enabled === 1} onChange={event => void setAutomation(id, event.target.checked)}
                    aria-label={`Автопубликация ${label} раз в час`} />
                  Раз в час
                </label>
                {automation?.enabled === 1 && !target ? (
                  <p className="text-xs text-base-content/70">Ожидает входа в YouTube</p>
                ) : automation?.error && <p className="text-xs text-error">{automation.error}</p>}
              </div>
            );
          })}
          <Link className="link py-2" to="/accounts">Подключить канал</Link>
        </div>
      </details>
      {youtubeError === "waiting" && <p role="status" className="text-sm text-base-content/70">Кнопка YouTube станет доступна после обновления сервера.</p>}
      {youtubeError === "unavailable" && <p role="status" className="text-sm text-error">Не удалось загрузить настройки YouTube.</p>}
      {loadError && (
        <div className="flex flex-wrap items-center gap-3 text-error" role="alert">
          <span>{loadError}</span>
          <button className="btn btn-outline btn-sm" onClick={() => setReload((value) => value + 1)}>Повторить</button>
        </div>
      )}
      {actionError && <p className="text-error" role="alert">{actionError}</p>}
      {!clips && !loadError && <p role="status" className="text-sm">Загрузка…</p>}
      {!!clips?.length && (
        <>
          <div className="flex scroll-mt-4 flex-wrap items-center gap-2" ref={controls}>
            <select className="select select-bordered select-sm min-h-11 w-auto max-w-full" aria-label="Стример" value={activeSource}
              onChange={event => { setSource(event.target.value); setPage(1); }}>
              <option value="">Все стримеры</option>
              {sources.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <select className="select select-bordered select-sm min-h-11 w-auto max-w-full" aria-label="Статус публикации" value={publicationFilter}
              onChange={event => { setPublicationFilter(event.target.value as PublicationFilter); setPage(1); }}>
              <option value="all">Все ролики</option>
              <option value="posted">Выложенные</option>
              <option value="unposted">Не выложенные</option>
            </select>
            <select className="select select-bordered select-sm min-h-11 w-auto max-w-full" aria-label="Сортировка" value={sort}
              onChange={event => { setSort(event.target.value as Sort); setPage(1); }}>
              {SORT_OPTIONS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            {pageClips.length > 0 && (
              <span className="text-sm tabular-nums text-base-content/70">{start + 1}–{start + pageClips.length} из {filteredClips.length}</span>
            )}
          </div>
          {!pageClips.length && <p className="text-sm text-base-content/70">Нет роликов с такими фильтрами.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pageClips.map(clip => <Gta6ClipCard key={clip.id} clip={clip} busy={busy} youtube={youtube} onUpdate={updateClip} onPublish={publishClip} />)}
          </div>
          {pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Страницы роликов">
              <button type="button" className="btn btn-outline btn-sm btn-square min-h-11 min-w-11" aria-label="Предыдущая страница"
                disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
              <span className="text-sm tabular-nums" aria-live="polite">{currentPage} / {pageCount}</span>
              <button type="button" className="btn btn-outline btn-sm btn-square min-h-11 min-w-11" aria-label="Следующая страница"
                disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
