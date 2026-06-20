import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";

// Admin-only gallery of montage Shorts, grouped into themed PACKS. Reads a manifest (written live by
// temp/clip-demo/buildpack.mjs). Pure viewer — watch and download mp4, no posting.
const V = "11"; // bump to bust browser/Cloudflare cache on every clip change

type Item = { id: string; title: string; theme?: string; voice?: string; dur?: string; createdAt?: string; updatedAt?: string };
type Pack = { id: string; title: string; lang?: string; items: Item[] };
type FlatItem = Item & { packId: string; packTitle: string };
type SortMode = "newest" | "oldest";
const PAGE_SIZE = 12;

const SRC = (id: string) => `/files/admin-demos/${id}.mp4?v=${V}`;
const POSTER = (id: string) => `/files/admin-demos/${id}.jpg?v=${V}`;
const shortVoice = (v?: string) => (v || "").replace(/^[a-z]{2}-[A-Z]{2}-/, "").replace(/Multilingual/, "").replace(/Neural$/, "");
const itemTime = (d: Item) => {
  const raw = d.createdAt || d.updatedAt;
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
};
const sortItems = <T extends Item>(items: T[], mode: SortMode): T[] =>
  [...items].sort((a, b) => {
    const at = itemTime(a);
    const bt = itemTime(b);
    if (at === null && bt === null) return a.title.localeCompare(b.title);
    if (at === null) return 1;
    if (bt === null) return -1;
    return mode === "newest" ? bt - at : at - bt;
  });
const formatCreatedAt = (d: Item) => {
  const time = itemTime(d);
  if (time === null) return "";
  return new Date(time).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

function Card({ d, addedLabel }: { d: FlatItem; addedLabel: string }) {
  const createdAt = formatCreatedAt(d);
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <figure className="bg-black">
        <video controls preload="none" poster={POSTER(d.id)} className="w-full max-h-[70vh] aspect-[9/16] object-contain bg-black">
          <source src={SRC(d.id)} type="video/mp4" />
        </video>
      </figure>
      <div className="card-body p-4 gap-2">
        <h2 className="card-title text-base leading-snug">{d.title}</h2>
        <div className="flex flex-wrap gap-1.5">
          {d.dur && <span className="badge badge-primary badge-sm">{d.dur}</span>}
          <span className="badge badge-ghost badge-sm">{d.packTitle}</span>
          {createdAt && (
            <span className="badge badge-ghost badge-sm gap-1">
              <AppIcon name="time" size={12} />
              {addedLabel} {createdAt}
            </span>
          )}
          {d.voice && (
            <span className="badge badge-ghost badge-sm gap-1">
              <AppIcon name="music" size={12} />
              {shortVoice(d.voice)}
            </span>
          )}
          <a href={SRC(d.id)} download className="badge badge-ghost badge-sm gap-1 hover:badge-primary">
            <AppIcon name="external" size={12} />
            mp4
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ClipDemos() {
  const { user } = useAuth();
  const { t } = useT();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [err, setErr] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [packId, setPackId] = useState("all");
  const [page, setPage] = useState(1);
  const visiblePacks = packs ? (packId === "all" ? packs : packs.filter((pack) => pack.id === packId)) : null;
  const items = visiblePacks
    ? sortItems(
        visiblePacks.flatMap((pack) => pack.items.map((item) => ({ ...item, packId: pack.id, packTitle: pack.title }))),
        sortMode,
      )
    : [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeTitle = packId === "all" ? t("clipdemos.allPacks") : packs?.find((pack) => pack.id === packId)?.title || "";
  const totalItems = packs?.reduce((sum, pack) => sum + pack.items.length, 0) ?? 0;

  useEffect(() => {
    setPage(1);
  }, [packId, sortMode, packs?.length]);

  // Poll the manifest so the gallery fills in real-time as the pack builder produces videos.
  useEffect(() => {
    if (user?.role !== "admin") return;
    let stop = false, got = false;
    const load = () =>
      fetch(`/files/admin-demos/manifest.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
        .then((d) => { if (!stop) { got = true; setPacks(d.packs || []); setErr(false); } })
        .catch(() => { if (!stop && !got) setErr(true); });
    load();
    const id = setInterval(load, 7000);
    return () => { stop = true; clearInterval(id); };
  }, [user]);

  if (user?.role !== "admin") {
    return (
      <div className="alert alert-warning max-w-xl">
        <AppIcon name="warning" size={18} />
        <span>{t("users.adminOnly")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            <PackButton
              active={packId === "all"}
              label={t("clipdemos.allPacks")}
              count={totalItems}
              onClick={() => setPackId("all")}
            />
            {packs?.map((pack) => (
              <PackButton
                key={pack.id}
                active={packId === pack.id}
                label={pack.title}
                count={pack.items.length}
                onClick={() => setPackId(pack.id)}
              />
            ))}
          </div>
        </div>
        <div className="shrink-0 self-start">
          <button
            className="btn btn-sm btn-primary gap-1.5"
            onClick={() => setSortMode((mode) => (mode === "newest" ? "oldest" : "newest"))}
            aria-pressed={sortMode === "newest"}
          >
            {sortMode === "newest" ? (
              <AppIcon name="time" size={14} />
            ) : (
              <AppIcon name="chevron-right" size={14} className="rotate-90" />
            )}
            {t(sortMode === "newest" ? "clipdemos.sortNewest" : "clipdemos.sortOldest")}
          </button>
        </div>
      </div>

      {err && <div className="alert alert-warning"><AppIcon name="warning" size={18} /><span>{t("clipdemos.loadFail")}</span></div>}
      {!packs && !err && <div className="flex items-center gap-2 text-base-content/60"><span className="loading loading-spinner loading-sm" />{t("clipdemos.loading")}</div>}
      {packs && !packs.length && <div className="alert"><span>{t("clipdemos.empty")}</span></div>}

      {packs && items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-semibold text-base-content/70 flex items-center gap-2">
              {activeTitle}
              <span className="badge badge-neutral badge-sm">{items.length}</span>
            </div>
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pageItems.map((d) => (
              <Card key={d.id} d={d} addedLabel={t("clipdemos.addedAt")} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} alignEnd />
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
      className={`btn btn-sm shrink-0 gap-2 ${active ? "btn-primary" : "admin-action-secondary"}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{label}</span>
      <span className={`badge badge-sm ${active ? "badge-primary border-primary-content/30" : "badge-ghost"}`}>{count}</span>
    </button>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
  alignEnd = false,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  alignEnd?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={`join ${alignEnd ? "flex justify-end" : ""}`}>
      <button className="btn btn-sm join-item" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        <AppIcon name="chevron-left" size={15} />
      </button>
      <span className="btn btn-sm join-item pointer-events-none">
        {page} / {totalPages}
      </span>
      <button className="btn btn-sm join-item" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        <AppIcon name="chevron-right" size={15} />
      </button>
    </div>
  );
}
