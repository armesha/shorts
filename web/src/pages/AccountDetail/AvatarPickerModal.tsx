import { Upload, Loader2, RefreshCw, X } from "lucide-react";

type T = (key: string, vars?: Record<string, string | number>) => string;

// Avatar-picker modal. Rendered inline (DaisyUI modal) exactly as before — only the
// props were threaded through; no behavior change.
export default function AvatarPickerModal({
  avatarList,
  avatarBusy,
  currentAvatar,
  onClose,
  onPick,
  onUpload,
  t,
}: {
  avatarList: string[];
  avatarBusy: boolean;
  currentAvatar?: string | null;
  onClose: () => void;
  onPick: (url: string) => void;
  onUpload: (file: File) => void;
  t: T;
}) {
  return (
    <div className="modal modal-open modal-middle" onClick={() => !avatarBusy && onClose()}>
      <div className="modal-box max-w-2xl max-h-[88vh] p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3">
          <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">{t("account.avatarModalTitle")}</h3>
          <button
            className="btn btn-sm btn-circle btn-ghost"
            onClick={onClose}
            disabled={avatarBusy}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <label className={`btn btn-sm btn-primary gap-1 ${avatarBusy ? "btn-disabled" : ""}`}>
            <Upload size={14} /> {t("account.uploadOwnPhoto")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="btn btn-sm btn-ghost gap-1"
            disabled={avatarBusy || avatarList.length === 0}
            onClick={() => onPick(avatarList[Math.floor(Math.random() * avatarList.length)])}
          >
            <RefreshCw size={14} /> {t("account.randomAvatar")}
          </button>
          {avatarBusy && <Loader2 className="animate-spin self-center" size={16} />}
          <span className="text-xs text-base-content/50 ml-auto">{t("account.orPickFromSet")}</span>
          </div>
        </div>
        <div className="max-h-[calc(88vh-8.5rem)] overflow-y-auto p-4">
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2 p-1">
          {avatarList.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onPick(u)}
              disabled={avatarBusy}
              title={t("account.pickAvatar")}
              className={`rounded-full overflow-hidden border-2 transition w-full aspect-square ${
                currentAvatar === u ? "border-primary" : "border-transparent hover:border-base-300"
              }`}
            >
              <img src={u} alt="" className="w-full aspect-square object-cover bg-base-200" loading="lazy" />
            </button>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
