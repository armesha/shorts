import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Db } from "../db.ts";
import {
  activateCircleTemplate,
  activeCircleTemplateId,
  circleTemplateIdFromDeckId,
  getCircleTemplate,
} from "./circle-templates.ts";
import {
  pickCircleSourceForUser,
} from "./circle-source-library.ts";
import {
  renderCircleVideo,
} from "./circle-video-renderer.ts";
import {
  listCircleGameplays,
  resolveCircleGameplay,
} from "./circle-gameplay-library.ts";
import { circleProjectDir, readCircleConfig } from "./circle-workspace.ts";

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
  source: string;
  gameplayFile: string;
}> {
  const root = projectDir();
  const source = await pickCircleSourceForUser(userId, root);
  if (!source) {
    throw new Error("Нет Telegram-кружков. Загрузите кружок в редакторе или отправьте его боту.");
  }
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

  const videoRel = `preview/telegram-circle-${stamp}.mp4`;
  const target = resolve(outputRoot, videoRel);
  await mkdir(dirname(target), { recursive: true });
  try {
    await renderCircleVideo({
      sourceFile: resolve(root, "downloads", source),
      gameplayFile: gameplayPath,
      outputFile: target,
      layout: template.layout,
    });
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
  return { videoRel, source, gameplayFile };
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
      imageRel: null,
    });
  } catch (error) {
    await rm(resolve(input.outputRoot, generated.videoRel), { force: true });
    throw error;
  }
}
