export interface Account {
  id: number;
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
}

export interface AppStatus {
  credsConfigured: boolean;
  credsFile: string;
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
  googleClientSecretFile: string;
  exists: boolean;
  isDefault: boolean;
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

/** Error carrying the HTTP status + the server's `{error}` message (for lockout/attempt UI). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handle<T>(r: Response, path: string): Promise<T> {
  if (r.ok) return (await r.json()) as T;
  let message = `${r.status} ${r.statusText}`;
  try {
    const data = (await r.json()) as { error?: string };
    if (data?.error) message = data.error;
  } catch {
    /* non-JSON error body — keep the status text */
  }
  // Session expired/invalid mid-use → let the app fall back to the login screen.
  if (r.status === 401 && !path.startsWith("/auth/")) {
    window.dispatchEvent(new CustomEvent("auth:unauthorized"));
  }
  throw new ApiError(r.status, message);
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

export const apiClient = {
  me: () => get<AuthUser>("/auth/me"),
  login: (username: string, password: string) =>
    send<AuthUser>("/auth/login", "POST", { username, password }),
  logout: () => send<{ ok: boolean }>("/auth/logout", "POST", {}),
  status: () => get<AppStatus>("/config"),
  settings: () => get<AppSettings>("/settings"),
  updateSettings: (googleClientSecretFile: string) =>
    send<AppSettings>("/settings", "PUT", { googleClientSecretFile }),
  accounts: () => get<Account[]>("/accounts"),
  account: (id: number | string) => get<Account>(`/accounts/${id}`),
  createAccount: () => send<Account>("/accounts", "POST", {}),
  updateAccount: (id: number | string, data: Partial<Account>) =>
    send<Account>(`/accounts/${id}`, "PUT", data),
  deleteAccount: (id: number | string) => send<{ ok: boolean }>(`/accounts/${id}`, "DELETE"),
  youtubeAuthUrl: (accountId: number | string) =>
    get<{ url: string }>(`/youtube/auth-url?accountId=${accountId}`),
  history: () => get<HistoryItem[]>("/history"),
  generators: () => get<Generator[]>("/generators"),
  backgrounds: () => get<string[]>("/backgrounds"),
  music: () => get<string[]>("/music"),
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
  postVideoNow: (id: number | string, publishAt?: string) =>
    send<{ ok: boolean; youtubeId?: string; url?: string; scheduled?: boolean; removed?: boolean }>(
      `/videos/${id}/post-now`,
      "POST",
      { publishAt },
    ),
};
