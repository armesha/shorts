// Вкладка «Видео» проекта: собрать MP4/PNG по карточке, ZIP по паку и галерея готовых файлов.
import { useMemo, useState } from "react";
import {
  Archive,
  Clapperboard,
  Download,
  FileImage,
  Loader2,
  Mic,
  Trash2,
} from "lucide-react";
import { useT } from "../../lib/i18n";
import { MiniCard, type MiniCardStyling } from "./MiniCard";
import { cardTitleText, packCardItems, parseUtcDate, type GalleryItem } from "./model";
import type { CreatorAsset, CreatorPack } from "./types";

export type ExportOptions = {
  index: number;
  format: "mp4" | "png";
  voiceover: boolean;
  durationSec: number;
  music: string;
};

export type VideosOps = {
  exportCard: (opts: ExportOptions) => Promise<GalleryItem | null>;
  exportZip: (opts: Omit<ExportOptions, "index"> & { limit: number }) => Promise<boolean>;
  deleteGalleryItem: (id: number) => Promise<boolean>;
};

export function VideosPanel({
  pack,
  styling,
  gallery,
  music,
  defaultDurationSec,
  defaultMusic,
  ops,
  busy,
}: {
  pack: CreatorPack;
  styling: MiniCardStyling;
  gallery: GalleryItem[];
  music: CreatorAsset[];
  defaultDurationSec: number;
  defaultMusic: string;
  ops: VideosOps;
  busy: string | null;
}) {
  const { t, lang } = useT();
  const cards = packCardItems(pack);
  const [index, setIndex] = useState(0);
  const [format, setFormat] = useState<"mp4" | "png">("mp4");
  const [voiceover, setVoiceover] = useState(false);
  const [durationSec, setDurationSec] = useState(defaultDurationSec);
  const [musicId, setMusicId] = useState(defaultMusic);
  const [zipLimit, setZipLimit] = useState(Math.max(1, Math.min(cards.length || 1, 12)));
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);

  const safeIndex = Math.min(index, Math.max(0, cards.length - 1));
  const selected = cards[safeIndex];
  const selectedText = selected ? cardTitleText(selected) : null;
  const locale = lang === "en" ? "en-GB" : "ru-RU";
  const dateText = useMemo(
    () => (value: string) => {
      const date = parseUtcDate(value);
      return date
        ? date.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        : "";
    },
    [locale],
  );

  const exportOptions = (): ExportOptions => ({
    index: safeIndex,
    format,
    voiceover,
    durationSec,
    music: musicId,
  });

  if (!cards.length) {
    return (
      <section className="creator-card creator-cards-empty">
        <p>{t("creator.videosNoCards")}</p>
        <span>{t("creator.videosNoCardsHint")}</span>
      </section>
    );
  }

  return (
    <div className="creator-videos-panel">
      <section className="creator-card creator-export-card">
        <div className="creator-export-settings">
          <label className="form-control creator-export-picker">
            <span className="label-text">{t("creator.exportPickCard")}</span>
            <select
              className="select select-bordered select-sm"
              value={safeIndex}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              {cards.map((card, cardIndex) => {
                const { title } = cardTitleText(card);
                return (
                  <option key={cardIndex} value={cardIndex}>
                    #{cardIndex + 1} · {title.slice(0, 48) || t("creator.previewHeadingFallback")}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="creator-export-row">
            <div
              className="creator-mode-switch"
              role="tablist"
              aria-label={t("creator.exportFormat")}
            >
              <button type="button" className={format === "mp4" ? "is-active" : ""} role="tab" aria-selected={format === "mp4"} onClick={() => setFormat("mp4")}>
                <Clapperboard size={14} />
                {t("creator.exportVideo")}
              </button>
              <button type="button" className={format === "png" ? "is-active" : ""} role="tab" aria-selected={format === "png"} onClick={() => setFormat("png")}>
                <FileImage size={14} />
                {t("creator.exportImage")}
              </button>
            </div>
            {format === "mp4" && (
              <label className={`creator-voiceover-toggle ${voiceover ? "is-on" : ""}`}>
                <input type="checkbox" checked={voiceover} onChange={(event) => setVoiceover(event.target.checked)} />
                <Mic size={14} />
                {t("creator.voiceover")}
              </label>
            )}
          </div>

          {format === "mp4" && (
            <>
              <div className="creator-video-duration">
                <span className="creator-tool-label">
                  {t("creator.durationSec")}
                  <span className="creator-range-value">{t("creator.secondsShort", { count: durationSec })}</span>
                </span>
                <input
                  className="creator-range"
                  type="range"
                  min="6"
                  max="30"
                  step="1"
                  value={durationSec}
                  onChange={(event) => setDurationSec(Number(event.target.value))}
                  aria-label={t("creator.durationSec")}
                />
              </div>
              {!voiceover && (
                <label className="form-control">
                  <span className="label-text">{t("creator.music")}</span>
                  <select className="select select-bordered select-sm" value={musicId} onChange={(event) => setMusicId(event.target.value)}>
                    <option value="none">{t("creator.noMusic")}</option>
                    <option value="auto">{t("creator.musicAuto")}</option>
                    {music.map((track) => (
                      <option key={String(track.id)} value={String(track.id)}>
                        {String(track.name || track.id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary btn-sm gap-2 creator-export-run"
            onClick={() => void ops.exportCard(exportOptions())}
            disabled={busy !== null}
          >
            {busy === "export-card" ? <Loader2 className="animate-spin" size={15} /> : format === "mp4" ? <Clapperboard size={15} /> : <FileImage size={15} />}
            {format === "mp4" ? t("creator.exportMakeVideo") : t("creator.exportMakeImage")}
          </button>

          <div className="creator-zip-row">
            <label className="creator-zip-limit">
              {t("creator.zipFirstN")}
              <input
                type="number"
                className="input input-bordered input-xs"
                min={1}
                max={Math.min(50, cards.length)}
                value={zipLimit}
                onChange={(event) => setZipLimit(Math.max(1, Math.min(50, Math.min(cards.length, Math.round(Number(event.target.value) || 1)))))}
              />
            </label>
            <button
              type="button"
              className="btn btn-sm btn-outline gap-2"
              onClick={() => void ops.exportZip({ ...exportOptions(), limit: zipLimit })}
              disabled={busy !== null}
            >
              {busy === "export-zip" ? <Loader2 className="animate-spin" size={15} /> : <Archive size={15} />}
              {t("creator.zipBuild", { count: zipLimit })}
            </button>
          </div>
        </div>

        <div className="creator-export-preview">
          {selectedText && (
            <MiniCard styling={styling} title={selectedText.title} text={selectedText.text} className="is-large" />
          )}
        </div>
      </section>

      <section className="creator-gallery-section">
        <h3>{t("creator.readyFiles")}</h3>
        {gallery.length === 0 ? (
          <p className="creator-library-muted">{t("creator.galleryEmpty")}</p>
        ) : (
          <div className="creator-gallery-grid">
            {gallery.map((item) => {
              const downloadRel = item.videoRel ?? item.zipRel ?? item.imageRel;
              return (
                <article className="creator-gallery-item" key={item.id}>
                  <div className="creator-gallery-media">
                    {item.videoRel ? (
                      <video src={`/files/${item.videoRel}`} controls playsInline preload="metadata" poster={item.imageRel ? `/files/${item.imageRel}` : undefined} />
                    ) : item.imageRel ? (
                      <img src={`/files/${item.imageRel}`} alt="" loading="lazy" />
                    ) : (
                      <span className="creator-gallery-zip">
                        <Archive size={26} />
                        ZIP
                      </span>
                    )}
                  </div>
                  <div className="creator-gallery-info">
                    <strong>{item.title || item.packName}</strong>
                    <span className="creator-gallery-meta">
                      {item.format.toUpperCase()}
                      {item.durationSec ? ` · ${t("creator.secondsShort", { count: item.durationSec })}` : ""}
                      {item.createdAt ? ` · ${dateText(item.createdAt)}` : ""}
                    </span>
                  </div>
                  <div className="creator-gallery-actions">
                    {downloadRel && (
                      <a className="btn btn-xs btn-outline gap-1" href={`/files/${downloadRel}`} download target="_blank" rel="noreferrer">
                        <Download size={13} />
                        {t("creator.download")}
                      </a>
                    )}
                    <button
                      type="button"
                      className={`btn btn-xs ${deleteArmedId === item.id ? "btn-error" : "btn-ghost"} gap-1`}
                      onClick={() => {
                        if (deleteArmedId !== item.id) {
                          setDeleteArmedId(item.id);
                          window.setTimeout(() => setDeleteArmedId((current) => (current === item.id ? null : current)), 2600);
                          return;
                        }
                        setDeleteArmedId(null);
                        void ops.deleteGalleryItem(item.id);
                      }}
                      disabled={busy === "delete-gallery"}
                    >
                      <Trash2 size={13} />
                      {deleteArmedId === item.id ? t("creator.confirmDeleteFile") : ""}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
