// Public view of a stored Google OAuth client (client_secret JSON) for the Settings keys UI.
// client_id is not a secret (it appears in the consent URL); client_secret_json never leaves the
// server. We shorten client_id only to keep the UI tidy. Moved VERBATIM from index.ts.
import type { OAuthClientRow } from "../db.ts";

export const maskClientId = (id: string): string => {
  const core = id.replace(/\.apps\.googleusercontent\.com$/i, "");
  const head = core.split("-")[0] || core.slice(0, 12);
  const tail = core.slice(-6);
  return head && tail && head.length + tail.length < core.length ? `${head}…${tail}` : core.slice(0, 28);
};

export const publicClient = (c: OAuthClientRow) => ({
  id: c.id,
  label: c.label,
  clientIdShort: maskClientId(c.clientId),
  projectId: c.projectId,
  createdAt: c.createdAt,
  channelCount: c.channelCount,
});
