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
export type TgWebAppVerify = {
  ok: true;
  user: TgUser;
  queryId?: string;
  startParam?: string;
} | { ok: false; reason: string };

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

/** Verify Telegram Mini App initData. The HMAC scheme differs from the Login Widget. */
export function verifyTelegramWebAppInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86_400,
): TgWebAppVerify {
  if (!botToken) return { ok: false, reason: "Telegram-вход не настроен" };
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  if (!hash) return { ok: false, reason: "Нет подписи Telegram" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "Подпись Telegram неверна" };

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { ok: false, reason: "Нет даты авторизации" };
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > maxAgeSec || ageSec < -300) return { ok: false, reason: "Данные Telegram устарели — откройте Mini App заново" };

  let rawUser: Record<string, unknown>;
  try {
    rawUser = JSON.parse(params.get("user") || "{}") as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "Не удалось прочитать пользователя Telegram" };
  }
  const id = rawUser.id != null ? String(rawUser.id) : "";
  if (!id) return { ok: false, reason: "Нет id пользователя Telegram" };
  return {
    ok: true,
    queryId: str(params.get("query_id")),
    startParam: str(params.get("start_param")),
    user: {
      id,
      first_name: str(rawUser.first_name),
      last_name: str(rawUser.last_name),
      username: str(rawUser.username),
      photo_url: str(rawUser.photo_url),
      auth_date: authDate,
    },
  };
}

// ---- Inline keyboards (for the in-bot stats menu) ------------------------------------------------
export interface InlineKeyboardButton {
  text: string;
  callback_data?: string; // ≤64 bytes (Telegram limit) — keep our s:* tokens compact
  url?: string;
  web_app?: { url: string };
  style?: "danger" | "success" | "primary";
  copy_text?: { text: string };
}
export interface InlineKeyboard {
  inline_keyboard: InlineKeyboardButton[][];
}
export interface SendOpts {
  replyMarkup?: InlineKeyboard;
  parseMode?: "HTML" | "MarkdownV2";
}

/** Send a DM via the bot. Works only if the user allowed the bot (widget "write" access / pressed Start). */
export async function sendBotMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  opts: SendOpts = {},
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  if (!botToken) return { ok: false, error: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
        ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    return j.ok ? { ok: true, messageId: j.result?.message_id } : { ok: false, error: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Edit an existing bot message in place — powers inline-keyboard navigation without spamming the chat. */
export async function editMessageText(
  botToken: string,
  chatId: string | number,
  messageId: number,
  text: string,
  opts: SendOpts = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken) return { ok: false, error: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        disable_web_page_preview: true,
        ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
        ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    // Telegram 400s a no-op edit ("message is not modified") — the content is already shown, so treat as ok.
    if (!j.ok && /not modified/i.test(j.description || "")) return { ok: true };
    return j.ok ? { ok: true } : { ok: false, error: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Acknowledge a callback-button press. REQUIRED: until called, the client shows a spinner on the
 *  button until it times out. Best-effort — a failed ack never propagates into the webhook handler. */
export async function answerCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  opts: { text?: string; showAlert?: boolean } = {},
): Promise<void> {
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.showAlert ? { show_alert: true } : {}),
      }),
    });
  } catch {
    /* ignore — only a transient spinner is at stake */
  }
}

/** Register the bot's command list → adds the "Menu" button + "/" autocomplete in Telegram clients. */
export async function setBotCommands(
  botToken: string,
  commands: { command: string; description: string }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken) return { ok: false, error: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    return j.ok ? { ok: true } : { ok: false, error: j.description || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Configure the private-chat Menu button. `commands` keeps Telegram's native command drawer visible. */
export async function setChatMenuButton(
  botToken: string,
  menuButton: { type: "commands" } | { type: "default" } | { type: "web_app"; text: string; web_app: { url: string } },
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken) return { ok: false, error: "no bot token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ menu_button: menuButton }),
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
      // callback_query is NOT delivered by default when allowed_updates is set — it must be listed
      // explicitly, or the inline-keyboard buttons in the stats menu silently do nothing.
      body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message", "callback_query"] }),
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
