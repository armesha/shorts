import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "../components/AppIcon";
import { apiClient, type LongVideoCatalog, type LongVideoItem } from "../lib/api";
import { useT } from "../lib/i18n";

type FlatLongVideo = LongVideoItem & {
  packTitle: string;
  packLang: string | null;
};

const itemTime = (item: LongVideoItem) => {
  if (!item.builtAt) return null;
  const time = new Date(item.builtAt).getTime();
  return Number.isFinite(time) ? time : null;
};

const sortVideos = (items: FlatLongVideo[]) =>
  [...items].sort((a, b) => {
    const at = itemTime(a);
    const bt = itemTime(b);
    if (at === null && bt === null) return a.title.localeCompare(b.title);
    if (at === null) return 1;
    if (bt === null) return -1;
    return bt - at;
  });

function formatDuration(value: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return "";
  const total = Math.max(0, Math.round(value ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string | null, locale: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (!Number.isFinite(time.getTime())) return "";
  return time.toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function LongVideos() {
  const { t, lang } = useT();
  const [catalog, setCatalog] = useState<LongVideoCatalog | null>(null);
  const [err, setErr] = useState(false);
  const [packId, setPackId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const locale = lang === "ru" ? "ru-RU" : "en-US";

  useEffect(() => {
    let alive = true;
    let got = false;
    const load = () =>
      apiClient
        .longVideos(Date.now())
        .then((data) => {
          if (!alive) return;
          got = true;
          setCatalog(data);
          setErr(false);
        })
        .catch(() => {
          if (alive && !got) setErr(true);
        });
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const allItems = useMemo<FlatLongVideo[]>(
    () =>
      sortVideos(
        catalog?.packs.flatMap((pack) =>
          pack.items.map((item) => ({
            ...item,
            packTitle: pack.title,
            packLang: pack.lang,
          })),
        ) ?? [],
      ),
    [catalog],
  );

  const visibleItems = useMemo(
    () => (packId === "all" ? allItems : allItems.filter((item) => item.deckId === packId)),
    [allItems, packId],
  );

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [visibleItems, selectedId]);

  const selected = visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;

  return (
    <div className="route-page max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("longVideos.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">{t("longVideos.subtitle")}</p>
        </div>
        <div className="badge badge-neutral self-start sm:self-auto">{t("longVideos.total", { n: catalog?.total ?? 0 })}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <PackButton
          active={packId === "all"}
          label={t("longVideos.allPacks")}
          count={catalog?.total ?? 0}
          onClick={() => setPackId("all")}
        />
        {catalog?.packs.map((pack) => (
          <PackButton
            key={pack.id}
            active={packId === pack.id}
            label={pack.title}
            count={pack.count}
            onClick={() => setPackId(pack.id)}
          />
        ))}
      </div>

      {err && (
        <div className="alert alert-warning">
          <AppIcon name="warning" size={18} />
          <span>{t("longVideos.loadFail")}</span>
        </div>
      )}
      {!catalog && !err && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" />
          {t("longVideos.loading")}
        </div>
      )}
      {catalog && catalog.total === 0 && (
        <div className="alert">
          <AppIcon name="video" size={18} />
          <span>{t("longVideos.empty")}</span>
        </div>
      )}

      {selected && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm">
            <div className="flex justify-center bg-black">
              <video
                key={selected.id}
                controls
                preload="metadata"
                className="aspect-video max-h-[calc(100vh-210px)] min-h-[260px] w-full bg-black object-contain"
              >
                <source src={selected.videoUrl} type="video/mp4" />
              </video>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-snug">{selected.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="badge badge-ghost badge-sm">{selected.packTitle}</span>
                    {selected.durationSec != null && (
                      <span className="badge badge-primary badge-sm gap-1">
                        <AppIcon name="time" size={12} />
                        {formatDuration(selected.durationSec)}
                      </span>
                    )}
                    {selected.sceneCount != null && (
                      <span className="badge badge-ghost badge-sm">
                        {selected.sceneCount} {t("longVideos.scenes")}
                      </span>
                    )}
                    {selected.music && (
                      <span className="badge badge-ghost badge-sm gap-1">
                        <AppIcon name="music" size={12} />
                        {selected.music}
                      </span>
                    )}
                  </div>
                </div>
                <a href={selected.videoUrl} download className="btn btn-sm btn-primary gap-1.5">
                  <AppIcon name="external" size={14} />
                  {t("longVideos.download")}
                </a>
              </div>
              {selected.text && <p className="max-w-3xl text-sm leading-relaxed text-base-content/70">{selected.text}</p>}
              <div className="flex flex-wrap gap-2 text-xs text-base-content/55">
                {selected.builtAt && (
                  <span>
                    {t("longVideos.builtAt")}: {formatDate(selected.builtAt, locale)}
                  </span>
                )}
                {selected.source && (
                  <span>
                    {t("longVideos.source")}: {selected.source}
                  </span>
                )}
              </div>
            </div>
          </div>

          <aside className="overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
              <div className="font-semibold">{t("longVideos.videoList")}</div>
              <span className="badge badge-ghost badge-sm">{visibleItems.length}</span>
            </div>
            <div className="max-h-[calc(100vh-190px)] divide-y divide-base-300 overflow-y-auto">
              {visibleItems.map((item) => {
                const active = item.id === selected?.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full px-4 py-3 text-left transition-colors ${
                      active ? "bg-primary text-primary-content" : "hover:bg-base-200"
                    }`}
                    onClick={() => setSelectedId(item.id)}
                    aria-pressed={active}
                  >
                    <div className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</div>
                    <div className={`mt-2 flex flex-wrap gap-1.5 text-xs ${active ? "text-primary-content/80" : "text-base-content/55"}`}>
                      <span>{item.packTitle}</span>
                      {item.durationSec != null && <span>{formatDuration(item.durationSec)}</span>}
                      {item.sceneCount != null && (
                        <span>
                          {item.sceneCount} {t("longVideos.scenes")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

function PackButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn btn-sm gap-2 ${active ? "btn-primary" : "btn-ghost border border-base-300"}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className={`badge badge-sm ${active ? "badge-primary border-primary-content/30" : "badge-ghost"}`}>{count}</span>
    </button>
  );
}
