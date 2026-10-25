import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { openDb } from "../db.ts";
import { CutRequestSchema } from "./video-cutting-plan.ts";
import { MANUAL_VIDEO_DECK } from "./manual-videos.ts";
import { addCuttingClipsToChannel } from "./video-cutting-channels.ts";
import { VideoCuttingService, type CutJob } from "./video-cutting.ts";

async function fixture() {
  const base = resolve(process.cwd(), "tmp/cutting-channel-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "run-"));
  const db = openDb(":memory:");
  const owner = db.createUser({
    username: "owner",
    passHash: "test",
    role: "user",
  });
  const other = db.createUser({
    username: "other",
    passHash: "test",
    role: "user",
  });
  const account = db.createAccount({
    userId: owner.id,
    channelName: "Channel",
    status: "connected",
    sourceDecks: ["manual"],
  });
  const foreign = db.createAccount({
    userId: other.id,
    channelName: "Other channel",
    status: "connected",
  });
  const job: CutJob = {
    id: randomUUID(),
    userId: owner.id,
    input: CutRequestSchema.parse({
      url: "https://youtu.be/iJH6dAG9NVk",
      mode: "manual",
      count: 2,
    }),
    status: "completed",
    stage: "Готово",
    progress: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clips: [1, 2].map((number) => ({
      number,
      start: (number - 1) * 80,
      end: number * 80,
      title: `Part ${number}`,
      reason: "Context",
      videoUrl: "",
      duration: 80,
    })),
  };
  const source = resolve(root, `creator/cutting-u${owner.id}/${job.id}`);
  await mkdir(source, { recursive: true });
  for (const clip of job.clips) {
    await writeFile(
      resolve(source, `part-${clip.number}.mp4`),
      `rendered fixture ${clip.number}`,
    );
    db.createCreatorGalleryItem({
      userId: owner.id,
      packId: "video-cutting",
      packName: "Cutting",
      templateType: "montage",
      cardIndex: clip.number,
      title: clip.title,
      text: "",
      format: "mp4",
      videoRel: `creator/cutting-u${owner.id}/${job.id}/part-${clip.number}.mp4`,
    });
  }
  return {
    root,
    db,
    owner,
    other,
    account,
    foreign,
    job,
    source,
    close: async () => {
      db.db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("ready clips enter the manual library without reuploading; retries do not duplicate", async () => {
  const f = await fixture();
  try {
    const input = {
      userId: f.owner.id,
      job: f.job,
      accountId: f.account.id,
      outputDir: f.root,
    };
    const result = await addCuttingClipsToChannel(f.db, input);
    assert.equal(result.added.length, 2);
    assert.equal(f.db.listVideos(f.account.id).length, 2);
    const saved = f.db.getVideo(result.added[0].videoId)!;
    assert.equal(saved.deck, MANUAL_VIDEO_DECK);
    assert.equal(saved.postCount, 0);
    assert.equal(
      await readFile(resolve(f.root, saved.videoRel), "utf8"),
      "rendered fixture 1",
    );
    const retry = await addCuttingClipsToChannel(f.db, input);
    assert.equal(retry.added.length, 0);
    assert.equal(retry.existing.length, 2);
    assert.equal(f.db.libraryReservationsForAccount(f.account.id), 0);
  } finally {
    await f.close();
  }
});
test("foreign jobs, foreign or disconnected channels and unready parts are rejected", async () => {
  const f = await fixture();
  try {
    const input = {
      userId: f.owner.id,
      job: f.job,
      accountId: f.account.id,
      outputDir: f.root,
    };
    await assert.rejects(
      () => addCuttingClipsToChannel(f.db, { ...input, userId: f.other.id }),
      /недоступна/,
    );
    await assert.rejects(
      () =>
        addCuttingClipsToChannel(f.db, { ...input, accountId: f.foreign.id }),
      /свой канал/,
    );
    await assert.rejects(
      () => addCuttingClipsToChannel(f.db, { ...input, parts: [3] }),
      /готовые части/,
    );
    f.db.db
      .prepare("UPDATE accounts SET status='needs_auth' WHERE id=?")
      .run(f.account.id);
    await assert.rejects(
      () => addCuttingClipsToChannel(f.db, input),
      /подключите/,
    );
    assert.equal(f.db.listVideos(f.account.id).length, 0);
  } finally {
    await f.close();
  }
});
test("batch copy failure leaves no partial library rows and releases reservations", async () => {
  const f = await fixture();
  try {
    await rm(resolve(f.source, "part-2.mp4"));
    await assert.rejects(() =>
      addCuttingClipsToChannel(f.db, {
        userId: f.owner.id,
        job: f.job,
        accountId: f.account.id,
        outputDir: f.root,
      }),
    );
    assert.equal(f.db.listVideos(f.account.id).length, 0);
    assert.equal(f.db.libraryReservationsForAccount(f.account.id), 0);
    await assert.rejects(() =>
      access(
        resolve(
          f.root,
          `library/cutting-u${f.owner.id}/${f.job.id}/channel-${f.account.id}/part-1.mp4`,
        ),
      ),
    );
  } finally {
    await f.close();
  }
});
test("channel library capacity is checked before importing a batch", async () => {
  const f = await fixture();
  try {
    for (let n = 0; n < 50; n++)
      f.db.createVideo({
        accountId: f.account.id,
        title: "Existing",
        text: "",
        bg: "",
        music: "none",
        deck: "manual",
        videoRel: `library/existing-${n}.mp4`,
        imageRel: null,
      });
    await assert.rejects(
      () =>
        addCuttingClipsToChannel(f.db, {
          userId: f.owner.id,
          job: f.job,
          accountId: f.account.id,
          outputDir: f.root,
        }),
      /осталось 0 мест/,
    );
    assert.equal(f.db.listVideos(f.account.id).length, 50);
  } finally {
    await f.close();
  }
});
test("deleting a ready part removes its gallery file but preserves channel copies and receipts", async () => {
  const f = await fixture();
  const jobs = resolve(f.root, "jobs");
  await mkdir(resolve(jobs, `u${f.owner.id}`, f.job.id), { recursive: true });
  await writeFile(
    resolve(jobs, `u${f.owner.id}`, f.job.id, "job.json"),
    JSON.stringify(f.job),
  );
  let service = new VideoCuttingService({
    root: jobs,
    outputDir: f.root,
    db: f.db,
  });
  try {
    await assert.rejects(
      () => service.deletePart(f.other.id, f.job.id, 1),
      /не найдена/,
    );
    const first = await service.addToChannel(
      f.owner.id,
      f.job.id,
      f.account.id,
      [1],
    );
    assert.equal(first.added.length, 1);
    const copy = f.db.getVideo(first.added[0].videoId)!;
    const deleted = await service.deletePart(f.owner.id, f.job.id, 1);
    assert.deepEqual(
      deleted.clips.map((clip) => clip.number),
      [2],
    );
    assert.deepEqual(deleted.deletedParts, [1]);
    await assert.rejects(() => access(resolve(f.source, "part-1.mp4")));
    assert.equal(
      await readFile(resolve(f.root, copy.videoRel), "utf8"),
      "rendered fixture 1",
    );
    assert.equal(f.db.listCreatorGalleryItems(f.owner.id).length, 1);
    await service.deletePart(f.owner.id, f.job.id, 1);
    await service.close();
    service = new VideoCuttingService({
      root: jobs,
      outputDir: f.root,
      db: f.db,
    });
    const restored = await service.get(f.owner.id, f.job.id);
    assert.deepEqual(restored?.deletedParts, [1]);
    assert.equal(restored?.channelAdds?.length, 1);
    await assert.rejects(
      () => service.addToChannel(f.owner.id, f.job.id, f.account.id, [1]),
      /готовые части/,
    );
  } finally {
    await service.close();
    await f.close();
  }
});
