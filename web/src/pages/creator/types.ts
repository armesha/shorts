export type CreatorRecord = Record<string, unknown>;

export type CreatorPack = CreatorRecord & {
  id?: string;
  name?: string;
  lang?: string;
  templateType?: string;
  creatorDesignState?: unknown;
  templates?: unknown[] | number;
  cards?: unknown[] | number;
  cardCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatorAsset = CreatorRecord & {
  id?: string;
  name?: string;
  type?: string;
  group?: string;
  groupName?: string;
  src?: string;
  url?: string;
  dataUrl?: string;
};

export type CreatorBackground = string | CreatorAsset;

export type CreatorSummary = {
  feature: boolean;
  packs: CreatorPack[];
  gallery: CreatorRecord[];
  backgrounds: CreatorBackground[];
  userBackgrounds: CreatorBackground[];
  presets: TemplatePreset[];
  music: CreatorAsset[];
  motion: CreatorAsset[];
};

export type TemplatePreset = {
  id: string;
  label: string;
  templateType: string;
  lang?: string;
  previewSrc?: string;
  templates: unknown[];
  defaults: CardValues;
};

export type CardValues = {
  heading: string;
  body: string;
  text: string;
  cta: string;
  badge: string;
};

export type TextBoxRole = "heading" | "body";
/** fs — желаемый размер шрифта (только для текстовых боксов; не задан → размер из пресета). */
export type TextBoxRect = { x: number; y: number; w: number; h: number; rot?: number; fs?: number };
export type TextLayout = Record<TextBoxRole, TextBoxRect>;

export type TextStyle = {
  color: string;
  outline: string;
  background: number;
};

export type StickerKind = "emoji" | "image";

export type StickerOverlay = {
  kind: StickerKind;
  value: string;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type MediaSettings = {
  /** Выбранные треки: [] = без музыки, ["auto"] = случайный фон, иначе id треков (на видео берётся случайный из списка). */
  musicTracks: string[];
  customMusicName: string;
  motion: string;
  customMotion: string;
  customMotionName: string;
  durationSec: number;
  motionBox: TextBoxRect;
};

export type DesignerElement = TextBoxRole | "sticker" | "motion";
export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type CreatorDesignState = {
  version: 1;
  templateName: string;
  presetId: string;
  background: string;
  values: Pick<CardValues, "heading" | "body">;
  layout: TextLayout;
  textStyle: TextStyle;
  sticker: StickerOverlay | null;
  /** music — legacy-строка для старых читателей (первый трек / "" = авто / "none"). */
  media: Pick<MediaSettings, "musicTracks" | "customMusicName" | "motion" | "customMotion" | "customMotionName" | "durationSec" | "motionBox"> & { music: string };
};

export type Notice = { type: "success" | "error" | "info"; text: string } | null;
