import { google } from "googleapis";
import type { ClientCreds } from "./youtube.ts";

// Channel statistics are read with the SAME OAuth the upload flow already uses
// (scope youtube.readonly) — no extra consent / re-auth needed. We call
// channels.list(part=statistics,snippet), which returns the channel's lifetime totals plus title/avatar.

export interface ChannelStats {
  subscribers: number;
  views: number;
  videos: number;
  channelId: string | null;
  channelTitle: string | null;
  channelAvatar: string | null;
}

/** Fetch one channel's current YouTube totals using its owner's creds + stored refresh token. */
export async function fetchChannelStats(
  creds: ClientCreds,
  redirectUri: string,
  refreshToken: string,
): Promise<ChannelStats> {
  const oauth = new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
  oauth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: "v3", auth: oauth });
  const res = await yt.channels.list({ part: ["statistics", "snippet"], mine: true });
  const ch = res.data.items?.[0];
  const s = ch?.statistics;
  const thumbs = ch?.snippet?.thumbnails;
  return {
    subscribers: Number(s?.subscriberCount ?? 0),
    views: Number(s?.viewCount ?? 0),
    videos: Number(s?.videoCount ?? 0),
    channelId: ch?.id ?? null,
    channelTitle: ch?.snippet?.title ?? null,
    channelAvatar: thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null,
  };
}
