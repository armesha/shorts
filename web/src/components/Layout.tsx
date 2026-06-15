import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Tv, History, Settings, Clapperboard, Sparkles, BarChart3, Bug, Rocket, Server, LogOut, Menu, LayoutTemplate, Users, Layers, TrendingUp, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";

type NavItem = { to: string; label: string; icon: LucideIcon; end: boolean; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Каналы", icon: Tv, end: true },
  { to: "/studio", label: "Студия", icon: Sparkles, end: false },
  { to: "/cards", label: "Карточки", icon: LayoutTemplate, end: false },
  { to: "/packs", label: "Паки", icon: Layers, end: false },
  { to: "/history", label: "История", icon: History, end: false },
  { to: "/statistics", label: "Статистика", icon: BarChart3, end: false },
  { to: "/admin/analytics", label: "Аналитика", icon: TrendingUp, end: false, adminOnly: true },
  { to: "/changelog", label: "Обновления", icon: Rocket, end: false },
  { to: "/settings", label: "Настройки", icon: Settings, end: false },
  { to: "/users", label: "Админка", icon: Users, end: false, adminOnly: true },
  { to: "/errors", label: "Ошибки", icon: Bug, end: false, adminOnly: true },
  { to: "/system", label: "Сервер", icon: Server, end: false },
];

const DRAWER_ID = "main-drawer";
// Close the off-canvas drawer (mobile) after navigating — pure-CSS DaisyUI drawer keeps it open otherwise.
function closeDrawer() {
  const el = document.getElementById(DRAWER_ID) as HTMLInputElement | null;
  if (el) el.checked = false;
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-200 text-base-content">
      <input id={DRAWER_ID} type="checkbox" className="drawer-toggle" />

      <div className="drawer-content flex flex-col min-w-0">
        {/* Mobile top bar with hamburger; on lg+ the sidebar is always visible instead. */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-2 bg-base-100 border-b border-base-300 px-3 h-14">
          <label htmlFor={DRAWER_ID} className="btn btn-ghost btn-sm btn-square" aria-label="Открыть меню">
            <Menu size={20} />
          </label>
          <Clapperboard className="text-primary" size={22} />
          <span className="font-bold tracking-tight">Shorts Factory</span>
        </div>

        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8">{children}</div>
        </main>
      </div>

      <div className="drawer-side z-40">
        <label htmlFor={DRAWER_ID} className="drawer-overlay" aria-label="Закрыть меню"></label>
        <aside className="w-64 min-h-screen bg-base-100 border-r border-base-300 flex flex-col">
          <div className="px-5 h-16 flex items-center gap-2 border-b border-base-300">
            <Clapperboard className="text-primary" size={26} />
            <span className="font-bold text-lg tracking-tight">Shorts Factory</span>
          </div>
          <nav className="p-3 flex-1">
            <ul className="menu gap-1 w-full">
              {NAV.filter((n) => !n.adminOnly || user?.role === "admin").map(({ to, label, icon: Icon, end, adminOnly }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={closeDrawer}
                    className={({ isActive }) => (isActive ? "active font-medium" : "")}
                  >
                    <Icon size={18} />
                    {label}
                    {/* Admin-only tab → small red «adm» tag (auto for any adminOnly item, now & future). */}
                    {adminOnly && (
                      <span className="badge badge-error badge-xs ml-auto" title="видно только администратору">
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
                    {user.role === "admin" ? "администратор" : "пользователь"}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={logout} title="Выйти" aria-label="Выйти">
                  <LogOut size={16} />
                </button>
              </div>
            )}
            <div className="px-2 text-xs text-base-content/40">v0.1 · авто-режим</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
