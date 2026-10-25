import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X, Upload, Trash2, Check } from "lucide-react";
import {
  apiClient,
  type CircleAdvertiser,
  type CircleAdvertiserState,
} from "../lib/api";
import { confirmDialog } from "../lib/confirm";
export default function BannerLibraryDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<CircleAdvertiserState | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let alive = true;
    apiClient
      .circleAdvertisers()
      .then((r) => {
        if (alive) setState(r);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить баннеры.");
      });
    return () => {
      alive = false;
      dialog.current?.close();
    };
  }, []);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("upload");
    setError("");
    try {
      if (!/\.mov$/i.test(file.name)) throw new Error("Выберите файл MOV.");
      if (!file.size) throw new Error("Файл пуст.");
      if (file.size > 100 * 1024 * 1024)
        throw new Error("Максимальный размер баннера — 100 МБ.");
      const result = await apiClient.uploadCircleAdvertiser(
        {
          name: name.trim() || file.name.replace(/\.mov$/i, ""),
          transparent: true,
          fullFrameMode: "auto",
          activate: false,
        },
        file,
      );
      setState(result);
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить баннер.");
    } finally {
      setBusy("");
    }
  }
  async function remove(item: CircleAdvertiser) {
    if (
      !(await confirmDialog(
        `Баннер «${item.name}» будет удалён из общей библиотеки.`,
        { title: "Удалить баннер?", confirmText: "Удалить", danger: true },
      ))
    )
      return;
    setBusy(item.id);
    setError("");
    try {
      setState(await apiClient.deleteCircleAdvertiser(item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить баннер.");
    } finally {
      setBusy("");
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="banner-library-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-box max-w-4xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <h2 id="banner-library-title" className="text-xl font-semibold">
            Баннеры
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            aria-label="Закрыть"
            disabled={!!busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex flex-wrap items-end gap-3">
          <label className="form-control gap-1 flex-1 min-w-0">
            <span className="label-text">Название баннера</span>
            <input
              className="input input-bordered w-full"
              value={name}
              maxLength={64}
              disabled={!!busy}
              placeholder="Необязательно"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label
            className={`btn btn-primary gap-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 ${busy ? "btn-disabled" : ""}`}
          >
            {busy === "upload" ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Upload size={16} />
            )}
            Загрузить MOV
            <input
              className="sr-only"
              type="file"
              accept=".mov,video/quicktime"
              aria-label="Загрузить баннер MOV"
              disabled={!!busy}
              onChange={(e) => void upload(e)}
            />
          </label>
        </div>
        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}
        {!state ? (
          <p role="status">Загрузка…</p>
        ) : !state.advertisers.length ? (
          <p className="text-base-content/70">Баннеров пока нет.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {state.advertisers.map((item) => (
              <article
                key={item.id}
                className="overflow-hidden border border-base-300"
              >
                <div className="bg-base-200 aspect-[9/4] relative overflow-hidden">
                  {item.hasVideo ? (
                    <video
                      className="w-full h-full object-contain"
                      controls
                      playsInline
                      preload="none"
                      poster={`/api/circle-editor/banner-preview.png?id=${encodeURIComponent(item.id)}`}
                      src={`/api/circle-editor/banner-preview.webm?id=${encodeURIComponent(item.id)}`}
                    />
                  ) : (
                    <img
                      src={`/api/circle-editor/banner-preview.png?id=${encodeURIComponent(item.id)}`}
                      alt={item.name}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold break-words">{item.name}</h3>
                    {item.sourceName && (
                      <p className="text-xs text-base-content/70 break-all">
                        {item.sourceName}
                      </p>
                    )}
                    {item.id === state.activeAdvertiserId &&
                      state.bannerEnabled && (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <Check size={12} />
                          Используется
                        </span>
                      )}
                  </div>
                  {!item.legacy && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-square text-error"
                      disabled={!!busy}
                      aria-label={`Удалить баннер ${item.name}`}
                      onClick={() => void remove(item)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button
          aria-label="Закрыть окно"
          disabled={!!busy}
          onClick={(e) => {
            e.preventDefault();
            if (!busy) onClose();
          }}
        />
      </form>
    </dialog>
  );
}
