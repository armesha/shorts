import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { ChannelPlatform } from "../lib/api";

const PLATFORMS: { id: ChannelPlatform; name: string; description: string }[] =
  [
    { id: "youtube", name: "YouTube", description: "Подключение через Google" },
    {
      id: "instagram",
      name: "Instagram",
      description: "Подключение через cookies",
    },
    { id: "tiktok", name: "TikTok", description: "Подключение через cookies" },
  ];

type Props = {
  busy: boolean;
  onClose: () => void;
  onCreate: (platform: ChannelPlatform, name: string) => Promise<void>;
  error: string;
};

export default function AddChannelDialog({
  busy,
  onClose,
  onCreate,
  error,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [platform, setPlatform] = useState<ChannelPlatform | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);
  const selected = PLATFORMS.find((p) => p.id === platform);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (platform && !busy) await onCreate(platform, name.trim());
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="add-channel-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="modal-box max-w-lg space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-channel-title" className="text-xl font-semibold">
            Добавить канал
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            disabled={busy}
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {!platform ? (
          <>
            <p className="text-sm text-base-content/75">
              Выберите площадку. Библиотека роликов, расписание и история будут
              доступны в общей карточке канала.
            </p>
            <div className="divide-y divide-base-300 border-y border-base-300">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-4 px-2 text-left transition-colors hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={() => setPlatform(p.id)}
                >
                  <span>
                    <span className="block font-semibold">{p.name}</span>
                    <span className="block mt-1 text-sm text-base-content/75">
                      {p.description}
                    </span>
                  </span>
                  <ArrowRight size={18} className="shrink-0" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <form className="space-y-5" onSubmit={(event) => void submit(event)}>
            <button
              type="button"
              className="btn btn-ghost btn-sm gap-2 -ml-2"
              disabled={busy}
              onClick={() => setPlatform(null)}
            >
              <ArrowLeft size={15} />
              Выбрать другую площадку
            </button>
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">{selected?.name}</h3>
              <p className="text-sm text-base-content/75">
                {platform === "youtube"
                  ? "После создания подключите YouTube-канал через Google. Затем выберите контент и расписание."
                  : "После создания загрузите cookies файлом JSON/TXT или вставьте их текстом. Проверьте вход, затем выберите контент и расписание."}
              </p>
            </div>
            <label className="form-control gap-2">
              <span className="label-text">Название канала</span>
              <input
                className="input input-bordered w-full"
                autoFocus
                value={name}
                maxLength={100}
                disabled={busy}
                placeholder={`Мой ${selected?.name}`}
                onChange={(event) => setName(event.target.value)}
              />
              <span className="label-text-alt text-base-content/70">
                Название можно изменить в настройках канала.
              </span>
            </label>
            {error && (
              <div className="alert alert-error text-sm" role="alert">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={onClose}
              >
                Отмена
              </button>
              <button className="btn btn-primary gap-2" disabled={busy}>
                {busy ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <ArrowRight size={16} />
                )}
                Далее: подключение
              </button>
            </div>
          </form>
        )}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            if (!busy) onClose();
          }}
          aria-label="Закрыть окно"
        />
      </form>
    </dialog>
  );
}
