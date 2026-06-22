import type { AppIconName } from "../AppIcon";
import type { AuthUser } from "../../lib/api";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: AppIconName;
  end: boolean;
  adminOnly?: boolean;
  adminBadge?: boolean;
  userOnly?: boolean;
};
export const ADMIN_NAV_GROUPS: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: "layout.groupWork",
    items: [
      { to: "/", labelKey: "nav.channels", icon: "accounts", end: true, userOnly: true },
      { to: "/channels", labelKey: "nav.channels", icon: "accounts", end: false, adminOnly: true },
      { to: "/", labelKey: "nav.overview", icon: "home", end: true, adminOnly: true, adminBadge: true },
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
      { to: "/gallery", labelKey: "nav.gallery", icon: "library", end: false, adminOnly: true, adminBadge: true },
      { to: "/editor", labelKey: "nav.templates", icon: "library", end: false, adminOnly: true, adminBadge: true },
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
  { to: "/", labelKey: "nav.overview", icon: "home", end: true, adminBadge: true },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
  { to: "/history", labelKey: "nav.history", icon: "history", end: false },
];
export const USER_BOTTOM_NAV: NavItem[] = [
  { to: "/", labelKey: "nav.channels", icon: "accounts", end: true },
  { to: "/studio", labelKey: "nav.studio", icon: "studio", end: false },
  { to: "/history", labelKey: "nav.history", icon: "history", end: false },
  { to: "/packs", labelKey: "nav.packs", icon: "packs", end: false },
  { to: "/statistics", labelKey: "nav.statistics", icon: "analytics", end: false },
];

export function canSeeNav(item: NavItem, user: AuthUser): boolean {
  if (item.adminOnly && user.role !== "admin") return false;
  if (item.userOnly && user.role === "admin") return false;
  return true;
}
