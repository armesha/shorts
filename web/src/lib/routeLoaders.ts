const routeLoaders = {
  overview: () => import("../pages/Overview"),
  studio: () => import("../pages/Studio"),
  gallery: () => import("../pages/Gallery"),
  cards: () => import("../pages/Cards"),
  packs: () => import("../pages/Packs"),
  queue: () => import("../pages/Queue"),
  accounts: () => import("../pages/Accounts"),
  accountDetail: () => import("../pages/AccountDetail"),
  history: () => import("../pages/History"),
  notifications: () => import("../pages/Notifications"),
  statistics: () => import("../pages/Statistics"),
  errors: () => import("../pages/Errors"),
  system: () => import("../pages/System"),
  settings: () => import("../pages/Settings"),
  users: () => import("../pages/Users"),
  clipDemos: () => import("../pages/ClipDemos"),
  examples: () => import("../pages/Examples"),
  longVideos: () => import("../pages/LongVideos"),
  templateEditor: () => import("../pages/TemplateEditor"),
  circleEditor: () => import("../pages/CircleEditor"),
  bannerLibrary: () => import("../pages/BannerLibrary"),
  login: () => import("../pages/Login"),
  register: () => import("../pages/Register"),
  telegramMiniApp: () => import("../pages/TelegramMiniApp"),
  ideas: () => import("../pages/Ideas"),
  signals: () => import("../pages/Signals"),
  signalsAnalysis: () => import("../pages/SignalsAnalysis"),
};

export const pageLoaders = routeLoaders;

const preloaded = new Set<keyof typeof routeLoaders>();

export function preloadRoutePath(path: string): void {
  const key = loaderKeyForPath(path);
  if (!key || preloaded.has(key)) return;
  preloaded.add(key);
  void routeLoaders[key]().catch(() => {
    preloaded.delete(key);
  });
}

function loaderKeyForPath(path: string): keyof typeof routeLoaders | null {
  let pathname = path;
  try {
    pathname = new URL(path, window.location.origin).pathname;
  } catch {
    pathname = path.split("?")[0]?.split("#")[0] ?? path;
  }

  if (pathname === "/" || pathname === "/channels" || pathname === "/accounts") return "accounts";
  if (pathname.startsWith("/accounts/")) return "accountDetail";
  if (pathname === "/admin/analytics") return "statistics";
  if (pathname === "/tg") return "telegramMiniApp";
  if (pathname === "/signals/analysis") return "signalsAnalysis";

  switch (pathname) {
    case "/overview":
      return "overview";
    case "/studio":
      return "studio";
    case "/gallery":
      return "gallery";
    case "/cards":
      return "cards";
    case "/library":
      return "packs";
    case "/packs":
      return "packs";
    case "/queue":
      return "queue";
    case "/history":
      return "history";
    case "/notifications":
      return "notifications";
    case "/statistics":
      return "statistics";
    case "/clip-demos":
      return "clipDemos";
    case "/examples":
      return "examples";
    case "/long-videos":
      return "longVideos";
    case "/errors":
      return "errors";
    case "/system":
      return "system";
    case "/settings":
      return "settings";
    case "/editor":
      return "templateEditor";
    case "/circles":
    case "/admin/circles":
      return "circleEditor";
    case "/admin/banners":
    case "/banners":
      return "bannerLibrary";
    case "/users":
      return "users";
    case "/login":
      return "login";
    case "/register":
      return "register";
    case "/ideas":
      return "ideas";
    case "/signals":
      return "signals";
    default:
      return null;
  }
}
