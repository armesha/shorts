import {
  DEFAULT_MOTION_BOX,
  DEFAULT_STICKER_BOX,
  DEFAULT_TEXT_LAYOUT,
  DEFAULT_TEXT_STYLE,
  TEMPLATE_H,
  TEMPLATE_W,
} from "./config";
import type {
  CardValues,
  CreatorDesignState,
  MediaSettings,
  StickerOverlay,
  TextBoxRect,
  TextBoxRole,
  TextLayout,
  TextStyle,
} from "./types";

export function clampFontSize(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.max(22, Math.min(120, Math.round(numeric)));
}

export function clampTextBox(box: TextBoxRect, role: TextBoxRole): TextBoxRect {
  const minW = role === "heading" ? 280 : 320;
  const minH = role === "heading" ? 92 : 160;
  const w = Math.min(TEMPLATE_W, Math.max(minW, Math.round(box.w)));
  const h = Math.min(TEMPLATE_H, Math.max(minH, Math.round(box.h)));
  const x = Math.min(TEMPLATE_W - w, Math.max(0, Math.round(box.x)));
  const y = Math.min(TEMPLATE_H - h, Math.max(0, Math.round(box.y)));
  const fs = clampFontSize(box.fs);
  return { x, y, w, h, rot: clampRotation(box.rot), ...(fs ? { fs } : {}) };
}

export function cloneTextLayout(layout: TextLayout): TextLayout {
  return {
    heading: { ...layout.heading },
    body: { ...layout.body },
  };
}

export function clampStickerBox(box: TextBoxRect): TextBoxRect {
  const min = 72;
  const w = Math.min(TEMPLATE_W, Math.max(min, Math.round(box.w)));
  const h = Math.min(TEMPLATE_H, Math.max(min, Math.round(box.h)));
  const x = Math.min(TEMPLATE_W - w, Math.max(0, Math.round(box.x)));
  const y = Math.min(TEMPLATE_H - h, Math.max(0, Math.round(box.y)));
  return { x, y, w, h, rot: clampRotation(box.rot) };
}

export function clampMotionBox(box: TextBoxRect): TextBoxRect {
  const min = 96;
  const max = 560;
  const w = Math.min(max, Math.max(min, Math.round(box.w)));
  const h = Math.min(max, Math.max(min, Math.round(box.h)));
  const x = Math.min(TEMPLATE_W - w, Math.max(0, Math.round(box.x)));
  const y = Math.min(TEMPLATE_H - h, Math.max(0, Math.round(box.y)));
  return { x, y, w, h, rot: clampRotation(box.rot) };
}

export function clampRotation(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  const rounded = Math.round(numeric);
  return Math.max(-360, Math.min(360, rounded));
}

export function textBackgroundCss(value: number): string {
  const opacity = Math.max(0, Math.min(0.8, Number(value) / 100));
  if (opacity <= 0) return "";
  return `rgba(255,255,255,${opacity.toFixed(2)})`;
}

export function textOutlineShadow(color: string): string {
  if (!color || color === "none") return "";
  return `2px 0 0 ${color}, -2px 0 0 ${color}, 0 2px 0 ${color}, 0 -2px 0 ${color}, 1px 1px 2px rgba(0,0,0,.18)`;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value);
}

export function colorInputValue(value: string, fallback: string): string {
  if (isHexColor(value)) return value;
  if (isHexColor(fallback)) return fallback;
  return "#000000";
}

function cleanString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function cleanPercent(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(80, Math.round(numeric)));
}

function cleanTextStyle(value: unknown, fallback: TextStyle): TextStyle {
  if (!value || typeof value !== "object") return { ...fallback };
  const src = value as Partial<TextStyle>;
  const fallbackColor = isHexColor(fallback.color) ? fallback.color : DEFAULT_TEXT_STYLE.color;
  const fallbackOutline = fallback.outline === "none" || isHexColor(fallback.outline) ? fallback.outline : DEFAULT_TEXT_STYLE.outline;
  const outline = src.outline === "none" || isHexColor(src.outline) ? String(src.outline) : fallbackOutline;
  return {
    color: isHexColor(src.color) ? src.color : fallbackColor,
    outline,
    background: cleanPercent(src.background, fallback.background),
  };
}

function cleanBox(value: unknown, fallback: TextBoxRect, clamp: (box: TextBoxRect) => TextBoxRect): TextBoxRect {
  if (!value || typeof value !== "object") return clamp(fallback);
  const src = value as Partial<TextBoxRect>;
  return clamp({
    x: Number(src.x ?? fallback.x),
    y: Number(src.y ?? fallback.y),
    w: Number(src.w ?? fallback.w),
    h: Number(src.h ?? fallback.h),
    rot: Number(src.rot ?? fallback.rot ?? 0),
    ...(src.fs !== undefined || fallback.fs !== undefined ? { fs: Number(src.fs ?? fallback.fs) } : {}),
  });
}

/** Чистый список выбранных треков: [] = без музыки, ["auto"] = случайный, иначе id. */
export function cleanMusicTracks(value: unknown, legacyMusic?: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof legacyMusic === "string" && legacyMusic && legacyMusic !== "none"
      ? [legacyMusic]
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item ?? "").trim();
    if (!id || id === "none" || out.includes(id)) continue;
    out.push(id);
    if (out.length >= 24) break;
  }
  return out.includes("auto") ? ["auto"] : out;
}

/** Legacy-строка music для старых читателей designState. */
export function legacyMusicFromTracks(tracks: string[]): string {
  if (!tracks.length) return "none";
  if (tracks[0] === "auto") return "";
  return tracks[0];
}

function cleanSticker(value: unknown): StickerOverlay | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Partial<StickerOverlay>;
  const kind = src.kind === "image" || src.kind === "emoji" ? src.kind : null;
  const stickerValue = cleanString(src.value);
  if (!kind || !stickerValue) return null;
  return {
    kind,
    value: stickerValue,
    name: cleanString(src.name) || undefined,
    ...cleanBox(src, DEFAULT_STICKER_BOX, clampStickerBox),
  };
}

export function buildCreatorDesignState(input: {
  templateName: string;
  presetId: string;
  background: string;
  values: CardValues;
  layout: TextLayout;
  textStyle: TextStyle;
  sticker: StickerOverlay | null;
  mediaSettings: MediaSettings;
}): CreatorDesignState {
  return {
    version: 1,
    templateName: input.templateName,
    presetId: input.presetId,
    background: input.background,
    values: {
      heading: input.values.heading,
      body: input.values.body,
    },
    layout: {
      heading: clampTextBox(input.layout.heading, "heading"),
      body: clampTextBox(input.layout.body, "body"),
    },
    textStyle: cleanTextStyle(input.textStyle, DEFAULT_TEXT_STYLE),
    sticker: input.sticker ? { ...input.sticker, ...clampStickerBox(input.sticker) } : null,
    media: {
      music: legacyMusicFromTracks(input.mediaSettings.musicTracks),
      musicTracks: cleanMusicTracks(input.mediaSettings.musicTracks),
      customMusicName: input.mediaSettings.customMusicName,
      motion: input.mediaSettings.motion,
      customMotion: input.mediaSettings.customMotion,
      customMotionName: input.mediaSettings.customMotionName,
      durationSec: input.mediaSettings.durationSec,
      motionBox: clampMotionBox(input.mediaSettings.motionBox),
    },
  };
}

export function normalizeCreatorDesignState(parsed: Partial<CreatorDesignState>): CreatorDesignState {
  if (!parsed || typeof parsed !== "object") throw new Error("bad-state");
  const values = parsed.values && typeof parsed.values === "object" ? parsed.values : {};
  const media = parsed.media && typeof parsed.media === "object" ? parsed.media : {};
  return {
    version: 1,
    templateName: cleanString(parsed.templateName),
    presetId: cleanString(parsed.presetId),
    background: cleanString(parsed.background),
    values: {
      heading: cleanString((values as Partial<CardValues>).heading),
      body: cleanString((values as Partial<CardValues>).body),
    },
    layout: {
      heading: cleanBox(parsed.layout?.heading, DEFAULT_TEXT_LAYOUT.heading, (box) => clampTextBox(box, "heading")),
      body: cleanBox(parsed.layout?.body, DEFAULT_TEXT_LAYOUT.body, (box) => clampTextBox(box, "body")),
    },
    textStyle: cleanTextStyle(parsed.textStyle, DEFAULT_TEXT_STYLE),
    sticker: cleanSticker(parsed.sticker),
    media: {
      music: cleanString((media as Record<string, unknown>).music, "none"),
      musicTracks: cleanMusicTracks((media as Partial<MediaSettings>).musicTracks, (media as Record<string, unknown>).music),
      customMusicName: cleanString((media as Partial<MediaSettings>).customMusicName),
      motion: cleanString((media as Partial<MediaSettings>).motion, "none"),
      customMotion: cleanString((media as Partial<MediaSettings>).customMotion),
      customMotionName: cleanString((media as Partial<MediaSettings>).customMotionName),
      durationSec: Math.max(3, Math.min(30, Math.round(Number((media as Partial<MediaSettings>).durationSec ?? 6)))),
      motionBox: cleanBox((media as Partial<MediaSettings>).motionBox, DEFAULT_MOTION_BOX, clampMotionBox),
    },
  };
}

export function parseCreatorDesignState(raw: string): CreatorDesignState {
  return normalizeCreatorDesignState(JSON.parse(raw) as Partial<CreatorDesignState>);
}

export function readCreatorDesignState(raw: unknown): CreatorDesignState | null {
  try {
    if (typeof raw === "string") return parseCreatorDesignState(raw);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return normalizeCreatorDesignState(raw as Partial<CreatorDesignState>);
  } catch {
    return null;
  }
  return null;
}
