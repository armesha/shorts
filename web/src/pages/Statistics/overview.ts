import type { StatRow, YoutubeBreakdownRow, YoutubeTopVideo } from "../../lib/api";

export interface OverviewDailyPoint {
  date: string;
  views: number;
  watchMinutes: number;
  engagedViews: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface OverviewTopVideo extends YoutubeTopVideo {
  accountId: number;
  channelTitle: string;
  ownerUsername: string | null;
}

export interface OverviewTopChannel {
  accountId: number;
  channelTitle: string;
  ytChannelId: string | null;
  ownerUsername: string | null;
  subscribers: number;
  publicViews: number;
  analyticsViews: number;
  watchMinutes: number;
  avgViewDuration: number;
  subscribersNet: number;
}

export interface StatsOverviewData {
  channels: number;
  connected: number;
  subscribers: number;
  publicViews: number;
  videos: number;
  analyticsChannels: number;
  analyticsViews: number;
  watchMinutes: number;
  engagedViews: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  dislikes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  dataThrough: string | null;
  daily: OverviewDailyPoint[];
  topVideos: OverviewTopVideo[];
  topChannels: OverviewTopChannel[];
  trafficSources: YoutubeBreakdownRow[];
  devices: YoutubeBreakdownRow[];
  countries: YoutubeBreakdownRow[];
}

export function buildOverview(rows: StatRow[]): StatsOverviewData {
  const daily = new Map<string, OverviewDailyPoint>();
  const topVideos: OverviewTopVideo[] = [];
  const topChannels: OverviewTopChannel[] = [];
  const trafficSources: YoutubeBreakdownRow[] = [];
  const devices: YoutubeBreakdownRow[] = [];
  const countries: YoutubeBreakdownRow[] = [];
  const overview: StatsOverviewData = {
    channels: rows.length,
    connected: 0,
    subscribers: 0,
    publicViews: 0,
    videos: 0,
    analyticsChannels: 0,
    analyticsViews: 0,
    watchMinutes: 0,
    engagedViews: 0,
    avgViewDuration: 0,
    avgViewPercentage: 0,
    likes: 0,
    dislikes: 0,
    comments: 0,
    shares: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    dataThrough: null,
    daily: [],
    topVideos,
    topChannels,
    trafficSources: [],
    devices: [],
    countries: [],
  };
  let durationWeighted = 0;
  let percentageWeighted = 0;

  for (const row of rows) {
    if (row.connected) overview.connected += 1;
    if (row.latest) {
      overview.subscribers += row.latest.subscribers;
      overview.publicViews += row.latest.views;
      overview.videos += row.latest.videos;
    }

    const analytics = row.analytics;
    const summary = analytics.summary;
    const hasAnalytics = summary.views > 0 || analytics.daily.length > 0 || analytics.topVideos.length > 0;
    if (hasAnalytics) overview.analyticsChannels += 1;
    if (analytics.dataThrough && (!overview.dataThrough || analytics.dataThrough > overview.dataThrough)) {
      overview.dataThrough = analytics.dataThrough;
    }

    overview.analyticsViews += summary.views;
    overview.watchMinutes += summary.watchMinutes;
    overview.engagedViews += summary.engagedViews;
    overview.likes += summary.likes;
    overview.dislikes += summary.dislikes;
    overview.comments += summary.comments;
    overview.shares += summary.shares;
    overview.subscribersGained += summary.subscribersGained;
    overview.subscribersLost += summary.subscribersLost;
    if (summary.views > 0) {
      durationWeighted += summary.avgViewDuration * summary.views;
      percentageWeighted += summary.avgViewPercentage * summary.views;
    }

    for (const point of analytics.daily) {
      const current =
        daily.get(point.date) ??
        {
          date: point.date,
          views: 0,
          watchMinutes: 0,
          engagedViews: 0,
          subscribersGained: 0,
          subscribersLost: 0,
        };
      current.views += point.views;
      current.watchMinutes += point.watchMinutes;
      current.engagedViews += point.engagedViews;
      current.subscribersGained += point.subscribersGained;
      current.subscribersLost += point.subscribersLost;
      daily.set(point.date, current);
    }

    const channelTitle = row.ytChannelTitle || row.channelName;
    for (const video of analytics.topVideos) {
      topVideos.push({
        ...video,
        accountId: row.accountId,
        channelTitle,
        ownerUsername: row.ownerUsername,
      });
    }
    topChannels.push({
      accountId: row.accountId,
      channelTitle,
      ytChannelId: row.ytChannelId,
      ownerUsername: row.ownerUsername,
      subscribers: row.latest?.subscribers ?? 0,
      publicViews: row.latest?.views ?? 0,
      analyticsViews: summary.views,
      watchMinutes: summary.watchMinutes,
      avgViewDuration: summary.avgViewDuration,
      subscribersNet: summary.subscribersGained - summary.subscribersLost,
    });
    trafficSources.push(...analytics.trafficSources);
    devices.push(...analytics.devices);
    countries.push(...analytics.countries);
  }

  if (overview.analyticsViews > 0) {
    overview.avgViewDuration = durationWeighted / overview.analyticsViews;
    overview.avgViewPercentage = percentageWeighted / overview.analyticsViews;
  }

  overview.daily = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  overview.topVideos = topVideos.sort((a, b) => b.views - a.views);
  overview.topChannels = topChannels
    .sort((a, b) => (b.analyticsViews || b.publicViews) - (a.analyticsViews || a.publicViews));
  overview.trafficSources = mergeBreakdowns(trafficSources);
  overview.devices = mergeBreakdowns(devices);
  overview.countries = mergeBreakdowns(countries);
  return overview;
}

export function mergeBreakdowns(rows: YoutubeBreakdownRow[]): YoutubeBreakdownRow[] {
  const byKey = new Map<string, YoutubeBreakdownRow & { _durationWeighted: number }>();
  for (const row of rows) {
    const key = row.key || "unknown";
    const current =
      byKey.get(key) ??
      {
        key,
        views: 0,
        engagedViews: 0,
        watchMinutes: 0,
        avgViewDuration: 0,
        _durationWeighted: 0,
      };
    current.views += row.views;
    current.engagedViews += row.engagedViews;
    current.watchMinutes += row.watchMinutes;
    if (row.avgViewDuration && row.views > 0) current._durationWeighted += row.avgViewDuration * row.views;
    byKey.set(key, current);
  }
  return [...byKey.values()]
    .map(({ _durationWeighted, ...row }) => ({
      ...row,
      avgViewDuration: row.views > 0 ? _durationWeighted / row.views : 0,
    }))
    .sort((a, b) => b.views - a.views);
}
