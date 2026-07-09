import type { Account, Db } from "../db.ts";

export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_SAMPLE_WIDTH_BYTES = 2;
const MAX_PREVIEW_TEXT_CHARS = 6_000;

export type GeminiTtsLanguageCode = keyof typeof GEMINI_TTS_LANGUAGES;

export const GEMINI_TTS_LANGUAGES = {
  ar: { label: "العربية", promptName: "Arabic" },
  de: { label: "Deutsch", promptName: "German" },
  en: { label: "English", promptName: "English" },
  es: { label: "Español", promptName: "Spanish" },
  fr: { label: "Français", promptName: "French" },
  it: { label: "Italiano", promptName: "Italian" },
  ja: { label: "日本語", promptName: "Japanese" },
  pl: { label: "Polski", promptName: "Polish" },
  pt: { label: "Português", promptName: "Portuguese" },
  ro: { label: "Română", promptName: "Romanian" },
  ru: { label: "Русский", promptName: "Russian" },
} as const;

export const GEMINI_TTS_VOICES = [
  { id: "Zephyr", tone: "Bright" },
  { id: "Puck", tone: "Upbeat" },
  { id: "Charon", tone: "Informative" },
  { id: "Kore", tone: "Firm" },
  { id: "Fenrir", tone: "Excitable" },
  { id: "Leda", tone: "Youthful" },
  { id: "Orus", tone: "Firm" },
  { id: "Aoede", tone: "Breezy" },
  { id: "Callirrhoe", tone: "Easy-going" },
  { id: "Autonoe", tone: "Bright" },
  { id: "Enceladus", tone: "Breathy" },
  { id: "Iapetus", tone: "Clear" },
  { id: "Umbriel", tone: "Easy-going" },
  { id: "Algieba", tone: "Smooth" },
  { id: "Despina", tone: "Smooth" },
  { id: "Erinome", tone: "Clear" },
  { id: "Algenib", tone: "Gravelly" },
  { id: "Rasalgethi", tone: "Informative" },
  { id: "Laomedeia", tone: "Upbeat" },
  { id: "Achernar", tone: "Soft" },
  { id: "Alnilam", tone: "Firm" },
  { id: "Schedar", tone: "Even" },
  { id: "Gacrux", tone: "Mature" },
  { id: "Pulcherrima", tone: "Forward" },
  { id: "Achird", tone: "Friendly" },
  { id: "Zubenelgenubi", tone: "Casual" },
  { id: "Vindemiatrix", tone: "Gentle" },
  { id: "Sadachbia", tone: "Lively" },
  { id: "Sadaltager", tone: "Knowledgeable" },
  { id: "Sulafat", tone: "Warm" },
] as const;

export const GEMINI_TTS_PRESETS = [
  {
    id: "meme-punchline",
    label: "Мемный панч",
    voice: "Puck",
    style: "dry, mischievous short-form comedy host with a visible smile in the voice",
    pace: "fast but still clean; punch the last phrase and leave tiny pauses before the punchline",
    accent: "",
    scene: "A compact Shorts booth: close mic, quick cuts, no dead air.",
    energy: 4,
    sampleText: "[laughs] Ну всё, это уже не план, это легенда.",
  },
  {
    id: "joke-storyteller",
    label: "Рассказчик анекдотов",
    voice: "Achird",
    style: "friendly late-night storyteller, natural and conversational",
    pace: "medium; keep setup clear and slow down slightly before the punchline",
    accent: "",
    scene: "A warm studio corner where the narrator tells a quick joke directly to one viewer.",
    energy: 3,
    sampleText: "Заходит программист в бар и говорит: мне как обычно, но без багов.",
  },
  {
    id: "whisper-suspense",
    label: "Шепот и пауза",
    voice: "Enceladus",
    style: "breathy suspense narrator with controlled whisper and playful tension",
    pace: "slow; use short pauses and a quiet final reveal",
    accent: "",
    scene: "A near-silent room, close microphone, the joke is delivered like a tiny secret.",
    energy: 2,
    sampleText: "[whispers] Я думал, что это обычный мем... [short pause] но он оказался про меня.",
  },
  {
    id: "sarcastic-reaction",
    label: "Саркастичная реакция",
    voice: "Kore",
    style: "deadpan, skeptical, sarcastic reaction voice",
    pace: "medium-fast; keep the first half flat and make the final word sharper",
    accent: "",
    scene: "A reaction voiceover over a fast meme clip, direct and dry.",
    energy: 3,
    sampleText: "[sarcastic] Конечно, отличный план. Что вообще могло пойти не так?",
  },
  {
    id: "fast-shorts",
    label: "Быстрый Shorts",
    voice: "Laomedeia",
    style: "upbeat short-form narrator with clean diction and strong hooks",
    pace: "very fast, but keep every word understandable",
    accent: "",
    scene: "A bright vertical-video voice booth with high tempo and tight timing.",
    energy: 5,
    sampleText: "[excited] Подожди до конца, потому что финал реально странный.",
  },
  {
    id: "warm-explainer",
    label: "Теплый факт",
    voice: "Sulafat",
    style: "warm, calm, trustworthy narrator",
    pace: "medium-slow; relaxed, clear, and human",
    accent: "",
    scene: "A clean documentary-style voiceover for a short interesting fact.",
    energy: 2,
    sampleText: "Иногда самая простая деталь меняет смысл всей истории.",
  },
] as const;

export type GeminiTtsPresetId = (typeof GEMINI_TTS_PRESETS)[number]["id"];

export interface GeminiTtsPreviewInput {
  text: string;
  language: string;
  voice: string;
  style?: string;
  pace?: string;
  accent?: string;
  scene?: string;
  energy?: number;
  apiKey?: string;
}

export interface GeminiTtsPreviewResult {
  model: string;
  voice: string;
  language: string;
  languageLabel: string;
  mimeType: "audio/wav";
  audioDataUrl: string;
  durationSec: number;
  inputChars: number;
  prompt: string;
  usage?: unknown;
}

export class GeminiTtsError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "GeminiTtsError";
    this.statusCode = statusCode;
  }
}

export function hasServerGeminiApiKey(): boolean {
  return !!serverGeminiApiKey();
}

export function listArmenTtsLanguages(db: Db) {
  const user = db.getUserByUsername("armen");
  const accounts = user ? db.listAccountsByUser(user.id) : db.listAccounts().filter((account) => account.ownerUsername === "armen");
  const counts = new Map<GeminiTtsLanguageCode, { accountCount: number; channelNames: Set<string> }>();
  for (const account of accounts) {
    const codes = languageCodesForAccount(account);
    for (const code of codes) {
      const row = counts.get(code) ?? { accountCount: 0, channelNames: new Set<string>() };
      row.accountCount += 1;
      row.channelNames.add(account.channelName);
      counts.set(code, row);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].accountCount - a[1].accountCount || a[0].localeCompare(b[0]))
    .map(([code, row]) => ({
      code,
      label: GEMINI_TTS_LANGUAGES[code].label,
      promptName: GEMINI_TTS_LANGUAGES[code].promptName,
      accountCount: row.accountCount,
      channelNames: [...row.channelNames].slice(0, 8),
    }));
}

export function buildGeminiTtsPrompt(input: GeminiTtsPreviewInput): string {
  const text = normalizePreviewText(input.text);
  const language = validLanguage(input.language);
  const voice = validVoice(input.voice);
  const style = cleanLine(input.style) || "natural short-form narration";
  const pace = cleanLine(input.pace) || "medium pace, clear diction";
  const accent = cleanLine(input.accent);
  const scene = cleanLine(input.scene) || "A clean close-mic studio recording for a vertical short.";
  const energy = clampEnergy(input.energy);

  return [
    "# AUDIO PROFILE",
    `Voice: ${voice}`,
    `Language: ${GEMINI_TTS_LANGUAGES[language].promptName}. Read the transcript as written; do not translate it.`,
    "Role: virtual voice actor for short-form video voiceover.",
    "",
    "## THE SCENE",
    scene,
    "",
    "### DIRECTOR'S NOTES",
    `Style: ${style}`,
    `Pacing: ${pace}`,
    `Energy: ${energy}/5`,
    accent ? `Accent: ${accent}` : "Accent: natural for the selected language.",
    "Breathing and pauses: keep it human, with short intentional pauses where the transcript suggests them.",
    "If inline audio tags are present, interpret English tags such as [laughs], [whispers], [sighs], [sarcastic], [excited], [short pause].",
    "",
    "#### TRANSCRIPT",
    text,
  ].join("\n");
}

export async function generateGeminiTtsPreview(input: GeminiTtsPreviewInput): Promise<GeminiTtsPreviewResult> {
  const apiKey = cleanApiKey(input.apiKey) || serverGeminiApiKey();
  if (!apiKey) throw new GeminiTtsError(400, "Нужен Google AI Studio API key: задайте GEMINI_API_KEY на сервере или вставьте ключ в поле страницы.");

  const text = normalizePreviewText(input.text);
  const language = validLanguage(input.language);
  const voice = validVoice(input.voice);
  const prompt = buildGeminiTtsPrompt({ ...input, text, language, voice });
  const controller = new AbortController();
  const timeoutMs = Math.max(5_000, Number(process.env.GEMINI_TTS_TIMEOUT_MS ?? 60_000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GEMINI_TTS_MODEL,
        input: prompt,
        response_format: { type: "audio" },
        generation_config: {
          speech_config: [{ voice }],
        },
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      throw new GeminiTtsError(response.status, geminiErrorMessage(json, raw));
    }

    const audio = extractAudioPayload(json);
    if (!audio?.data) throw new GeminiTtsError(502, "Gemini TTS не вернул аудио. Повторите запрос.");
    const pcm = Buffer.from(audio.data, "base64");
    if (!pcm.length) throw new GeminiTtsError(502, "Gemini TTS вернул пустой аудиопоток.");
    const sampleRate = audio.sampleRate || DEFAULT_SAMPLE_RATE;
    const channels = audio.channels || DEFAULT_CHANNELS;
    const wav = pcmToWav(pcm, { sampleRate, channels, sampleWidthBytes: DEFAULT_SAMPLE_WIDTH_BYTES });
    const durationSec = pcm.length / (sampleRate * channels * DEFAULT_SAMPLE_WIDTH_BYTES);

    return {
      model: GEMINI_TTS_MODEL,
      voice,
      language,
      languageLabel: GEMINI_TTS_LANGUAGES[language].label,
      mimeType: "audio/wav",
      audioDataUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
      durationSec,
      inputChars: text.length,
      prompt,
      usage: interactionUsage(json),
    };
  } catch (error) {
    if (error instanceof GeminiTtsError) throw error;
    if ((error as { name?: string })?.name === "AbortError") {
      throw new GeminiTtsError(504, "Gemini TTS не ответил вовремя.");
    }
    throw new GeminiTtsError(502, sanitizeUpstreamMessage(error instanceof Error ? error.message : String(error)));
  } finally {
    clearTimeout(timer);
  }
}

export function pcmToWav(
  pcm: Buffer,
  opts: { sampleRate?: number; channels?: number; sampleWidthBytes?: number } = {},
): Buffer {
  const sampleRate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = opts.channels ?? DEFAULT_CHANNELS;
  const sampleWidthBytes = opts.sampleWidthBytes ?? DEFAULT_SAMPLE_WIDTH_BYTES;
  const bitsPerSample = sampleWidthBytes * 8;
  const byteRate = sampleRate * channels * sampleWidthBytes;
  const blockAlign = channels * sampleWidthBytes;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function languageCodesForAccount(account: Account): Set<GeminiTtsLanguageCode> {
  const codes = new Set<GeminiTtsLanguageCode>();
  addLanguage(codes, account.channelLang);
  addLanguage(codes, account.lang);
  for (const deck of account.sourceDecks) addLanguage(codes, inferDeckLanguage(deck));
  return codes;
}

function inferDeckLanguage(deck: string): string {
  const raw = deck.replace(/^pack:/, "").toLowerCase();
  const parts = raw.split(/[^a-z]+/).filter(Boolean);
  for (const part of parts) {
    if (part in GEMINI_TTS_LANGUAGES) return part;
  }
  return raw;
}

function addLanguage(codes: Set<GeminiTtsLanguageCode>, raw: string | null | undefined) {
  const code = String(raw ?? "").trim().toLowerCase();
  if (code in GEMINI_TTS_LANGUAGES) codes.add(code as GeminiTtsLanguageCode);
}

function normalizePreviewText(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) throw new GeminiTtsError(400, "Введите текст для озвучки.");
  if (text.length > MAX_PREVIEW_TEXT_CHARS) throw new GeminiTtsError(400, `Текст слишком длинный: максимум ${MAX_PREVIEW_TEXT_CHARS} символов.`);
  return text;
}

function validLanguage(value: unknown): GeminiTtsLanguageCode {
  const code = String(value ?? "").trim().toLowerCase();
  if (code in GEMINI_TTS_LANGUAGES) return code as GeminiTtsLanguageCode;
  throw new GeminiTtsError(400, "Этот язык не доступен для текущих каналов armen.");
}

function validVoice(value: unknown): string {
  const voice = String(value ?? "").trim();
  if (GEMINI_TTS_VOICES.some((item) => item.id === voice)) return voice;
  throw new GeminiTtsError(400, "Неизвестный голос Gemini TTS.");
}

function cleanLine(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function clampEnergy(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function serverGeminiApiKey(): string {
  return cleanApiKey(process.env.GEMINI_API_KEY) || cleanApiKey(process.env.GOOGLE_AI_API_KEY) || cleanApiKey(process.env.GOOGLE_API_KEY);
}

function cleanApiKey(value: unknown): string {
  const key = String(value ?? "").trim();
  if (!key) return "";
  if (key.length > 300) throw new GeminiTtsError(400, "API key выглядит слишком длинным.");
  return key;
}

function extractAudioPayload(json: unknown): { data: string; sampleRate: number; channels: number } | null {
  const data = json as {
    output_audio?: { data?: string; sample_rate?: number; channels?: number };
    steps?: { content?: { type?: string; data?: string; sample_rate?: number; channels?: number; mime_type?: string }[] }[];
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] } }[];
  };
  if (data.output_audio?.data) {
    return {
      data: data.output_audio.data,
      sampleRate: Number(data.output_audio.sample_rate) || DEFAULT_SAMPLE_RATE,
      channels: Number(data.output_audio.channels) || DEFAULT_CHANNELS,
    };
  }
  for (const step of data.steps ?? []) {
    for (const part of step.content ?? []) {
      if (part.type === "audio" && part.data) {
        return {
          data: part.data,
          sampleRate: Number(part.sample_rate) || DEFAULT_SAMPLE_RATE,
          channels: Number(part.channels) || DEFAULT_CHANNELS,
        };
      }
    }
  }
  const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData ?? data.candidates?.[0]?.content?.parts?.[0]?.inline_data;
  if (inline?.data) return { data: inline.data, sampleRate: DEFAULT_SAMPLE_RATE, channels: DEFAULT_CHANNELS };
  return null;
}

function interactionUsage(json: unknown): unknown {
  const usage = (json as { usage?: unknown } | null)?.usage;
  return usage && typeof usage === "object" ? usage : undefined;
}

function geminiErrorMessage(json: unknown, fallback: string): string {
  const error = (json as { error?: { message?: string; status?: string; code?: number } } | null)?.error;
  const message = error?.message || fallback || "Gemini TTS вернул ошибку.";
  return sanitizeUpstreamMessage(message);
}

function sanitizeUpstreamMessage(message: string): string {
  return message.replace(/[A-Za-z0-9_.-]{24,}/g, "[redacted]").slice(0, 600);
}
