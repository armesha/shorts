import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useT, type Lang } from "../lib/i18n";
import { AppIcon } from "./AppIcon";
import { apiClient, type AuthUser } from "../lib/api";
import { groupNotifications } from "../lib/notificationGroups";
import { ADMIN_NAV_GROUPS, ADMIN_BOTTOM_NAV, USER_BOTTOM_NAV, canSeeNav } from "./layout/navConfig";
import { NotificationDropdown } from "./layout/NotificationDropdown";
import { NetworkIndicator, LanguageToggle, SkinToggle } from "./layout/widgets";

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

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, setUser } = useAuth();
  const { t, lang, setLang } = useT();
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [notificationBump, setNotificationBump] = useState(false);
  const unreadRef = useRef(0);
  const unreadLoadedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let bumpTimer: number | undefined;
    const load = () =>
      apiClient
        .notifications({ scope: "mine", status: "open", limit: 200 })
        .then((items) => {
          if (!alive) return;
          const groupedUnread = groupNotifications(items).filter((group) => group.unread).length;
          if (unreadLoadedRef.current && groupedUnread > unreadRef.current) {
            setNotificationBump(true);
            if (bumpTimer) window.clearTimeout(bumpTimer);
            bumpTimer = window.setTimeout(() => setNotificationBump(false), 900);
          }
          unreadLoadedRef.current = true;
          unreadRef.current = groupedUnread;
          setNotificationUnread(groupedUnread);
        })
        .catch(() => {});
    load();
    const stream =
      typeof window.EventSource === "function"
        ? new EventSource("/api/notifications/stream", { withCredentials: true })
        : null;
    stream?.addEventListener("notifications", load);
    const timer = window.setInterval(load, stream ? 60_000 : 20_000);
    window.addEventListener("notifications:changed", load);
    return () => {
      alive = false;
      if (bumpTimer) window.clearTimeout(bumpTimer);
      stream?.close();
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
      notificationBump={notificationBump}
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
  notificationBump,
  stopImpersonation,
}: {
  children: ReactNode;
  user: AuthUser;
  logout: () => Promise<void>;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  notificationUnread: number;
  notificationBump: boolean;
  stopImpersonation: () => Promise<void>;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const firstRoute = useRef(true);
  const [routeSettling, setRouteSettling] = useState(false);
  const bottomNav = user.role === "admin" ? ADMIN_BOTTOM_NAV : USER_BOTTOM_NAV;
  // Clip-demos (нарезки) is open to all, but the nav item only shows if the user has ≥1 accessible pack.
  const [hasClipDemos, setHasClipDemos] = useState(user.role === "admin");
  useEffect(() => {
    if (user.role === "admin") { setHasClipDemos(true); return; }
    let alive = true;
    fetch("/api/clip-demos/packs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((d) => { if (alive) setHasClipDemos((d.packs?.length ?? 0) > 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.role]);

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
              <NotificationDropdown user={user} unread={notificationUnread} bump={notificationBump} t={t} />
              <SkinToggle t={t} />
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
          <div className="grid" style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}>
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
            className="px-5 h-14 flex items-center gap-2 border-b border-base-300 font-bold text-lg tracking-tight hover:bg-base-200/60 transition-colors"
          >
            <AppIcon name="clips" className="text-primary" size={26} />
            <span>{t("layout.brand")}</span>
          </Link>

          <nav className="p-3 flex-1 overflow-y-auto">
            <div className="space-y-4">
              {ADMIN_NAV_GROUPS.map((group) => {
                const items = group.items.filter((item) => canSeeNav(item, user, { hasClipDemos }));
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
