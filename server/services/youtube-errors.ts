// YouTube/OAuth error formatting helpers — turn googleapis/OAuth failures into short Russian hints and
// extract the Google Cloud project / API-enable URL for notifications. Moved VERBATIM from index.ts.
// Pure functions (no db, no shared state) → safe to import from any route module.

export function errorText(err: unknown): string {
  const e = err as { message?: string; stack?: string; response?: { data?: unknown }; errors?: unknown };
  const parts = [e?.message, e?.response?.data, e?.errors, e?.stack]
    .filter((x) => x != null)
    .map((x) => {
      if (typeof x === "string") return x;
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    });
  return parts.join("\n");
}

export function publicErrorMessage(err: unknown): string {
  const msg = (err as { message?: unknown })?.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 500);
  return "Не удалось выполнить операцию";
}

export function extractGoogleApiUrl(text: string): string | null {
  const m = text.match(/https:\/\/console\.developers\.google\.com\/apis\/api\/youtubeanalytics\.googleapis\.com\/overview\?project=\d+/i);
  return m?.[0] ?? null;
}

export function extractGoogleProjectId(text: string): string | null {
  return (
    text.match(/[?&]project=(\d+)/)?.[1] ??
    text.match(/\bproject\s+(\d+)\b/i)?.[1] ??
    null
  );
}

// Turn a googleapis/OAuth failure into a short Russian hint; raw reason stays in () for the F12 console.
export function ytErrorMessage(err: unknown): string {
  const e = err as {
    code?: number | string;
    response?: { status?: number; data?: { error_description?: string; error?: unknown } };
    errors?: { message?: string; reason?: string }[];
    message?: string;
  };
  const data = e?.response?.data;
  const status = e?.response?.status ?? (typeof e?.code === "number" ? e.code : undefined);
  // Token endpoint → error/error_description are STRINGS; YouTube Data API → `error` is an OBJECT
  // { code, message, errors:[{reason,message}] }. Extracting .message avoids "[object Object]".
  const apiErr =
    data?.error && typeof data.error === "object"
      ? (data.error as { message?: string; errors?: { reason?: string; message?: string }[] })
      : null;
  const reason = apiErr?.errors?.[0]?.reason ?? e?.errors?.[0]?.reason ?? "";
  const raw =
    data?.error_description ||
    (typeof data?.error === "string" ? data.error : apiErr?.message) ||
    apiErr?.errors?.[0]?.message ||
    e?.errors?.[0]?.message ||
    e?.message ||
    String(err);
  const s = `${String(raw)} ${reason}`.trim();
  if (/youtubeSignupRequired|channelNotFound/i.test(s))
    return `У выбранного Google-аккаунта нет YouTube-канала — создайте канал на youtube.com и переподключите.`;
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used in project/i.test(s))
    return `В проекте этого Google-ключа не включён YouTube Data API v3 — включите его в Google Cloud и переподключите.`;
  if (/unauthorized_client|invalid_client/i.test(s))
    return `Токен канала не принят (${s}) — переподключите канал в «Каналы».`;
  if (/invalid_grant/i.test(s)) return `Доступ отозван или истёк (${s}) — переподключите канал.`;
  if (status === 401 || /\bunauthorized\b|authorizationRequired/i.test(s))
    return `YouTube не принял авторизацию (401${reason ? " · " + reason : ""}). Обычно причина: у выбранного Google-аккаунта нет YouTube-канала, либо на экране согласия не отмечены галочки доступа к YouTube, либо в проекте ключа не включён YouTube Data API v3.`;
  if (/insufficient|scope|forbidden/i.test(s))
    return `Недостаточно прав токена (${s}) — переподключите канал и отметьте все доступы.`;
  if (/quota|rateLimit|userRateLimitExceeded/i.test(s))
    return `Квота YouTube API исчерпана (${s}) — попробуйте позже.`;
  return `Ошибка YouTube: ${s || "неизвестно"}${status ? ` (HTTP ${status})` : ""}`;
}
