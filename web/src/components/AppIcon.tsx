import {
  AlertTriangle,
  BarChart3,
  Bell,
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
  GripVertical,
  History,
  House,
  KeyRound,
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
  Trash2,
  UserCog,
  Users,
  Video,
  X,
  MonitorPlay,
  Palette,
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
  | "drag"
  | "errors"
  | "external"
  | "globe"
  | "history"
  | "home"
  | "library"
  | "limits"
  | "login"
  | "logout"
  | "menu"
  | "music"
  | "notifications"
  | "packs"
  | "plus"
  | "queue"
  | "refresh"
  | "settings"
  | "skin"
  | "studio"
  | "system"
  | "time"
  | "trash"
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
  drag: GripVertical,
  errors: AlertTriangle,
  external: ExternalLink,
  globe: Globe2,
  history: History,
  home: House,
  library: Library,
  limits: KeyRound,
  login: LogIn,
  logout: LogOut,
  menu: Menu,
  music: Music2,
  notifications: Bell,
  packs: PackageOpen,
  plus: Plus,
  queue: ListPlus,
  refresh: RefreshCw,
  settings: Settings2,
  skin: Palette,
  studio: Languages,
  system: UserCog,
  time: Clock3,
  trash: Trash2,
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
