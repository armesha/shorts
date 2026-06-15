import { useEffect, useRef } from "react";

interface Props {
  bot: string; // the bot's @username (without @)
  onAuth: (user: Record<string, unknown>) => void;
  /** Ask the user to also allow the bot to message them — required for bot-delivered recovery codes. */
  requestAccess?: boolean;
  size?: "small" | "medium" | "large";
}

let seq = 0;

/**
 * Renders the official Telegram Login Widget (telegram-widget.js) and calls `onAuth` with the
 * signed user payload. NOTE: the widget only works on the exact domain linked to the bot via
 * @BotFather (/setdomain) — it shows an error on localhost / unlinked origins.
 */
export default function TelegramLoginButton({ bot, onAuth, requestAccess, size = "large" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth; // keep the latest handler without re-injecting the widget

  useEffect(() => {
    const el = ref.current;
    if (!bot || !el) return;
    const cb = `onTelegramAuth_${++seq}`;
    (window as unknown as Record<string, unknown>)[cb] = (user: Record<string, unknown>) =>
      onAuthRef.current(user);

    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", size);
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-onauth", `${cb}(user)`);
    if (requestAccess) s.setAttribute("data-request-access", "write");

    el.innerHTML = "";
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
      delete (window as unknown as Record<string, unknown>)[cb];
    };
  }, [bot, size, requestAccess]);

  return <div ref={ref} className="inline-flex min-h-[40px] items-center" />;
}
