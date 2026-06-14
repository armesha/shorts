export interface Account {
  id: number;
  userId?: number | null; // owner (present on admin scope=all listings)
  channelName: string;
  theme: string;
  lang: string;
  schedule: string[];
  template: string;
  status: "connected" | "needs_auth" | string;
  enabled: boolean;
  uploadsToday: number;
  createdAt: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  slotVideos: Record<string, number>;
}

export interface HistoryItem {
  id: number;
  accountId: number;
  title: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
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

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  locked: boolean;
  createdAt: string;
}

/** A pack (deck) for the admin visibility matrix. */
export interface DeckInfo {
  id: string;
  name: string;
}
/** One row of the admin pack-visibility matrix: a user + which packs are hidden / actually used. */
export interface UserDeckRow {
  userId: number;
  username: string;
  role: string;
  hidden: string[];
  used: string[];
  scheduled: number; // posts/day planned across all the user's channels
  library: number; // videos queued in the user's libraries
  // Per-deck remaining/used/total/posted for the decks the user uses (admin "when does a pack run out").
  deckStats?: Record<string, { used: number; available: number; total: number; posted: number }>;
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

export interface VideoItem {
  id: number;
  accountId: number;
  title: string;
  text: string;
  bg: string;
  music: string;
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
}

/** A channel's totals at one moment (used for latest/prev on a stats row). */
export interface StatSnapshot {
  subscribers: number;
  views: number;
  videos: number;
  takenAt: string;
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
  active: { render: number; upload: number };
  scheduler: { lastTickAt: number | null; lastPostAt: number | null };
  history: { t: number; cpu: number; memPct: number; rssMb: number; diskPct: number }[];
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
  name: string;
  lang: string;
  templates: number;
  cards: number;
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
  name: string;
  lang: string;
  createdAt: string;
  templates: unknown[];
  cards: PackCardRow[];
  rules: PackRoleRule[];
}

/** Error carrying the HTTP status + the server's `{error}` message (for lockout/attempt UI). */
export class ApiError extends Error {
  status: number;
  /** Parsed JSON error body when present (e.g. per-card upload validation errors). */
  body?: unknown;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handle<T>(r: Response, path: string): Promise<T> {
  if (r.ok) return (await r.json()) as T;
  let message = `${r.status} ${r.statusText}`;
  let body: unknown;
  try {
    body = await r.json();
    const data = body as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    /* non-JSON error body — keep the status text */
  }
  // Session expired/invalid mid-use → let the app fall back to the login screen.
  if (r.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }
  const err = new ApiError(r.status, message);
  err.body = body;
  throw err;
}

async function get<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`/api${path}`, { credentials: "include" }), path);
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle<T>(r, path);
}

/** One generation-queue job's live status (one video at a time across all users). */
export interface GenJobStatus {
  id: string;
  total: number;
  done: number;
  state: "queued" | "running" | "done" | "exhausted" | "canceled" | "error";
  ahead: number; // videos remaining ahead before this job starts (0 once running)
  position: number; // 0 = running/next, >0 = waiting, -1 = finished
  error: string | null;
}

export const apiClient = {
  me: () => get<AuthUser>("/auth/me"),
  login: (username: string, password: string) =>
    send<AuthUser>("/auth/login", "POST", { username, password }),
  logout: () => send<{ ok: boolean }>("/auth/logout", "POST", {}),
  status: () => get<AppStatus>("/config"),
  changelog: () => get<{ raw: string }>("/changelog"),
  settings: () => get<AppSettings>("/settings"),
  uploadGoogleKey: (json: string) => send<AppSettings>("/settings/google-key", "PUT", { json }),
  removeGoogleKey: () => send<AppSettings>("/settings/google-key", "DELETE"),
  adminUsers: () => get<AdminUser[]>("/admin/users"),
  createUser: (username: string, password: string, role?: string, hidden?: string[]) =>
    send<{ id: number; username: string; role: string }>("/admin/users", "POST", {
      username,
      password,
      role,
      hidden,
    }),
  adminDecks: () => get<DeckInfo[]>("/admin/decks"),
  adminUserDecks: () => get<UserDeckRow[]>("/admin/user-decks"),
  setUserDecks: (userId: number, hidden: string[]) =>
    send<{ ok: boolean; hidden: string[] }>(`/admin/users/${userId}/decks`, "PUT", { hidden }),
  myDecks: (userId?: number) => get<MyDecks>(`/my-decks${userId != null ? `?userId=${userId}` : ""}`),
  adminLowDecks: () => get<LowDeckRow[]>("/admin/low-decks"),
  accounts: (scope?: "all") => get<Account[]>(`/accounts${scope === "all" ? "?scope=all" : ""}`),
  account: (id: number | string) => get<Account>(`/accounts/${id}`),
  createAccount: () => send<Account>("/accounts", "POST", {}),
  updateAccount: (id: number | string, data: Partial<Account>) =>
    send<Account>(`/accounts/${id}`, "PUT", data),
  deleteAccount: (id: number | string) => send<{ ok: boolean }>(`/accounts/${id}`, "DELETE"),
  youtubeAuthUrl: (accountId: number | string) =>
    get<{ url: string }>(`/youtube/auth-url?accountId=${accountId}`),
  history: (params?: {
    scope?: "mine" | "all";
    userId?: number;
    accountId?: number;
    page?: number;
    pageSize?: number;
  }) => {
    const p = params ?? {};
    const qs = new URLSearchParams();
    if (p.scope === "all") qs.set("scope", "all");
    if (p.userId != null) qs.set("userId", String(p.userId));
    if (p.accountId != null) qs.set("accountId", String(p.accountId));
    if (p.page != null) qs.set("page", String(p.page));
    if (p.pageSize != null) qs.set("pageSize", String(p.pageSize));
    const s = qs.toString();
    return get<HistoryPage>(`/history${s ? "?" + s : ""}`);
  },
  generators: () => get<Generator[]>("/generators"),
  backgrounds: () => get<string[]>("/backgrounds"),
  music: () => get<string[]>("/music"),
  // German-psychology card uploader
  psychSchema: () => get<PsychSchema>("/psych/cards/schema"),
  psychCards: (page = 1, pageSize = 12, onlyUploaded = true) =>
    get<PsychCardList>(`/psych/cards?page=${page}&pageSize=${pageSize}&onlyUploaded=${onlyUploaded}`),
  uploadPsychCards: (cards: unknown) =>
    send<{ added: number; total: number }>("/psych/cards", "POST", { cards }),
  deletePsychCard: (index: number, addedAt?: string) =>
    send<{ deleted: boolean; total: number }>(
      `/psych/cards/${index}${addedAt ? `?addedAt=${encodeURIComponent(addedAt)}` : ""}`,
      "DELETE",
    ),
  // Кастомные паки
  packs: () => get<PackSummary[]>("/packs"),
  pack: (id: string) => get<PackFull>(`/packs/${id}`),
  createPack: (name: string, lang: string, templates: unknown[]) =>
    send<PackSummary>("/packs", "POST", { name, lang, templates }),
  addPackCards: (id: string, cards: unknown) =>
    send<{ added: number; total: number }>(`/packs/${id}/cards`, "POST", { cards }),
  deletePackCard: (id: string, index: number, addedAt?: string) =>
    send<{ deleted: boolean; total: number }>(
      `/packs/${id}/cards/${index}${addedAt ? `?addedAt=${encodeURIComponent(addedAt)}` : ""}`,
      "DELETE",
    ),
  deletePack: (id: string) => send<{ deleted: boolean }>(`/packs/${id}`, "DELETE"),
  packPreview: (id: string, i: number) => get<{ imageUrl: string }>(`/packs/${id}/preview?i=${i}`),
  generateAnecdote: (body?: { text?: string; title?: string; bg?: string; deck?: string }) =>
    send<GeneratedPreview>("/generate/anecdote", "POST", body ?? {}),
  generateAnecdoteVideo: (body?: { text?: string; title?: string; bg?: string; music?: string; deck?: string }) =>
    send<GeneratedVideo>("/generate/anecdote-video", "POST", body ?? {}),
  videos: (accountId: number | string) => get<VideoItem[]>(`/videos?accountId=${accountId}`),
  saveVideo: (body: { accountId: number; text: string; title: string; bg?: string; music?: string; deck?: string }) =>
    send<VideoItem>("/videos", "POST", body),
  deleteVideo: (id: number | string) => send<{ ok: boolean }>(`/videos/${id}`, "DELETE"),
  batchVideos: (accountId: number | string, count: number, deck?: string) =>
    send<{ created: VideoItem[]; requested: number; made: number; exhausted: boolean }>(
      "/videos/batch",
      "POST",
      { accountId: Number(accountId), count, deck },
    ),
  // Generation queue: one video at a time across all users. Enqueue → poll status → optional cancel.
  enqueueGen: (accountId: number | string, count: number) =>
    send<{ jobId: string; total: number }>("/gen-queue", "POST", { accountId: Number(accountId), count }),
  genStatus: (jobId: string) => get<GenJobStatus>(`/gen-queue/${jobId}`),
  cancelGen: (jobId: string) => send<{ ok: boolean }>(`/gen-queue/${jobId}/cancel`, "POST", {}),
  postVideoNow: (id: number | string, publishAt?: string) =>
    send<{ ok: boolean; youtubeId?: string; url?: string; scheduled?: boolean; removed?: boolean }>(
      `/videos/${id}/post-now`,
      "POST",
      { publishAt },
    ),
  // Statistics: every user sees their own channels; admins may pass scope="all" for all channels.
  stats: (scope?: "mine" | "all") =>
    get<StatRow[]>(`/stats${scope === "all" ? "?scope=all" : ""}`),
  refreshStats: (scope?: "mine" | "all") =>
    send<StatRow[]>(`/stats/refresh${scope === "all" ? "?scope=all" : ""}`, "POST", {}),
  statsHistory: (accountId: number | string) => get<StatPoint[]>(`/stats/${accountId}/history`),
  // Error log: admin views/clears; any page can report a client-side error (fire-and-forget).
  errors: () => get<ErrorLogItem[]>("/errors"),
  clearErrors: () => send<{ ok: boolean }>("/errors", "DELETE"),
  // Server health (admin-only): live CPU/RAM/disk + in-memory history + pipeline activity.
  system: () => get<SystemStatus>("/system"),
  reportClientError: (message: string, detail?: string, context?: string) =>
    send<{ ok: boolean }>("/client-error", "POST", { message, detail, context }).catch(() => ({
      ok: false,
    })),
};
