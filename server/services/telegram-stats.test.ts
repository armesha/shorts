import assert from "node:assert/strict";
import test from "node:test";
import type { Db, UserAuth } from "../db.ts";
import type { InlineKeyboard } from "../telegram.ts";
import type { SnapshotAnalyticsFields } from "./stats-refresh.ts";
import { makeBotStats } from "./telegram-stats.ts";

interface BotRequest {
  url: string;
  body: {
    text?: string;
    reply_markup?: InlineKeyboard;
  };
}

const user: UserAuth = {
  id: 7,
  username: "telegram-user",
  passHash: "",
  passwordSet: false,
  role: "user",
  isSuperAdmin: false,
  timezone: "Europe/Prague",
  failedAttempts: 0,
  lockedUntil: null,
  telegramId: "100",
  telegramUsername: "@telegram-user",
  createdAt: "2026-07-24 12:00:00",
};

const emptyAnalytics: SnapshotAnalyticsFields = {
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
};

function callbackData(keyboard: InlineKeyboard | undefined): string[] {
  return keyboard?.inline_keyboard.flat().flatMap((button) => button.callback_data ? [button.callback_data] : []) ?? [];
}

test("Telegram bot menu exposes clear circle navigation and back actions", async () => {
  const originalFetch = globalThis.fetch;
  const previousBaseUrl = process.env.PUBLIC_BASE_URL;
  const requests: BotRequest[] = [];
  process.env.PUBLIC_BASE_URL = "https://shareboard.live/";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as BotRequest["body"] : {},
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const db = {
    getUserByTelegramId: (telegramId: string) => telegramId === "100" ? user : null,
    listAccountsByUser: () => [],
    getTelegramPreferences: () => ({
      postSuccess: false,
      postFailures: false,
      generationDone: false,
      quotaWarnings: false,
      channelAlerts: false,
      statsDigest: "off" as const,
    }),
  } as unknown as Db;
  const bot = makeBotStats({
    db,
    botToken: () => "test-token",
    accountCreds: () => null,
    redirectUri: "",
    analyticsRange: () => ({ from: "2026-06-24", to: "2026-07-24" }),
    summarizeStored: () => emptyAnalytics,
    formatStatsError: () => "Ошибка",
    refreshHooks: {},
  });

  try {
    await bot.entry({ from: { id: 100 }, chat: { id: 100 } }, "home");
    const home = requests.at(-1);
    assert.ok(home?.url.endsWith("/sendMessage"));
    assert.match(home?.body.text ?? "", /Выберите нужное действие/);
    assert.deepEqual(callbackData(home?.body.reply_markup), [
      "s:circles",
      "s:sum:mine",
      "s:settings",
      "s:help",
    ]);
    const homeButtons = home?.body.reply_markup?.inline_keyboard.flat() ?? [];
    assert.ok(homeButtons.some((button) => button.web_app?.url === "https://shareboard.live/tg"));
    assert.ok(homeButtons.some((button) => button.url === "https://shareboard.live/circles"));

    await bot.entry({ from: { id: 100 }, chat: { id: 100 } }, "circles");
    const circles = requests.at(-1);
    assert.match(circles?.body.text ?? "", /Отправьте или перешлите/);
    assert.deepEqual(callbackData(circles?.body.reply_markup), ["s:sum:mine", "s:home"]);
    assert.ok(circles?.body.reply_markup?.inline_keyboard.flat().some(
      (button) => button.url === "https://shareboard.live/circles",
    ));

    requests.length = 0;
    await bot.callback({
      id: "callback-1",
      data: "s:circles",
      from: { id: 100 },
      message: { chat: { id: 100 }, message_id: 55 },
    });
    assert.ok(requests.some((request) => request.url.endsWith("/answerCallbackQuery")));
    const edited = requests.find((request) => request.url.endsWith("/editMessageText"));
    assert.match(edited?.body.text ?? "", /Добавить Telegram-кружок/);
    assert.ok(callbackData(edited?.body.reply_markup).includes("s:home"));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previousBaseUrl;
  }
});
