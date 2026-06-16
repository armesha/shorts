// Import a finished montage mp4 (from the admin "Нарезки" gallery, data/output/admin-demos/) into a
// channel's library so the existing scheduler auto-posts it — mirrors buildFactLibraryVideo
// (copy the ready mp4 + grab a poster + db.createVideo). No re-render.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "./db.ts";
import { loadBaseConfig } from "./config.ts";
import * as metrics from "./metrics.ts";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const OUTPUT_DIR = loadBaseConfig().outputDir;
const DEMOS_DIR = resolve(process.cwd(), OUTPUT_DIR, "admin-demos");

/** Copy a gallery montage into a channel's library (then the scheduler posts it like any other video). */
export async function importClipToLibrary(input: {
  db: Db;
  accountId: number;
  clipId: string;
  title: string;
  description: string;
  deck: string;
}) {
  const { db, accountId, clipId, title, description, deck } = input;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(clipId)) throw new Error("Некорректный id ролика");
  const src = resolve(DEMOS_DIR, `${clipId}.mp4`);
  if (!existsSync(src)) throw new Error(`Ролик не найден: ${clipId}.mp4`);

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const vidRel = `library/clip-${stamp}.mp4`;
  const imgRel = `library/clip-${stamp}.png`;
  const vidAbs = resolve(process.cwd(), OUTPUT_DIR, vidRel);
  const imgAbs = resolve(process.cwd(), OUTPUT_DIR, imgRel);
  // Counted as a "render" task so graceful-shutdown drains it (same as buildFactLibraryVideo).
  await metrics.track("render", async () => {
    mkdirSync(dirname(vidAbs), { recursive: true });
    copyFileSync(src, vidAbs);
    try {
      await pexec(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1", "-i", src, "-frames:v", "1", imgAbs]);
    } catch {
      /* poster optional */
    }
  });
  return db.createVideo({
    accountId,
    title: (title || clipId).slice(0, 100),
    text: (description || "").slice(0, 4900),
    bg: "",
    music: "", // audio already baked into the montage mp4
    deck,
    videoRel: vidRel,
    imageRel: existsSync(imgAbs) ? imgRel : null,
  });
}
