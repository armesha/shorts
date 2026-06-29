import type { AppIconName } from "../AppIcon";
import type { AuthUser } from "../../lib/api";
import { isMainAdmin } from "../../lib/authz";

export const PINNED_NAV_STORAGE_KEY = "sidebarPinnedNavItems";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: AppIconName;
  end: boolean;
  adminOnly?: boolean;
  superOnly?: boolean;
  adminBadge?: boolean;
  userOnly?: boolean;
  /** Shown to ALL users, but only when they actually have ≥1 accessible pack (admins always). */
  clipDemos?: boolean;
};
export const ADMIN_NAV_GROUPS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "layout.groupWork",
    items: [
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, userOnly: true },
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, adminOnly: true },
      { to: "/overview", labelKey: "nav.overview", icon: "home", end: false, adminOnly: true, adminBadge: true },
      { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
      { to: "/queue", labelKey: "nav.queue", icon: "queue", end: false, adminOnly: true, adminBadge: true },
      { to: "/history", labelKey: "nav.history", icon: "history", end: false },
      { to: "/clip-demos", labelKey: "nav.clipdemos", icon: "clips", end: false, clipDemos: true },
    ],
  },
  {
    labelKey: "layout.groupContent",
    items: [
      { to: "/packs", labelKey: "nav.packs", icon: "packs", end: false },
      { to: "/long-videos", labelKey: "nav.longVideos", icon: "video", end: false },
      { to: "/cards", labelKey: "nav.cards", icon: "cards", end: false },
      { to: "/gallery", labelKey: "nav.gallery", icon: "library", end: false, adminOnly: true, adminBadge: true },
      // Редактор шаблонов НЕ выносим отдельной вкладкой: на него уже есть переход из «Паки и карточки»
      // (/cards → форма создания пака → ссылка «Нарисуйте шаблон в /editor», CreatePackForm.tsx).
      // Роут /editor (App.tsx) остаётся рабочим по прямой ссылке.
    ],
  },
  {
    labelKey: "layout.groupControl",
    items: [
      { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
      { to: "/limits", labelKey: "nav.limits", icon: "limits", end: false, adminOnly: true, adminBadge: true },
      { to: "/notifications", labelKey: "nav.notifications", icon: "notifications", end: false, adminOnly: true, adminBadge: true },
      { to: "/errors", labelKey: "nav.errors", icon: "errors", end: false, adminOnly: true, adminBadge: true },
      { to: "/system", labelKey: "nav.server", icon: "system", end: false },
    ],
  },
  // Личное / общее — видно ВСЕМ юзерам. Ключи Google живут в «Настройках»; раньше пункт стоял в
  // группе «Админ» и потому ошибочно казался админским (хотя добавление ключей пер-юзер для всех).
  {
    labelKey: "layout.groupAccount",
    items: [
      { to: "/settings", labelKey: "nav.settings", icon: "settings", end: false },
      { to: "/changelog", labelKey: "nav.changelog", icon: "updates", end: false },
    ],
  },
  {
    labelKey: "layout.groupAdmin",
    items: [
      { to: "/users", labelKey: "nav.users", icon: "users", end: false, adminOnly: true, adminBadge: true },
    ],
  },
];
export const ADMIN_BOTTOM_NAV: NavItem[] = [
  { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false },
  { to: "/overview", labelKey: "nav.overview", icon: "home", end: false, adminBadge: true },
  { to: "/queue", labelKey: "nav.queue", icon: "queue", end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
  { to: "/history", labelKey: "nav.history", icon: "history", end: false },
];
export const USER_BOTTOM_NAV: NavItem[] = [
  { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false },
  { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
  { to: "/packs", labelKey: "nav.packs", icon: "packs", end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
];

export function canSeeNav(item: NavItem, user: AuthUser, ctx?: { hasClipDemos?: boolean }): boolean {
  if (item.adminOnly && user.role !== "admin") return false;
  if (item.superOnly && !isMainAdmin(user)) return false;
  if (item.userOnly && user.role === "admin") return false;
  // clip-demos: visible to all, but hidden for non-admins with no accessible packs.
  if (item.clipDemos && user.role !== "admin" && !ctx?.hasClipDemos) return false;
  return true;
}

export function navKeyFor(item: Pick<NavItem, "to" | "labelKey">) {
  return `${item.to}::${item.labelKey}`;
}

export function readPinnedNavKeys(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_NAV_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function writePinnedNavKeys(keys: string[]) {
  try {
    localStorage.setItem(PINNED_NAV_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* localStorage can be unavailable in private or restricted browser contexts. */
  }
}
