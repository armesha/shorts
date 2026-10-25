import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import type { Account, ChannelGroup } from "../lib/api";
export default function ChannelGroupDialog({
  group,
  accounts,
  busy,
  error,
  onClose,
  onSave,
}: {
  group: ChannelGroup | null;
  accounts: Account[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (name: string, ids: number[]) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(group?.name || "");
  const [selected, setSelected] = useState<number[]>(
    accounts.filter((a) => group && a.groupId === group.id).map((a) => a.id),
  );
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && !busy) await onSave(name.trim(), selected);
  }
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="channel-group-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="modal-box max-w-lg space-y-5"
      >
        <header className="flex items-center justify-between gap-3">
          <h2 id="channel-group-title" className="text-xl font-semibold">
            {group ? "Изменить группу" : "Создать группу"}
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
        </header>
        <label className="form-control gap-2">
          <span className="label-text">Название группы</span>
          <input
            className="input input-bordered w-full"
            autoFocus
            required
            maxLength={100}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="font-medium text-sm mb-2">Каналы</legend>
          {!accounts.length ? (
            <p className="text-sm text-base-content/70">Каналов пока нет.</p>
          ) : (
            <div className="max-h-64 overflow-auto divide-y divide-base-300">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex items-center gap-3 py-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={selected.includes(account.id)}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, account.id]
                          : ids.filter((id) => id !== account.id),
                      )
                    }
                  />
                  <span className="min-w-0 break-words">
                    {account.channelName}
                    <span className="block text-xs text-base-content/70">
                      {account.platform === "youtube"
                        ? "YouTube"
                        : account.platform === "instagram"
                          ? "Instagram"
                          : "TikTok"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onClose}
          >
            Отмена
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy && <span className="loading loading-spinner loading-sm" />}
            {group ? "Сохранить" : "Создать"}
          </button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop">
        <button
          aria-label="Закрыть окно"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            if (!busy) onClose();
          }}
        />
      </form>
    </dialog>
  );
}
