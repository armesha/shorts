import type { AppIconName } from "../AppIcon";
import type { AuthUser } from "../../lib/api";
import { isAdminLike, isAdminRole, isMainAdmin } from "../../lib/authz";

export const PINNED_NAV_STORAGE_KEY = "sidebarPinnedNavItems";
export const HIDDEN_NAV_STORAGE_KEY = "sidebarHiddenNavItems";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: AppIconName;
  end: boolean;
  adminOnly?: boolean;
  staffOnly?: boolean;
  superOnly?: boolean;
  adminBadge?: boolean;
  userOnly?: boolean;
  /** Visible only to the one designated Memoteka curator: armen, the main super admin. */
  armenOnly?: boolean;
  /** A regular document link rather than a client-side React route. */
  external?: boolean;
  /** Shown to ALL users, but only when they actually have ≥1 accessible pack (admins always). */
  clipDemos?: boolean;
};
export const ADMIN_NAV_GROUPS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "layout.groupWork",
    items: [
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, userOnly: true },
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, staffOnly: true },
      { to: "/overview", labelKey: "nav.overview", icon: "home", end: false, adminOnly: true, adminBadge: true },
      { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
      { to: "/queue", labelKey: "nav.queue", icon: "queue", end: false, staffOnly: true, adminBadge: true },
      { to: "/history", labelKey: "nav.history", icon: "history", end: false },
      { to: "/clip-demos", labelKey: "nav.clipdemos", icon: "clips", end: false, clipDemos: true },
      { to: "/ideas", labelKey: "nav.ideas", icon: "ideas", end: false, adminOnly: true, adminBadge: true },
    ],
  },
  {
    labelKey: "layout.groupContent",
    items: [
      { to: "/library", labelKey: "nav.library", icon: "library", end: false },
      { to: "/circles", labelKey: "nav.circles", icon: "video", end: false },
      { to: "/admin/banners", labelKey: "nav.banners", icon: "ads", end: false },
      { to: "/memes", labelKey: "nav.memoteka", icon: "globe", end: false, armenOnly: true, external: true, adminBadge: true },
      // Карточки, длинные видео, галерея и редактор шаблонов остаются рабочими внутренними
      // экранами, но не занимают отдельные пункты бокового меню: вход к ним теперь из «Библиотеки».
    ],
  },
  {
    labelKey: "layout.groupControl",
    items: [
      { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
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
  { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, staffOnly: true },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
  { to: "/history", labelKey: "nav.history", icon: "history", end: false },
];
export const USER_BOTTOM_NAV: NavItem[] = [
  { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false },
  { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
  { to: "/library", labelKey: "nav.library", icon: "library", end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
];

export function canSeeNav(item: NavItem, user: AuthUser, ctx?: { hasClipDemos?: boolean }): boolean {
  if (item.adminOnly && !isAdminRole(user)) return false;
  if (item.staffOnly && !isAdminLike(user)) return false;
  if (item.superOnly && !isMainAdmin(user)) return false;
  if (item.armenOnly && !(isMainAdmin(user) && user.username.trim().toLowerCase() === "armen")) return false;
  if (item.userOnly && isAdminLike(user)) return false;
  // clip-demos: visible to all, but hidden for non-admins with no accessible packs.
  if (item.clipDemos && !isAdminLike(user) && !ctx?.hasClipDemos) return false;
  return true;
}

export function navKeyFor(item: Pick<NavItem, "to" | "labelKey">) {
  return `${item.to}::${item.labelKey}`;
}

function readStringArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((value): value is string => {
      if (typeof value !== "string" || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify([...new Set(values)]));
  } catch {
    /* localStorage can be unavailable in private or restricted browser contexts. */
  }
}

export function readPinnedNavKeys(): string[] {
  return readStringArray(PINNED_NAV_STORAGE_KEY);
}

export function writePinnedNavKeys(keys: string[]) {
  writeStringArray(PINNED_NAV_STORAGE_KEY, keys);
}

export function readHiddenNavKeys(): string[] {
  return readStringArray(HIDDEN_NAV_STORAGE_KEY);
}

export function writeHiddenNavKeys(keys: string[]) {
  writeStringArray(HIDDEN_NAV_STORAGE_KEY, keys);
}
