import { copyFile, mkdir, realpath, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import type { Db } from "../db.ts";
import { channelLibraryVideoCap, isMgsUser } from "../infra/account-limits.ts";
import {
  MANUAL_VIDEO_DECK,
  applyManualVideoAccountDefaults,
  getManualVideoAccountDefaults,
} from "./manual-videos.ts";
import type { CutJob } from "./video-cutting.ts";

export type CuttingChannelAdd = {
  accountId: number;
  part: number;
  videoId: number;
};

export async function addCuttingClipsToChannel(
  db: Db,
  input: {
    userId: number;
    job: CutJob;
    accountId: number;
    parts?: number[];
    outputDir: string;
  },
): Promise<{ added: CuttingChannelAdd[]; existing: CuttingChannelAdd[] }> {
  const { userId, job, accountId } = input;
  if (job.userId !== userId || !/^[a-f\d-]{36}$/.test(job.id))
    throw new Error("Нарезка недоступна.");
  const account = db.getAccount(accountId);
  if (!account || account.userId !== userId)
    throw new Error("Выберите свой канал.");
  if (account.status !== "connected" || account.authError)
    throw new Error("Сначала подключите канал заново.");
  const numbers = [
    ...new Set(input.parts || job.clips.map((clip) => clip.number)),
  ].sort((a, b) => a - b);
  if (
    !numbers.length ||
    numbers.length > (job.daily ? 200 : 30) ||
    numbers.some(
      (n) =>
        !Number.isInteger(n) || !job.clips.some((clip) => clip.number === n),
    )
  )
    throw new Error("Выберите готовые части этой нарезки.");
  const prefix = `library/cutting-u${userId}/${job.id}/channel-${accountId}`;
  const videos = db.listVideos(accountId);
  const existing: CuttingChannelAdd[] = [],
    pending: number[] = [];
  for (const part of numbers) {
    const receipt = job.channelAdds?.find(
      (row) => row.accountId === accountId && row.part === part,
    );
    const saved = videos.find(
      (video) => video.videoRel === `${prefix}/part-${part}.mp4`,
    );
    if (receipt || saved)
      existing.push(receipt || { accountId, part, videoId: saved!.id });
    else pending.push(part);
  }
  if (!pending.length) return { added: [], existing };
  const owner = db.getUserById(userId);
  const cap = channelLibraryVideoCap(owner?.role === "admin", isMgsUser(owner));
  let reservation: string | null = null;
  if (cap !== null) {
    const result = db.reserveLibrarySlots(accountId, cap, pending.length);
    if (!result.ok)
      throw new Error(
        `В библиотеке канала осталось ${result.available} мест, нужно ${pending.length}.`,
      );
    reservation = result.token;
  }
  const copied: string[] = [],
    temporary: string[] = [];
  let committed = false;
  try {
    const sourceRoot = await realpath(
      resolve(input.outputDir, `creator/cutting-u${userId}/${job.id}`),
    );
    const expectedRoot = await realpath(input.outputDir);
    if (!sourceRoot.startsWith(expectedRoot + sep))
      throw new Error("Файлы нарезки недоступны.");
    await mkdir(resolve(input.outputDir, prefix), { recursive: true });
    for (const part of pending) {
      const source = await realpath(resolve(sourceRoot, `part-${part}.mp4`));
      if (!source.startsWith(sourceRoot + sep))
        throw new Error("Файл части недоступен.");
      const target = resolve(input.outputDir, prefix, `part-${part}.mp4`);
      const temp = `${target}.${randomUUID()}.tmp`;
      temporary.push(temp);
      await copyFile(source, temp);
      await rename(temp, target);
      copied.push(target);
    }
    const current = db.getAccount(accountId);
    if (
      !current ||
      current.userId !== userId ||
      current.status !== "connected" ||
      current.authError
    )
      throw new Error(
        "Подключение канала изменилось. Повторите добавление после подключения.",
      );
    const defaults = getManualVideoAccountDefaults(db, accountId);
    const added: CuttingChannelAdd[] = [];
    db.db.exec("BEGIN IMMEDIATE");
    try {
      for (const part of pending) {
        const clip = job.clips.find((clip) => clip.number === part)!;
        const meta = applyManualVideoAccountDefaults(
          {
            title: clip.title.slice(0, 90),
            text: `${clip.title}\n\nЧасть ${part} из ${job.plan?.length || job.clips.length}.\nИсточник: ${job.input.url}`,
            videoRel: `${prefix}/part-${part}.mp4`,
            tags: [],
          },
          defaults,
        );
        const video = db.createVideo({
          accountId,
          title: meta.title,
          text: meta.text,
          bg: "manual",
          music: "none",
          deck: MANUAL_VIDEO_DECK,
          videoRel: meta.videoRel,
          imageRel: null,
          tags: meta.tags,
        });
        added.push({ accountId, part, videoId: video.id });
      }
      db.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      db.db.exec("ROLLBACK");
      throw error;
    }
    return { added, existing };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        "Одна из готовых частей больше недоступна. Обновите список или повторите нарезку.",
      );
    throw error;
  } finally {
    try {
      await Promise.all(temporary.map((file) => rm(file, { force: true })));
      if (!committed)
        await Promise.all(copied.map((file) => rm(file, { force: true })));
    } finally {
      if (reservation) db.releaseLibraryReservation(reservation);
    }
  }
}
