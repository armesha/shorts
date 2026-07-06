// Shared dependency bag threaded into every carved route module. index.ts builds ONE instance
// (makeRouteDeps) wiring the foundation singletons (auth-session, deck-access, notifier,
// buildLibraryVideo) plus the remaining cross-cutting closures that were inline in the god-file
// (account access, analytics-row builders, avatar helpers, the generation rate-limit wrappers).
// All bodies are VERBATIM from index.ts — only the closed-over module globals became constructor args.
import type { Db, Account } from "../db.ts";
import type { ClientCreds } from "../services/youtube.ts";
import { parseCreds } from "../services/youtube.ts";
import type { AuthSession, Replyish } from "../infra/auth-session.ts";
import type { DeckAccess } from "../services/deck-access.ts";
import type { Notifier } from "../services/notify-stream.ts";
import type { BuildLibraryVideo } from "../services/library-build.ts";
import type { RefreshHooks } from "../services/stats-refresh.ts";
import { uid } from "../infra/auth-session.ts";
import { isSuperAdminUser } from "../auth.ts";
import {
  RATE_LIMIT_MESSAGE,
  RateLimitError,
  checkRateLimit,
  heavyActiveKey,
  withActiveLimit,
  withGlobalRenderSlot,
} from "../infra/rate-limits.ts";
import { dailyScheduleLimitError, describeShortsSchedulePolicy, forbiddenSuperAdminScheduleTimes, isMgsUser } from "../infra/account-limits.ts";
import {
  youtubeAnalyticsRange,
  asArray,
} from "../services/analytics-range.ts";

export type LimitedReplyish = Replyish & { header: (k: string, v: string) => unknown };

export type StatRow = {
  accountId: number;
  channelName: string;
  ytChannelTitle: string | null;
  ytChannelId: string | null;
  ownerUsername: string | null;
  connected: boolean;
  latest: unknown;
  prev: unknown;
  analytics: unknown;
  error: string | null;
};

export interface RouteDeps {
  auth: AuthSession;
  deckAccess: DeckAccess;
  notifier: Notifier;
  buildLibraryVideo: BuildLibraryVideo;
  // Failure side-effects for refreshAccountStats() — shared by the HTTP refresh route and the Telegram
  // stats bot so both behave identically (server log + error_log row + owner notification).
  statsRefreshHooks: RefreshHooks;
  outputDir: string;
  redirectUri: string;
  webOrigin: string;
  // Per-channel Google creds (parsed from the key the channel was connected with).
  accountCreds: (account: Account) => ClientCreds | null;
  // Legacy avatar set endpoint. Channel display avatars come from YouTube thumbnails.
  listAvatarFiles: () => string[];
  // Account access
  accessibleAccount: (req: unknown, reply: Replyish, id: number) => Account | null;
  accountOwnerId: (req: unknown, account: Account) => number;
  rejectScheduleLimit: (req: unknown, reply: Replyish, schedule: unknown, acc: Account | null, excludeAccountId?: number, channelLang?: string | null) => boolean;
  rejectIfNotConnected: (reply: Replyish, acc: Account) => boolean;
  visibleAccounts: (req: unknown, scope?: string, readonly?: boolean) => Account[];
  visibleAccount: (req: unknown, id: number, readonly?: boolean) => Account | null;
  notificationVisible: (req: unknown, notificationId: number) => boolean;
  // Analytics row builders
  accountAnalyticsPayload: (accountId: number, days?: number) => unknown;
  statRow: (a: Account, error?: string | null, days?: number) => StatRow;
  // Generation rate-limit wrappers
  sendGenerationRateLimit: (reply: LimitedReplyish, retryAfterMs?: number) => unknown;
  enforceGenerationWindow: (req: unknown, reply: LimitedReplyish, route: string, rule: { limit: number; windowMs: number }) => boolean;
  runHeavyGenerationLimited: <T>(req: unknown, reply: LimitedReplyish, route: string, fn: () => Promise<T>) => Promise<T | unknown>;
}

export function makeRouteDeps(input: {
  db: Db;
  auth: AuthSession;
  deckAccess: DeckAccess;
  notifier: Notifier;
  buildLibraryVideo: BuildLibraryVideo;
  statsRefreshHooks: RefreshHooks;
  outputDir: string;
  redirectUri: string;
  webOrigin: string;
  accountCreds: (account: Account) => ClientCreds | null;
  listAvatarFiles: () => string[];
}): RouteDeps {
  const { db, auth, deckAccess, notifier, buildLibraryVideo, statsRefreshHooks, outputDir, redirectUri, webOrigin, accountCreds } = input;
    const { isAdminReq, isAdminLikeReq, isSuperAdminReq } = auth;

  function sendGenerationRateLimit(reply: LimitedReplyish, retryAfterMs = 1_000): unknown {
    reply.header("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
    return reply.code(429).send({ error: RATE_LIMIT_MESSAGE });
  }

  function enforceGenerationWindow(
    req: unknown,
    reply: LimitedReplyish,
    route: string,
    rule: { limit: number; windowMs: number },
  ): boolean {
    if (isAdminReq(req)) return true;
    const hit = checkRateLimit(`user:${uid(req)}:${route}:window`, rule);
    if (!hit.ok) {
      sendGenerationRateLimit(reply, hit.retryAfterMs);
      return false;
    }
    return true;
  }

  async function runHeavyGenerationLimited<T>(
    req: unknown,
    reply: LimitedReplyish,
    route: string,
    fn: () => Promise<T>,
  ): Promise<T | unknown> {
    try {
      const isAdmin = isAdminReq(req);
      // Two ceilings: per-user (fairness) AND a process-wide render cap (shared with the pack routes) so
      // N users can't each spawn a Chrome+ffmpeg at once and OOM the host. Excess → 429 (RateLimitError).
      return await withActiveLimit(heavyActiveKey(uid(req), isAdmin, route), isAdmin ? 2 : 1, () =>
        withGlobalRenderSlot(fn),
      );
    } catch (e) {
      if (e instanceof RateLimitError) return sendGenerationRateLimit(reply, e.retryAfterMs);
      throw e;
    }
  }

    // Only the main admin may edit any channel; regular admins stay locked to their own channels.
    function accessibleAccount(req: unknown, reply: Replyish, id: number): Account | null {
      const a = db.getAccount(id);
      if (!a || (!isSuperAdminReq(req) && a.userId !== uid(req))) {
        reply.code(404).send({ error: "Канал не найден" });
        return null;
      }
    return a;
  }

  function accountOwnerId(req: unknown, account: Account): number {
    return account.userId ?? uid(req);
  }

  // Schedule guard: (option B) only a CONNECTED channel may carry a posting schedule, and the daily cap
  // is counted PER Google key (oauth_client) — YouTube's upload quota is per Cloud project, not per channel.
  function rejectScheduleLimit(
    req: unknown,
    reply: Replyish,
    schedule: unknown,
    acc: Account | null,
    excludeAccountId?: number,
    channelLang?: string | null,
  ): boolean {
    if (!Array.isArray(schedule)) return false;
    if (schedule.length > 0 && (!acc || acc.status !== "connected")) {
      reply.code(400).send({ error: "Подключите канал к YouTube — расписание можно задавать только у подключённого канала." });
      return true;
    }
    const otherSlots = acc?.oauthClientId != null ? db.scheduleSlotsForKey(acc.oauthClientId, excludeAccountId) : 0;
    // Per-channel cap follows the channel OWNER's profile: admins keep 20/day, mgs keeps the legacy
    // profile, every other non-admin channel is capped at 5/day.
    // On create (acc === null) the owner is the requester (createAccount sets userId: uid(req)).
    const ownerId = acc?.userId ?? uid(req);
    const owner = db.getUserById(ownerId);
    const isAdminOwner = owner?.role === "admin";
    const isSuperAdminOwner = isSuperAdminUser(owner);
    const isMgsOwner = isMgsUser(owner);
    if (isSuperAdminOwner) {
      const scheduleLang = channelLang ?? acc?.channelLang ?? acc?.lang ?? null;
      const forbiddenTimes = forbiddenSuperAdminScheduleTimes(schedule, scheduleLang);
      if (forbiddenTimes.length) {
        reply.code(400).send({
          error: `Для каналов главного админа расписание должно попадать в языковые Shorts-окна. ${describeShortsSchedulePolicy(scheduleLang)}. Уберите: ${forbiddenTimes.join(", ")}.`,
        });
        return true;
      }
    }
    const limitError = dailyScheduleLimitError(schedule.length, otherSlots, isAdminOwner, isSuperAdminOwner, isMgsOwner);
    if (!limitError) return false;
    reply.code(400).send({ error: limitError });
    return true;
  }

  // Option B: a channel must be connected to YouTube before videos can be prepared/queued for it.
  function rejectIfNotConnected(reply: Replyish, acc: Account): boolean {
    if (acc.status === "connected") return false;
    reply.code(400).send({ error: "Сначала подключите канал к YouTube — до подключения нельзя готовить видео в очередь." });
    return true;
  }

  function notificationVisible(req: unknown, notificationId: number): boolean {
    const n = db.getNotification(notificationId);
    return !!n && (isAdminReq(req) || n.userId === uid(req));
  }

  // ---- Channel visibility ----
  // `scope=all` is available to admins and moderators for read-only views. Mutating flows still
  // require the real admin role, so a moderator cannot turn a visual aggregate into write access.
  function visibleAccounts(req: unknown, scope?: string, readonly = false): Account[] {
    if (scope === "all" && (readonly ? isAdminLikeReq(req) : isAdminReq(req))) return db.listAccounts();
    return db.listAccountsByUser(uid(req));
  }
  function visibleAccount(req: unknown, id: number, readonly = false): Account | null {
    const a = db.getAccount(id);
    if (!a) return null;
    if (readonly && isAdminLikeReq(req)) return a;
    return a.userId === uid(req) || isSuperAdminReq(req) ? a : null;
  }

  function accountAnalyticsPayload(accountId: number, days = 30) {
    const latest = db.latestSnapshot(accountId);
    const range = youtubeAnalyticsRange(new Date(), days);
    const daily = db.listDailyAnalytics([accountId], range.from, range.to);
    const summary = daily.reduce(
      (acc, r) => {
        acc.views += r.views;
        acc.engagedViews += r.engagedViews;
        acc.watchMinutes += r.watchMinutes;
        acc.likes += r.likes;
        acc.dislikes += r.dislikes;
        acc.comments += r.comments;
        acc.shares += r.shares;
        acc.subscribersGained += r.subscribersGained;
        acc.subscribersLost += r.subscribersLost;
        if (r.views > 0) {
          acc._durationWeighted += r.avgViewDuration * r.views;
          acc._percentageWeighted += r.avgViewPercentage * r.views;
        }
        return acc;
      },
      {
        views: 0,
        engagedViews: 0,
        watchMinutes: 0,
        avgViewDuration: 0,
        avgViewPercentage: 0,
        likes: 0,
        dislikes: 0,
        comments: 0,
        shares: 0,
        subscribersGained: 0,
        subscribersLost: 0,
        _durationWeighted: 0,
        _percentageWeighted: 0,
      },
    );
    if (summary.views > 0) {
      summary.avgViewDuration = summary._durationWeighted / summary.views;
      summary.avgViewPercentage = summary._percentageWeighted / summary.views;
    }
    const { _durationWeighted, _percentageWeighted, ...cleanSummary } = summary;
    return {
      range,
      days,
      status: latest?.analyticsStatus ?? null,
      error: latest?.analyticsError ?? null,
      dataThrough: latest?.dataThrough ?? db.latestDailyAnalyticsDate(accountId),
      takenAt: latest?.analyticsTakenAt ?? null,
      summary: cleanSummary,
      daily,
      topVideos: asArray(db.latestReportCache(accountId, "topVideos")?.payload),
      trafficSources: asArray(db.latestReportCache(accountId, "trafficSources")?.payload),
      devices: asArray(db.latestReportCache(accountId, "devices")?.payload),
      countries: asArray(db.latestReportCache(accountId, "countries")?.payload),
      subscribedStatus: asArray(db.latestReportCache(accountId, "subscribedStatus")?.payload),
      demographics: asArray(db.latestReportCache(accountId, "demographics")?.payload),
      sharing: asArray(db.latestReportCache(accountId, "sharing")?.payload),
      retention: asArray(db.latestReportCache(accountId, "retention")?.payload),
    };
  }

  // One row for the stats table: current totals + the previous snapshot (frontend computes +/-).
  function statRow(a: Account, error?: string | null, days = 30) {
    const { latest, prev } = db.twoLatestSnapshots(a.id);
    const owner = a.userId != null ? db.getUserById(a.userId) : null;
    return {
      accountId: a.id,
      channelName: a.channelName,
      ytChannelTitle: a.ytChannelTitle,
      ytChannelId: a.ytChannelId,
      ownerUsername: owner?.username ?? null,
      connected: a.status === "connected",
      latest,
      prev,
      analytics: accountAnalyticsPayload(a.id, days),
      error: error ?? null,
    };
  }

  return {
    auth,
    deckAccess,
    notifier,
    buildLibraryVideo,
    statsRefreshHooks,
    outputDir,
    redirectUri,
    webOrigin,
    accountCreds,
    listAvatarFiles: input.listAvatarFiles,
    accessibleAccount,
    accountOwnerId,
    rejectScheduleLimit,
    rejectIfNotConnected,
    visibleAccounts,
    visibleAccount,
    notificationVisible,
    accountAnalyticsPayload,
    statRow,
    sendGenerationRateLimit,
    enforceGenerationWindow,
    runHeavyGenerationLimited,
  };
}

// Re-export for route modules that just need parseCreds typing convenience.
export { parseCreds };
