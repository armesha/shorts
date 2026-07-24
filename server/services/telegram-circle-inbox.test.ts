import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import ffmpegPath from "ffmpeg-static";
import {
  circleSourceVisibleToUser,
  listCircleSourcesForUser,
} from "./circle-source-library.ts";
import {
  handleTelegramCircleInboxMessage,
  importTelegramCircle,
  MAX_TELEGRAM_CIRCLE_BYTES,
  TelegramCircleImportError,
} from "./telegram-circle-inbox.ts";

test("Telegram Bot API import stores one owner-scoped validated circle", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-telegram-circle-"));
  const previous = process.env.TG_CIRCLES_DIR;
  process.env.TG_CIRCLES_DIR = root;
  try {
    assert.ok(ffmpegPath);
    const fixture = resolve(root, "fixture.mp4");
    const generated = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=red:s=240x240:r=24:d=0.4",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      fixture,
    ], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    const bytes = readFileSync(fixture);
    let requests = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      requests++;
      if (String(url).includes("/getFile")) {
        return new Response(JSON.stringify({
          ok: true,
          result: { file_path: "video/file.mp4", file_size: bytes.length },
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.length) },
      });
    }) as typeof fetch;

    const first = await importTelegramCircle({
      botToken: "test-token",
      userId: 7,
      fileId: "file-id",
      fileUniqueId: "stable-file-id",
      fileSize: bytes.length,
    }, { fetchImpl });
    assert.equal(first.duplicate, false);
    assert.match(first.file, /^circle-u7-telegram-[a-f0-9]{20}\.mp4$/);
    assert.equal(statSync(resolve(root, "downloads", first.file)).mode & 0o777, 0o600);
    assert.equal(circleSourceVisibleToUser(first.file, 7), true);
    assert.equal(circleSourceVisibleToUser(first.file, 8), false);
    assert.deepEqual(listCircleSourcesForUser(7, root), [first.file]);
    assert.deepEqual(listCircleSourcesForUser(8, root), []);

    const duplicate = await importTelegramCircle({
      botToken: "test-token",
      userId: 7,
      fileId: "new-file-id",
      fileUniqueId: "stable-file-id",
      fileSize: bytes.length,
    }, { fetchImpl });
    assert.equal(duplicate.duplicate, true);
    assert.equal(requests, 2);

    await assert.rejects(
      importTelegramCircle({
        botToken: "test-token",
        userId: 7,
        fileId: "large",
        fileUniqueId: "large",
        fileSize: MAX_TELEGRAM_CIRCLE_BYTES + 1,
      }, { fetchImpl }),
      (error: unknown) => error instanceof TelegramCircleImportError && error.code === "too_large",
    );
  } finally {
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test("bot inbox accepts circles only from a linked Telegram account", async () => {
  const messages: string[] = [];
  const unlinked = await handleTelegramCircleInboxMessage({
    fromId: "100",
    chatId: 100,
    chatType: "private",
    videoNote: { fileId: "file", fileUniqueId: "unique" },
  }, {
    botToken: "test-token",
    publicBaseUrl: "https://shareboard.live/",
    findUserByTelegramId: () => null,
    sendMessage: async (_chatId, text) => { messages.push(text); },
  });
  assert.equal(unlinked, true);
  assert.match(messages[0], /привяжите/i);
  assert.match(messages[0], /https:\/\/shareboard\.live\/settings/);

  let importedUserId = 0;
  const linked = await handleTelegramCircleInboxMessage({
    fromId: "101",
    chatId: 101,
    chatType: "private",
    videoNote: { fileId: "file", fileUniqueId: "unique" },
  }, {
    botToken: "test-token",
    findUserByTelegramId: () => ({ id: 9 }),
    sendMessage: async (_chatId, text) => { messages.push(text); },
    importCircle: async (input) => {
      importedUserId = input.userId;
      return { file: "circle.mp4", duplicate: false };
    },
  });
  assert.equal(linked, true);
  assert.equal(importedUserId, 9);
  assert.match(messages.at(-1) || "", /добавлен/i);
});
