// Видео-факты (дека preFact, напр. "fact-en"): items ссылаются на готовые mp4 в assets/fact-videos/.
// EN копируется как есть; локализованные fact-* деки пересобирают тот же footage с локальной озвучкой
// и плашкой. Совпадает по контракту с randomAnecdote/buildLibraryVideo (PackItem.videoFile несёт имя файла).
import { copyFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "../db.ts";
import { loadBaseConfig } from "../config.ts";
import { type PackItem } from "../../src/anecdotes/library.ts";
import { deckLang } from "../../src/anecdotes/decks.ts";
import * as metrics from "../infra/metrics.ts";

const pexec = promisify(execFile);
const FFMPEG = ffmpegPath as unknown as string;
const OUTPUT_DIR = loadBaseConfig().outputDir;
const FACT_DIR = resolve(process.cwd(), "assets/fact-videos");
const TTS_PYTHON = resolve(process.cwd(), ".venv-tts/bin/python");
const FACT_TTS_VOICE_BY_LANG: Record<string, string> = {
  ru: "ru-RU-SvetlanaNeural",
  de: "de-DE-KatjaNeural",
  it: "it-IT-ElsaNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  pt: "pt-BR-FranciscaNeural",
};

async function mediaDurationSec(path: string): Promise<number> {
  try {
    const { stdout } = await pexec(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : 8;
  } catch {
    return 8;
  }
}

function cleanForSpeech(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[#*_`]/g, "").trim();
}

function wrapAss(text: string): string {
  const words = cleanForSpeech(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const maxLen = text.length > 95 ? 24 : 20;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLen && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join("\\N");
}

function assTime(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
}

function assDoc(text: string, durationSec: number): string {
  const fontSize = text.length > 95 ? 58 : text.length > 60 ? 64 : 72;
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,5,2,2,70,70,500,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(0)},${assTime(durationSec)},Default,,0,0,0,,${escapeAss(wrapAss(text))}
`;
}

function ffmpegFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function buildLocalizedFactVideo(input: {
  src: string;
  out: string;
  imageOut: string;
  title: string;
  text: string;
  stamp: string;
  lang: string;
  voice: string;
}): Promise<{ music: string }> {
  if (!existsSync(TTS_PYTHON)) throw new Error(`edge-tts не найден: ${TTS_PYTHON}`);
  const tempDir = resolve(process.cwd(), `temp/fact-${input.lang}-render`);
  mkdirSync(tempDir, { recursive: true });
  const speech = cleanForSpeech(input.text || input.title);
  const spoken = speech.length > 520 ? `${speech.slice(0, 500).replace(/\s+\S*$/, "")}.` : speech;
  const audioPath = resolve(tempDir, `${input.stamp}.mp3`);
  const assPath = resolve(tempDir, `${input.stamp}.ass`);
  await pexec(
    TTS_PYTHON,
    ["-m", "edge_tts", "--voice", input.voice, "--text", spoken, "--write-media", audioPath],
    { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const audioDuration = await mediaDurationSec(audioPath);
  const duration = Math.max(8, Math.min(60, audioDuration + 0.8));
  writeFileSync(assPath, assDoc(input.title || input.text, duration));
  const vf = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "drawbox=x=0:y=ih*0.48:w=iw:h=ih*0.28:color=black@0.64:t=fill",
    `subtitles='${ffmpegFilterPath(assPath)}':fontsdir=/usr/share/fonts/truetype/noto`,
  ].join(",");
  await pexec(
    FFMPEG,
    [
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      input.src,
      "-i",
      audioPath,
      "-t",
      duration.toFixed(2),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      input.out,
    ],
    { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
  );
  try {
    await pexec(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1", "-i", input.out, "-frames:v", "1", input.imageOut]);
  } catch {
    /* thumbnail optional */
  }
  return { music: `edge-tts:${input.voice}` };
}

/** Скопировать ОДИН готовый видео-факт в библиотеку канала + пометить использованным. */
export async function buildFactLibraryVideo(input: {
  db: Db;
  userId: number;
  accountId: number;
  deckId: string;
  picked: PackItem; // .videoFile = имя mp4 в assets/fact-videos/, .text/.title — для метаданных
}) {
  const { db, accountId, deckId, picked } = input; // userId: бронь факта делает вызывающий (claimAnecdote)
  if (!picked.videoFile) throw new Error("У видео-факта нет файла (videoFile)");
  const src = resolve(FACT_DIR, picked.videoFile);
  if (!existsSync(src)) throw new Error(`Видео-факт не найден на диске: ${picked.videoFile}`);

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const vidRel = `library/fact-${stamp}.mp4`;
  const imgRel = `library/fact-${stamp}.png`;
  const vidAbs = resolve(process.cwd(), OUTPUT_DIR, vidRel);
  const imgAbs = resolve(process.cwd(), OUTPUT_DIR, imgRel);
  // Counted as a "render" task so the graceful-shutdown drain waits for it (like buildLibraryVideo).
  let music = "";
  await metrics.track("render", async () => {
    mkdirSync(dirname(vidAbs), { recursive: true });
    const lang = deckLang(deckId);
    const localizedVoice = FACT_TTS_VOICE_BY_LANG[lang];
    if (localizedVoice) {
      const localized = await buildLocalizedFactVideo({
        src,
        out: vidAbs,
        imageOut: imgAbs,
        title: picked.title || "Interesting Fact",
        text: picked.text || picked.title || "Interesting Fact",
        stamp,
        lang,
        voice: localizedVoice,
      });
      music = localized.music;
    } else {
      copyFileSync(src, vidAbs);
      // Постер-кадр для миниатюры в библиотеке (best-effort — без него видео всё равно валидно).
      try {
        await pexec(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1", "-i", src, "-frames:v", "1", imgAbs]);
      } catch {
        /* thumbnail optional */
      }
    }
  });
  const v = db.createVideo({
    accountId,
    title: picked.title || "Interesting Fact",
    text: picked.text,
    bg: "",
    music, // non-localized prebuilt mp4s already include audio; localized variants use edge-tts
    deck: deckId,
    videoRel: vidRel,
    imageRel: existsSync(imgAbs) ? imgRel : null,
  });
  // NB: бронь факта (claimAnecdote) делает ВЫЗЫВАЮЩИЙ ДО копирования — иначе параллельные генерации
  // взяли бы один факт дважды. Здесь не помечаем.
  return v;
}
