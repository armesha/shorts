export interface Account {
  id: number;
  userId?: number | null; // owner (present on admin scope=all listings)
  channelName: string;
  theme: string;
  lang: string; // выбор контента: встроенный пак (ru/de/…) или свой пак ("pack:<id>")
  sourceDecks?: string[]; // выбранные источники канала; старые аккаунты используют lang
  longVideoDecks?: string[]; // длинные видео-паки: только ручное добавление в библиотеку + ручная выкладка
  channelLang?: string; // язык канала (ru/de/it/fr/en/ar) — пак должен совпадать по языку
  schedule: string[];
  template: string;
  status: "connected" | "needs_auth" | string;
  enabled: boolean;
  uploadsToday: number;
  createdAt: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  slotVideos: Record<string, number>;
  slotDecks?: Record<string, string>;
  avatar?: string | null; // channel avatar URL (built-in /avatars/… or uploaded /files/avatars/…)
  oauthClientId?: number | null; // which uploaded Google key the channel was connected with
  authError?: string | null; // YouTube rejected the token (revoked/expired) → канал нужно переподключить
  authFailedAt?: string | null; // когда токен начал отклоняться (ISO) — для «отвалился …»
}

export interface HistoryItem {
  id: number;
  accountId: number;
  title: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  error?: string | null; // why a `failed` row failed (e.g. auto-upload error reason)
  // Enriched (admin "all users" view): channel name, owner login, and a watch link.
  channelName?: string;
  ownerUsername?: string | null;
  youtubeId?: string | null;
  videoRel?: string | null;
}

/** One page of history rows. */
export interface HistoryPage {
  items: HistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppStatus {
  hasGoogleKey: boolean;
  credsConfigured: boolean; // alias of hasGoogleKey (back-compat for the channels badge)
  chromePath: string;
  llm: string;
}

export interface Generator {
  id: string;
  name: string;
  ai: boolean;
  preFact?: boolean; // pre-built video pack — Studio shows a random video instead of a text card
  longVideo?: boolean; // long pre-built compilation assembled from many short scenes
  gallery?: boolean; // static deck (deterministic per-card render) — browsable in the Gallery page
  total: number;
  titled: number;
  used: number;
  available: number;
  packs: number;
  range: [number, number];
  readyPacks: { n: number; name: string; titled: number }[];
  untitledPacks: number;
  untitledTotal: number;
}

export interface AppSettings {
  hasGoogleKey: boolean;
}

// One uploaded Google OAuth key (client_secret.json). The secret itself never reaches the client —
// only this display metadata does.
export interface OAuthClient {
  id: number;
  label: string;
  clientIdShort: string; // shortened client_id (semi-public; for display only)
  projectId: string | null;
  createdAt: string;
  channelCount: number; // connected channels bound to this key
}

export interface OAuthClientsResponse {
  clients: OAuthClient[];
  max: number;
  redirectUri: string; // the exact URI the server sends to Google (must be in each key's redirect URIs)
}

export interface AddOAuthClientResponse {
  client: OAuthClient;
  redirectOk: boolean; // false → the key's Authorized redirect URIs is missing our redirectUri
  redirectUri: string;
}

export interface AdminLimitsKey {
  index: number;
  keyHint: string;
  status: "ok" | "exhausted" | "invalid" | "rate_limited" | "error" | "blocked";
  httpStatus?: number;
  tier?: string | null;
  characterCount: number | null;
  characterLimit: number | null;
  remaining: number | null;
  usedPercent: number | null;
  resetAt: string | null;
  error?: string;
}

export interface ManualVideoLimits {
  maxFileMb: number;
  uploadsPerHour: number;
  durationSec: number;
}

export interface ReadinessLimits {
  minRunwayDays: number;
}

export interface AdminLimits {
  provider: "elevenlabs";
  updatedAt: string;
  keys: AdminLimitsKey[];
  manualVideo: ManualVideoLimits;
  readiness: ReadinessLimits;
  totals: {
    configured: number;
    active: number;
    exhausted: number;
    invalid: number;
    rateLimited: number;
    errors: number;
    blocked: number;
    characterCount: number | null;
    characterLimit: number | null;
    remaining: number | null;
    usedPercent: number | null;
  };
}

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
  locked: boolean;
  createdAt: string;
}

/** A pack (deck) for the admin visibility matrix. */
export interface DeckInfo {
  id: string;
  name: string;
  pack?: boolean; // кастомный пак (id вида "pack:<id>"); доступ — opt-in (гранты), а не hidden
  grantable?: boolean; // встроенный admin-only deck, который админ выдает opt-in галочкой
  adminOnly?: boolean; // admin-only дека: юзеру недоступна («—» в матрице), но админ может скрыть её у себя
  longVideo?: boolean; // длинный video-pack: отдельная таблица выдачи в админке
}
/** One row of the admin pack-visibility matrix: a user + which packs are hidden / actually used. */
export interface UserDeckRow {
  userId: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
  hidden: string[];
  grantedPacks: string[]; // id opt-in паков: кастомные "pack:<id>" + grantable built-in deck ids
  grantedLongVideos: string[]; // id opt-in long-video паков, отдельная таблица прав на backend
  used: string[];
  scheduled: number; // posts/day planned across all the user's channels
  library: number; // videos queued in the user's libraries
  usedTotal: number; // всего использованных карточек (встроенные + кастомные паки) — бейдж в панели сброса
  infiniteSim?: boolean; // «бесконечный пак» (имитация): весь пак свободен, очередь крутится по кругу
  // Per-deck remaining/used/total/posted for the decks the user uses (admin "when does a pack run out").
  deckStats?: Record<string, { used: number; available: number; total: number; posted: number }>;
}

/** Одна строка «занятости паков» юзера для админ-панели сброса: встроенный дек ИЛИ кастомный пак. */
export interface PackUsageItem {
  id: string; // "<deckId>" (встроенный) или "pack:<id>" (кастомный)
  name: string;
  pack: boolean; // true = кастомный пак
  total: number;
  used: number;
  available: number;
}

/** One pack's stats for the «Паки» tab: total cards / used / remaining / posted. */
export interface MyDeckStat {
  id: string;
  name: string;
  total: number;
  used: number;
  available: number;
  posted: number;
}
/** A user's pack overview (their visible packs with stats). */
export interface MyDecks {
  userId: number;
  username: string;
  decks: MyDeckStat[];
}
/** One row of the admin "running low" report: a user's pack with remaining below the threshold. */
export interface LowDeckRow {
  userId: number;
  username: string;
  deckId: string;
  deckName: string;
  lang?: string | null;
  available: number;
  total: number;
  used: number;
  posted: number;
}

export interface GeneratedPreview {
  imageUrl: string;
  title: string;
  text: string;
  chars: number;
  bg: string;
  fontPx: number;
}

export interface GeneratedVideo {
  videoUrl: string;
  imageUrl: string;
  title: string;
  text: string;
  chars: number;
  bg: string;
  music: string;
}

export interface LongVideoItem {
  id: string;
  deckId: string;
  deckName: string;
  title: string;
  text: string;
  videoUrl: string;
  file: string;
  durationSec: number | null;
  plannedDurationSec: number | null;
  sceneCount: number | null;
  music: string | null;
  source: string | null;
  builtAt: string | null;
}

export interface LongVideoPack {
  id: string;
  title: string;
  lang: string | null;
  count: number;
  items: LongVideoItem[];
}

export interface LongVideoCatalog {
  packs: LongVideoPack[];
  total: number;
}

export interface VideoItem {
  id: number;
  accountId: number;
  title: string;
  text: string;
  bg: string;
  music: string;
  deck: string;
  videoRel: string;
  imageRel: string | null;
  postCount: number;
  lastPostedAt: string | null;
  createdAt: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isSuperAdmin?: boolean;
  impersonator?: { id: number; username: string; role: string; isSuperAdmin?: boolean } | null;
}

/** A channel's totals at one moment (used for latest/prev on a stats row). */
export interface StatSnapshot {
  subscribers: number;
  views: number;
  videos: number;
  analyticsStatus: string | null;
  analyticsError: string | null;
  dataThrough: string | null;
  watchMinutes: number;
  engagedViews: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  analyticsTakenAt: string | null;
  takenAt: string;
}

export interface YoutubeDailyPoint {
  accountId?: number;
  date: string;
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes?: number;
  comments?: number;
  shares?: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface YoutubeBreakdownRow {
  key: string;
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration?: number;
}

export interface YoutubeDemographicsRow {
  ageGroup: string;
  gender: string;
  viewerPercentage: number;
}

export interface YoutubeSharingRow {
  service: string;
  shares: number;
}

export interface YoutubeTopVideo {
  videoId: string;
  title: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  views: number;
  engagedViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface YoutubeRetention {
  videoId: string;
  title: string;
  points: {
    elapsedRatio: number;
    audienceWatchRatio: number;
    relativeRetentionPerformance: number;
    startedWatching: number;
    stoppedWatching: number;
    totalSegmentImpressions: number;
  }[];
}

export interface YoutubeAnalyticsPayload {
  range: { from: string; to: string };
  days: number;
  status: string | null;
  error: string | null;
  dataThrough: string | null;
  takenAt: string | null;
  summary: {
    views: number;
    engagedViews: number;
    watchMinutes: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    likes: number;
    dislikes: number;
    comments: number;
    shares: number;
    subscribersGained: number;
    subscribersLost: number;
  };
  daily: YoutubeDailyPoint[];
  topVideos: YoutubeTopVideo[];
  trafficSources: YoutubeBreakdownRow[];
  devices: YoutubeBreakdownRow[];
  countries: YoutubeBreakdownRow[];
  subscribedStatus: YoutubeBreakdownRow[];
  demographics: YoutubeDemographicsRow[];
  sharing: YoutubeSharingRow[];
  retention: YoutubeRetention[];
}

/** One row on the Statistics page: a channel + its latest totals and the previous snapshot. */
export interface StatRow {
  accountId: number;
  channelName: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  ownerUsername: string | null;
  connected: boolean;
  latest: StatSnapshot | null;
  prev: StatSnapshot | null;
  analytics: YoutubeAnalyticsPayload;
  error: string | null;
}

/** A stored snapshot point for the history chart. */
export interface StatPoint {
  id: number;
  accountId: number;
  subscribers: number;
  views: number;
  videos: number;
  takenAt: string;
}

/** Aggregate audience totals across visible channels (latest snapshot of each), for the dashboard. */
export interface ChannelTotals {
  scope: "mine" | "all";
  channels: number;
  withData: number;
  subscribers: number;
  views: number;
  videos: number;
}

// Platform-wide production totals (every signed-in user sees the same aggregate numbers).
export interface PlatformSummary {
  queued: number;
  published: number;
  scheduled: number;
  failed: number;
  channels: number;
  channelsConnected: number;
  users: number;
}

export interface UserAnalytics {
  range: { from: string; to: string };
  summary: {
    published: number;
    scheduled: number;
    failed: number;
    queuedVideos: number;
    channels: number;
    connected: number;
    subscribers: number;
    views: number;
    youtubeVideos: number;
    subscriberDelta: number;
    viewsDelta: number;
    watchMinutes: number;
    engagedViews: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    likes: number;
    comments: number;
    shares: number;
    subscribersGained: number;
    subscribersLost: number;
    dataThrough: string | null;
  };
  daily: { date: string; published: number; scheduled: number; failed: number }[];
  youtubeDaily: YoutubeDailyPoint[];
}

export interface AdminAnalytics {
  range: { from: string; to: string };
  updatedAt: string;
  summary: {
    published: number;
    scheduled: number;
    failed: number;
    historyTotal: number;
    queuedVideos: number;
    accountsTotal: number;
    accountsEnabled: number;
    accountsConnected: number;
    usersTotal: number;
    errors: number;
    subscribers: number;
    views: number;
    youtubeVideos: number;
    subscriberDelta: number;
    viewsDelta: number;
    youtubeVideosDelta: number;
    watchMinutes: number;
    engagedViews: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    likes: number;
    comments: number;
    shares: number;
    subscribersGained: number;
    subscribersLost: number;
    dataThrough: string | null;
  };
  daily: { date: string; published: number; scheduled: number; failed: number }[];
  youtubeSeries: {
    date: string;
    subscribers: number;
    views: number;
    videos: number;
    watchMinutes: number;
    engagedViews: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    subscribersGained: number;
    subscribersLost: number;
  }[];
  topChannels: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    published: number;
    scheduled: number;
    failed: number;
    latestPublishedAt: string | null;
    queued: number;
    postsPerDay: number;
    runwayDays: number | null;
    subscribers: number;
    views: number;
    watchMinutes: number;
    avgViewDuration: number;
  }[];
  topUsers: {
    userId: number;
    username: string;
    published: number;
    scheduled: number;
    failed: number;
    channels: number;
    queued: number;
    postsPerDay: number;
  }[];
  runway: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    queued: number;
    postsPerDay: number;
    runwayDays: number | null;
    enabled: boolean;
    connected: boolean;
  }[];
  youtubeGrowth: {
    accountId: number;
    channelName: string;
    ownerUsername: string | null;
    subscribers: number;
    views: number;
    videos: number;
    subscriberDelta: number;
    viewsDelta: number;
    videoDelta: number;
    watchMinutes: number;
    avgViewDuration: number;
    subscribersGained: number;
    subscribersLost: number;
  }[];
  failures: {
    id: number;
    accountId: number;
    title: string;
    channelName: string;
    ownerUsername: string | null;
    error: string | null;
    createdAt: string;
    publishedAt: string | null;
  }[];
  recentErrors: {
    id: number;
    source: string;
    level: string;
    message: string;
    context: string | null;
    createdAt: string;
  }[];
}

/** One logged error row for the admin Errors page. */
export interface ErrorLogItem {
  id: number;
  source: string; // 'server' | 'client'
  level: string;
  message: string;
  detail: string | null;
  context: string | null;
  userId: number | null;
  createdAt: string;
  firstCreatedAt?: string;
  count?: number;
}

/** User-facing deduped notification with a suggested fix. */
export interface NotificationItem {
  id: number;
  userId: number;
  username: string | null;
  accountId: number | null;
  accountName: string | null;
  severity: "info" | "warning" | "error" | string;
  category: string;
  title: string;
  message: string;
  solution: string | null;
  actionUrl: string | null;
  dedupeKey: string;
  source: string | null;
  context: string | null;
  count: number;
  readAt: string | null;
  resolvedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationCounts {
  open: number;
  unread: number;
  total: number;
}

/** Live server-health snapshot for the admin «Сервер» page (in-memory history, no DB). */
export interface SystemStatus {
  now: {
    uptimeSec: number;
    cpuPct: number;
    loadavg: number[]; // [1m,5m,15m] — [0,0,0] on Windows
    cpuCount: number;
    rssMb: number;
    heapMb: number;
    memUsedMb: number;
    memTotalMb: number;
    memPct: number;
    diskFreeMb: number;
    diskTotalMb: number;
    diskPct: number;
    platform: string;
    nodeVersion: string;
    sampleSec: number;
  };
  hardware: {
    tempC: number | null;
    tempLabel: string | null;
    cpuTempC: number | null;
    gpuTempC: number | null;
    fanRpm: number | null;
    sensors: {
      kind: "cpu" | "gpu" | "system" | "other";
      label: string;
      tempC: number;
    }[];
  };
  active: { render: number; upload: number };
  scheduler: { lastTickAt: number | null; lastPostAt: number | null };
  history: { t: number; cpu: number; memPct: number; rssMb: number; diskPct: number; tempC: number | null }[];
  domain: {
    videosQueued: number;
    accountsTotal: number;
    accountsEnabled: number;
    accountsConnected: number;
    errors24h: number;
    errorsTotal: number;
  };
}

// ---- German-psychology card uploader (the "Карточки" page) ----
export interface PsychPatternField {
  key: string;
  label: string;
  max: number;
  required: boolean;
}
export interface PsychPattern {
  id: string;
  label: string;
  desc: string;
  itemFields: PsychPatternField[];
  exampleItem: Record<string, string>;
}
export interface PsychLimits {
  titleLines: { min: number; max: number; maxLineChars: number };
  items: { min: number; max: number };
  outroMax: number;
}
export interface PsychSchema {
  patterns: PsychPattern[];
  limits: PsychLimits;
}
export interface PsychCard {
  pattern: string;
  title_lines: string[];
  items: Record<string, string>[];
  outro?: string;
  addedAt?: string;
  source?: string;
}
export interface PsychCardRow {
  index: number;
  card: PsychCard;
}
export interface PsychCardList {
  items: PsychCardRow[];
  total: number;
  page: number;
  pageSize: number;
}
/** Per-card validation error from a rejected upload (carried on ApiError.body). */
export interface PsychUploadErrorBody {
  error: string;
  errors: { index: number; messages: string[] }[];
  parsed: number;
  valid: number;
}

// ---- Кастомные паки (хаб «Паки и карточки») ----
export interface PackSummary {
  id: string;
  owners: number[]; // владельцы пака (могут редактировать; пусто = без владельца)
  createdBy: number | null; // кто создал пак; обычный админ может удалять только свои созданные паки
  name: string;
  lang: string;
  templates: number;
  cards: number; // всего карточек в паке
  used?: number; // сколько карточек этот юзер уже использовал
  available?: number; // сколько карточек ещё свободно для генерации (cards − used)
  createdAt: string;
}
export interface PackRoleRule {
  role: string;
  list: boolean;
  min: number;
  max: number;
}
export interface PackCardRow {
  values: Record<string, string | string[]>;
  addedAt: string;
}
export interface PackFull {
  id: string;
  owners: number[]; // владельцы пака (могут редактировать имя/язык/карточки)
  createdBy: number | null;
  name: string;
  lang: string;
  createdAt: string;
  templates: unknown[];
  cards: PackCardRow[];
  rules: PackRoleRule[];
}
export interface MusicTrack {
  id: string;
  name: string;
  fileName: string;
  bytes: number;
  url: string;
}
export interface PackMusic {
  builtin: MusicTrack[];
  custom: MusicTrack[];
  canEdit: boolean;
  maxFiles: number;
  maxFileMb: number;
}
export interface PackMusicUploadFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}
export interface PackMusicUploadResult {
  added: MusicTrack[];
  errors: { name: string; message: string }[];
  tracks: MusicTrack[];
}

/** One generation-queue job's live status (one video at a time across all users). */
export interface GenJobStatus {
  id: string;
  userId?: number;
  ownerUserId?: number;
  accountId: number;
  deckIds?: string[];
  total: number;
  done: number;
  state: "queued" | "running" | "done" | "exhausted" | "canceled" | "error";
  ahead: number; // videos remaining ahead before this job starts (0 once running)
  position: number; // 0 = running/next, >0 = waiting, -1 = finished
  error: string | null;
  createdAt?: number;
  endedAt?: number | null;
}

export type ContentCatalogKind = "builtin" | "custom_pack" | "manual" | "clip_demo";

export interface ContentCatalogAccount {
  id: number;
  channelName: string;
  enabled: boolean;
  connected: boolean;
}

export interface ContentCatalogItem {
  id: string;
  kind: ContentCatalogKind;
  title: string;
  lang: string | null;
  total: number | null;
  available: number | null;
  queued: number;
  demoCount: number;
  usedByAccounts: ContentCatalogAccount[];
}

export interface ContentCatalogResponse {
  items: ContentCatalogItem[];
}

export interface ChannelThemeBlockDeck {
  id: string;
  name: string;
  lang: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  available: number;
  queued: number;
  total: number | null;
}

export interface ChannelThemeBlockSourceGroup {
  id: string;
  title: string;
  defaultWeight: number;
  weight: number;
}

export interface ChannelThemeBlockAccount {
  id: number;
  userId?: number | null;
  channelName: string;
  theme: string;
  channelLang: string;
  enabled: boolean;
  connected: boolean;
  status: string;
  authError?: string | null;
  schedule: string[];
  avatar?: string | null;
  ytChannelId?: string | null;
  queued: number;
  queuedByDeck: Record<string, number>;
  shortAvailable: number;
  sourceDecks: ChannelThemeBlockDeck[];
}

export interface ChannelThemeBlockCell {
  lang: string;
  label: string;
  accounts: ChannelThemeBlockAccount[];
  defaultSourceDecks: string[];
}

export interface ChannelThemeBlock {
  id: string;
  title: string;
  description: string;
  rules: string[];
  sourceGroups: ChannelThemeBlockSourceGroup[];
  cells: ChannelThemeBlockCell[];
  totalAccounts: number;
  queued: number;
  shortAvailable: number;
  postsPerDay: number;
  runwayDays: number | null;
  totalQueued: number;
  totalShortAvailable: number;
  totalPostsPerDay: number;
}

export interface ChannelThemeBlocksResponse {
  languages: { code: string; label: string }[];
  blocks: ChannelThemeBlock[];
  unassignedAccounts: ChannelThemeBlockAccount[];
}

export interface ChannelThemeBlockGenerateResult {
  blockId: string;
  requestedPerChannel: number;
  jobs: { accountId: number; channelName: string; deckIds: string[]; jobId: string; total: number }[];
  skipped: { accountId: number; channelName: string; reason: string }[];
}

export interface ChannelThemeBlockNormalizeResult {
  blockId: string;
  targetQueued: number;
  jobs: { accountId: number; channelName: string; deckIds: string[]; jobId: string; total: number; currentQueued: number; targetQueued: number }[];
  skipped: { accountId: number; channelName: string; reason: string; currentQueued?: number; targetQueued?: number }[];
}

export interface ChannelThemeBlockScheduleResult {
  blockId: string;
  perDay: number;
  updated: { accountId: number; channelName: string; schedule: string[] }[];
  skipped: { accountId: number; channelName: string; reason: string; cap?: number; available?: number }[];
}

export type AccountReadinessStatus = "ready" | "warning" | "blocked";

export interface AccountReadiness {
  status: AccountReadinessStatus;
  blockers: string[];
  warnings: string[];
  actions: string[];
  queuedVideos: number;
  postsPerDay: number;
  runwayDays: number | null;
  minRunwayDays: number;
  decks: {
    deckId: string;
    queued: number;
    postsPerDay: number;
    runwayDays: number | null;
    status: "ok" | "low" | "empty" | "idle";
  }[];
  nextSlotAt: string | null;
  sourceDecks: string[];
  availableNow: number;
}

export interface QueueJob extends GenJobStatus {
  channelName: string;
  ownerUsername: string | null;
}

export interface QueueChannel {
  accountId: number;
  channelName: string;
  ownerUsername: string | null;
  connected: boolean;
  enabled: boolean;
  schedule: string[];
  sourceDecks: string[];
  byDeck: Record<string, number>;
  queued: number;
  postsPerDay: number;
  runwayDays: number | null;
}

export interface QueueSlot {
  accountId: number;
  channelName: string;
  time: string;
  at: string;
  deck: string | null;
}

export interface QueueOverview {
  generationJobs: QueueJob[];
  channelQueues: QueueChannel[];
  upcomingSlots: QueueSlot[];
}
