import { useEffect, useState } from "react";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiError, get, send } from "../lib/api/http";
import { confirmDialog } from "../lib/confirm";

const API = "/gta6-live/library";
const YOUTUBE_API = "/gta6-live/youtube";
const BANNERS = [
  { id: "shortrobot", label: "Shortrobot" },
  { id: "simka", label: "SIMKA VPN" },
] as const;

type Banner = (typeof BANNERS)[number]["id"];
type Clip = { id: string; title: string; createdAt: string; published: boolean; duration?: number };
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
};

function isUploading(publication?: Publication) {
  return publication?.state === "uploading" || publication?.state === "submitted";
}

function Gta6ClipCard({ clip, busy, youtube, onUpdate, onPublish }: {
  clip: Clip;
  busy: boolean;
  youtube?: YouTubeState;
  onUpdate: (clip: Clip, published?: boolean) => void;
  onPublish: (clip: Clip, banner: Banner, target: YouTubeAccount) => void;
}) {
  const [banner, setBanner] = useState<Banner>("shortrobot");
  const src = `/api${API}/${clip.id}/${banner}`;
  const titleId = `gta6-clip-${clip.id}`;
  const targetId = youtube?.targets.find(item => item.banner === banner)?.accountId;
  const target = youtube?.accounts.find(account => account.id === targetId);
  const publication = youtube?.publications.find(item => item.clipId === clip.id && item.banner === banner);
  const uploading = youtube?.publications.some(item => item.clipId === clip.id && isUploading(item));
  const date = new Date(clip.createdAt).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <article aria-labelledby={titleId} className="min-w-0 border border-base-300 bg-base-100">
      <div className="bg-black">
        <video src={src} controls playsInline preload="none" aria-label={`Ролик ${clip.title}`}
          className="mx-auto block aspect-[9/16] max-h-[420px] w-full object-contain" />
      </div>
      <div className="space-y-2 px-3 py-2">
        <div className="space-y-1">
          <h2 id={titleId} className="break-words text-sm font-semibold">{clip.title}</h2>
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
        ) : clip.duration === undefined || clip.duration <= 180 ? (
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
          {BANNERS.map(({ id, label }) => (
            <label key={id} className="grid min-w-0 max-w-full gap-1">
              {label}
              <select className="select select-bordered select-sm w-full min-h-11" disabled={busy || !youtube?.accounts.length}
                value={youtube?.targets.find(target => target.banner === id)?.accountId ?? ""}
                onChange={event => void setTarget(id, event.target.value ? Number(event.target.value) : null)}>
                <option value="">Выбрать канал</option>
                {youtube?.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          ))}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {clips.map((clip) => <Gta6ClipCard key={clip.id} clip={clip} busy={busy} youtube={youtube} onUpdate={updateClip} onPublish={publishClip} />)}
        </div>
      )}
    </div>
  );
}
