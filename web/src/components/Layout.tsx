import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Tv, History, Settings, Clapperboard, Sparkles, BarChart3, Bug, Rocket, Server, LogOut, Menu, LayoutTemplate, Users, Layers, TrendingUp, Globe, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useT, LANGS, type Lang } from "../lib/i18n";

type NavItem = { to: string; labelKey: string; icon: LucideIcon; end: boolean; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/", labelKey: "nav.channels", icon: Tv, end: true },
  { to: "/studio", labelKey: "nav.studio", icon: Sparkles, end: false },
  { to: "/cards", labelKey: "nav.cards", icon: LayoutTemplate, end: false },
  { to: "/packs", labelKey: "nav.packs", icon: Layers, end: false },
  { to: "/history", labelKey: "nav.history", icon: History, end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: BarChart3, end: false },
  { to: "/admin/analytics", labelKey: "nav.analytics", icon: TrendingUp, end: false, adminOnly: true },
  { to: "/changelog", labelKey: "nav.changelog", icon: Rocket, end: false },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, end: false },
  { to: "/users", labelKey: "nav.users", icon: Users, end: false, adminOnly: true },
  { to: "/errors", labelKey: "nav.errors", icon: Bug, end: false, adminOnly: true },
  { to: "/system", labelKey: "nav.server", icon: Server, end: false },
];

const DRAWER_ID = "main-drawer";
// Close the off-canvas drawer (mobile) after navigating — pure-CSS DaisyUI drawer keeps it open otherwise.
function closeDrawer() {
  const el = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
  if (el) el.checked = false;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useT();
  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-200 text-base-content">
      <input id={DRAWER_ID} type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-w-0">
        {/* Mobile top bar with hamburger; on lg+ the sidebar is always visible instead. */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 bg-base-100 border-b border-base-300 px-3 h-14">
          <label htmlFor={DRAWER_ID} className="btn btn-ghost btn-sm btn-square" aria-label={t("layout.openMenu")}>
            <Menu size={20} />
          </label>
          <Clapperboard className="text-primary" size={22} />
          <span className="font-bold tracking-tight">{t("layout.brand")}</span>
        </div>

        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">{children}</div>
        </main>
      </div>

      <div className="drawer-side z-40">
        <label htmlFor={DRAWER_ID} className="drawer-overlay" aria-label={t("layout.closeMenu")}></label>
        <aside className="w-64 min-h-screen bg-base-100 border-r border-base-300 flex flex-col">
          <div className="px-5 h-16 flex items-center gap-2 border-b border-base-300">
            <Clapperboard className="text-primary" size={26} />
            <span className="font-bold text-lg tracking-tight">{t("layout.brand")}</span>
          </div>
          <nav className="p-3 flex-1">
            <ul className="menu gap-1 w-full">
              {NAV.filter((n) => !n.adminOnly || user?.role === "admin").map(({ to, labelKey, icon: Icon, end, adminOnly }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={closeDrawer}
                    className={({ isActive }) => (isActive ? "active font-medium" : "")}
                  >
                    <Icon size={18} />
                    {t(labelKey)}
                    {/* Admin-only tab → small red «adm» tag (auto for any adminOnly item, now & future). */}
                    {adminOnly && (
                      <span className="badge badge-error badge-xs ml-auto" title={t("layout.adminBadge")}>
                        adm
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="px-3 py-3 border-t border-base-300">
            {user && (
              <div className="flex items-center justify-between gap-2 px-2 mb-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{user.username}</div>
                  <div className="text-xs text-base-content/50">
                    {user.role === "admin" ? t("common.admin") : t("common.user")}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={logout} title={t("layout.logout")} aria-label={t("layout.logout")}>
                  <LogOut size={16} />
                </button>
              </div>
            )}
            {/* UI language switcher — dashboard language only (separate from a channel's content lang). */}
            <label className="flex items-center gap-2 px-2 mb-2" title={t("layout.uiLanguage")}>
              <Globe size={14} className="text-base-content/40 shrink-0" />
              <select
                className="select select-bordered select-xs flex-1"
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
                aria-label={t("layout.uiLanguage")}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="px-2 text-xs text-base-content/40">{t("layout.tagline")}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
