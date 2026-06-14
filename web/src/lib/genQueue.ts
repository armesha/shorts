import { useEffect, useRef, useState } from "react";
import { apiClient } from "./api";

// Client side of the global generation queue: enqueue a batch, poll its status (position + progress),
// and cancel. One video at a time across all users is enforced on the server. Shared by Studio and
// the channel page so both go through the same queue (server load stays bounded).
const TERMINAL = ["done", "exhausted", "canceled", "error"];

export interface GenQueueUI {
  running: boolean;
  total: number;
  done: number;
  ahead: number;
  position: number; // 0 = your turn (generating), >0 = waiting in line
  state: string;
  msg: string | null;
  run: (accountId: number | string, count: number) => Promise<void>;
  cancel: () => void;
}

export function useGenQueue(onDone?: () => void): GenQueueUI {
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [ahead, setAhead] = useState(0);
  const [position, setPosition] = useState(-1);
  const [state, setState] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => () => stopTimer(), []);

  async function run(accountId: number | string, count: number) {
    if (running || jobIdRef.current) return;
    setRunning(true);
    setMsg(null);
    setDone(0);
    setTotal(count);
    setAhead(0);
    setPosition(-1);
    setState("queued");
    try {
      const { jobId, total: t } = await apiClient.enqueueGen(accountId, count);
      jobIdRef.current = jobId;
      setTotal(t);
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
            onDoneRef.current?.();
          }
        } catch {
          // job pruned (404) or transient network blip — stop polling politely
          stopTimer();
          jobIdRef.current = null;
          setRunning(false);
        }
      }, 1200);
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

  return { running, total, done, ahead, position, state, msg, run, cancel };
}
