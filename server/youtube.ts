import { readFileSync, createReadStream } from "node:fs";
import { google } from "googleapis";

// Loaded & run by the SERVER (never the agent tooling). Client credentials come either from a
// user's uploaded client_secret JSON (multi-user) or, as a fallback, the global client-secret file.

export interface ClientCreds {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
}

/** Parse a Google client_secret JSON string (web/installed/raw shape) into ClientCreds. */
export function parseCreds(json: string): ClientCreds {
  const j = JSON.parse(json);
  const c = j.web ?? j.installed ?? j;
  if (!c?.client_id || !c?.client_secret) throw new Error("В JSON нет client_id/client_secret");
  return { client_id: c.client_id, client_secret: c.client_secret, redirect_uris: c.redirect_uris };
}

/** Read + parse the global client-secret file (fallback / admin default). */
export function readCredsFile(path: string): ClientCreds {
  return parseCreds(readFileSync(path, "utf8"));
}

function client(creds: ClientCreds, redirectUri: string) {
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri);
}

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** Build the Google consent URL to connect one channel (state carries the account id). */
export function buildAuthUrl(creds: ClientCreds, redirectUri: string, state: string): string {
  return client(creds, redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

/** Exchange the consent code for tokens and fetch the connected channel's id/title. */
export async function exchangeAndGetChannel(
  creds: ClientCreds,
  redirectUri: string,
  code: string,
): Promise<{ refreshToken: string | null; channelId: string | null; channelTitle: string | null }> {
  const oauth = client(creds, redirectUri);
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

/** Upload a Short with the channel's stored refresh token + its owner's client creds. */
export async function uploadShort(
  creds: ClientCreds,
  redirectUri: string,
  refreshToken: string,
  o: UploadOptions,
): Promise<string | null> {
  const oauth = client(creds, redirectUri);
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
