import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db.ts";
import {
  buildTelegramDigestText,
  runTelegramDigestCycle,
  telegramDigestPeriod,
  telegramDigestSentSettingKey,
} from "./telegram-digest.ts";

function seededDb() {
  const db = openDb(":memory:");
  const user = db.createUser({ username: "armen", passHash: "x", timezone: "Europe/Prague" });
  db.setUserTelegram(user.id, "1234567890", "@armen");
  db.updateTelegramPreferences(user.id, { statsDigest: "daily" });

  const account = db.createAccount({
    userId: user.id,
    channelName: "Main",
    lang: "en",
    channelLang: "en",
    schedule: ["12:00"],
  });
  db.setYouTube(account.id, { refreshToken: "token", channelId: "UC1", channelTitle: "Main YT" });
  db.addChannelSnapshot({ accountId: account.id, subscribers: 100, views: 1_000, videos: 10 });
  db.createVideo({
    accountId: account.id,
    title: "queued",
    text: "txt",
    bg: "",
    music: "",
    deck: "en",
    videoRel: "queued.mp4",
    imageRel: null,
  });
  db.upsertDailyAnalytics([
    {
      accountId: account.id,
      date: "2026-07-07",
      views: 42,
      engagedViews: 30,
      watchMinutes: 12,
      avgViewDuration: 18,
      avgViewPercentage: 66,
      likes: 5,
      dislikes: 0,
      comments: 2,
      shares: 1,
      subscribersGained: 4,
      subscribersLost: 1,
    },
  ]);
  db.db
    .prepare(
      "INSERT INTO history (account_id, title, status, youtube_id, published_at, created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(account.id, "published", "published", "yt1", "2026-07-07T10:00:00.000Z", "2026-07-07 10:00:00");
  db.db
    .prepare("INSERT INTO history (account_id, title, status, error, created_at) VALUES (?,?,?,?,?)")
    .run(account.id, "failed", "failed", "bad token", "2026-07-07 11:00:00");

  return { db, user };
}

test("daily digest becomes due after the local send time and reports yesterday", () => {
  assert.equal(telegramDigestPeriod("daily", new Date("2026-07-08T06:59:00Z"), "Europe/Prague"), null);

  const period = telegramDigestPeriod("daily", new Date("2026-07-08T07:00:00Z"), "Europe/Prague");
  assert.ok(period);
  assert.equal(period.from, "2026-07-07");
  assert.equal(period.to, "2026-07-07");
  assert.equal(period.key, "daily:2026-07-07");
});

test("weekly digest is due on Monday after the local send time", () => {
  assert.equal(telegramDigestPeriod("weekly", new Date("2026-07-07T08:00:00Z"), "Europe/Prague"), null);

  const period = telegramDigestPeriod("weekly", new Date("2026-07-06T07:01:00Z"), "Europe/Prague");
  assert.ok(period);
  assert.equal(period.from, "2026-06-29");
  assert.equal(period.to, "2026-07-05");
  assert.equal(period.key, "weekly:2026-06-29:2026-07-05");
});

test("digest text uses the user's stored stats and current totals", () => {
  const { db, user } = seededDb();
  const period = telegramDigestPeriod("daily", new Date("2026-07-08T07:00:00Z"), user.timezone);
  assert.ok(period);

  const text = buildTelegramDigestText(db, user, period, { db, baseUrl: () => "https://shareboard.live" });

  assert.ok(text.split("\n").length <= 8);
  assert.match(text, /<b>Дайджест Shorts Factory<\/b>/);
  assert.match(text, /За <b>07\.07\.2026<\/b>/);
  assert.match(text, /<b>Публикации<\/b>: <b>1<\/b> опубликовано, <b>1<\/b> ошибка/);
  assert.match(text, /<b>YouTube<\/b>: <b>42<\/b> просмотра, <b>\+3<\/b> подписчика/);
  assert.match(text, /<b>Всего<\/b>: <b>100<\/b> подписчиков, <b>1\s?000<\/b> просмотров/);
  assert.match(text, /<a href="https:\/\/shareboard\.live\/statistics">Открыть статистику<\/a>/);
  assert.doesNotMatch(text, /https:\/\/shareboard\.live\/statistics$/);
  assert.doesNotMatch(text, /Аккаунт:/);
  assert.doesNotMatch(text, /Каналы:/);
  assert.doesNotMatch(text, /Библиотека:/);
  assert.doesNotMatch(text, /лайки|комментарии|шеры|Данные Analytics/);
  assert.doesNotMatch(text, /10 видео/);
});

test("digest cycle sends once per user and period", async () => {
  const { db, user } = seededDb();
  const sent: string[] = [];
  const parseModes: Array<string | undefined> = [];

  const first = await runTelegramDigestCycle({
    db,
    now: () => new Date("2026-07-08T07:10:00Z"),
    sendMessage: async (_chatId, text, opts) => {
      sent.push(text);
      parseModes.push(opts?.parseMode);
      return { ok: true, messageId: 77 };
    },
  });
  const second = await runTelegramDigestCycle({
    db,
    now: () => new Date("2026-07-08T08:10:00Z"),
    sendMessage: async (_chatId, text) => {
      sent.push(text);
      return { ok: true, messageId: 78 };
    },
  });

  assert.equal(first.length, 1);
  assert.equal(first[0]?.sent, true);
  assert.equal(second.length, 0);
  assert.equal(sent.length, 1);
  assert.deepEqual(parseModes, ["HTML"]);
  assert.equal(db.getSetting(telegramDigestSentSettingKey(user.id, "daily")), "daily:2026-07-07");
});

test("failed digest send is not marked as delivered", async () => {
  const { db, user } = seededDb();

  const result = await runTelegramDigestCycle({
    db,
    now: () => new Date("2026-07-08T07:10:00Z"),
    sendMessage: async () => ({ ok: false, error: "blocked" }),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.sent, false);
  assert.equal(result[0]?.error, "blocked");
  assert.equal(db.getSetting(telegramDigestSentSettingKey(user.id, "daily")), null);
});
