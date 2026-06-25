import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  trackJobs: (jobs: { jobId: string; accountId?: number | null; total?: number }[]) => void;
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

  function trackJobs(jobs: { jobId: string; accountId?: number | null; total?: number }[]) {
    const valid = jobs.filter((job) => job.jobId);
    if (!valid.length) return;
    setRunning(true);
    setMsg(null);
    setState("queued");
    setAccountId(valid.find((job) => job.accountId != null)?.accountId ?? null);
    setTotal((t) => t + valid.reduce((sum, job) => sum + Math.max(0, Number(job.total) || 0), 0));
    setActiveJobIds([...activeJobIdsRef.current, ...valid.map((job) => job.jobId)]);
    startPolling();
  }

  function cancel() {
    for (const id of activeJobIdsRef.current) apiClient.cancelGen(id).catch(() => {});
  }

  function dismiss() {
    setMsg(null);
  }

  return { running, total, done, ahead, position, state, msg, accountId, completions, run, trackJobs, cancel, dismiss };
}

export function GenQueueProvider({ children }: { children: ReactNode }) {
  const value = useProvideGenQueue();
  // The progress widget (<GenProgressToast/>) is rendered separately in App.tsx (inside this
  // provider) so this stays a plain .ts file with no JSX and no import cycle.
  return createElement(GenQueueContext.Provider, { value }, children);
}

export function useGenQueue(): GenQueueUI {
  const ctx = useContext(GenQueueContext);
  if (!ctx) throw new Error("useGenQueue must be used within <GenQueueProvider>");
  return ctx;
}
