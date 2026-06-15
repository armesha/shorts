// Telegram Login Widget verification + minimal Bot API helpers.
//
// Verification follows https://core.telegram.org/widgets/login#checking-authorization :
//   secret_key        = SHA256(<bot_token>)
//   data_check_string = every received field EXCEPT `hash`, sorted by key,
//                       formatted "key=value", joined with a "\n" (0x0A)
//   the payload is authentic  ⇔  hex(HMAC_SHA256(data_check_string, secret_key)) === hash
// We additionally require `auth_date` to be recent so a leaked payload can't be replayed forever.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TgUser {
  id: string; // numeric Telegram user id, kept as a string — it's our stable linking key
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
}

export type TgVerify = { ok: true; user: TgUser } | { ok: false; reason: string };

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : v == null ? undefined : String(v);

/** Verify a Telegram Login Widget payload against the bot token. `data` = the object the widget emits. */
export function verifyTelegramAuth(
  data: Record<string, unknown>,
  botToken: string,
  maxAgeSec = 86_400,
): TgVerify {
  if (!botToken) return { ok: false, reason: "Telegram-вход не настроен" };
  const hash = typeof data.hash === "string" ? data.hash : "";
  if (!hash) return { ok: false, reason: "Нет подписи Telegram" };

  // data-check-string: all fields except `hash`, alphabetical by key, "key=value" joined by \n.
  const dataCheckString = Object.keys(data)
    .filter((k) => k !== "hash" && data[k] !== undefined && data[k] !== null)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "Подпись Telegram неверна" };

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) return { ok: false, reason: "Нет даты авторизации" };
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > maxAgeSec || ageSec < -300) // tolerate up to 5 min of clock skew
    return { ok: false, reason: "Данные Telegram устарели — попробуйте ещё раз" };

  const id = data.id != null ? String(data.id) : "";
  if (!id) return { ok: false, reason: "Нет id пользователя Telegram" };

  return {
    ok: true,
    user: {
      id,
      first_name: str(data.first_name),
      last_name: str(data.last_name),
      username: str(data.username),
      photo_url: str(data.photo_url),
      auth_date: authDate,
    },
  };
}

/** Send a DM via the bot. Works only if the user allowed the bot (widget "write" access / pressed Start). */
export async function sendBotMessage(
  botToken: string,
  chatId: string | number,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken) return { ok: false, error: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

let cachedUsername: string | null | undefined;
/** The bot's public @username — from TELEGRAM_BOT_USERNAME, else fetched once via getMe and cached. */
export async function getBotUsername(botToken: string): Promise<string | null> {
  const fromEnv = (process.env.TELEGRAM_BOT_USERNAME || "").trim();
  if (fromEnv) return fromEnv;
  if (cachedUsername !== undefined) return cachedUsername ?? null;
  if (!botToken) return (cachedUsername = null);
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: { username?: string } };
    cachedUsername = j.ok ? (j.result?.username ?? null) : null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername ?? null;
}

/** Register the bot webhook so Telegram POSTs updates (e.g. /start) to our server. */
export async function setBotWebhook(
  botToken: string,
  url: string,
  secret: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Deep link that opens the bot and pre-fills /start <token>. */
export function botStartLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`;
}
