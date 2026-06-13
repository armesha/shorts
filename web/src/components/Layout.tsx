import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Tv, History, Settings, Clapperboard, Sparkles } from "lucide-react";

const NAV = [
  { to: "/", label: "Обзор", icon: LayoutDashboard, end: true },
  { to: "/studio", label: "Студия", icon: Sparkles, end: false },
  { to: "/accounts", label: "Каналы", icon: Tv, end: false },
  { to: "/history", label: "История", icon: History, end: false },
  { to: "/settings", label: "Настройки", icon: Settings, end: false },
];

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-base-200 text-base-content">
      <aside className="w-64 shrink-0 bg-base-100 border-r border-base-300 flex flex-col">
        <div className="px-5 h-16 flex items-center gap-2 border-b border-base-300">
          <Clapperboard className="text-primary" size={26} />
          <span className="font-bold text-lg tracking-tight">Shorts Factory</span>
        </div>
        <nav className="p-3 flex-1">
          <ul className="menu gap-1 w-full">
            {NAV.map(({ to, label, icon: Icon, end }) => (
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
        <div className="px-5 py-4 text-xs text-base-content/50 border-t border-base-300">
          v0.1 · автоматический режим
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
