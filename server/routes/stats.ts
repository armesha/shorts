// Channel statistics + analytics: snapshot rows with deltas, audience totals, platform summary,
// per-user analytics, and the YouTube refresh endpoints (full + data-only). Handlers moved VERBATIM
// from index.ts; the per-channel refresh shares stats-refresh.ts with the Telegram bot.
import type { FastifyInstance } from "fastify";
import type { Db } from "../db.ts";
import { fetchChannelStats } from "../services/stats.ts";
import { refreshAccountStats } from "../services/stats-refresh.ts";
import { buildUserAnalytics } from "../services/user-analytics.ts";
import { ytErrorMessage } from "../services/youtube-errors.ts";
import { youtubeAnalyticsRange, summarizeStoredAnalytics, clampStatDays } from "../services/analytics-range.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps } from "./deps.ts";

export function registerStatsRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { requireAdmin } = deps.auth;
  const { visibleAccounts, visibleAccount, statRow, accountCreds, statsRefreshHooks, redirectUri } = deps;
  const REDIRECT_URI = redirectUri;
  const summarizeStored = (accountId: number, from: string, to: string) =>
    summarizeStoredAnalytics(db, accountId, from, to);

  app.get("/api/stats", async (req) => {
    const q = req.query as { scope?: string; days?: string };
    const days = clampStatDays(q.days);
    const me = uid(req);
    const isAdmin = db.getUserById(me)?.role === "admin";
    // Everyone may view all channels' stats; the owner's identity is hidden from non-admins.
    return visibleAccounts(req, q.scope, true).map((a) => {
      const row = statRow(a, null, days);
      if (!isAdmin && a.userId !== me) row.ownerUsername = null;
      return row;
    });
  });

  // Aggregate audience totals (subscribers / views / videos) summed from each visible channel's LATEST
  // snapshot. Lightweight: DB-only, no YouTube calls — powers the dashboard «Аудитория» KPIs and its
  // Мои/Все toggle. Same read access as GET /api/stats (scope=all readable by anyone; refresh stays
  // admin-gated elsewhere). `withData` = how many of the channels actually have a stored snapshot yet.
  app.get("/api/stats/totals", async (req) => {
    const scope = (req.query as { scope?: string }).scope;
    const accounts = visibleAccounts(req, scope, true);
    let subscribers = 0;
    let views = 0;
    let videos = 0;
    let withData = 0;
    for (const a of accounts) {
      const s = db.latestSnapshot(a.id);
      if (!s) continue;
      subscribers += s.subscribers;
      views += s.views;
      videos += s.videos;
      withData += 1;
    }
    return { scope: scope === "all" ? "all" : "mine", channels: accounts.length, withData, subscribers, views, videos };
  });

  // Platform-wide production totals (queue / uploaded / scheduled / channels) — visible to every
  // signed-in user. No per-user breakdown or PII; just the aggregate counters.
  app.get("/api/summary", async () => db.platformSummary());

  // Per-user analytics — any signed-in user, scoped to their OWN channels. Admins may pass
  // ?scope=all to aggregate publishing activity across EVERY channel (matches the «Все каналы» tab).
  app.get("/api/analytics", async (req) => {
    const q = (req.query as { from?: string; to?: string; scope?: string }) ?? {};
    const allChannels = q.scope === "all" && db.getUserById(uid(req))?.role === "admin";
    return buildUserAnalytics(db, uid(req), { from: q.from, to: q.to }, { allChannels });
  });

  // Poll YouTube for each visible+connected channel, store a fresh snapshot, return rows with deltas.
  // Each channel is queried with ITS OWNER's Google key (per-user isolation), all in parallel.
  app.post("/api/stats/refresh", async (req) => {
    const scope = (req.query as { scope?: string }).scope;
    const accounts = visibleAccounts(req, scope);
    const errors = new Map<number, string>();
    const analyticsRange = youtubeAnalyticsRange();
    await Promise.all(
      accounts.map(async (a) => {
        if (a.status !== "connected") return;
        // Shared with the Telegram bot — see refreshAccountStats() in stats-refresh.ts. The creds/token
        // null-checks, 15-min/6-h TTL caching, snapshot write and error/notification side-effects all
        // live there now; statsRefreshHooks replays exactly the log+error_log+notification this route did.
        const { error } = await refreshAccountStats({
          db,
          account: a,
          creds: accountCreds(a),
          refreshToken: db.getRefreshToken(a.id),
          redirectUri: REDIRECT_URI,
          analyticsRange,
          summarizeStored,
          formatStatsError: ytErrorMessage,
          hooks: statsRefreshHooks,
        });
        if (error) errors.set(a.id, error);
      }),
    );
    return accounts.map((a) => statRow(a, errors.get(a.id)));
  });

  app.post("/api/stats/refresh-data-only", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const q = (req.query as { scope?: string }) ?? {};
    const body = (req.body as { accountIds?: number[] }) ?? {};
    const requested = new Set(
      Array.isArray(body.accountIds) ? body.accountIds.map(Number).filter((id) => Number.isFinite(id)) : [],
    );
    if (Array.isArray(body.accountIds) && requested.size === 0) return [];

    const all = visibleAccounts(req, q.scope);
    const accounts = all.filter((a) => {
      if (a.status !== "connected") return false;
      if (requested.size) return requested.has(a.id);
      return true;
    });
    const errors = new Map<number, string>();
    const analyticsRange = youtubeAnalyticsRange();
    await Promise.all(
      accounts.map(async (a) => {
        const creds = accountCreds(a);
        const token = db.getRefreshToken(a.id);
        if (!creds) {
          errors.set(a.id, "Нет Google-ключа у владельца канала");
          return;
        }
        if (!token) {
          errors.set(a.id, "Канал не подключён к YouTube");
          return;
        }
        try {
          const totals = await fetchChannelStats(creds, REDIRECT_URI, token);
          db.setYouTube(a.id, {
            refreshToken: token,
            channelId: totals.channelId ?? a.ytChannelId,
            channelTitle: totals.channelTitle ?? a.ytChannelTitle,
            channelAvatar: totals.channelAvatar,
          });
          const latest = db.latestSnapshot(a.id);
          const analyticsSummary = summarizeStoredAnalytics(db, a.id, analyticsRange.from, analyticsRange.to);
          db.addChannelSnapshot({
            accountId: a.id,
            subscribers: totals.subscribers,
            views: totals.views,
            videos: totals.videos,
            analyticsStatus: "data_only",
            analyticsError: null,
            dataThrough: latest?.dataThrough ?? db.latestDailyAnalyticsDate(a.id),
            watchMinutes: analyticsSummary.watchMinutes,
            engagedViews: analyticsSummary.engagedViews,
            avgViewDuration: analyticsSummary.avgViewDuration,
            avgViewPercentage: analyticsSummary.avgViewPercentage,
            likes: analyticsSummary.likes,
            comments: analyticsSummary.comments,
            shares: analyticsSummary.shares,
            subscribersGained: analyticsSummary.subscribersGained,
            subscribersLost: analyticsSummary.subscribersLost,
            analyticsTakenAt: latest?.analyticsTakenAt ?? null,
          });
        } catch (err) {
          app.log.error({ err: String(err), accountId: a.id }, "youtube data-only refresh failed");
          const msg = ytErrorMessage(err);
          db.addError({
            source: "server",
            message: "Статистика YouTube Data: " + msg,
            detail: (err as Error)?.stack ?? null,
            context: `stats data-only refresh account=${a.id}`,
            userId: a.userId ?? null,
          });
          errors.set(a.id, msg);
        }
      }),
    );
    return accounts.map((a) => statRow(a, errors.get(a.id)));
  });

  app.get("/api/stats/:id/history", async (req, reply) => {
    // Read-only snapshot history of any channel — visible to every signed-in user (matches the
    // «Все каналы» stats view; same harmless subscribers/views series already shown on the card).
    const a = visibleAccount(req, Number((req.params as { id: string }).id), true);
    if (!a) return reply.code(404).send({ error: "Канал не найден" });
    return db.listChannelSnapshots(a.id);
  });
}
