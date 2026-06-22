import { useEffect, useState } from "react";
import type { Lang } from "../../lib/i18n";
import { useSkin } from "../../lib/skin";
import { AppIcon } from "../AppIcon";

// Admin-only quick toggle for the СЕЧЕНИЕ skin. Renders nothing for non-admins. The classic look is
// always one click away. When the skin is on, the button itself gets an acid chip (styled in
// sechenie.css via .sx-skin-toggle.is-on) so its state is obvious.
export function SkinToggle({
  t,
  className = "",
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  className?: string;
}) {
  const { skinOn, canUseSkin, setSkinOn } = useSkin();
  if (!canUseSkin) return null;
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm btn-square sx-skin-toggle ${skinOn ? "is-on text-primary" : ""} ${className}`}
      onClick={() => setSkinOn(!skinOn)}
      title={`${t("skin.name")} — ${skinOn ? t("skin.on") : t("skin.off")}. ${t("skin.toggleHint")}`}
      aria-label={t("skin.name")}
      aria-pressed={skinOn}
    >
      <AppIcon name="skin" size={16} />
    </button>
  );
}

export function NetworkIndicator({ t }: { t: (key: string, vars?: Record<string, string | number>) => string }) {
  const [state, setState] = useState<"online" | "checking" | "offline">(() =>
    navigator.onLine ? "online" : "offline",
  );

  useEffect(() => {
    let alive = true;
    const check = async (visible = false) => {
      if (!navigator.onLine) {
        if (alive) setState("offline");
        return;
      }
      if (visible && alive) setState("checking");
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 4_000);
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
        if (alive) setState(r.ok ? "online" : "offline");
      } catch {
        if (alive) setState("offline");
      } finally {
        window.clearTimeout(timer);
      }
    };
    const onOffline = () => setState("offline");
    const onOnline = () => check(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    check(false);
    const timer = window.setInterval(() => check(false), 45_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (state === "online") return null;
  return (
    <span className={`badge badge-sm gap-1 ${state === "checking" ? "badge-warning" : "badge-error"}`}>
      {state === "checking" ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="warning" size={13} />}
      <span className="hidden sm:inline">{t(state === "checking" ? "layout.networkChecking" : "layout.networkOffline")}</span>
    </span>
  );
}

export function LanguageToggle({
  lang,
  setLang,
  t,
  className = "",
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  className?: string;
}) {
  const next = lang === "ru" ? "en" : "ru";
  const label = lang === "ru" ? "RU" : "EN";
  const nextLabel = next === "ru" ? "RU" : "EN";
  return (
    <button
      type="button"
      className={`btn btn-outline btn-sm admin-action-secondary gap-2 px-3 ${className}`}
      onClick={() => setLang(next)}
      title={`${t("layout.uiLanguage")}: ${label}. ${t("layout.switchLanguageHint", { lang: nextLabel })}`}
      aria-label={t("layout.switchLanguageHint", { lang: nextLabel })}
    >
      <AppIcon name="globe" size={15} />
      <span className="font-bold tabular-nums">{label}</span>
    </button>
  );
}
