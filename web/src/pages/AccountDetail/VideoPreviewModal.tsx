import { useState } from "react";
import { createPortal } from "react-dom";
import { Upload, Download, X, Trash2, Pencil, Loader2 } from "lucide-react";
import { apiClient, type VideoItem } from "../../lib/api";
import VideoPlayer from "../../components/VideoPlayer";
import { cleanDisplayText } from "../../lib/text";

type T = (key: string, vars?: Record<string, string | number>) => string;

// Video-preview portal modal. Mounted into document.body. Behavior is identical to the
// inline version it replaced — only the props were threaded through.
export default function VideoPreviewModal({
  preview,
  accountStatus,
  posting,
  onClose,
  onRemove,
  onPost,
  onSaved,
  t,
}: {
  preview: VideoItem;
  accountStatus: string;
  posting: number | null;
  onClose: () => void;
  onRemove: (id: number) => void;
  onPost: (id: number) => void;
  onSaved: (v: VideoItem) => void;
  t: T;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(preview.title);
  const [text, setText] = useState(preview.text);
  const [tags, setTags] = useState((preview.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError(t("account.editMetaTitleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await apiClient.updateVideoMeta(preview.id, {
        title: title.trim(),
        text: text.trim(),
        tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="modal modal-open modal-middle z-[1000]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal-box relative w-[calc(100vw-1.5rem)] max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-xl bg-base-100 p-0 shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-20 bg-base-100/70 hover:bg-base-100"
        >
          <X size={16} />
        </button>
        <div className="flex min-h-0 w-full flex-col sm:flex-row">
          <div className="flex min-h-0 shrink-0 items-center justify-center bg-black sm:order-2 sm:w-[300px]">
            <VideoPlayer
              src={`/files/${preview.videoRel}`}
              poster={preview.imageRel ? `/files/${preview.imageRel}` : undefined}
              className="h-[50dvh] max-h-[460px] w-full object-contain sm:aspect-[9/16] sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:order-1 sm:p-4">
            {editing ? (
              <>
                <label className="text-xs font-semibold text-base-content/60">{t("account.editMetaTitleLabel")}</label>
                <input
                  className="input input-sm input-bordered w-full"
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <label className="text-xs font-semibold text-base-content/60">{t("account.editMetaTextLabel")}</label>
                <textarea
                  className="textarea textarea-bordered w-full min-h-[10dvh] text-sm leading-relaxed sm:min-h-[30vh]"
                  value={text}
                  maxLength={4500}
                  onChange={(e) => setText(e.target.value)}
                />
                <label className="text-xs font-semibold text-base-content/60">{t("account.editMetaTagsLabel")}</label>
                <input
                  className="input input-sm input-bordered w-full"
                  value={tags}
                  maxLength={480}
                  placeholder={t("account.editMetaTagsPlaceholder")}
                  onChange={(e) => setTags(e.target.value)}
                />
                <div className="text-[11px] text-base-content/50">{t("account.editMetaTagsHint")}</div>
                {error && <div className="text-xs text-error">{error}</div>}
                <div className="flex items-center gap-2 pt-2 mt-auto">
                  <button className="btn btn-sm btn-primary gap-1" disabled={saving} onClick={save}>
                    {saving && <Loader2 className="animate-spin" size={14} />} {t("common.save")}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={saving}
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      setTitle(preview.title);
                      setText(preview.text);
                      setTags((preview.tags ?? []).join(", "));
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-bold text-base leading-snug">{cleanDisplayText(preview.title)}</h3>
                {preview.text && (
                  <p className="max-h-[14dvh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-base-content/80 sm:max-h-[40vh]">
                    {preview.text}
                  </p>
                )}
                <div className="text-xs text-base-content/50">
                  {t("account.charCount", { n: preview.text.length })}
                  {preview.postCount > 0 ? ` · ${t("account.postedTimes", { n: preview.postCount })}` : ` · ${t("account.notPosted")}`}
                  {preview.lastPostedAt && ` · ${new Date(preview.lastPostedAt).toLocaleDateString("ru-RU")}`}
                  {preview.music && preview.music !== "none"
                    ? ` · ${t("studio.musicLabel").toLowerCase()} ${preview.music.split("/").pop()?.replace(/\.\w+$/, "")}`
                    : ` · ${t("account.noMusic")}`}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 mt-auto">
                  <a href={`/files/${preview.videoRel}`} download className="btn btn-sm btn-ghost gap-1">
                    <Download size={14} /> MP4
                  </a>
                  <button className="btn btn-sm btn-ghost gap-1" onClick={() => setEditing(true)}>
                    <Pencil size={14} /> {t("common.edit")}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost text-error gap-1"
                    onClick={() => {
                      const pid = preview.id;
                      onClose();
                      onRemove(pid);
                    }}
                  >
                    <Trash2 size={14} /> {t("common.delete")}
                  </button>
                  <button
                    className="btn btn-sm btn-primary gap-1 ml-auto"
                    disabled={accountStatus !== "connected" || posting === preview.id}
                    onClick={() => {
                      const pid = preview.id;
                      onClose();
                      onPost(pid);
                    }}
                  >
                    <Upload size={14} /> {t("account.post")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-backdrop bg-black/55" />
      </div>
    </div>,
    document.body,
  );
}
