import { useEffect, useRef, useState } from "react";
import { Send, ExternalLink, Check, AlertTriangle } from "lucide-react";
import { apiClient, type AuthUser } from "../lib/api";

type Mode = "bind" | "login";
type Phase = "idle" | "waiting" | "done" | "nomatch" | "conflict" | "expired" | "error";

interface Props {
  mode: Mode;
  onDone?: (user?: AuthUser) => void;
}

// Bot deep-link handshake: mint a token → user opens @bot and presses Start → we poll a tiny
// status endpoint until the webhook resolves it. Polling auto-stops on a result or after 3 minutes,
// so the backend is never asked to "wait forever" (Telegram pushes the /start; we don't long-poll it).
export default function TelegramConnect({ mode, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState("");
  const [bot, setBot] = useState("");
  const tokenRef = useRef("");
  const pollRef = useRef<number | undefined>(undefined);

  const stop = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = undefined;
    }
  };
  useEffect(() => stop, []);

  async function begin() {
    setPhase("waiting");
    try {
      const r = mode === "bind" ? await apiClient.tgBindStart() : await apiClient.tgLoginStart();
      tokenRef.current = r.token;
      setUrl(r.url);
      setBot(r.bot);
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - startedAt > 3 * 60_000) {
          stop();
          setPhase("expired");
          return;
        }
        try {
          const s =
            mode === "bind"
              ? await apiClient.tgBindStatus(tokenRef.current)
              : await apiClient.tgLoginStatus(tokenRef.current);
          if (s.status === "pending" || s.status === "notfound") return; // keep waiting
          stop();
          if (mode === "bind") {
            if (s.status === "linked") {
              setPhase("done");
              onDone?.();
            } else setPhase(s.status === "conflict" ? "conflict" : "expired");
          } else {
            const u = (s as { user?: AuthUser }).user;
            if (s.status === "ok" && u) {
              setPhase("done");
              onDone?.(u);
            } else setPhase(s.status === "nomatch" ? "nomatch" : "expired");
          }
        } catch {
          /* transient network error — keep polling */
        }
      }, 2500);
    } catch {
      setPhase("error");
    }
  }

  if (phase === "idle")
    return (
      <button className="btn btn-primary btn-sm gap-2" onClick={begin}>
        <Send size={16} /> {mode === "bind" ? "Привязать через Telegram" : "Войти через Telegram"}
      </button>
    );

  if (phase === "waiting")
    return (
      <div className="flex flex-col gap-2 items-start">
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm gap-2">
          <ExternalLink size={16} /> Открыть {bot ? `@${bot}` : "бота"} и нажать Start
        </a>
        <div className="text-sm text-base-content/60 flex items-center gap-2">
          <span className="loading loading-spinner loading-xs" /> Жду, пока вы нажмёте Start в боте…
        </div>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => {
            stop();
            setPhase("idle");
          }}
        >
          Отмена
        </button>
      </div>
    );

  if (phase === "done")
    return (
      <div className="text-success text-sm flex items-center gap-1">
        <Check size={16} /> {mode === "bind" ? "Telegram привязан!" : "Готово, входим…"}
      </div>
    );

  const text =
    phase === "nomatch"
      ? "Этот Telegram не привязан ни к одному аккаунту. Войди паролем и привяжите его в Настройках."
      : phase === "conflict"
        ? "Этот Telegram уже привязан к другому аккаунту."
        : phase === "expired"
          ? "Время вышло (или Start не нажат). Попробуй ещё раз."
          : "Что-то пошло не так. Попробуй ещё раз.";
  return (
    <div className="flex flex-col gap-2 items-start">
      <div className="text-error text-sm flex items-center gap-1">
        <AlertTriangle size={16} /> {text}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setPhase("idle")}>
        Ещё раз
      </button>
    </div>
  );
}
