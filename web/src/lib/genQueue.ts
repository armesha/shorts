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
  run: (accountId: number | string, count: number, deckIds?: string[]) => Promise<void>;
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
  const activeJobIdsRef = useRef<string[]>([]);
  const timerRef = useRef<number | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const setActiveJobIds = (ids: string[]) => {
    const clean = [...new Set(ids.filter(Boolean))];
    activeJobIdsRef.current = clean;
    try {
      if (clean.length) localStorage.setItem(LS_KEY, JSON.stringify({ jobs: clean }));
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* private mode */
    }
  };

  const pollActiveJobs = async () => {
    const ids = activeJobIdsRef.current;
    if (ids.length === 0) {
      stopTimer();
      setRunning(false);
      return;
    }
    const statuses = await Promise.all(ids.map((id) => apiClient.genStatus(id).catch(() => null)));
    const keep: string[] = [];
    let activeTotal = 0;
    let activeDone = 0;
    let terminalTotal = 0;
    let terminalDone = 0;
    let terminalJobs = 0;
    let terminalAccountId: number | null = null;
    let firstActive: { ahead: number; position: number; state: string } | null = null;

    for (const st of statuses) {
      if (!st) continue;
      if (TERMINAL.includes(st.state)) {
        terminalJobs++;
        terminalTotal += st.total;
        terminalDone += st.done;
        terminalAccountId = st.accountId;
        continue;
      }
      keep.push(st.id);
      activeTotal += st.total;
      activeDone += st.done;
      firstActive ??= { ahead: st.ahead, position: st.position, state: st.state };
    }

    setActiveJobIds(keep);
    if (terminalJobs > 0) {
      setMsg(
        terminalJobs === 1
          ? `Задача завершена: добавлено ${terminalDone} из ${terminalTotal}.`
          : `Завершено задач: ${terminalJobs}. Добавлено ${terminalDone} из ${terminalTotal}.`,
      );
      if (terminalAccountId != null) setAccountId(terminalAccountId);
      setCompletions((c) => c + terminalJobs);
    }

    if (keep.length === 0) {
      stopTimer();
      setRunning(false);
      setTotal(terminalTotal || 0);
      setDone(terminalDone || 0);
      setAhead(0);
      setPosition(-1);
      setState("");
      return;
    }

    setRunning(true);
    setTotal(activeTotal);
    setDone(activeDone);
    setAhead(firstActive?.ahead ?? 0);
    setPosition(firstActive?.position ?? -1);
    setState(firstActive?.state ?? "queued");
  };

  // Poll active jobs until they reach a terminal state. Used both by run() and by reload-resume.
  const startPolling = () => {
    if (timerRef.current) return;
    stopTimer();
    timerRef.current = window.setInterval(() => {
      pollActiveJobs().catch(() => {
        stopTimer();
        setActiveJobIds([]);
        setRunning(false);
      });
    }, 1200);
    void pollActiveJobs();
  };

  // On mount: resume an in-flight job left from a previous page (full reload). The server keeps
  // generating regardless; we just re-attach the progress UI to it.
  useEffect(() => {
    let resumeTimer: number | null = null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { jobId?: string; jobs?: string[]; accountId?: number | null; total?: number };
        const jobs = Array.isArray(saved?.jobs) && saved.jobs.length ? saved.jobs : saved?.jobId ? [saved.jobId] : [];
        if (jobs.length) {
          resumeTimer = window.setTimeout(() => {
            setActiveJobIds(jobs);
            setRunning(true);
            setTotal(saved.total ?? 0);
            setAccountId(saved.accountId ?? null);
            setState("queued");
            startPolling();
          }, 0);
        }
      }
    } catch {
      /* ignore */
    }
    return () => {
      if (resumeTimer != null) window.clearTimeout(resumeTimer);
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(acc: number | string, count: number, deckIds?: string[]) {
    const requested = Math.max(1, Math.floor(Number(count) || 1));
    const accNum = Number(acc);
    const accId = Number.isFinite(accNum) ? accNum : null;
    setRunning(true);
    setMsg(null);
    setTotal((t) => t + requested);
    setState("queued");
    setAccountId(accId);
    try {
      const { jobId, total: t } = await apiClient.enqueueGen(acc, requested, deckIds);
      setActiveJobIds([...activeJobIdsRef.current, jobId]);
      setTotal((prev) => Math.max(0, prev - requested) + t);
      startPolling();
    } catch (e) {
      setTotal((prev) => Math.max(0, prev - requested));
      if (activeJobIdsRef.current.length === 0) setRunning(false);
      setMsg(e instanceof Error ? e.message : "Не удалось поставить в очередь");
    }
  }

  function cancel() {
    for (const id of activeJobIdsRef.current) apiClient.cancelGen(id).catch(() => {});
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

function pluralRu(n: number, forms: [string, string, string]) {
  const value = Math.abs(Math.trunc(n));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

function videoWord(n: number) {
  return pluralRu(n, ["ролик", "ролика", "роликов"]);
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
  // Green check only when everything requested was actually added; partial/canceled/error → warning.
  // (The completion message reads «Задача завершена…», never «Готово», so the old regex was always false.)
  const ok = q.total > 0 && q.done >= q.total;
  const aheadText = `${q.ahead} ${videoWord(q.ahead)}`;
  const totalText = `${q.total} ${videoWord(q.total)}`;

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
        waiting
          ? createElement(
              "div",
              {
                key: "queue",
                className:
                  "rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs text-base-content/75",
              },
              createElement(
                "div",
                { className: "mb-2 flex items-center justify-between gap-3" },
                createElement("span", { className: "font-medium text-base-content" }, "В очереди"),
                createElement("span", { className: "rounded-full bg-base-100 px-2 py-0.5 text-[11px] text-primary" }, "ожидание"),
              ),
              createElement(
                "div",
                { className: "grid grid-cols-2 gap-2" },
                createElement(
                  "div",
                  { className: "rounded-md bg-base-100 p-2" },
                  createElement("div", { className: "text-[11px] text-base-content/55" }, "Перед вами"),
                  createElement("div", { className: "mt-0.5 font-semibold text-base-content" }, aheadText),
                ),
                createElement(
                  "div",
                  { className: "rounded-md bg-base-100 p-2" },
                  createElement("div", { className: "text-[11px] text-base-content/55" }, "Ваш пакет"),
                  createElement("div", { className: "mt-0.5 font-semibold text-base-content" }, totalText),
                ),
              ),
            )
          : createElement(
              "div",
              { key: "t", className: "text-xs text-base-content/70" },
              `Готово ${q.done} из ${q.total}…`,
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
    { className: "fixed bottom-32 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)] lg:bottom-4" },
    createElement(
      "div",
      { className: "card bg-base-100 border border-base-300 shadow-xl" },
      createElement("div", { className: "card-body p-4 gap-3" }, header, ...body),
    ),
  );
}
