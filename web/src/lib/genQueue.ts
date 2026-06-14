import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Square, CheckCircle2, X } from "lucide-react";
import { apiClient } from "./api";

// Global generation queue. Generation runs SERVER-SIDE (one video at a time across all users);
// the client only enqueues a batch, then polls its status. State lives in a single app-wide
// provider (not per-page), so progress keeps showing — as a bottom-right toast — while you
// navigate the site, and even survives a full page reload (the job id is kept in localStorage
// and polling resumes on mount). Shared by Studio and the channel page.
const TERMINAL = ["done", "exhausted", "canceled", "error"];
const LS_KEY = "genQueue.active.v1";

export interface GenQueueUI {
  running: boolean;
  total: number;
  done: number;
  ahead: number;
  position: number; // 0 = your turn (generating), >0 = waiting in line
  state: string;
  msg: string | null;
  accountId: number | null; // which channel this batch fills (for in-place refresh)
  completions: number; // bumps each time a job reaches a terminal state
  run: (accountId: number | string, count: number) => Promise<void>;
  cancel: () => void;
  dismiss: () => void; // hide the finished-message toast
}

const GenQueueContext = createContext<GenQueueUI | null>(null);

function useProvideGenQueue(): GenQueueUI {
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [ahead, setAhead] = useState(0);
  const [position, setPosition] = useState(-1);
  const [state, setState] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [completions, setCompletions] = useState(0);
  const jobIdRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Poll a job until it reaches a terminal state. Used both by run() and by reload-resume.
  const startPolling = (jobId: string) => {
    jobIdRef.current = jobId;
    stopTimer();
    timerRef.current = window.setInterval(async () => {
      const id = jobIdRef.current;
      if (!id) return;
      try {
        const st = await apiClient.genStatus(id);
        setTotal(st.total);
        setDone(st.done);
        setAhead(st.ahead);
        setPosition(st.position);
        setState(st.state);
        if (TERMINAL.includes(st.state)) {
          stopTimer();
          jobIdRef.current = null;
          try {
            localStorage.removeItem(LS_KEY);
          } catch {
            /* private mode */
          }
          setRunning(false);
          setMsg(
            st.state === "exhausted"
              ? `Свободные карточки закончились — добавлено ${st.done} из ${st.total}.`
              : st.state === "canceled"
                ? `Остановлено — добавлено ${st.done} из ${st.total}.`
                : st.state === "error"
                  ? `Прервано — добавлено ${st.done} из ${st.total}.`
                  : `Готово: добавлено ${st.done} ролик(ов) в библиотеку.`,
          );
          setCompletions((c) => c + 1);
        } else {
          setRunning(true);
        }
      } catch {
        // job pruned (404) or transient network blip — stop polling politely
        stopTimer();
        jobIdRef.current = null;
        try {
          localStorage.removeItem(LS_KEY);
        } catch {
          /* private mode */
        }
        setRunning(false);
      }
    }, 1200);
  };

  // On mount: resume an in-flight job left from a previous page (full reload). The server keeps
  // generating regardless; we just re-attach the progress UI to it.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { jobId?: string; accountId?: number | null; total?: number };
        if (saved?.jobId) {
          setRunning(true);
          setTotal(saved.total ?? 0);
          setAccountId(saved.accountId ?? null);
          setState("queued");
          startPolling(saved.jobId);
        }
      }
    } catch {
      /* ignore */
    }
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(acc: number | string, count: number) {
    if (running || jobIdRef.current) return;
    const accNum = Number(acc);
    const accId = Number.isFinite(accNum) ? accNum : null;
    setRunning(true);
    setMsg(null);
    setDone(0);
    setTotal(count);
    setAhead(0);
    setPosition(-1);
    setState("queued");
    setAccountId(accId);
    try {
      const { jobId, total: t } = await apiClient.enqueueGen(acc, count);
      setTotal(t);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ jobId, accountId: accId, total: t }));
      } catch {
        /* private mode */
      }
      startPolling(jobId);
    } catch (e) {
      setRunning(false);
      jobIdRef.current = null;
      setMsg(e instanceof Error ? e.message : "Не удалось поставить в очередь");
    }
  }

  function cancel() {
    const id = jobIdRef.current;
    if (id) apiClient.cancelGen(id).catch(() => {});
  }

  function dismiss() {
    setMsg(null);
  }

  return { running, total, done, ahead, position, state, msg, accountId, completions, run, cancel, dismiss };
}

export function GenQueueProvider({ children }: { children: ReactNode }) {
  const value = useProvideGenQueue();
  // Render children + the global progress toast under one provider (no JSX — this is a .ts file).
  return createElement(GenQueueContext.Provider, { value }, children, createElement(GenProgressToast));
}

export function useGenQueue(): GenQueueUI {
  const ctx = useContext(GenQueueContext);
  if (!ctx) throw new Error("useGenQueue must be used within <GenQueueProvider>");
  return ctx;
}

// Bottom-right floating notification, visible on every page while a batch generates (or just finished).
function GenProgressToast() {
  const q = useGenQueue();
  // Auto-hide the «finished» message after a few seconds.
  useEffect(() => {
    if (q.msg && !q.running) {
      const t = setTimeout(() => q.dismiss(), 9000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.msg, q.running]);

  if (!q.running && !q.msg) return null;
  const waiting = q.running && q.position > 0;
  const ok = /Готово/.test(q.msg ?? "");

  const header = createElement(
    "div",
    { className: "flex items-center gap-2" },
    q.running
      ? createElement(Loader2, { className: "animate-spin text-primary", size: 18 })
      : createElement(CheckCircle2, { className: ok ? "text-success" : "text-warning", size: 18 }),
    createElement(
      "span",
      { className: "font-medium text-sm flex-1" },
      q.running ? "Генерация роликов" : "Генерация завершена",
    ),
    !q.running &&
      createElement(
        "button",
        {
          className: "btn btn-ghost btn-xs btn-square",
          onClick: q.dismiss,
          "aria-label": "Закрыть",
        },
        createElement(X, { size: 14 }),
      ),
  );

  const body = q.running
    ? [
        createElement(
          "div",
          { key: "t", className: "text-xs text-base-content/70" },
          waiting
            ? `В очереди: впереди ${q.ahead} роликов, потом ваши ${q.total}`
            : `Готово ${q.done} из ${q.total}…`,
        ),
        waiting
          ? createElement("progress", { key: "p", className: "progress progress-primary w-full" })
          : createElement("progress", {
              key: "p",
              className: "progress progress-primary w-full",
              value: q.done,
              max: q.total,
            }),
        createElement(
          "button",
          {
            key: "stop",
            className: "btn btn-xs btn-outline btn-error self-end gap-1",
            onClick: q.cancel,
          },
          createElement(Square, { size: 12 }),
          "Стоп",
        ),
      ]
    : [createElement("div", { key: "m", className: "text-xs text-base-content/70" }, q.msg)];

  return createElement(
    "div",
    { className: "fixed bottom-4 right-4 z-[60] w-72 max-w-[calc(100vw-2rem)]" },
    createElement(
      "div",
      { className: "card bg-base-100 border border-base-300 shadow-xl" },
      createElement("div", { className: "card-body p-4 gap-2" }, header, ...body),
    ),
  );
}
