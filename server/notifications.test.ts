import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "./db.ts";

function withDb(fn: (store: ReturnType<typeof openDb>) => void) {
  const dir = mkdtempSync(join(tmpdir(), "shorts-notifications-"));
  const store = openDb(join(dir, "app.db"));
  try {
    fn(store);
  } finally {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("deduplicates repeated notifications and deletes issues", () =>
  withDb((store) => {
    store.db.prepare("INSERT INTO users (id, username, pass_hash, role) VALUES (?,?,?,?)").run(
      7,
      "owner",
      "x",
      "user",
    );
    store.db
      .prepare(
        `INSERT INTO accounts
          (id, user_id, channel_name, schedule, enabled, lang, channel_lang)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(21, 7, "Totgelacht", '["12:00"]', 1, "en", "en");

    const first = store.upsertNotification({
      userId: 7,
      accountId: 21,
      severity: "error",
      category: "youtube_analytics",
      title: "YouTube Analytics API выключен",
      message: "Канал «Totgelacht»: API disabled",
      solution: "Enable YouTube Analytics API.",
      actionUrl: "https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=1",
      dedupeKey: "youtube-analytics-disabled:account=21:project=1",
      source: "server",
      context: "analytics refresh account=21",
    });
    const second = store.upsertNotification({
      userId: 7,
      accountId: 21,
      severity: "error",
      category: "youtube_analytics",
      title: "YouTube Analytics API выключен",
      message: "Канал «Totgelacht»: API disabled again",
      solution: "Enable YouTube Analytics API.",
      actionUrl: "https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=1",
      dedupeKey: "youtube-analytics-disabled:account=21:project=1",
      source: "server",
      context: "analytics refresh account=21",
    });

    assert.equal(second.id, first.id);
    assert.equal(second.count, 2);
    assert.equal(store.listNotifications({ userId: 7 }).length, 1);
    assert.deepEqual(store.notificationCounts(7), { open: 1, unread: 1, total: 1 });

    const read = store.markNotificationRead(second.id)!;
    assert.ok(read.readAt);
    assert.deepEqual(store.notificationCounts(7), { open: 1, unread: 0, total: 1 });

    assert.equal(store.deleteNotification(second.id), true);
    assert.equal(store.listNotifications({ userId: 7 }).length, 0);
    assert.deepEqual(store.notificationCounts(7), { open: 0, unread: 0, total: 0 });

    const recreated = store.upsertNotification({
      userId: 7,
      accountId: 21,
      severity: "error",
      category: "youtube_analytics",
      title: "YouTube Analytics API выключен",
      message: "Канал «Totgelacht»: still disabled",
      solution: "Enable YouTube Analytics API.",
      actionUrl: null,
      dedupeKey: "youtube-analytics-disabled:account=21:project=1",
      source: "server",
      context: "analytics refresh account=21",
    });
    assert.notEqual(recreated.id, first.id);
    assert.equal(recreated.count, 1);
    assert.equal(recreated.readAt, null);
    assert.equal(recreated.resolvedAt, null);
  }));
