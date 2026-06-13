import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Tv, History, Settings, Clapperboard, Sparkles, BarChart3, Bug, LogOut, type LucideIcon } from "lucide-react";
import { useAuth } from "../lib/auth";

type NavItem = { to: string; label: string; icon: LucideIcon; end: boolean; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/", label: "Каналы", icon: Tv, end: true },
  { to: "/studio", label: "Студия", icon: Sparkles, end: false },
  { to: "/history", label: "История", icon: History, end: false },
  { to: "/statistics", label: "Статистика", icon: BarChart3, end: false },
  { to: "/settings", label: "Настройки", icon: Settings, end: false },
  { to: "/errors", label: "Ошибки", icon: Bug, end: false, adminOnly: true },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex bg-base-200 text-base-content">
      <aside className="w-64 shrink-0 bg-base-100 border-r border-base-300 flex flex-col">
        <div className="px-5 h-16 flex items-center gap-2 border-b border-base-300">
          <Clapperboard className="text-primary" size={26} />
          <span className="font-bold text-lg tracking-tight">Shorts Factory</span>
        </div>
        <nav className="p-3 flex-1">
          <ul className="menu gap-1 w-full">
            {NAV.filter((n) => !n.adminOnly || user?.role === "admin").map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) => (isActive ? "active font-medium" : "")}
                >
                  <Icon size={18} />
                  {label}
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
              <button className="btn btn-ghost btn-sm" onClick={logout} title="Выйти">
                <LogOut size={16} />
              </button>
            </div>
          )}
          <div className="px-2 text-xs text-base-content/40">v0.1 · авто-режим</div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
