import { readFileSync, createReadStream } from "node:fs";
import { google } from "googleapis";

// NOTE: this module is loaded & run by the server; it reads the client-secret file at
// RUNTIME (never by the agent tooling). The path is supplied by config.

interface ClientCreds {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

function readCreds(path: string): ClientCreds {
  const j = JSON.parse(readFileSync(path, "utf8"));
  const c = j.web ?? j.installed ?? j;
  return { client_id: c.client_id, client_secret: c.client_secret, redirect_uris: c.redirect_uris };
}

function client(credsPath: string, redirectUri: string) {
  const c = readCreds(credsPath);
  return new google.auth.OAuth2(c.client_id, c.client_secret, redirectUri);
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** Build the Google consent URL to connect one channel (state carries the account id). */
export function buildAuthUrl(credsPath: string, redirectUri: string, state: string): string {
  return client(credsPath, redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

/** Exchange the consent code for tokens and fetch the connected channel's id/title. */
export async function exchangeAndGetChannel(
  credsPath: string,
  redirectUri: string,
  code: string,
): Promise<{ refreshToken: string | null; channelId: string | null; channelTitle: string | null }> {
  const oauth = client(credsPath, redirectUri);
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);
  const yt = google.youtube({ version: "v3", auth: oauth });
  const res = await yt.channels.list({ part: ["snippet"], mine: true });
  const ch = res.data.items?.[0];
  return {
    refreshToken: tokens.refresh_token ?? null,
    channelId: ch?.id ?? null,
    channelTitle: ch?.snippet?.title ?? null,
  };
}

export interface UploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  /** RFC3339 timestamp → schedule (video stays private until then). Omit = publish now. */
  publishAt?: string | null;
}

/** Upload a Short via the stored refresh token. Returns the new video id. */
export async function uploadShort(
  credsPath: string,
  redirectUri: string,
  refreshToken: string,
  o: UploadOptions,
): Promise<string | null> {
  const oauth = client(credsPath, redirectUri);
  oauth.setCredentials({ refresh_token: refreshToken });
  const yt = google.youtube({ version: "v3", auth: oauth });
  const res = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: o.title.slice(0, 100),
        description: o.description.slice(0, 4900),
        tags: o.tags,
        categoryId: "23", // Comedy
      },
      status: {
        privacyStatus: o.publishAt ? "private" : "public",
        publishAt: o.publishAt ?? undefined,
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: createReadStream(o.videoPath) },
  });
  return res.data.id ?? null;
}

