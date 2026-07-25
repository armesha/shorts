import type { Dispatch, ReactNode, SetStateAction } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Play, Plus, Square, Trash2, Upload } from "lucide-react";
import type { Account, VideoItem } from "../../lib/api";
import type { useGenQueue } from "../../lib/genQueue";
import type { useT } from "../../lib/i18n";
import { AppIcon } from "../../components/AppIcon";
import { langTag } from "../../lib/deck";
import { cleanDisplayText } from "../../lib/text";
import { GENERATE_ALL_DECKS } from "./sources";

type TFn = ReturnType<typeof useT>["t"];
type QueueController = ReturnType<typeof useGenQueue>;
type SortMode = "date" | "title" | "posts";

type LibrarySectionProps = {
  account: Account;
  accountId: string;
  totalVideos: number;
  pageVideos: VideoItem[];
  sort: SortMode;
  setSort: Dispatch<SetStateAction<SortMode>>;
  clearing: boolean;
  clearLibrary: () => void | Promise<void>;
  selectedSources: string[];
  deckName: (deckId: string) => string;
  deckMeta: (deckId: string) => string;
  updateSources: (next: string[]) => void;
  deckOptions: (excludeSelected?: boolean) => ReactNode;
  isConnected: boolean;
  canPrepareLibrary: boolean;
  activeGenerateDeck: string;
  setGenerateDeck: Dispatch<SetStateAction<string>>;
  canGenerateAllSources: boolean;
  maxBatch: number;
  libraryFull: boolean;
  libraryCap: number | null;
  batchN: number;
  setBatchN: Dispatch<SetStateAction<number>>;
  sourcesDirty: boolean;
  save: () => Promise<boolean>;
  queue: QueueController;
  generateDeckIds: string[];
  langMismatch: boolean;
  saving: boolean;
  manualMaxFileMb: number;
  manualDurationSec: number;
  manualUploadsPerHour: number;
  manualUploading: boolean;
  manualUploadProgress: { current: number; total: number } | null;
  uploadManualVideos: (files: File[]) => void | Promise<void>;
  mismatchedSources: string[];
  contentLang: (deckId: string) => string;
  curContentLang: string;
  channelLang: string;
  postedTwicePlus: number;
  removePosted: () => void | Promise<void>;
  lastPosted: { title: string; url: string } | null;
  setPreview: Dispatch<SetStateAction<VideoItem | null>>;
  removeVid: (videoId: number) => void | Promise<void>;
  posting: number | null;
  postNow: (videoId: number) => void | Promise<void>;
  isLongVideoDeck: (deckId: string) => boolean;
  librarySourceName: (deckId: string) => string;
  pageCount: number;
  clampedPage: number;
  setPage: Dispatch<SetStateAction<number>>;
  t: TFn;
};

export default function LibrarySection({
  account,
  accountId,
  totalVideos,
  pageVideos,
  sort,
  setSort,
  clearing,
  clearLibrary,
  selectedSources,
  deckName,
  deckMeta,
  updateSources,
  deckOptions,
  isConnected,
  canPrepareLibrary,
  activeGenerateDeck,
  setGenerateDeck,
  canGenerateAllSources,
  maxBatch,
  libraryFull,
  libraryCap,
  batchN,
  setBatchN,
  sourcesDirty,
  save,
  queue,
  generateDeckIds,
  langMismatch,
  saving,
  manualMaxFileMb,
  manualDurationSec,
  manualUploadsPerHour,
  manualUploading,
  manualUploadProgress,
  uploadManualVideos,
  mismatchedSources,
  contentLang,
  curContentLang,
  channelLang,
  postedTwicePlus,
  removePosted,
  lastPosted,
  setPreview,
  removeVid,
  posting,
  postNow,
  isLongVideoDeck,
  librarySourceName,
  pageCount,
  clampedPage,
  setPage,
  t,
}: LibrarySectionProps) {
  const manualUploadButtonText =
    manualUploading && manualUploadProgress && manualUploadProgress.total > 1
      ? t("account.manualUploadingProgress", { current: manualUploadProgress.current, total: manualUploadProgress.total })
      : manualUploading
        ? t("account.manualUploading")
        : t("account.manualUploadButton");

  return (
    <section id="channel-content" className="card bg-base-100 border border-base-300">
      <div className="card-body">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="card-title text-base">{t("account.libraryTitle", { n: totalVideos })}</h2>
          <div className="flex items-center gap-2">
            {totalVideos > 0 && (
              <button
                className="btn btn-sm btn-error btn-outline gap-1"
                onClick={clearLibrary}
                disabled={clearing || queue.running}
                title={t("account.clearAllTitle")}
              >
                {clearing ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                {t("account.clearAll")}
              </button>
            )}
            <select
              className="select select-bordered select-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="date">{t("account.sortNewest")}</option>
              <option value="title">{t("account.sortByTitle")}</option>
              <option value="posts">{t("account.sortByPosts")}</option>
            </select>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-base-300 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)_minmax(300px,0.7fr)] gap-3 items-start">
          <div className="rounded-md border border-base-300 bg-base-200/30 p-3 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="font-medium text-sm">{t("account.channelPacks")}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSources.map((deckId, index) => (
                <span
                  key={deckId}
                  className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    index === 0 ? "border-primary/50 bg-primary/10 text-primary" : "border-base-300 bg-base-100"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold max-w-[15rem]" title={deckName(deckId)}>
                      {deckName(deckId)}
                    </span>
                    <span className="block text-[11px] opacity-70 leading-tight">{deckMeta(deckId)}</span>
                  </span>
                  {selectedSources.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                      title={t("account.removePack")}
                      onClick={() => updateSources(selectedSources.filter((x) => x !== deckId))}
                    >
                      <AppIcon name="close" size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <select
              className="select select-bordered select-sm w-full max-w-sm mt-2"
              aria-label={t("account.addPack")}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                updateSources([...selectedSources, e.target.value]);
                setGenerateDeck(e.target.value);
              }}
              title={t("account.channelPackTitle")}
            >
              <option value="">{t("account.addPack")}</option>
              {deckOptions(true)}
            </select>
          </div>

          <div className="rounded-md border border-base-300 bg-base-200/30 p-3">
            <div className="font-medium text-sm mb-2">{t("account.generateToLibrary")}</div>
            {!isConnected && (
              <div className="text-xs text-warning mb-2 flex items-center gap-1.5">
                <AppIcon name="warning" size={13} /> {t(canPrepareLibrary ? "account.superAdminLibraryPrepHint" : "account.connectFirstHint")}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="select select-bordered select-sm min-w-[12rem] flex-1"
                value={activeGenerateDeck}
                onChange={(e) => setGenerateDeck(e.target.value)}
                aria-label={t("account.generatePack")}
              >
                {canGenerateAllSources && <option value={GENERATE_ALL_DECKS}>{t("account.generateAll")}</option>}
                {selectedSources.map((deckId) => (
                  <option key={deckId} value={deckId}>
                    {deckName(deckId)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={Math.max(1, maxBatch)}
                className="input input-bordered input-sm w-[4.5rem]"
                value={batchN}
                disabled={maxBatch < 1}
                onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                aria-label={t("account.howManyVideosAria")}
              />
              <span className="text-xs text-base-content/50 shrink-0">
                {libraryFull && libraryCap != null ? t("account.libraryLimitReached", { n: libraryCap }) : maxBatch < 1 ? t("account.noCards") : `1–${maxBatch}`}
              </span>
              <button
                className="btn btn-sm btn-primary gap-1"
                onClick={async () => {
                  if (sourcesDirty && !(await save())) return;
                  queue.run(accountId, Math.min(batchN, maxBatch), generateDeckIds);
                }}
                disabled={langMismatch || saving || maxBatch < 1 || !canPrepareLibrary || libraryFull}
                title={langMismatch ? t("account.genTitleMismatch") : t("account.generateSelectedTitle")}
              >
                <Plus size={14} /> {t("account.generateButton")}
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-2">
              {queue.running && (
                <button
                  className="btn btn-sm btn-outline btn-error gap-1"
                  onClick={() => void queue.cancel()}
                  disabled={queue.canceling}
                  title={t("account.cancelQueueTitle")}
                >
                  {queue.canceling ? <Loader2 className="animate-spin" size={14} /> : <Square size={14} />}
                  {queue.canceling ? t("account.cancelingQueue") : t("account.cancelQueue")}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-base-300 bg-base-200/30 p-3">
            <div className="font-medium text-sm mb-2">{t("account.manualUploadTitle")}</div>
            {!isConnected && (
              <div className="text-xs text-warning mb-2 flex items-center gap-1.5">
                <AppIcon name="warning" size={13} /> {t("account.connectFirstHint")}
              </div>
            )}
            <p className="text-xs text-base-content/60 mb-3 leading-snug">
              {t("account.manualUploadHint", {
                mb: manualMaxFileMb,
                sec: manualDurationSec,
                n: manualUploadsPerHour,
              })}
            </p>
            {libraryFull && libraryCap != null && (
              <div className="text-xs text-warning mb-2 flex items-center gap-1.5">
                <AppIcon name="warning" size={13} /> {t("account.libraryLimitReached", { n: libraryCap })}
              </div>
            )}
            <label className={`btn btn-sm btn-outline gap-1 w-full ${manualUploading || !isConnected || libraryFull ? "btn-disabled" : ""}`}>
              {manualUploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              {manualUploadButtonText}
              <input
                type="file"
                className="hidden"
                accept="video/mp4,.mp4"
                multiple
                disabled={manualUploading || !isConnected || libraryFull}
                onChange={(e) => {
                  const files = Array.from(e.currentTarget.files ?? []);
                  e.currentTarget.value = "";
                  void uploadManualVideos(files);
                }}
              />
            </label>
          </div>

          {langMismatch && (
            <div
              role="alert"
              className="xl:col-span-3 flex items-start gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm font-semibold text-error"
            >
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <span>
                {t("account.langMismatchWarn", {
                  content: mismatchedSources.map((x) => langTag(contentLang(x))).join(", ") || langTag(curContentLang),
                  channel: langTag(channelLang),
                })}
              </span>
            </div>
          )}
          {sourcesDirty && totalVideos > 0 && <span className="xl:col-span-3 text-xs text-warning">{t("account.oldVideosWarn")}</span>}
          {postedTwicePlus > 0 && (
            <div className="xl:col-span-3 flex justify-end">
              <button className="btn btn-sm btn-ghost text-error gap-1" onClick={removePosted} disabled={queue.running} title={t("account.removePostedTitle")}>
                <Trash2 size={14} /> {t("account.postedTwicePlus", { n: postedTwicePlus })}
              </button>
            </div>
          )}
        </div>
        {queue.running && (
          <div className="mt-1 text-xs text-base-content/60 flex items-center gap-1">
            <Loader2 className="animate-spin" size={12} />
            {t("account.genInBackground")}
          </div>
        )}
        {lastPosted && (
          <div className="alert alert-success py-2 text-sm mt-2">
            <span>
              {t("account.postedPrefix")} <b>{cleanDisplayText(lastPosted.title)}</b> —{" "}
              <a href={lastPosted.url} target="_blank" rel="noreferrer" className="link font-medium">
                {lastPosted.url}
              </a>
            </span>
          </div>
        )}
        {totalVideos === 0 ? (
          <div className="text-sm text-base-content/50 py-6 text-center">{t("account.libraryEmpty")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-4 mt-3">
            {pageVideos.map((v) => {
              const longVideo = isLongVideoDeck(v.deck);
              const previewClass = longVideo ? "aspect-video max-w-[360px]" : "aspect-[9/16] max-w-[280px]";
              const textClass = longVideo ? "max-w-[360px]" : "max-w-[280px]";
              return (
              <div key={v.id} className="group min-w-0">
                <div className={`relative mx-auto ${previewClass} w-full rounded-lg overflow-hidden border border-base-300 bg-base-200`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPreview(v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPreview(v);
                      }
                    }}
                    title={t("account.openAndWatch")}
                    className="absolute inset-0 cursor-pointer"
                  >
                    {v.imageRel ? (
                      <img src={`/files/${v.imageRel}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <video
                        src={`/files/${v.videoRel}`}
                        muted
                        playsInline
                        preload="metadata"
                        className="pointer-events-none h-full w-full object-cover"
                        aria-hidden="true"
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition">
                      <Play size={34} fill="currentColor" className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition" />
                    </span>
                    {v.postCount > 0 ? (
                      <span className="absolute top-1 left-1 badge badge-success badge-sm">×{v.postCount}</span>
                    ) : (
                      <span className="absolute top-1 left-1 badge badge-ghost badge-sm">{t("account.newBadge")}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVid(v.id)}
                    title={t("account.removeFromLibrary")}
                    className="absolute top-1 right-1 z-10 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => postNow(v.id)}
                    disabled={posting === v.id || account.status !== "connected"}
                    title={account.status !== "connected" ? t("account.connectFirst") : t("account.postNowTitle")}
                    className="absolute bottom-1.5 inset-x-1.5 z-10 btn btn-xs btn-primary gap-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    {posting === v.id ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                    {t("account.post")}
                  </button>
                </div>
                <div className={`mx-auto mt-1.5 ${textClass} text-sm font-medium leading-tight line-clamp-2`} title={cleanDisplayText(v.title)}>
                  {cleanDisplayText(v.title)}
                </div>
                <div className={`mx-auto mt-1 ${textClass} text-[11px] text-base-content/50 truncate`}>{librarySourceName(v.deck)}</div>
              </div>
              );
            })}
          </div>
        )}
        {pageCount > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              className="btn btn-xs btn-outline gap-1"
              disabled={clampedPage <= 1}
              onClick={() => setPage(Math.max(1, clampedPage - 10))}
              title="На 10 страниц назад"
              aria-label="На 10 страниц назад"
            >
              <ChevronsLeft size={14} /> 10
            </button>
            <button className="btn btn-xs btn-outline gap-1" disabled={clampedPage <= 1} onClick={() => setPage(clampedPage - 1)}>
              <ChevronLeft size={14} /> {t("common.back")}
            </button>
            <span className="text-sm text-base-content/60">
              {t("common.page")} {clampedPage} {t("common.of")} {pageCount}
            </span>
            <button className="btn btn-xs btn-outline gap-1" disabled={clampedPage >= pageCount} onClick={() => setPage(clampedPage + 1)}>
              {t("common.forward")} <ChevronRight size={14} />
            </button>
            <button
              className="btn btn-xs btn-outline gap-1"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage(Math.min(pageCount, clampedPage + 10))}
              title="На 10 страниц вперёд"
              aria-label="На 10 страниц вперёд"
            >
              10 <ChevronsRight size={14} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
