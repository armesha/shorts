// Barrel: re-exports all DTO types (./types) + the HTTP transport (./http) and assembles apiClient.
// Every existing `import { apiClient, ApiError, type X } from "../lib/api"` resolves here unchanged.
export * from "./types";
export { ApiError } from "./http";
import { get, send } from "./http";
import type {
  Account, HistoryPage, AppStatus, AppSettings, OAuthClientsResponse, AddOAuthClientResponse,
  AdminUser, DeckInfo, UserDeckRow, AdminLimits, PackUsageItem, MyDecks, LowDeckRow, ManualVideoLimits, ReadinessLimits,
  AuthUser, Generator, GeneratedPreview, GeneratedVideo, VideoItem, GenJobStatus, GenQueueResponse, GenWorkerStatus,
  PsychSchema, PsychCardList, PackSummary, PackFull, PackMusic, PackMusicUploadFile,
  PackMusicUploadResult, MusicTrack, StatRow, ChannelTotals, PlatformSummary, StatPoint,
  AdminAnalytics, UserAnalytics, ErrorLogItem, NotificationItem, NotificationCounts, SystemStatus,
  ContentCatalogResponse, AccountReadiness, QueueOverview, LongVideoCatalog, VideoCountsResponse,
  ChannelThemeBlockAccount, ChannelThemeBlocksResponse, ChannelThemeBlockGenerateResult,
  ChannelThemeBlockNormalizeResult, ChannelThemeBlockScheduleResult, ChannelThemeBlockSourceGroup,
} from "./types";

export const apiClient = {
  me: () => get<AuthUser>("/auth/me"),
  login: (username: string, password: string) =>
    send<AuthUser>("/auth/login", "POST", { username, password }),
  register: (username: string, password: string) =>
    send<AuthUser>("/auth/register", "POST", { username, password }),
  logout: () => send<{ ok: boolean }>("/auth/logout", "POST", {}),
  // Telegram via the bot (press Start): info / link-status / bind / login / unbind.
  telegramInfo: () => get<{ enabled: boolean; bot: string | null }>("/auth/telegram/info"),
  telegramStatus: () =>
    get<{ enabled: boolean; bot: string | null; linked: boolean; username: string | null }>(
      "/auth/telegram/me",
    ),
  telegramUnbind: () => send<{ ok: boolean }>("/auth/telegram/unbind", "POST", {}),
  tgBindStart: () =>
    send<{ token: string; url: string; bot: string }>("/auth/telegram/bind/start", "POST", {}),
  tgBindStatus: (token: string) =>
    get<{ status: string; username?: string | null }>(
      `/auth/telegram/bind/status?token=${encodeURIComponent(token)}`,
    ),
  tgLoginStart: () =>
    send<{ token: string; url: string; bot: string }>("/auth/telegram/login/start", "POST", {}),
  tgLoginStatus: (token: string) =>
    get<{ status: string; user?: AuthUser }>(
      `/auth/telegram/login/status?token=${encodeURIComponent(token)}`,
    ),
  tgRegisterStart: () =>
    send<{ token: string; url: string; bot: string }>("/auth/telegram/register/start", "POST", {}),
  tgRegisterStatus: (token: string) =>
    get<{ status: string; user?: AuthUser }>(
      `/auth/telegram/register/status?token=${encodeURIComponent(token)}`,
    ),
  recoverStart: (username: string) => send<{ ok: boolean }>("/auth/recover/start", "POST", { username }),
  recoverComplete: (username: string, code: string, newPassword: string) =>
    send<{ ok: boolean }>("/auth/recover/complete", "POST", { username, code, newPassword }),
  status: () => get<AppStatus>("/config"),
  changelog: () => get<{ raw: string }>("/changelog"),
  settings: () => get<AppSettings>("/settings"),
  // Google keys (client_secret.json) — up to N per user, each channel bound to one.
  youtubeClients: () => get<OAuthClientsResponse>("/youtube/clients"),
  addYoutubeClient: (json: string, label?: string) =>
    send<AddOAuthClientResponse>("/youtube/clients", "POST", { json, label }),
  renameYoutubeClient: (id: number, label: string) =>
    send<{ ok: boolean }>(`/youtube/clients/${id}`, "PATCH", { label }),
  deleteYoutubeClient: (id: number) => send<{ ok: boolean }>(`/youtube/clients/${id}`, "DELETE"),
  adminUsers: () => get<AdminUser[]>("/admin/users"),
  createUser: (username: string, password: string, role?: string, hidden?: string[]) =>
    send<{ id: number; username: string; role: string; isSuperAdmin?: boolean }>("/admin/users", "POST", {
      username,
      password,
      role,
      hidden,
    }),
  setUserRole: (userId: number | string, role: "admin" | "user") =>
    send<{ ok: boolean; role: string; isSuperAdmin?: boolean }>(`/admin/users/${userId}/role`, "PUT", { role }),
  impersonateUser: (userId: number | string) =>
    send<AuthUser>(`/admin/users/${userId}/impersonate`, "POST", {}),
  stopImpersonation: () => send<AuthUser>("/auth/impersonation/stop", "POST", {}),
  adminSendNotification: (
    userId: number | string,
    body: { severity?: "info" | "warning" | "error"; title?: string; message: string; solution?: string; actionUrl?: string },
  ) => send<NotificationItem>(`/admin/users/${userId}/notifications`, "POST", body),
  adminDecks: () => get<DeckInfo[]>("/admin/decks"),
  adminPacks: () => get<PackSummary[]>("/admin/packs"),
  adminUserDecks: () => get<UserDeckRow[]>("/admin/user-decks"),
  adminLimits: () => get<AdminLimits>("/admin/limits"),
  updateAdminManualVideoLimits: (body: { maxFileMb: number; uploadsPerHour: number }) =>
    send<ManualVideoLimits>("/admin/manual-video-limits", "PUT", body),
  updateAdminReadinessLimits: (body: { minRunwayDays: number }) =>
    send<ReadinessLimits>("/admin/readiness-limits", "PUT", body),
  manualVideoLimits: () => get<ManualVideoLimits>("/videos/manual-limits"),
  setUserDecks: (userId: number, hidden: string[], grants?: string[], longVideoGrants?: string[]) =>
    send<{ ok: boolean; hidden: string[] }>(`/admin/users/${userId}/decks`, "PUT", { hidden, grants, longVideoGrants }),
  // «Бесконечный пак» (имитация) — вкл/выкл для юзера: весь пак свободен + рецикл очереди.
  setUserInfinitePacks: (userId: number, enabled: boolean) =>
    send<{ ok: boolean; enabled: boolean }>(`/admin/users/${userId}/infinite-packs`, "PUT", { enabled }),
  setUserCommercialCreator: (userId: number, enabled: boolean) =>
    send<{ ok: boolean; enabled: boolean }>(`/admin/users/${userId}/commercial-creator`, "PUT", { enabled }),
  resetUserDeck: (userId: number, deckId: string) =>
    send<{ ok: boolean; removed: number }>(`/admin/users/${userId}/decks/${encodeURIComponent(deckId)}/reset`, "POST", {}),
  adminUserPackUsage: (userId: number) =>
    get<{ userId: number; username: string; items: PackUsageItem[] }>(`/admin/users/${userId}/pack-usage`),
  myDecks: (userId?: number) => get<MyDecks>(`/my-decks${userId != null ? `?userId=${userId}` : ""}`),
  contentCatalog: () => get<ContentCatalogResponse>("/content-catalog"),
  channelThemeBlocks: () => get<ChannelThemeBlocksResponse>("/super-admin/channel-blocks"),
  createChannelThemeBlockAccount: (blockId: string, lang: string) =>
    send<ChannelThemeBlockAccount>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/accounts`,
      "POST",
      { lang },
    ),
  generateChannelThemeBlock: (blockId: string, count: number, accountIds?: number[], sourceWeights?: Record<string, number>) =>
    send<ChannelThemeBlockGenerateResult>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/generate`,
      "POST",
      { count, ...(accountIds ? { accountIds } : {}), ...(sourceWeights ? { sourceWeights } : {}) },
    ),
  normalizeChannelThemeBlock: (blockId: string, accountIds?: number[], sourceWeights?: Record<string, number>, targetRunwayDays?: number) =>
    send<ChannelThemeBlockNormalizeResult>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/normalize`,
      "POST",
      { ...(accountIds ? { accountIds } : {}), ...(sourceWeights ? { sourceWeights } : {}), ...(targetRunwayDays ? { targetRunwayDays } : {}) },
    ),
  previewChannelThemeBlockNormalize: (blockId: string, accountIds?: number[], sourceWeights?: Record<string, number>, targetRunwayDays?: number) =>
    send<ChannelThemeBlockNormalizeResult>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/normalize-preview`,
      "POST",
      { ...(accountIds ? { accountIds } : {}), ...(sourceWeights ? { sourceWeights } : {}), ...(targetRunwayDays ? { targetRunwayDays } : {}) },
    ),
  setChannelThemeBlockSchedule: (blockId: string, perDay: number, accountIds?: number[], sourceWeights?: Record<string, number>) =>
    send<ChannelThemeBlockScheduleResult>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/schedule`,
      "POST",
      { perDay, ...(accountIds ? { accountIds } : {}), ...(sourceWeights ? { sourceWeights } : {}) },
    ),
  saveChannelThemeBlockSourceWeights: (blockId: string, sourceWeights: Record<string, number>) =>
    send<{ blockId: string; sourceGroups: ChannelThemeBlockSourceGroup[]; sourceWeights: Record<string, number> }>(
      `/super-admin/channel-blocks/${encodeURIComponent(blockId)}/source-weights`,
      "POST",
      { sourceWeights },
    ),
  longVideos: (cacheBust?: number) => get<LongVideoCatalog>(`/long-videos${cacheBust ? `?t=${cacheBust}` : ""}`),
  adminLowDecks: () => get<LowDeckRow[]>("/admin/low-decks"),
  accounts: (scope?: "all") => get<Account[]>(`/accounts${scope === "all" ? "?scope=all" : ""}`),
  account: (id: number | string) => get<Account>(`/accounts/${id}`),
  accountReadiness: (id: number | string) => get<AccountReadiness>(`/accounts/${id}/readiness`),
  createAccount: () => send<Account>("/accounts", "POST", {}),
  updateAccount: (id: number | string, data: Partial<Account>) =>
    send<Account>(`/accounts/${id}`, "PUT", data),
  deleteAccount: (id: number | string) => send<{ ok: boolean }>(`/accounts/${id}`, "DELETE"),
  addLongVideoToLibrary: (accountId: number | string, deck: string) =>
    send<VideoItem>("/videos/long", "POST", { accountId: Number(accountId), deck }),
  avatars: () => get<string[]>("/avatars"),
  uploadAvatar: (id: number | string, dataUrl: string) =>
    send<Account>(`/accounts/${id}/avatar`, "POST", { dataUrl }),
  youtubeAuthUrl: (accountId: number | string, clientId?: number) =>
    get<{ url: string }>(`/youtube/auth-url?accountId=${accountId}${clientId ? `&clientId=${clientId}` : ""}`),
  history: (params?: {
    scope?: "mine" | "all";
    userId?: number;
    accountId?: number;
    onlyErrors?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    const p = params ?? {};
    const qs = new URLSearchParams();
    if (p.scope === "all") qs.set("scope", "all");
    if (p.userId != null) qs.set("userId", String(p.userId));
    if (p.accountId != null) qs.set("accountId", String(p.accountId));
    if (p.onlyErrors) qs.set("onlyErrors", "1");
    if (p.page != null) qs.set("page", String(p.page));
    if (p.pageSize != null) qs.set("pageSize", String(p.pageSize));
    const s = qs.toString();
    return get<HistoryPage>(`/history${s ? "?" + s : ""}`);
  },
  clearHistoryErrors: (params?: {
    scope?: "mine" | "all";
    userId?: number;
    accountId?: number;
  }) => {
    const p = params ?? {};
    const qs = new URLSearchParams();
    if (p.scope === "all") qs.set("scope", "all");
    if (p.userId != null) qs.set("userId", String(p.userId));
    if (p.accountId != null) qs.set("accountId", String(p.accountId));
    const s = qs.toString();
    return send<{ ok: boolean; removed: number }>(`/history/errors${s ? "?" + s : ""}`, "DELETE");
  },
  generators: () => get<Generator[]>("/generators"),
  galleryCards: (deck: string) =>
    get<{ deck: string; name: string; count: number; cards: { i: number; title: string; caption: string; text: string }[] }>(
      `/gallery/${encodeURIComponent(deck)}/cards`,
    ),
  // Random pre-built fact video (preFact deck) for the Studio preview player.
  factRandom: (deck: string) =>
    get<{ videoUrl?: string; title?: string; text?: string; error?: string }>(
      `/fact/random?deck=${encodeURIComponent(deck)}`,
    ),
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
  packs: (opts?: { all?: boolean }) => get<PackSummary[]>(`/packs${opts?.all ? "?all=1" : ""}`),
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
  setPackLang: (id: string, lang: string) => send<{ ok: boolean; lang: string }>(`/packs/${id}/lang`, "POST", { lang }),
  setPackName: (id: string, name: string) => send<{ ok: boolean; name: string }>(`/packs/${id}/name`, "POST", { name }),
  // Admin: set a pack's owners (0+; owners edit the pack on /cards). Пусто = без владельца.
  setPackOwners: (id: string, owners: number[]) =>
    send<{ ok: boolean; owners: number[] }>(`/admin/packs/${id}/owners`, "PUT", { owners }),
  packMusic: (id: string) => get<PackMusic>(`/packs/${id}/music`),
  uploadPackMusic: (id: string, files: PackMusicUploadFile[]) =>
    send<PackMusicUploadResult>(`/packs/${id}/music`, "POST", { files }),
  deletePackMusic: (id: string, fileName: string) =>
    send<{ deleted: boolean; tracks: MusicTrack[] }>(
      `/packs/${id}/music/${encodeURIComponent(fileName)}`,
      "DELETE",
    ),
  packPreview: (id: string, i: number) => get<{ imageUrl: string; index?: number }>(`/packs/${id}/preview?i=${i}`),
  packBuildVideo: (id: string, i: number, opts?: { accountId?: number; music?: string }) =>
    send<{ videoUrl: string; music: string; saved: boolean }>(`/packs/${id}/cards/${i}/video`, "POST", opts ?? {}),
  generateAnecdote: (body?: { text?: string; title?: string; bg?: string; avoidBg?: string; deck?: string }) =>
    send<GeneratedPreview>("/generate/anecdote", "POST", body ?? {}),
  generateAnecdoteVideo: (body?: { text?: string; title?: string; bg?: string; music?: string; deck?: string }) =>
    send<GeneratedVideo>("/generate/anecdote-video", "POST", body ?? {}),
  videoCounts: (scope?: "all") => get<VideoCountsResponse>(`/videos/counts${scope === "all" ? "?scope=all" : ""}`),
  videos: (accountId: number | string) => get<VideoItem[]>(`/videos?accountId=${accountId}`),
  saveVideo: (body: { accountId: number; text: string; title: string; bg?: string; music?: string; deck?: string }) =>
    send<VideoItem>("/videos", "POST", body),
  uploadVideo: (body: { accountId: number; name: string; type: string; size: number; dataUrl: string; title?: string }) =>
    send<VideoItem>("/videos/upload", "POST", body),
  deleteVideo: (id: number | string) => send<{ ok: boolean }>(`/videos/${id}`, "DELETE"),
  batchVideos: (accountId: number | string, count: number, deck?: string) =>
    send<{ created: VideoItem[]; requested: number; made: number; exhausted: boolean }>(
      "/videos/batch",
      "POST",
      { accountId: Number(accountId), count, deck },
    ),
  // Generation queue: one video at a time across all users. Enqueue → poll status → optional cancel.
  enqueueGen: (accountId: number | string, count: number, deckIds?: string[]) =>
    send<{ jobId: string; total: number }>("/gen-queue", "POST", { accountId: Number(accountId), count, deckIds }),
  genJobs: (scope?: "all") => get<GenQueueResponse>(`/gen-queue${scope === "all" ? "?scope=all" : ""}`),
  genWorker: () => get<{ worker: GenWorkerStatus }>("/gen-queue/worker"),
  genStatus: (jobId: string) => get<GenJobStatus>(`/gen-queue/${jobId}`),
  cancelGen: (jobId: string) => send<{ ok: boolean }>(`/gen-queue/${jobId}/cancel`, "POST", {}),
  queueOverview: (scope?: "all") => get<QueueOverview>(`/queue${scope === "all" ? "?scope=all" : ""}`),
  postVideoNow: (id: number | string, publishAt?: string) =>
    send<{ ok: boolean; youtubeId?: string; url?: string; scheduled?: boolean; removed?: boolean }>(
      `/videos/${id}/post-now`,
      "POST",
      { publishAt },
    ),
  // Statistics: every user sees their own channels; admins may pass scope="all" for all channels.
  // days = analytics window (7/30/90), summarized server-side from stored per-day rows.
  stats: (scope?: "mine" | "all", days?: number) => {
    const qs = new URLSearchParams();
    if (scope === "all") qs.set("scope", "all");
    if (days && days !== 30) qs.set("days", String(days));
    const s = qs.toString();
    return get<StatRow[]>(`/stats${s ? "?" + s : ""}`);
  },
  // Aggregate subscribers/views/videos across visible channels (Мои/Все) — for the dashboard KPIs.
  statsTotals: (scope?: "mine" | "all") =>
    get<ChannelTotals>(`/stats/totals${scope === "all" ? "?scope=all" : ""}`),
  // Platform-wide production totals, shown to every user on /statistics.
  summary: () => get<PlatformSummary>(`/summary`),
  refreshStats: (scope?: "mine" | "all") =>
    send<StatRow[]>(`/stats/refresh${scope === "all" ? "?scope=all" : ""}`, "POST", {}),
  refreshStatsDataOnly: (scope?: "mine" | "all", accountIds?: number[]) =>
    send<StatRow[]>(`/stats/refresh-data-only${scope === "all" ? "?scope=all" : ""}`, "POST", {
      ...(accountIds ? { accountIds } : {}),
    }),
  statsHistory: (accountId: number | string) => get<StatPoint[]>(`/stats/${accountId}/history`),
  adminAnalytics: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return get<AdminAnalytics>(`/admin/analytics${s ? "?" + s : ""}`);
  },
  // Per-user analytics for the Statistics page. Own channels by default; admins may pass
  // scope="all" to aggregate publishing activity across every channel.
  analytics: (scope?: "mine" | "all", from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (scope === "all") qs.set("scope", "all");
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const s = qs.toString();
    return get<UserAnalytics>(`/analytics${s ? "?" + s : ""}`);
  },
  // Error log: admin views/clears; any page can report a client-side error (fire-and-forget).
  errors: () => get<ErrorLogItem[]>("/errors"),
  clearErrors: () => send<{ ok: boolean }>("/errors", "DELETE"),
  notifications: (params?: {
    scope?: "mine" | "all";
    status?: "open" | "unread" | "all";
    userId?: number | string;
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.scope === "all") qs.set("scope", "all");
    if (params?.status) qs.set("status", params.status);
    if (params?.userId != null) qs.set("userId", String(params.userId));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const s = qs.toString();
    return get<NotificationItem[]>(`/notifications${s ? "?" + s : ""}`);
  },
  notificationCounts: (scope?: "mine" | "all") =>
    get<NotificationCounts>(`/notifications/counts${scope === "all" ? "?scope=all" : ""}`),
  readNotification: (id: number | string) => send<NotificationItem>(`/notifications/${id}/read`, "POST", {}),
  unreadNotification: (id: number | string) => send<NotificationItem>(`/notifications/${id}/unread`, "POST", {}),
  resolveNotification: (id: number | string) =>
    send<NotificationItem>(`/notifications/${id}/resolve`, "POST", {}),
  deleteNotification: (id: number | string) => send<{ ok: boolean }>(`/notifications/${id}`, "DELETE"),
  readAllNotifications: (scope?: "mine" | "all") =>
    send<{ ok: boolean; changed: number }>(
      `/notifications/read-all${scope === "all" ? "?scope=all" : ""}`,
      "POST",
      {},
    ),
  // Server health (admin-only): live CPU/RAM/disk + in-memory history + pipeline activity.
  system: () => get<SystemStatus>("/system"),
  reportClientError: (message: string, detail?: string, context?: string) =>
    send<{ ok: boolean }>("/client-error", "POST", { message, detail, context }).catch(() => ({
      ok: false,
    })),
};
