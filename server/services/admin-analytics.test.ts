import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../db.ts";
import { buildAdminAnalytics, normalizeAnalyticsRange } from "./admin-analytics.ts";

function withDb(fn: (store: ReturnType<typeof openDb>) => void) {
  const dir = mkdtempSync(join(tmpdir(), "shorts-analytics-"));
  const store = openDb(join(dir, "app.db"));
  try {
    fn(store);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("normalizes invalid ranges to a safe default", () => {
  assert.deepEqual(
    normalizeAnalyticsRange({ from: "bad", to: "2026-06-15" }, new Date("2026-06-15T12:00:00Z")),
    { from: "2026-05-17", to: "2026-06-15" },
  );
  assert.deepEqual(normalizeAnalyticsRange({ from: "2026-06-10", to: "2026-06-01" }), {
    from: "2026-06-01",
    to: "2026-06-10",
  });
});

test("builds admin analytics from history, queue and channel snapshots", () =>
  withDb((store) => {
    const db = store.db;
    db.prepare("INSERT INTO users (id, username, pass_hash, role) VALUES (?,?,?,?)").run(
      1,
      "admin",
      "x",
      "admin",
    );
    db.prepare("INSERT INTO users (id, username, pass_hash, role) VALUES (?,?,?,?)").run(
      2,
      "editor",
      "x",
      "user",
    );
    db.prepare(
      `INSERT INTO accounts
        (id, user_id, channel_name, schedule, enabled, yt_refresh_token, yt_channel_title, lang, channel_lang)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(1, 1, "A local", '["09:00","18:00"]', 1, "tok", "A YouTube", "de", "de");
    db.prepare(
      `INSERT INTO accounts
        (id, user_id, channel_name, schedule, enabled, yt_refresh_token, yt_channel_title, lang, channel_lang)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(2, 2, "B local", '["12:00"]', 1, null, null, "ru", "ru");

    for (let i = 1; i <= 3; i++) {
      db.prepare(
        "INSERT INTO videos (account_id, title, text, bg, music, deck, video_rel, created_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(1, `queued ${i}`, "txt", "bg", "music", "de", `v${i}.mp4`, "2026-06-02 10:00:00");
    }

    db.prepare(
      "INSERT INTO history (account_id, title, status, youtube_id, published_at, created_at) VALUES (?,?,?,?,?,?)",
    ).run(1, "pub 1", "published", "yt1", "2026-06-01T10:00:00.000Z", "2026-06-01 10:00:00");
    db.prepare(
      "INSERT INTO history (account_id, title, status, youtube_id, published_at, created_at) VALUES (?,?,?,?,?,?)",
    ).run(1, "pub 2", "published", "yt2", "2026-06-02T10:00:00.000Z", "2026-06-02 10:00:00");
    db.prepare(
      "INSERT INTO history (account_id, title, status, youtube_id, published_at, created_at) VALUES (?,?,?,?,?,?)",
    ).run(1, "scheduled", "scheduled", "yt3", "2026-06-03T10:00:00.000Z", "2026-06-03 10:00:00");
    db.prepare(
      "INSERT INTO history (account_id, title, status, error, created_at) VALUES (?,?,?,?,?)",
    ).run(2, "failed", "failed", "bad token", "2026-06-04 10:00:00");
    db.prepare(
      "INSERT INTO history (account_id, title, status, youtube_id, published_at, created_at) VALUES (?,?,?,?,?,?)",
    ).run(1, "old", "published", "old", "2026-05-20T10:00:00.000Z", "2026-05-20 10:00:00");

    db.prepare(
      "INSERT INTO channel_stats (account_id, subscribers, views, videos, taken_at) VALUES (?,?,?,?,?)",
    ).run(1, 100, 1000, 10, "2026-06-01 08:00:00");
    db.prepare(
      "INSERT INTO channel_stats (account_id, subscribers, views, videos, taken_at) VALUES (?,?,?,?,?)",
    ).run(1, 110, 1250, 12, "2026-06-07 08:00:00");
    db.prepare(
      "INSERT INTO channel_stats (account_id, subscribers, views, videos, taken_at) VALUES (?,?,?,?,?)",
    ).run(2, 50, 500, 5, "2026-06-01 08:00:00");
    db.prepare(
      "INSERT INTO channel_stats (account_id, subscribers, views, videos, taken_at) VALUES (?,?,?,?,?)",
    ).run(2, 55, 700, 6, "2026-06-07 08:00:00");

    db.prepare(
      "INSERT INTO error_log (source, level, message, context, created_at) VALUES (?,?,?,?,?)",
    ).run("server", "error", "upload failed", "scheduler", "2026-06-04 10:00:00");
    db.prepare(
      "INSERT INTO error_log (source, level, message, context, created_at) VALUES (?,?,?,?,?)",
    ).run("server", "error", "old", "scheduler", "2026-05-20 10:00:00");

    const data = buildAdminAnalytics(store, { from: "2026-06-01", to: "2026-06-07" });

    assert.equal(data.summary.published, 2);
    assert.equal(data.summary.scheduled, 1);
    assert.equal(data.summary.failed, 1);
    assert.equal(data.summary.queuedVideos, 3);
    assert.equal(data.summary.accountsTotal, 2);
    assert.equal(data.summary.accountsConnected, 1);
    assert.equal(data.summary.errors, 1);
    assert.equal(data.summary.subscribers, 165);
    assert.equal(data.summary.views, 1950);
    assert.equal(data.summary.youtubeVideos, 18);
    assert.equal(data.summary.subscriberDelta, 15);
    assert.equal(data.summary.viewsDelta, 450);
    assert.equal(data.summary.youtubeVideosDelta, 3);

    assert.equal(data.daily.length, 7);
    assert.equal(data.daily.find((d) => d.date === "2026-06-04")?.failed, 1);
    assert.equal(data.topChannels[0].channelName, "A YouTube");
    assert.equal(data.topChannels[0].published, 2);
    assert.equal(data.topChannels[0].runwayDays, 1.5);
    assert.equal(data.topUsers[0].username, "admin");
    assert.equal(data.runway[0].channelName, "B local");
    assert.equal(data.runway[0].runwayDays, 0);
    assert.equal(data.youtubeGrowth[0].channelName, "A YouTube");
    assert.equal(data.youtubeSeries.at(-1)?.views, 1950);
    assert.equal(data.failures[0].error, "bad token");
    assert.equal(data.recentErrors[0].message, "upload failed");
  }));
