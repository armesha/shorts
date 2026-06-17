import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useT, type Lang } from "../lib/i18n";
import { AppIcon, type AppIconName } from "./AppIcon";
import { apiClient, type AuthUser } from "../lib/api";

type NavItem = {
  to: string;
  labelKey: string;
  icon: AppIconName;
  end: boolean;
  adminOnly?: boolean;
  adminBadge?: boolean;
  userOnly?: boolean;
};
const ADMIN_NAV_GROUPS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "layout.groupWork",
    items: [
      { to: "/", labelKey: "nav.overview", icon: "home", end: true, adminOnly: true, adminBadge: true },
      { to: "/", labelKey: "nav.channels", icon: "accounts", end: true, userOnly: true },
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, adminOnly: true },
      { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
      { to: "/history", labelKey: "nav.history", icon: "history", end: false },
      { to: "/clip-demos", labelKey: "nav.clipdemos", icon: "clips", end: false, adminOnly: true, adminBadge: true },
    ],
  },
  {
    labelKey: "layout.groupContent",
    items: [
      { to: "/packs", labelKey: "nav.packs", icon: "packs", end: false },
      { to: "/cards", labelKey: "nav.cards", icon: "cards", end: false },
      { to: "/editor", labelKey: "nav.templates", icon: "library", end: false, adminOnly: true, adminBadge: true },
    ],
  },
  {
    labelKey: "layout.groupControl",
    items: [
      { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
      { to: "/notifications", labelKey: "nav.notifications", icon: "notifications", end: false },
      { to: "/errors", labelKey: "nav.errors", icon: "errors", end: false, adminOnly: true, adminBadge: true },
    ],
  },
  {
    labelKey: "layout.groupAdmin",
    items: [
      { to: "/users", labelKey: "nav.users", icon: "users", end: false, adminOnly: true, adminBadge: true },
      { to: "/system", labelKey: "nav.server", icon: "system", end: false },
      { to: "/settings", labelKey: "nav.settings", icon: "settings", end: false },
      { to: "/changelog", labelKey: "nav.changelog", icon: "updates", end: false },
    ],
  },
];
const ADMIN_BOTTOM_NAV: NavItem[] = [
  { to: "/", labelKey: "nav.overview", icon: "home", end: true, adminBadge: true },
  { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false },
  { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
  { to: "/clip-demos", labelKey: "nav.clipdemos", icon: "clips", end: false, adminBadge: true },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
];
const USER_BOTTOM_NAV: NavItem[] = [
  { to: "/", labelKey: "nav.channels", icon: "accounts", end: true },
  { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
  { to: "/history", labelKey: "nav.history", icon: "history", end: false },
  { to: "/packs", labelKey: "nav.packs", icon: "packs", end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
];

const DRAWER_ID = "main-drawer";
type ViewTransitionHandle = {
  finished: Promise<void>;
  skipTransition?: () => void;
};
type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransitionHandle;
};

// Close the off-canvas drawer (mobile) after navigating — pure-CSS DaisyUI drawer keeps it open otherwise.
function closeDrawer() {
  const el = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
  if (el) el.checked = false;
}

function canSeeNav(item: NavItem, user: AuthUser): boolean {
  if (item.adminOnly && user.role !== "admin") return false;
  if (item.userOnly && user.role === "admin") return false;
  return true;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, setUser } = useAuth();
  const { t, lang, setLang } = useT();
  const [notificationUnread, setNotificationUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      apiClient
        .notificationCounts()
        .then((c) => {
          if (alive) setNotificationUnread(c.unread);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("notifications:changed", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("notifications:changed", load);
    };
  }, [user?.id]);

  async function stopImpersonation() {
    try {
      const admin = await apiClient.stopImpersonation();
      setUser(admin);
      window.dispatchEvent(new CustomEvent("notifications:changed"));
    } catch {
      await logout();
    }
  }

  if (!user) return null;

  return (
    <AdminLayout
      user={user}
      logout={logout}
      lang={lang}
      setLang={setLang}
      t={t}
      notificationUnread={notificationUnread}
      stopImpersonation={stopImpersonation}
    >
      {children}
    </AdminLayout>
  );
}

function AdminLayout({
  children,
  user,
  logout,
  lang,
  setLang,
  t,
  notificationUnread,
  stopImpersonation,
}: {
  children: ReactNode;
  user: AuthUser;
  logout: () => Promise<void>;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  notificationUnread: number;
  stopImpersonation: () => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const firstRoute = useRef(true);
  const [routeSettling, setRouteSettling] = useState(false);
  const bottomNav = user.role === "admin" ? ADMIN_BOTTOM_NAV : USER_BOTTOM_NAV;

  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    setRouteSettling(true);
    const timer = window.setTimeout(() => setRouteSettling(false), 320);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  function handleRouteClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || !canSmoothNavigate(event, anchor)) return;

    const url = new URL(anchor.href);
    const nextPath = `${url.pathname}${url.search}${url.hash}`;
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    if (nextPath === currentPath) {
      closeDrawer();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const go = () => {
      closeDrawer();
      navigate(nextPath);
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as ViewTransitionDocument;
    if (!reduceMotion && doc.startViewTransition) {
      document.documentElement.dataset.routeTransition = "native";
      const transition = doc.startViewTransition(() => {
        flushSync(go);
      });
      transition.finished.finally(() => {
        delete document.documentElement.dataset.routeTransition;
      });
      return;
    }

    go();
  }

  return (
    <div className="admin-shell drawer lg:drawer-open min-h-screen bg-base-200 text-base-content" onClickCapture={handleRouteClick}>
      <input id={DRAWER_ID} type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex min-w-0 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
          <div className="h-14 px-3 sm:px-5 flex items-center gap-3">
            <label htmlFor={DRAWER_ID} className="btn btn-ghost btn-sm btn-square lg:hidden" aria-label={t("layout.openMenu")}>
              <AppIcon name="menu" size={20} />
            </label>
            <Link to="/" onClick={closeDrawer} className="lg:hidden flex items-center gap-2 font-bold">
              <AppIcon name="clips" className="text-primary" size={21} />
              <span>{t("layout.brand")}</span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <NetworkIndicator t={t} />
              <Link
                to="/notifications"
                className={`btn btn-sm btn-square ${notificationUnread > 0 ? "btn-error" : "admin-action-quiet"}`}
                aria-label={t("nav.notifications")}
                title={t("nav.notifications")}
              >
                <AppIcon name="notifications" size={17} />
                {notificationUnread > 0 && (
                  <span className="absolute -top-1 -right-1 badge badge-xs badge-primary border-base-100">
                    {notificationUnread > 99 ? "99+" : notificationUnread}
                  </span>
                )}
              </Link>
              <LanguageToggle lang={lang} setLang={setLang} t={t} className="hidden sm:inline-flex" />
              <button className="btn btn-ghost btn-sm btn-square" onClick={logout} title={t("layout.logout")} aria-label={t("layout.logout")}>
                <AppIcon name="logout" size={16} />
              </button>
            </div>
          </div>
          <div className={`route-progress ${routeSettling ? "is-visible" : ""}`} aria-hidden="true" />
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

        <main className="flex-1 min-w-0">
          <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-5 sm:py-6">
            <div key={`${location.pathname}${location.search}`} className="route-page">
              {children}
            </div>
          </div>
        </main>

        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-base-300 bg-base-100/95 backdrop-blur">
          <div className="grid grid-cols-5">
            {bottomNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative min-h-14 px-1 py-1.5 flex flex-col items-center justify-center gap-0.5 text-[11px] ${
                    isActive ? "text-primary font-semibold" : "text-base-content/60"
                  }`
                }
              >
                {item.adminBadge && <span className="admin-nav-badge admin-nav-badge-mobile">adm</span>}
                <AppIcon name={item.icon} size={18} />
                <span className="truncate max-w-full">{t(item.labelKey)}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>

      <div className="drawer-side z-40">
        <label htmlFor={DRAWER_ID} className="drawer-overlay" aria-label={t("layout.closeMenu")}></label>
        <aside className="w-72 min-h-screen bg-base-100 border-r border-base-300 flex flex-col">
          <Link
            to="/"
            onClick={closeDrawer}
            className="px-5 h-16 flex items-center gap-2 border-b border-base-300 font-bold text-lg tracking-tight hover:bg-base-200/60 transition-colors"
          >
            <AppIcon name="clips" className="text-primary" size={26} />
            <span>{t("layout.brand")}</span>
          </Link>

          <nav className="p-3 flex-1 overflow-y-auto">
            <div className="space-y-4">
              {ADMIN_NAV_GROUPS.map((group) => {
                const items = group.items.filter((item) => canSeeNav(item, user));
                if (!items.length) return null;
                return (
                <section key={group.labelKey}>
                  <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-base-content/45">
                    {t(group.labelKey)}
                  </div>
                  <ul className="menu gap-1 w-full p-0">
                    {items.map(({ to, labelKey, icon, end, adminBadge }) => (
                      <li key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={closeDrawer}
                          className={({ isActive }) => (isActive ? "active font-medium" : "")}
                        >
                          <AppIcon name={icon} size={18} />
                          {t(labelKey)}
                          {adminBadge && <span className="admin-nav-badge ml-auto">adm</span>}
                          {to === "/notifications" && notificationUnread > 0 && (
                            <span className="badge badge-error badge-sm ml-auto">{notificationUnread > 99 ? "99+" : notificationUnread}</span>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
                );
              })}
            </div>
          </nav>

          <div className="px-3 py-3 border-t border-base-300">
            <div className="rounded-md bg-base-200/70 border border-base-300 p-3 mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{user.username}</div>
                  <div className="text-xs text-base-content/55">
                    {user.role === "admin" ? t("common.admin") : t("common.user")}
                  </div>
                </div>
                {user.role === "admin" && <span className="badge badge-error badge-sm">adm</span>}
              </div>
            </div>
            <LanguageToggle lang={lang} setLang={setLang} t={t} className="w-full mb-2 sm:hidden" />
            <div className="px-1 text-xs text-base-content/40">{t("layout.tagline")}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function canSmoothNavigate(event: ReactMouseEvent, anchor: HTMLAnchorElement) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download") || anchor.closest("[data-no-route-transition]")) return false;

  const url = new URL(anchor.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  if (url.pathname.startsWith("/files/")) return false;
  if (url.pathname.startsWith("/fact-videos/")) return false;
  if (url.pathname.startsWith("/admin-demos/")) return false;
  if (url.pathname.includes(".") && !url.pathname.endsWith(".html")) return false;
  return true;
}

function NetworkIndicator({ t }: { t: (key: string, vars?: Record<string, string | number>) => string }) {
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

function LanguageToggle({
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
