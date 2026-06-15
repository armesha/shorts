import { useEffect, useState } from "react";

// Promise-based confirm dialog (replaces native window.confirm with an in-app modal).
// Usage: if (!(await confirmDialog("Удалить?", { danger: true }))) return;
type Opts = { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean };
type Pending = { opts: Opts; resolve: (v: boolean) => void };

let _show: ((opts: Opts) => Promise<boolean>) | null = null;

export function confirmDialog(message: string, opts: Omit<Opts, "message"> = {}): Promise<boolean> {
  if (!_show) return Promise.resolve(window.confirm(message)); // fallback if host not mounted yet
  return _show({ message, ...opts });
}

// Mount once near the app root.
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    _show = (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve }));
    return () => {
      _show = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  if (!pending) return null;
  const { opts, resolve } = pending;
  const close = (v: boolean) => {
    resolve(v);
    setPending(null);
  };

  return (
    <div className="modal modal-open" role="alertdialog" aria-modal="true" onClick={() => close(false)}>
      <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-base">{opts.title ?? "Подтвердите действие"}</h3>
        <p className="text-sm text-base-content/80 mt-2 whitespace-pre-wrap">{opts.message}</p>
        <div className="modal-action">
          <button className="btn btn-sm btn-ghost" onClick={() => close(false)}>
            {opts.cancelText ?? "Отмена"}
          </button>
          <button
            className={`btn btn-sm ${opts.danger ? "btn-error" : "btn-primary"}`}
            onClick={() => close(true)}
            autoFocus
          >
            {opts.confirmText ?? "Подтвердить"}
          </button>
        </div>
      </div>
    </div>
  );
}
