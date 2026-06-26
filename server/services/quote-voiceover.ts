import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Deck } from "../../src/anecdotes/decks.ts";
import { deckLang } from "../../src/anecdotes/decks.ts";

const pexec = promisify(execFile);

const TTS_PYTHON = resolve(process.cwd(), ".venv-tts/bin/python");
const CACHE_DIR = resolve(process.cwd(), "temp/quote-tts");

const VOICE_BY_LANG: Record<string, string> = {
  ar: "ar-SA-ZariyahNeural",
  de: "de-DE-KatjaNeural",
  en: "en-US-JennyNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  hi: "hi-IN-SwaraNeural",
  id: "id-ID-GadisNeural",
  it: "it-IT-IsabellaNeural",
  pt: "pt-PT-RaquelNeural",
  ru: "ru-RU-SvetlanaNeural",
};

function hashKey(parts: string[]): string {
  const h = createHash("sha256");
  for (const part of parts) {
    h.update("\0");
    h.update(part);
  }
  return h.digest("hex").slice(0, 24);
}

function spokenText(lang: string, quote: string, author: string): string {
  const cleanQuote = quote.replace(/\s+/g, " ").trim();
  const cleanAuthor = author.replace(/\s+/g, " ").trim();
  if (lang === "ru") return `${cleanQuote}. Автор: ${cleanAuthor}.`;
  if (lang === "de") return `${cleanQuote}. ${cleanAuthor}.`;
  if (lang === "es") return `${cleanQuote}. ${cleanAuthor}.`;
  return `${cleanQuote}. ${cleanAuthor}.`;
}

async function audioDurationSec(audioPath: string): Promise<number> {
  try {
    const { stdout } = await pexec(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
      { timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    const n = Number(String(stdout).trim());
    return Number.isFinite(n) && n > 0 ? n : 8;
  } catch {
    return 8;
  }
}

export async function quoteVoiceover(input: {
  deck: Deck;
  title: string;
  text: string;
}): Promise<{ audioPath: string; durationSec: number; music: string }> {
  const lang = deckLang(input.deck.id);
  const voice = VOICE_BY_LANG[lang];
  if (!voice) throw new Error(`Для видео-цитат нет edge-tts голоса для языка ${lang || input.deck.id}`);
  if (!existsSync(TTS_PYTHON)) throw new Error(`edge-tts не найден: ${TTS_PYTHON}`);

  const text = spokenText(lang, input.text, input.title || input.deck.name);
  const key = hashKey([input.deck.id, voice, text]);
  const audioPath = resolve(CACHE_DIR, `${input.deck.id}-${key}.mp3`);
  if (!existsSync(audioPath)) {
    mkdirSync(dirname(audioPath), { recursive: true });
    await pexec(
      TTS_PYTHON,
      ["-m", "edge_tts", "--voice", voice, "--text", text, "--write-media", audioPath],
      { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
  }
  const duration = await audioDurationSec(audioPath);
  return {
    audioPath,
    durationSec: Math.max(7, Math.min(45, duration + 0.8)),
    music: `edge-tts:${voice}`,
  };
}
