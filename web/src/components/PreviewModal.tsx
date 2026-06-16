// Shared 9:16 preview modal + a race-guarded loader hook.
//
// Previously this "open card → spinner → 270×480 image" block was copy-pasted in Cards, PackDetail
// and Packs, and only PackDetail had the race-guard — so closing the Cards/Packs preview mid-load
// could flash a stale image. Both the modal and the guard now live here.
import { useRef, useState, useCallback } from "react";
import { Loader2, X } from "lucide-react";
import { useT } from "../lib/i18n";

/**
 * Manages one preview at a time with a request token so a late-resolving fetch can't overwrite
 * a newer one (or a closed modal). `show(i, fetcher)` runs `fetcher()` and keeps the result only
 * if it's still the active request.
 */
export function usePreview() {
  const reqRef = useRef(0);
  const [index, setIndex] = useState<number | null>(null); // which item is open/loading
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = useCallback(async (i: number, fetcher: () => Promise<string>) => {
    const my = ++reqRef.current;
    setIndex(i);
    setUrl(null);
    setError(null);
    try {
      const u = await fetcher();
      if (reqRef.current === my) setUrl(u);
    } catch (e) {
      if (reqRef.current === my) setError(e instanceof Error ? e.message : null);
    }
  }, []);

  const close = useCallback(() => {
    reqRef.current++; // invalidate any in-flight request
    setIndex(null);
    setUrl(null);
    setError(null);
  }, []);

  return {
    /** Item index currently open (null = closed). Use to disable buttons while a preview is active. */
    index,
    open: index !== null,
    url,
    error,
    loading: index !== null && url === null && error === null,
    show,
    close,
  };
}

export function PreviewModal({
  open,
  url,
  error,
  onClose,
}: {
  open: boolean;
  url: string | null;
  error?: string | null;
  onClose: () => void;
}) {
  const { t } = useT();
  if (!open) return null;
  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-sm flex flex-col items-center gap-3">
        <button
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>
        <div
          className="rounded-xl overflow-hidden border border-base-300 bg-base-200"
          style={{ width: 270, height: 480 }}
        >
          {url ? (
            <img src={url} alt={t("common.preview")} width={270} height={480} className="block" />
          ) : error ? (
            <div className="w-full h-full flex items-center justify-center p-4 text-center text-sm text-error">
              {error || t("preview.failed")}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          )}
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
