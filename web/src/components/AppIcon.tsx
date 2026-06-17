import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Clapperboard,
  ExternalLink,
  FileText,
  Globe2,
  History,
  Languages,
  Library,
  ListPlus,
  LogIn,
  LogOut,
  Menu,
  Music2,
  PackageOpen,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SquareLibrary,
  UserCog,
  Users,
  Video,
  X,
  MonitorPlay,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

export type AppIconName =
  | "accounts"
  | "admin"
  | "analytics"
  | "cards"
  | "check"
  | "chevron-left"
  | "chevron-right"
  | "clips"
  | "close"
  | "deck"
  | "errors"
  | "external"
  | "globe"
  | "history"
  | "library"
  | "login"
  | "logout"
  | "menu"
  | "music"
  | "packs"
  | "plus"
  | "queue"
  | "refresh"
  | "settings"
  | "studio"
  | "system"
  | "time"
  | "updates"
  | "users"
  | "video"
  | "warning"
  | "youtube";

type AppIconProps = Omit<LucideProps, "ref"> & {
  name: AppIconName;
  size?: number;
  title?: string;
};

const ICONS: Record<AppIconName, LucideIcon> = {
  accounts: CircleUserRound,
  admin: ShieldCheck,
  analytics: BarChart3,
  cards: SquareLibrary,
  check: Check,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  clips: Clapperboard,
  close: X,
  deck: BookOpen,
  errors: AlertTriangle,
  external: ExternalLink,
  globe: Globe2,
  history: History,
  library: Library,
  login: LogIn,
  logout: LogOut,
  menu: Menu,
  music: Music2,
  packs: PackageOpen,
  plus: Plus,
  queue: ListPlus,
  refresh: RefreshCw,
  settings: Settings2,
  studio: Languages,
  system: UserCog,
  time: Clock3,
  updates: FileText,
  users: Users,
  video: Video,
  warning: AlertTriangle,
  youtube: MonitorPlay,
};

export function AppIcon({ name, title, strokeWidth = 2, ...props }: AppIconProps) {
  const Icon = ICONS[name] ?? Boxes;
  return <Icon aria-hidden={title ? undefined : true} aria-label={title} focusable="false" strokeWidth={strokeWidth} {...props} />;
}
