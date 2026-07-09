import { ApiError } from "../../lib/api/http";
import { FALLBACK_PRESETS } from "./config";
import type {
  CardValues,
  CreatorAsset,
  CreatorBackground,
  CreatorPack,
  CreatorRecord,
  CreatorSummary,
  TemplatePreset,
} from "./types";

export function cardValuesFromSample(sample: unknown): CardValues {
  const s = (sample ?? {}) as CreatorRecord;
  const asText = (value: unknown) => Array.isArray(value) ? value.map(String).join("\n") : String(value ?? "");
  const heading = asText(s.title ?? s.heading ?? s.hook ?? s.badge).trim();
  const body = asText(s.text ?? s.body ?? s.fact ?? s.points ?? s.items).trim();
  return {
    badge: asText(s.source ?? s.badge ?? "").trim(),
    heading: heading || "Новая карточка",
    body: body || "Текст карточки",
    text: asText(s.description ?? "").trim(),
    cta: asText(s.cta ?? "").trim(),
  };
}

export function firstTemplateImageSrc(templates: unknown): string | undefined {
  const list = Array.isArray(templates) ? templates : [];
  for (const template of list) {
    const elements = Array.isArray((template as CreatorRecord)?.elements) ? ((template as CreatorRecord).elements as unknown[]) : [];
    const image = elements.find((el) => {
      const record = el as CreatorRecord;
      const src = record?.src;
      const id = String(record?.id ?? "");
      return record?.type === "image" && id !== "creator-sticker-image" && typeof src === "string" && /^(assets\/template-packs\/|data:image\/)/.test(src);
    }) as CreatorRecord | undefined;
    if (typeof image?.src === "string") return image.src;
  }
  return undefined;
}

export function normalizePreset(raw: unknown): TemplatePreset | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as CreatorRecord;
  const id = String(src.id ?? "").trim();
  if (!id) return null;
  const templateType = String(src.templateType ?? src.type ?? "custom");
  return {
    id,
    label: String(src.label ?? src.name ?? id),
    templateType,
    lang: typeof src.lang === "string" ? src.lang : undefined,
    templates: Array.isArray(src.templates) ? src.templates : [],
    previewSrc: typeof src.previewSrc === "string" ? src.previewSrc : firstTemplateImageSrc(src.templates),
    defaults: cardValuesFromSample(src.sample ?? src.defaults),
  };
}

export function localizedFallbackPresets(t: (key: string, vars?: Record<string, string | number>) => string): TemplatePreset[] {
  return FALLBACK_PRESETS.map((preset) => ({
    ...preset,
    label: t(`creator.preset.${preset.id}.label`),
    defaults: {
      badge: t(`creator.preset.${preset.id}.badge`),
      heading: t(`creator.preset.${preset.id}.heading`),
      body: t(`creator.preset.${preset.id}.body`),
      text: t(`creator.preset.${preset.id}.text`),
      cta: t(`creator.preset.${preset.id}.cta`),
    },
  }));
}

export function normalizeSummary(data: unknown): CreatorSummary {
  const src = (data ?? {}) as CreatorRecord;
  const presets = Array.isArray(src.presets)
    ? (src.presets.map(normalizePreset).filter(Boolean) as TemplatePreset[])
    : [];
  return {
    feature: Boolean(src.feature),
    packs: Array.isArray(src.packs) ? (src.packs as CreatorPack[]) : [],
    gallery: Array.isArray(src.gallery) ? (src.gallery as CreatorRecord[]) : [],
    backgrounds: Array.isArray(src.backgrounds) ? (src.backgrounds as CreatorBackground[]) : [],
    userBackgrounds: Array.isArray(src.userBackgrounds) ? (src.userBackgrounds as CreatorBackground[]) : [],
    presets,
    music: Array.isArray(src.music) ? (src.music as CreatorAsset[]) : [],
    motion: Array.isArray(src.motion) ? (src.motion as CreatorAsset[]) : [],
  };
}

export function packId(pack: CreatorPack | null | undefined): string {
  return String(pack?.id ?? pack?.packId ?? pack?.slug ?? "");
}

export function packCards(pack: CreatorPack | null | undefined): number {
  if (!pack) return 0;
  if (Array.isArray(pack.cards)) return pack.cards.length;
  const raw = pack.cards ?? pack.cardCount ?? pack.totalCards ?? pack.total ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function packHasTemplates(pack: CreatorPack | null | undefined): boolean {
  if (!pack) return false;
  if (Array.isArray(pack.templates)) return pack.templates.length > 0;
  return Number(pack.templates) > 0;
}

export function packCardItems(pack: CreatorPack | null | undefined): CreatorRecord[] {
  return Array.isArray(pack?.cards) ? pack.cards.filter((item): item is CreatorRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export function creatorServiceAssetUrl(src: string | undefined): string {
  const value = String(src ?? "").trim();
  if (!value) return "";
  if (/^(data:image\/|https?:\/\/|\/)/i.test(value)) return value;
  if (!value.startsWith("assets/template-packs/") && !value.startsWith("assets/motion/") && !value.startsWith("assets/creator/motion/")) return "";
  return `/api/creator/service-assets/${value.slice("assets/".length).split("/").map(encodeURIComponent).join("/")}`;
}

export function cssUrl(url: string): string {
  return url.replace(/["\\]/g, "\\$&");
}

export function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return `${fallback}: ${err.message}`;
  if (err instanceof Error) return `${fallback}: ${err.message}`;
  return fallback;
}

export function templateTone(templateType: string): string {
  const type = templateType.toLowerCase();
  if (type.includes("meme")) return "tone-meme";
  if (type.includes("joke") || type.includes("fun")) return "tone-joke";
  if (type.includes("motivation") || type.includes("rule") || type.includes("list")) return "tone-motivation";
  if (type.includes("quote") || type.includes("thought")) return "tone-quote";
  if (type.includes("fact") || type.includes("kids")) return "tone-bright";
  return "tone-calm";
}

export function usableBackgroundUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(data:image\/|https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return "";
}

/** Читаемые заголовок/текст карточки пака (values по ролям с алиасами). */
export function cardTitleText(card: CreatorRecord): { title: string; text: string; narration: string } {
  const values = (card.values && typeof card.values === "object" && !Array.isArray(card.values) ? card.values : card) as CreatorRecord;
  const asText = (value: unknown) => (Array.isArray(value) ? value.map(String).join("\n") : typeof value === "string" ? value : "");
  const title = asText(values.title ?? values.heading ?? values.hook).trim();
  const text = asText(values.text ?? values.body ?? values.fact ?? values.points ?? values.items).trim();
  const narration = asText(card.narration).trim();
  return { title, text, narration };
}

export function cardAddedAt(card: CreatorRecord): string {
  return typeof card.addedAt === "string" ? card.addedAt : "";
}

/** Шаблон карточки: сохранённый индекс, иначе раскладка по кругу (как на сервере). */
export function cardTemplateIndex(card: CreatorRecord, cardIndex: number, templateCount: number): number {
  if (templateCount <= 0) return 0;
  const stored = Number(card.templateIndex);
  if (Number.isInteger(stored) && stored >= 0 && stored < templateCount) return stored;
  return cardIndex % templateCount;
}

export type GalleryItem = {
  id: number;
  packId: string;
  packName: string;
  templateType: string;
  cardIndex: number;
  title: string;
  text: string;
  format: string;
  imageRel: string | null;
  videoRel: string | null;
  zipRel: string | null;
  music: string;
  durationSec: number | null;
  createdAt: string;
};

export function normalizeGalleryItem(raw: unknown): GalleryItem | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as CreatorRecord;
  const id = Number(src.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rel = (value: unknown) => (typeof value === "string" && value ? value : null);
  return {
    id,
    packId: String(src.packId ?? ""),
    packName: String(src.packName ?? ""),
    templateType: String(src.templateType ?? "custom"),
    cardIndex: Number(src.cardIndex) || 0,
    title: String(src.title ?? ""),
    text: String(src.text ?? ""),
    format: String(src.format ?? "mp4"),
    imageRel: rel(src.imageRel),
    videoRel: rel(src.videoRel),
    zipRel: rel(src.zipRel),
    music: String(src.music ?? "none"),
    durationSec: src.durationSec == null ? null : Number(src.durationSec),
    createdAt: String(src.createdAt ?? ""),
  };
}

/** SQLite CURRENT_TIMESTAMP — UTC без зоны; парсим как UTC. */
export function parseUtcDate(value: string): Date | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
