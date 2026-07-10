import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { GEMINI_TTS_MODEL } from "./gemini-tts.ts";

const CHARACTER_STORE_PATH = resolve(process.cwd(), "data/audio-characters/characters.json");
const SAMPLE_DIR = resolve(process.cwd(), "data/audio-characters/samples");

export interface GeminiTtsCharacter {
  id: string;
  name: string;
  description: string;
  model: string;
  language: string;
  voice: string;
  style: string;
  pace: string;
  accent: string;
  scene: string;
  energy: number;
  sampleText: string;
  sampleUrl: string;
  sampleDurationSec: number;
  postProcessing: {
    label: string;
    ffmpegFilter: string;
  };
  source: {
    deck: string;
    cardId: string;
    phrase: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface StoredGeminiTtsCharacter extends Omit<GeminiTtsCharacter, "sampleUrl"> {
  sampleFile: string;
}

interface CharacterStore {
  characters: StoredGeminiTtsCharacter[];
}

const DEFAULT_CREATED_AT = "2026-07-09T00:00:00.000Z";

const DEFAULT_CHARACTERS: StoredGeminiTtsCharacter[] = [
  {
    id: "vitek",
    name: "Витёк",
    description: "Низковатый, чуть писклявый русский комедийный голос для живых диалогов и анекдотов.",
    model: GEMINI_TTS_MODEL,
    language: "ru",
    voice: "Puck",
    style: "lower-pitched but slightly squeaky nasal Russian comedy narrator; lively, not slow; distinct intonation for each dialogue line; no extra spoken words beyond transcript",
    pace: "medium-fast; short tight pauses; punchlines a little sharper; do not drag vowels; finish with a quick small laugh",
    accent: "natural Russian, casual, clear diction",
    scene: "Voiceover for an existing Russian anecdote card from the app library. Short-form comedy timing, close microphone.",
    energy: 4,
    sampleText: "[fast] Алло, здорово, как дела, чё делаешь?",
    sampleFile: "vitek-allo.wav",
    sampleDurationSec: 2.3,
    postProcessing: {
      label: "Ниже, быстрее, носовой комедийный тембр",
      ffmpegFilter:
        "asetrate=24000*0.94,aresample=48000,atempo=1.35,highpass=f=85,equalizer=f=2600:t=q:w=1.1:g=3.0,equalizer=f=4300:t=q:w=1.0:g=1.8,loudnorm=I=-15:TP=-1.5:LRA=9",
    },
    source: {
      deck: "ru",
      cardId: "558",
      phrase: "Алло, здорово, как дела, чё делаешь?",
    },
    createdAt: DEFAULT_CREATED_AT,
    updatedAt: DEFAULT_CREATED_AT,
  },
];

export class GeminiTtsCharacterError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "GeminiTtsCharacterError";
    this.statusCode = statusCode;
  }
}

export function listGeminiTtsCharacters(): GeminiTtsCharacter[] {
  return loadStore().characters.map(publicCharacter);
}

export function renameGeminiTtsCharacter(id: string, name: unknown): GeminiTtsCharacter {
  const cleanName = normalizeCharacterName(name);
  const store = loadStore();
  const index = store.characters.findIndex((character) => character.id === id);
  if (index === -1) throw new GeminiTtsCharacterError(404, "Персонаж не найден.");
  const updated: StoredGeminiTtsCharacter = {
    ...store.characters[index],
    name: cleanName,
    updatedAt: new Date().toISOString(),
  };
  store.characters[index] = updated;
  saveStore(store);
  return publicCharacter(updated);
}

export function geminiTtsCharacterSample(id: string) {
  const character = loadStore().characters.find((item) => item.id === id);
  if (!character) throw new GeminiTtsCharacterError(404, "Персонаж не найден.");
  const samplePath = resolveSamplePath(character.sampleFile);
  if (!existsSync(samplePath)) throw new GeminiTtsCharacterError(404, "Аудиопример персонажа не найден.");
  return { stream: createReadStream(samplePath), mimeType: "audio/wav" as const };
}

export function geminiTtsCharacterAlignmentInput(id: string) {
  const character = loadStore().characters.find((item) => item.id === id);
  if (!character) throw new GeminiTtsCharacterError(404, "Персонаж не найден.");
  const wavPath = resolveSamplePath(character.sampleFile);
  if (!existsSync(wavPath)) throw new GeminiTtsCharacterError(404, "Аудиопример персонажа не найден.");
  return {
    id: character.id,
    language: character.language,
    transcript: character.source.phrase || character.sampleText,
    wavPath,
  };
}

function loadStore(): CharacterStore {
  try {
    if (!existsSync(CHARACTER_STORE_PATH)) return { characters: [...DEFAULT_CHARACTERS] };
    const parsed = JSON.parse(readFileSync(CHARACTER_STORE_PATH, "utf8")) as Partial<CharacterStore>;
    if (!Array.isArray(parsed.characters)) return { characters: [...DEFAULT_CHARACTERS] };
    const characters = parsed.characters
      .map((item) => normalizeStoredCharacter(item))
      .filter((item): item is StoredGeminiTtsCharacter => !!item);
    return { characters: characters.length ? characters : [...DEFAULT_CHARACTERS] };
  } catch {
    return { characters: [...DEFAULT_CHARACTERS] };
  }
}

function saveStore(store: CharacterStore) {
  mkdirSync(dirname(CHARACTER_STORE_PATH), { recursive: true });
  const tmpPath = `${CHARACTER_STORE_PATH}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(tmpPath, CHARACTER_STORE_PATH);
}

function normalizeStoredCharacter(item: unknown): StoredGeminiTtsCharacter | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Partial<StoredGeminiTtsCharacter>;
  if (!row.id || !row.sampleFile) return null;
  return {
    id: String(row.id),
    name: String(row.name || row.id),
    description: String(row.description || ""),
    model: String(row.model || GEMINI_TTS_MODEL),
    language: String(row.language || "ru"),
    voice: String(row.voice || "Puck"),
    style: String(row.style || ""),
    pace: String(row.pace || ""),
    accent: String(row.accent || ""),
    scene: String(row.scene || ""),
    energy: clampEnergy(row.energy),
    sampleText: String(row.sampleText || ""),
    sampleFile: basename(String(row.sampleFile)),
    sampleDurationSec: Number.isFinite(Number(row.sampleDurationSec)) ? Number(row.sampleDurationSec) : 0,
    postProcessing: {
      label: String(row.postProcessing?.label || ""),
      ffmpegFilter: String(row.postProcessing?.ffmpegFilter || ""),
    },
    source: {
      deck: String(row.source?.deck || ""),
      cardId: String(row.source?.cardId || ""),
      phrase: String(row.source?.phrase || ""),
    },
    createdAt: String(row.createdAt || DEFAULT_CREATED_AT),
    updatedAt: String(row.updatedAt || row.createdAt || DEFAULT_CREATED_AT),
  };
}

function publicCharacter(character: StoredGeminiTtsCharacter): GeminiTtsCharacter {
  const { sampleFile: _sampleFile, ...rest } = character;
  return {
    ...rest,
    sampleUrl: `/api/audio/gemini/characters/${encodeURIComponent(character.id)}/sample`,
  };
}

function resolveSamplePath(file: string): string {
  return resolve(SAMPLE_DIR, basename(file));
}

function normalizeCharacterName(name: unknown): string {
  const value = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!value) throw new GeminiTtsCharacterError(400, "Введите имя персонажа.");
  if (value.length > 60) throw new GeminiTtsCharacterError(400, "Имя персонажа слишком длинное.");
  return value;
}

function clampEnergy(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(5, Math.round(parsed)));
}
