import { createPortal } from "react-dom";
import { AlertTriangle, Check } from "lucide-react";
import type { useT } from "../../lib/i18n";

type TFn = ReturnType<typeof useT>["t"];

type Notice = {
  text: string;
  kind: "info" | "success" | "error";
  title?: string;
};

type NoticeToastProps = {
  notice: Notice | null;
  t: TFn;
};

export default function NoticeToast({ notice, t }: NoticeToastProps) {
  if (!notice || typeof document === "undefined") return null;

  return createPortal(
    <div className="toast toast-bottom toast-end z-[1000] pointer-events-none">
      <div
        role="alert"
        className={`pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-md border px-3 py-2.5 shadow-2xl ring-1 ${
          notice.kind === "error"
            ? "border-error/40 border-l-4 bg-error text-error-content ring-error/25"
            : notice.kind === "success"
              ? "border-success/40 border-l-4 bg-success text-success-content ring-success/25"
              : "border-info/40 border-l-4 bg-info text-info-content ring-info/25"
        }`}
      >
        <div className="flex items-start gap-2">
          {notice.kind === "success" ? (
            <Check size={18} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight">
              {notice.title ?? (notice.kind === "success" ? t("common.saved") : t("common.error"))}
            </div>
            <div className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug">{notice.text}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
