// Shared YouTube-Analytics date-range + summary helpers. Used by both index.ts (stats routes) AND
// registerTelegramRoutes (the in-bot stats menu), so the date math + stored-row summarizer live in ONE
// place. Moved VERBATIM from index.ts. Pure helpers + one db-summary fn (db passed in by the caller).
import type { Db } from "../db.ts";

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

// Refresh always pulls a WIDE 90-day window of per-day rows; the read endpoint then summarizes any
// 7/30/90-day sub-range from the stored daily rows (no extra YouTube calls per period switch).
export const ANALYTICS_FETCH_DAYS = 90;
export const ALLOWED_STAT_DAYS = [7, 30, 90] as const;

export function youtubeAnalyticsRange(now = new Date(), days = ANALYTICS_FETCH_DAYS): { from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 2);
  const to = isoDate(end);
  return { from: addDays(to, -(days - 1)), to };
}

export function clampStatDays(v: string | undefined): number {
  const n = Number(v);
  return (ALLOWED_STAT_DAYS as readonly number[]).includes(n) ? n : 30;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function summarizeStoredAnalytics(db: Db, accountId: number, from: string, to: string) {
  const rows = db.listDailyAnalytics([accountId], from, to);
  const summary = rows.reduce(
    (acc, r) => {
      acc.watchMinutes += r.watchMinutes;
      acc.engagedViews += r.engagedViews;
      acc.avgViewDuration += r.avgViewDuration * r.views;
      acc.avgViewPercentage += r.avgViewPercentage * r.views;
      acc.likes += r.likes;
      acc.comments += r.comments;
      acc.shares += r.shares;
      acc.subscribersGained += r.subscribersGained;
      acc.subscribersLost += r.subscribersLost;
      acc.views += r.views;
      return acc;
    },
    {
      views: 0,
      watchMinutes: 0,
      engagedViews: 0,
      avgViewDuration: 0,
      avgViewPercentage: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      subscribersGained: 0,
      subscribersLost: 0,
    },
  );
  if (summary.views > 0) {
    summary.avgViewDuration /= summary.views;
    summary.avgViewPercentage /= summary.views;
  }
  return summary;
}
