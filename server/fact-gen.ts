// Видео-факты (дека preFact, напр. "fact-en"): items — это УЖЕ готовые mp4
// (озвучка + сток-футаж + субтитры), лежащие в assets/fact-videos/. «Генерация в библиотеку»
// = скопировать выбранный mp4 (не рендерить карточку) + снять постер-кадр + пометить использованным.
// Совпадает по контракту с randomAnecdote/buildLibraryVideo (PackItem.videoFile несёт имя файла).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "./db.ts";
import { loadBaseConfig } from "./config.ts";
import { anecdoteKey, type PackItem } from "../src/anecdotes/library.ts";
import * as metrics from "./metrics.ts";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const OUTPUT_DIR = loadBaseConfig().outputDir;
const FACT_DIR = resolve(process.cwd(), "assets/fact-videos");

/** Скопировать ОДИН готовый видео-факт в библиотеку канала + пометить использованным. */
export async function buildFactLibraryVideo(input: {
  db: Db;
  userId: number;
  accountId: number;
  deckId: string;
  picked: PackItem; // .videoFile = имя mp4 в assets/fact-videos/, .text/.title — для метаданных
}) {
  const { db, userId, accountId, deckId, picked } = input;
  if (!picked.videoFile) throw new Error("У видео-факта нет файла (videoFile)");
  const src = resolve(FACT_DIR, picked.videoFile);
  if (!existsSync(src)) throw new Error(`Видео-факт не найден на диске: ${picked.videoFile}`);

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const vidRel = `library/fact-${stamp}.mp4`;
  const imgRel = `library/fact-${stamp}.png`;
  const vidAbs = resolve(process.cwd(), OUTPUT_DIR, vidRel);
  const imgAbs = resolve(process.cwd(), OUTPUT_DIR, imgRel);
  // Counted as a "render" task so the graceful-shutdown drain waits for it (like buildLibraryVideo).
  await metrics.track("render", async () => {
    mkdirSync(dirname(vidAbs), { recursive: true });
    copyFileSync(src, vidAbs);
    // Постер-кадр для миниатюры в библиотеке (best-effort — без него видео всё равно валидно).
    try {
      await pexec(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1", "-i", src, "-frames:v", "1", imgAbs]);
    } catch {
      /* thumbnail optional */
    }
  });
  const v = db.createVideo({
    accountId,
    title: picked.title || "Interesting Fact",
    text: picked.text,
    bg: "",
    music: "", // музыка уже вшита в готовый mp4
    deck: deckId,
    videoRel: vidRel,
    imageRel: existsSync(imgAbs) ? imgRel : null,
  });
  db.markAnecdoteUsed(userId, anecdoteKey(picked.text)); // не повторять этот факт для этого юзера
  return v;
}
