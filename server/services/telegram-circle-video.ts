import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "../db.ts";
import {
  activateCircleTemplate,
  activeCircleTemplateId,
  circleTemplateIdFromDeckId,
  getCircleTemplate,
} from "./circle-templates.ts";
import {
  circleSourceStatsForUser,
  pickCircleSourceForUser,
  releaseCircleSourceForUser,
} from "./circle-source-library.ts";
import {
  renderCircleVideo,
} from "./circle-video-renderer.ts";
import {
  listCircleGameplays,
  resolveCircleGameplay,
} from "./circle-gameplay-library.ts";
import { circleProjectDir, readCircleConfig } from "./circle-workspace.ts";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;

function projectDir(): string {
  return circleProjectDir();
}

export function telegramCircleTemplateName(): string {
  try {
    const config = readCircleConfig() as { templateName?: unknown };
    const name = typeof config.templateName === "string" ? config.templateName.trim().slice(0, 80) : "";
    return name || "Telegram-кружочки";
  } catch {
    return "Telegram-кружочки";
  }
}

export async function generateTelegramCircleVideo(
  outputRoot: string,
  stamp: string,
  userId: number,
): Promise<{
  videoRel: string;
  imageRel: string;
  source: string;
  gameplayFile: string;
}> {
  const root = projectDir();
  const source = await pickCircleSourceForUser(userId, root);
  if (!source) {
    const stats = circleSourceStatsForUser(userId, root);
    throw new TelegramCircleSourceExhaustedError(
      stats.total > 0
        ? "Свободные Telegram-кружки закончились. Загрузите новые кружки."
        : "Нет Telegram-кружков. Загрузите кружок в редакторе или отправьте его боту.",
    );
  }
  const videoRel = `preview/telegram-circle-${stamp}.mp4`;
  const imageRel = telegramCirclePosterRel(videoRel);
  const target = resolve(outputRoot, videoRel);
  try {
    const gameplays = listCircleGameplays(root);
    if (!gameplays.length) {
      throw new Error("Нет геймплея. Загрузите фоновое видео в редакторе Telegram-кружочков.");
    }
    const gameplayFile = gameplays[Math.floor(Math.random() * gameplays.length)] || gameplays[0];
    const gameplayPath = resolveCircleGameplay(gameplayFile, root);
    if (!gameplayPath) {
      throw new Error("Выбранный геймплей больше недоступен.");
    }
    const template = getCircleTemplate(activeCircleTemplateId());
    if (!template) throw new Error("Активный шаблон Telegram-кружочков не найден.");
    await mkdir(dirname(target), { recursive: true });
    await renderCircleVideo({
      sourceFile: resolve(root, "downloads", source),
      gameplayFile: gameplayPath,
      outputFile: target,
      layout: template.layout,
    });
    await createTelegramCirclePoster(outputRoot, videoRel);
    return { videoRel, imageRel, source, gameplayFile };
  } catch (error) {
    await rm(target, { force: true });
    await rm(resolve(outputRoot, imageRel), { force: true });
    await releaseCircleSourceForUser(userId, source, root);
    throw error;
  }
}

export class TelegramCircleSourceExhaustedError extends Error {}

export function telegramCirclePosterRel(videoRel: string): string {
  return String(videoRel).replace(/\.[^.]+$/, ".jpg");
}

export async function createTelegramCirclePoster(outputRoot: string, videoRel: string): Promise<string> {
  const imageRel = telegramCirclePosterRel(videoRel);
  const videoPath = resolve(outputRoot, videoRel);
  const imagePath = resolve(outputRoot, imageRel);
  await mkdir(dirname(imagePath), { recursive: true });
  await pexec(
    FFMPEG,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      "1",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      imagePath,
    ],
    { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 },
  );
  return imageRel;
}

export async function buildTelegramCircleLibraryVideo(input: {
  db: Db;
  outputRoot: string;
  accountId: number;
  deckId: string;
}): Promise<ReturnType<Db["createVideo"]>> {
  const templateId = circleTemplateIdFromDeckId(input.deckId);
  const template = templateId ? getCircleTemplate(templateId) : null;
  if (!template) throw new Error("Шаблон Telegram-кружочков не найден.");
  const account = input.db.getAccount(input.accountId);
  if (!account?.userId) throw new Error("У канала не найден владелец.");
  await activateCircleTemplate(template.id);
  const stamp = `library-${input.accountId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const generated = await generateTelegramCircleVideo(input.outputRoot, stamp, account.userId);
  try {
    return input.db.createVideo({
      accountId: input.accountId,
      title: template.name,
      text: "",
      bg: generated.gameplayFile,
      music: "none",
      deck: input.deckId,
      videoRel: generated.videoRel,
      imageRel: generated.imageRel,
    });
  } catch (error) {
    await rm(resolve(input.outputRoot, generated.videoRel), { force: true });
    await rm(resolve(input.outputRoot, generated.imageRel), { force: true });
    await releaseCircleSourceForUser(account.userId, generated.source, projectDir());
    throw error;
  }
}
