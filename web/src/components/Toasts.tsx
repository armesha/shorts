// Floating toast notifications (bottom-right) — the app-wide version of the Creator studio's
// notices, for quick operation results that shouldn't live inline in the page flow.
// Pages own their list via useToasts() and render one <ToastStack>; it is portalled to <body>
// so parent overflow/stacking never clips it. Success/info auto-dismiss; pass duration:null
// for messages the user must read (multi-step instructions) — they stay until closed.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppIcon, type AppIconName } from "./AppIcon";
import { useT } from "../lib/i18n";

export type ToastType = "success" | "error" | "warning" | "info";
export type ToastInput = {
  type: ToastType;
  text: string;
  /** ms until auto-dismiss; null = stays until closed manually. Omit for per-type defaults. */
  duration?: number | null;
};
export type Toast = ToastInput & { id: number };

const AUTO_MS: Record<ToastType, number> = {
  success: 4200,
  info: 5200,
  warning: 7000,
  error: 8000,
};
const MAX_STACK = 4;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = useRef(0);
  const timersRef = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) window.clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = ++seqRef.current;
      setToasts((current) => {
        const next = [...current, { ...input, id }];
        // Oldest toasts beyond the cap leave immediately — clear their pending timers too.
        for (const dropped of next.slice(0, Math.max(0, next.length - MAX_STACK))) {
          const timer = timersRef.current.get(dropped.id);
          if (timer) window.clearTimeout(timer);
          timersRef.current.delete(dropped.id);
        }
        return next.slice(-MAX_STACK);
      });
      const ms = input.duration === undefined ? AUTO_MS[input.type] : input.duration;
      if (ms != null) timersRef.current.set(id, window.setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  return { toasts, push, dismiss };
}

const TOAST_ICON: Record<ToastType, AppIconName> = {
  success: "check",
  error: "warning",
  warning: "warning",
  info: "info",
};

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const { t } = useT();
  if (toasts.length === 0) return null;
  const content = (
    <div className="app-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`app-toast is-${toast.type}`} role="status">
          <span className="app-toast-icon">
            <AppIcon name={TOAST_ICON[toast.type]} size={16} />
          </span>
          <span className="app-toast-text">{toast.text}</span>
          <button
            type="button"
            className="app-toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <AppIcon name="close" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
