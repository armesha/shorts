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
  "https://www.googleapis.com/auth/yt-analytics.readonly",
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
): Promise<{ refreshToken: string | null; channelId: string | null; channelTitle: string | null; channelAvatar: string | null }> {
  const oauth = client(creds, redirectUri);
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);
  const yt = google.youtube({ version: "v3", auth: oauth });
  const res = await yt.channels.list({ part: ["snippet"], mine: true });
  const ch = res.data.items?.[0];
  const thumbs = ch?.snippet?.thumbnails;
  return {
    refreshToken: tokens.refresh_token ?? null,
    channelId: ch?.id ?? null,
    channelTitle: ch?.snippet?.title ?? null,
    channelAvatar: thumbs?.high?.url ?? thumbs?.medium?.url ?? thumbs?.default?.url ?? null,
  };
}

/**
 * Short human reason (RU) for a googleapis/OAuth failure — stored on the failed history row so the
 * user can see WHY an auto-upload failed (quota, revoked token, no channel, API disabled, …).
 * Token endpoint → error/error_description are STRINGS; YouTube Data API → `error` is an OBJECT
 * { code, message, errors:[{reason,message}] } — extracting .message avoids "[object Object]".
 */
/**
 * Pull the human message string + HTTP status + API reason out of a googleapis/OAuth error.
 * Shared by `ytErrorReason` (human text) and `isYtAuthError` (classification) so they never drift.
 */
function extractYtError(err: unknown): { s: string; status: number | undefined; reason: string } {
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error_description?: string; error?: unknown } };
    errors?: { message?: string; reason?: string }[];
    message?: string;
  };
  const data = e?.response?.data;
  const status = e?.response?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  const apiErr =
    data?.error && typeof data.error === "object"
      ? (data.error as { message?: string; errors?: { reason?: string; message?: string }[] })
      : null;
  const reason = apiErr?.errors?.[0]?.reason ?? e?.errors?.[0]?.reason ?? "";
  const errCode = typeof data?.error === "string" ? data.error : ""; // OAuth token endpoint: "invalid_grant" etc.
  const raw =
    data?.error_description ||
    (typeof data?.error === "string" ? data.error : apiErr?.message) ||
    apiErr?.errors?.[0]?.message ||
    e?.errors?.[0]?.message ||
    e?.message ||
    String(err);
  // Include the error code + reason in the matched string so /invalid_grant/ etc. fire even when the
  // human-readable text is in error_description.
  const s = `${String(raw)} ${errCode} ${reason}`.trim();
  return { s, status, reason };
}

/**
 * True ONLY for definitive OAuth/token failures that mean the channel must be RECONNECTED
 * (revoked/expired refresh token, 401, no YouTube channel on the Google account, missing scope).
 * Deliberately FALSE for quota / rate-limit / per-channel upload-cap / API-disabled — those are
 * transient or project-level, NOT the token, so they must never flip a channel to "needs reconnect".
 */
export function isYtAuthError(err: unknown): boolean {
  const { s, status } = extractYtError(err);
  // Transient / project-level walls — explicitly NOT a dead token.
  if (/uploadLimitExceeded|quotaExceeded|dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|rateLimit|\bquota\b/i.test(s))
    return false;
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project/i.test(s)) return false;
  // Definitive token death → reconnect required.
  if (/invalid_grant|unauthorized_client|invalid_client/i.test(s)) return true;
  if (/youtubeSignupRequired|channelNotFound/i.test(s)) return true;
  if (status === 401 || /\bunauthorized\b|authorizationRequired/i.test(s)) return true;
  if (/insufficient|scope/i.test(s)) return true;
  return false;
}

export function ytErrorReason(err: unknown): string {
  const { s, status, reason } = extractYtError(err);
  // Три РАЗНЫХ лимита YouTube (403), которые постоянно путают — держим их раздельно, чтобы в истории
  // было видно, какая стена и что её снимает. uploadLimitExceeded = суточный потолок ЗАГРУЗОК самого
  // канала (НЕ квота API); quotaExceeded = дневной бюджет API проекта; rateLimit = слишком частые запросы.
  if (/uploadLimitExceeded/i.test(s))
    return `Достигнут суточный лимит загрузок самого YouTube-канала (ограничение YouTube, не квота API) — обычно снимается примерно через 24 часа; поднять потолок помогает верификация канала по номеру телефона (uploadLimitExceeded).`;
  if (/quotaExceeded|dailyLimitExceeded|quota/i.test(s))
    return `Исчерпана суточная квота YouTube Data API проекта (хватает примерно на 6 загрузок в сутки) — сбрасывается в полночь по тихоокеанскому времени (quotaExceeded).`;
  if (/userRateLimitExceeded|rateLimitExceeded|rateLimit/i.test(s))
    return `Слишком много запросов к YouTube за короткое время — подождите минуту и повторите${reason ? ` (${reason})` : ""}.`;
  if (/youtubeSignupRequired|channelNotFound/i.test(s))
    return `У Google-аккаунта канала нет YouTube-канала — переподключите канал.`;
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project/i.test(s))
    return `В проекте Google-ключа не включён YouTube Data API v3.`;
  if (/invalid_grant/i.test(s)) return `Доступ канала отозван или истёк — переподключите канал.`;
  if (/unauthorized_client|invalid_client/i.test(s)) return `Токен канала не принят — переподключите канал.`;
  if (status === 401 || /\bunauthorized\b|authorizationRequired/i.test(s))
    return `YouTube не принял авторизацию (401) — переподключите канал.`;
  if (/insufficient|scope|forbidden/i.test(s)) return `Недостаточно прав токена — переподключите канал.`;
  const short = s.replace(/\s+/g, " ").trim().slice(0, 300);
  return short || "неизвестная ошибка";
}

/**
 * YouTube rejects `<` and `>` anywhere in a video title/description with
 * `invalidTitle`/`invalidDescription` (the API treats them as forbidden markup chars).
 * Some source decks legitimately contain them (code snippets like `<KEY_ID>`, UI paths
 * like `DevTools > Network`), so swap to look-alike single guillemets at the upload
 * boundary — the one choke point every upload passes through. Keeps meaning readable.
 */
function sanitizeYtText(s: string): string {
  return s.replace(/</g, "‹").replace(/>/g, "›");
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
        title: sanitizeYtText(o.title).slice(0, 100),
        description: sanitizeYtText(o.description).slice(0, 4900),
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
