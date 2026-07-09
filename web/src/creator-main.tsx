import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./styles/sechenie.css";
import "./styles/auth.css";
import "./styles/creator.css";
import Creator from "./pages/Creator";
import { AppIcon } from "./components/AppIcon";
import { applyDesign, getSavedDesign } from "./lib/design";
import { I18nProvider, useT } from "./lib/i18n";
import { applySavedSkin } from "./lib/skin";
import type { AuthUser } from "./lib/api";

applyDesign(getSavedDesign());
applySavedSkin();

async function creatorFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/creator${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.ok) return (await res.json()) as T;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    /* keep status text */
  }
  throw new Error(message);
}

function CreatorBootShell() {
  return (
    <div className="creator-shell min-h-screen bg-base-200 text-base-content">
      <header className="creator-liquid-header sticky top-0 z-30">
        <div className="creator-liquid-row">
          <div className="creator-liquid-pill creator-liquid-actions h-11 px-2 flex items-center gap-2">
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="skeleton h-8 w-8 rounded-md" />
          </div>
        </div>
      </header>
      <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="route-page space-y-5">
          <div className="skeleton h-7 w-44 rounded" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="skeleton h-[560px] rounded-lg" />
            <div className="skeleton h-[560px] rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}

function CreatorStandalone() {
  const { t } = useT();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const onUnauthorized = () => window.location.replace("/login");
    window.addEventListener("auth:unauthorized", onUnauthorized);
    creatorFetch<AuthUser>("/auth/me")
      .then((next) => {
        if (alive) setUser(next);
      })
      .catch(() => {
        window.location.replace("/login");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      window.removeEventListener("auth:unauthorized", onUnauthorized);
    };
  }, []);

  async function logout() {
    try {
      await creatorFetch<{ ok: boolean }>("/auth/logout", { method: "POST", body: "{}" });
    } finally {
      window.location.assign("/login");
    }
  }

  async function stopImpersonation() {
    try {
      const admin = await creatorFetch<AuthUser>("/auth/impersonation/stop", { method: "POST", body: "{}" });
      setUser(admin);
    } catch {
      window.location.assign("/login");
    }
  }

  if (loading || !user) return <CreatorBootShell />;

  return (
    <div className="creator-shell min-h-screen bg-base-200 text-base-content">
      <header className="creator-liquid-header sticky top-0 z-30">
        <div className="creator-liquid-row">
          <div className="creator-liquid-pill creator-liquid-actions h-11 px-2 flex items-center gap-2">
            <a href="/" className="btn btn-ghost btn-sm btn-square" title={t("creator.backToApp")} aria-label={t("creator.backToApp")}>
              <AppIcon name="home" size={16} />
            </a>
            <a href="/settings" className="btn btn-ghost btn-sm btn-square" title={t("settings.title")} aria-label={t("settings.title")}>
              <AppIcon name="settings" size={16} />
            </a>
            <button className="btn btn-ghost btn-sm btn-square" onClick={logout} title={t("layout.logout")} aria-label={t("layout.logout")}>
              <AppIcon name="logout" size={16} />
            </button>
          </div>
        </div>
      </header>
      {user.impersonator && (
        <div className="sticky top-14 z-20 bg-warning text-warning-content border-b border-warning/30 px-4 sm:px-6 py-2">
          <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-3">
            <div className="text-sm">
              {t("layout.impersonating", { user: user.username, admin: user.impersonator.username })}
            </div>
            <button className="btn btn-sm btn-warning" onClick={stopImpersonation}>
              {t("layout.returnAdmin")}
            </button>
          </div>
        </div>
      )}
      <main className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="route-page">
          <Creator />
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <CreatorStandalone />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
