// Floating "generation in progress" widget, shown on every page while a batch generates (or just
// finished). It is DRAGGABLE (grab the header), COLLAPSIBLE to a tiny pill, and stays compact on
// mobile (sits above the bottom nav, never full-screen). Position + collapsed state persist per
// browser. State/logic live in lib/genQueue.ts; this is purely the presentation.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronUp, GripVertical, Loader2, Minus, Square, X } from "lucide-react";
import { useGenQueue } from "../lib/genQueue";

const POS_KEY = "genQueue.toast.pos.v1";
const COLLAPSED_KEY = "genQueue.toast.collapsed.v1";
const MARGIN = 8;

type Pos = { left: number; top: number };

function pluralRu(n: number, forms: [string, string, string]) {
  const value = Math.abs(Math.trunc(n));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
const videoWord = (n: number) => pluralRu(n, ["ролик", "ролика", "роликов"]);

function formatWorkerAge(ageMs: number | null): string {
  if (ageMs == null) return "";
  const sec = Math.max(0, Math.round(ageMs / 1000));
  if (sec < 60) return `${sec} сек назад`;
  return `${Math.round(sec / 60)} мин назад`;
}

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return typeof p?.left === "number" && typeof p?.top === "number" ? p : null;
  } catch {
    return null;
  }
}

export function GenProgressToast() {
  const q = useGenQueue();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pos, setPos] = useState<Pos | null>(loadPos);
  const elRef = useRef<HTMLDivElement>(null);
  const dragOff = useRef<{ dx: number; dy: number } | null>(null);
  const posRef = useRef<Pos | null>(pos);
  posRef.current = pos;

  // Auto-hide the «finished» message after a few seconds.
  useEffect(() => {
    if (q.msg && !q.running) {
      const t = window.setTimeout(() => q.dismiss(), 9000);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.msg, q.running]);

  // Keep a custom-positioned widget on-screen when the viewport changes (resize / rotate) or when
  // its size changes (collapse/expand).
  useEffect(() => {
    if (!pos) return;
    const clamp = () => {
      const el = elRef.current;
      const cur = posRef.current;
      if (!el || !cur) return;
      const left = Math.max(MARGIN, Math.min(window.innerWidth - el.offsetWidth - MARGIN, cur.left));
      const top = Math.max(MARGIN, Math.min(window.innerHeight - el.offsetHeight - MARGIN, cur.top));
      if (left !== cur.left || top !== cur.top) savePos({ left, top });
    };
    window.addEventListener("resize", clamp);
    clamp();
    return () => window.removeEventListener("resize", clamp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos != null, collapsed]);

  function savePos(p: Pos | null) {
    setPos(p);
    posRef.current = p;
    try {
      if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
      else localStorage.removeItem(POS_KEY);
    } catch {
      /* private mode */
    }
  }
  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
    } catch {
      /* private mode */
    }
  }

  function onHandleDown(e: ReactPointerEvent) {
    if ((e.target as Element).closest("button")) return; // let header buttons work normally
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOff.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }
  function onHandleMove(e: ReactPointerEvent) {
    if (!dragOff.current) return;
    const el = elRef.current;
    if (!el) return;
    const left = Math.max(MARGIN, Math.min(window.innerWidth - el.offsetWidth - MARGIN, e.clientX - dragOff.current.dx));
    const top = Math.max(MARGIN, Math.min(window.innerHeight - el.offsetHeight - MARGIN, e.clientY - dragOff.current.dy));
    setPos({ left, top });
    posRef.current = { left, top };
  }
  function onHandleUp() {
    if (!dragOff.current) return;
    dragOff.current = null;
    savePos(posRef.current); // persist the final resting place
  }

  if (!q.running && !q.msg) return null;

  const waiting = q.running && q.position > 0;
  // Green check only when everything requested was actually added; partial/canceled/error → warning.
  const ok = q.total > 0 && q.done >= q.total;
  const aheadText = `${q.ahead} ${videoWord(q.ahead)}`;
  const totalText = `${q.total} ${videoWord(q.total)}`;

  const positioned = pos != null;
  const style: CSSProperties = positioned
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto", zIndex: 10000 }
    : { zIndex: 10000 };
  // Default (un-dragged): bottom-right, above the mobile bottom nav; lg drops it to the corner.
  const baseCls = `fixed${positioned ? "" : " bottom-32 right-4 lg:bottom-4"}`;

  const statusIcon = q.running ? (
    <Loader2 className="animate-spin text-primary shrink-0" size={18} />
  ) : (
    <CheckCircle2 className={`shrink-0 ${ok ? "text-success" : "text-warning"}`} size={18} />
  );
  const workerOffline = q.running && q.worker && !q.worker.online;
  const workerAge = formatWorkerAge(q.worker?.ageMs ?? null);

  const dragHandlers = {
    onPointerDown: onHandleDown,
    onPointerMove: onHandleMove,
    onPointerUp: onHandleUp,
    onPointerCancel: onHandleUp,
  };

  const content = collapsed ? (
    <div ref={elRef} className={baseCls} style={style}>
      <div className="card bg-base-100 border border-base-300 shadow-lg">
        <div className="flex items-center gap-1.5 py-1.5 pl-1 pr-2 cursor-move touch-none select-none" {...dragHandlers}>
          <GripVertical className="text-base-content/30 shrink-0" size={14} />
          {statusIcon}
          <span className="text-xs font-medium tabular-nums whitespace-nowrap">
            {q.running ? `${q.done}/${q.total}` : ok ? "Готово" : "Завершено"}
          </span>
          <button
            className="btn btn-ghost btn-xs btn-square ml-0.5"
            onClick={() => setCollapsedPersist(false)}
            aria-label="Развернуть"
            title="Развернуть"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div ref={elRef} className={`${baseCls} w-80 max-w-[calc(100vw-2rem)]`} style={style}>
      <div className="card bg-base-100 border border-base-300 shadow-xl">
        <div className="card-body p-4 gap-3">
          <div className="flex items-center gap-2 -m-1 p-1 cursor-move touch-none select-none" {...dragHandlers}>
            {statusIcon}
            <span className="font-medium text-sm flex-1">
              {q.running ? "Генерация роликов" : "Генерация завершена"}
            </span>
            <button
              className="btn btn-ghost btn-xs btn-square"
              onClick={() => setCollapsedPersist(true)}
              aria-label="Свернуть"
              title="Свернуть"
            >
              <Minus size={14} />
            </button>
            {!q.running && (
              <button className="btn btn-ghost btn-xs btn-square" onClick={q.dismiss} aria-label="Закрыть" title="Закрыть">
                <X size={14} />
              </button>
            )}
          </div>

          {q.running ? (
            <>
              {waiting ? (
                <div className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-base-content/75">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-medium text-base-content">В очереди</span>
                    <span className="rounded-full bg-base-100 px-2 py-0.5 text-[11px] text-primary">ожидание</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md bg-base-100 p-2">
                      <div className="text-[11px] text-base-content/55">Перед вами</div>
                      <div className="mt-0.5 font-semibold text-base-content">{aheadText}</div>
                    </div>
                    <div className="rounded-md bg-base-100 p-2">
                      <div className="text-[11px] text-base-content/55">Ваш пакет</div>
                      <div className="mt-0.5 font-semibold text-base-content">{totalText}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-base-content/70">{`Готово ${q.done} из ${q.total}…`}</div>
              )}
              {waiting ? (
                <progress className="progress progress-primary w-full" />
              ) : (
                <progress className="progress progress-primary w-full" value={q.done} max={q.total} />
              )}
              {q.worker && (
                <div
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] ${
                    workerOffline ? "bg-error/10 text-error" : "bg-base-200 text-base-content/55"
                  }`}
                >
                  {workerOffline ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                  <span>{workerOffline ? "Движок не отвечает" : "Движок активен"}</span>
                  {q.worker.mode === "external" && workerAge && <span className="text-current/70">· {workerAge}</span>}
                </div>
              )}
              <button className="btn btn-xs btn-outline btn-error self-end gap-1" onClick={() => void q.cancel()} disabled={q.canceling}>
                {q.canceling ? <Loader2 className="animate-spin" size={12} /> : <Square size={12} />}
                {q.canceling ? "Отменяю..." : "Отменить"}
              </button>
            </>
          ) : (
            <div className="text-xs text-base-content/70">{q.msg}</div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
