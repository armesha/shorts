// Единый редактор шаблона: канва с Moveable (снап к центру/краям/элементам,
// стрелки, двойной клик — правка текста) + панели Текст / Эмодзи / GIF / Музыка
// в одном пространстве. Музыка выбирается несколькими треками (на видео — случайный).
import {
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Moveable from "react-moveable";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Clapperboard,
  Music,
  MoveHorizontal,
  RotateCw,
  Palette,
  Redo2,
  RotateCcw,
  Shuffle,
  Smile,
  Type,
  Undo2,
  VolumeX,
} from "lucide-react";
import { useT } from "../../lib/i18n";
import type {
  CardValues,
  CreatorAsset,
  DesignerElement,
  MediaSettings,
  StickerOverlay,
  TextBoxRect,
  TextBoxRole,
  TextLayout,
  TextStyle,
  TemplatePreset,
} from "./types";
import {
  ALL_EMOJI_SET,
  ALL_EMOJIS,
  CREATOR_EMOJI_USAGE_KEY,
  CREATOR_GIF_USAGE_KEY,
  DEFAULT_MOTION_BOX,
  DEFAULT_STICKER_BOX,
  DEFAULT_TEXT_LAYOUT,
  DEFAULT_TEXT_STYLE,
  MOVEABLE_CLASS_NAME,
  OUTLINE_COLOR_CHOICES,
  TEMPLATE_H,
  TEMPLATE_W,
  TEXT_COLOR_CHOICES,
} from "./config";
import {
  clampMotionBox,
  clampRotation,
  clampStickerBox,
  clampTextBox,
  cloneTextLayout,
  colorInputValue,
  textBackgroundCss,
  textOutlineShadow,
} from "./designState";
import { bumpCreatorUsage, readCreatorUsage } from "./usage";
import {
  creatorServiceAssetUrl,
  cssUrl,
  firstTemplateImageSrc,
  templateTone,
  usableBackgroundUrl,
} from "./model";
import { handleRovingTabKey } from "./keyboard";

// Нижние 400px кадра — зона кнопок YouTube Shorts: подсвечиваем и снапим к границе.
const SAFE_BOTTOM_Y = 1520;

type EditorPane = "text" | "sticker" | "gif" | "music";

const PANES: Array<{ id: EditorPane; labelKey: string; icon: typeof Type }> = [
  { id: "text", labelKey: "creator.paneText", icon: Type },
  { id: "sticker", labelKey: "creator.paneSticker", icon: Smile },
  { id: "gif", labelKey: "creator.paneGif", icon: Clapperboard },
  { id: "music", labelKey: "creator.paneMusic", icon: Music },
];

const CREATOR_PALETTE_DRAG_TYPE = "application/x-creator-palette-item";

type PaletteDragPayload =
  | { kind: "emoji"; value: string }
  | { kind: "motion"; id: string };

type PaletteDragPreview =
  | { kind: "emoji"; value: string }
  | { kind: "image"; src: string; label: string };

type EditorClipboard =
  | { kind: "text"; role: TextBoxRole; value: string; box: TextBoxRect }
  | { kind: "sticker"; sticker: StickerOverlay & TextBoxRect }
  | {
      kind: "motion";
      id: string;
      box: TextBoxRect;
      customMotion?: string;
      customMotionName?: string;
    };

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function offsetPastedBox(box: TextBoxRect): TextBoxRect {
  return { ...box, x: box.x + 36, y: box.y + 36 };
}

function squareBox(box: TextBoxRect, min: number, max = 560): TextBoxRect {
  const size = Math.min(max, Math.max(min, Math.round(Math.min(box.w, box.h))));
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  return {
    ...box,
    x: centerX - size / 2,
    y: centerY - size / 2,
    w: size,
    h: size,
  };
}

function squareStickerBox(box: TextBoxRect): TextBoxRect {
  return clampStickerBox(squareBox(box, 72));
}

function squareMotionBox(box: TextBoxRect): TextBoxRect {
  return clampMotionBox(squareBox(box, 96));
}

function setPaletteDragImage(event: ReactDragEvent<HTMLElement>, preview: PaletteDragPreview) {
  const node = document.createElement("div");
  node.className = `creator-palette-drag-image is-${preview.kind}`;
  if (preview.kind === "emoji") {
    node.textContent = preview.value;
  } else if (preview.src) {
    const image = document.createElement("img");
    image.src = preview.src;
    image.alt = "";
    node.appendChild(image);
  } else {
    node.textContent = preview.label;
  }
  document.body.appendChild(node);
  const rect = node.getBoundingClientRect();
  event.dataTransfer.setDragImage(node, rect.width / 2, rect.height / 2);
  window.setTimeout(() => node.remove(), 0);
}

function writePaletteDragData(event: ReactDragEvent<HTMLElement>, payload: PaletteDragPayload, preview: PaletteDragPreview) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(CREATOR_PALETTE_DRAG_TYPE, JSON.stringify(payload));
  event.dataTransfer.setData("text/plain", payload.kind === "emoji" ? payload.value : payload.id);
  setPaletteDragImage(event, preview);
}

function readPaletteDragData(event: ReactDragEvent<HTMLElement>): PaletteDragPayload | null {
  try {
    const raw = event.dataTransfer.getData(CREATOR_PALETTE_DRAG_TYPE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaletteDragPayload>;
    if (parsed.kind === "emoji" && typeof parsed.value === "string" && parsed.value) return { kind: "emoji", value: parsed.value };
    if (parsed.kind === "motion" && typeof parsed.id === "string" && parsed.id) return { kind: "motion", id: parsed.id };
  } catch {
    return null;
  }
  return null;
}

function paneForElement(element: DesignerElement): EditorPane {
  if (element === "sticker") return "sticker";
  if (element === "motion") return "gif";
  return "text";
}

export type FontSizes = Record<TextBoxRole, number>;
export type Capacities = Record<TextBoxRole, number>;

export function DesignEditor({
  activePreset,
  values,
  updateValue,
  textLayout,
  setTextLayout,
  textStyle,
  setTextStyle,
  sticker,
  setSticker,
  uploadSticker,
  motion,
  music,
  uploadMusic,
  mediaSettings,
  setMediaSettings,
  uploadMotionGif,
  background,
  capacities,
  fontSizes,
  canUndoDesign,
  canRedoDesign,
  undoDesign,
  redoDesign,
}: {
  activePreset: TemplatePreset;
  values: CardValues;
  updateValue: (key: keyof CardValues, value: string) => void;
  textLayout: TextLayout;
  setTextLayout: (layout: TextLayout) => void;
  textStyle: TextStyle;
  setTextStyle: (style: TextStyle) => void;
  sticker: StickerOverlay | null;
  setSticker: (sticker: StickerOverlay | null) => void;
  uploadSticker: (file: File) => Promise<void>;
  motion: CreatorAsset[];
  music: CreatorAsset[];
  uploadMusic: (file: File) => Promise<void>;
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMotionGif: (file: File) => Promise<void>;
  background: string;
  capacities: Capacities;
  fontSizes: FontSizes;
  canUndoDesign: boolean;
  canRedoDesign: boolean;
  undoDesign: () => void;
  redoDesign: () => void;
}) {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<EditorClipboard | null>(null);
  const [pane, setPane] = useState<EditorPane>("text");
  const [selection, setSelection] = useState<DesignerElement>("heading");

  const selectElement = (element: DesignerElement) => {
    setSelection(element);
    setPane(paneForElement(element));
  };

  const openPane = (next: EditorPane) => {
    setPane(next);
    if (next === "text" && selection !== "heading" && selection !== "body") setSelection("heading");
    if (next === "sticker" && sticker) setSelection("sticker");
    if (next === "gif" && mediaSettings.motion !== "none") setSelection("motion");
  };

  const resetDesign = () => {
    setTextLayout(cloneTextLayout(DEFAULT_TEXT_LAYOUT));
    setTextStyle({ ...DEFAULT_TEXT_STYLE });
    setSticker(null);
    setMediaSettings((current) => ({ ...current, motion: "none", motionBox: DEFAULT_MOTION_BOX }));
    setSelection("heading");
    setPane("text");
  };

  const selectedMotion = motion.find((item) => item.id === mediaSettings.motion);
  const motionPreview =
    mediaSettings.motion === "custom"
      ? mediaSettings.customMotion
      : selectedMotion?.src
        ? creatorServiceAssetUrl(selectedMotion.src)
        : "";
  const paneIndex = PANES.findIndex((item) => item.id === pane);

  const copySelection = useCallback(() => {
    if (selection === "heading" || selection === "body") {
      clipboardRef.current = {
        kind: "text",
        role: selection,
        value: values[selection],
        box: { ...textLayout[selection] },
      };
      return;
    }
    if (selection === "sticker" && sticker) {
      clipboardRef.current = { kind: "sticker", sticker: { ...sticker, ...clampStickerBox(sticker) } };
      return;
    }
    if (selection === "motion" && mediaSettings.motion !== "none") {
      clipboardRef.current = {
        kind: "motion",
        id: mediaSettings.motion,
        box: { ...clampMotionBox(mediaSettings.motionBox) },
        customMotion: mediaSettings.customMotion,
        customMotionName: mediaSettings.customMotionName,
      };
    }
  }, [mediaSettings.customMotion, mediaSettings.customMotionName, mediaSettings.motion, mediaSettings.motionBox, selection, sticker, textLayout, values]);

  const pasteSelection = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload) return;
    if (payload.kind === "text") {
      const target = selection === "heading" || selection === "body" ? selection : payload.role;
      const next = cloneTextLayout(textLayout);
      next[target] = clampTextBox(offsetPastedBox(payload.box), target);
      setTextLayout(next);
      updateValue(target, payload.value);
      selectElement(target);
      return;
    }
    if (payload.kind === "sticker") {
      const box = clampStickerBox(offsetPastedBox(payload.sticker));
      setSticker({ ...payload.sticker, ...box });
      selectElement("sticker");
      return;
    }
    const box = clampMotionBox(offsetPastedBox(payload.box));
    setMediaSettings((current) => ({
      ...current,
      motion: payload.id,
      customMotion: payload.customMotion ?? current.customMotion,
      customMotionName: payload.customMotionName ?? current.customMotionName,
      motionBox: box,
    }));
    selectElement("motion");
  }, [selection, setMediaSettings, setSticker, setTextLayout, textLayout, updateValue]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || !root.contains(event.target as Node) || isEditableShortcutTarget(event.target)) return;
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canRedoDesign) redoDesign();
        } else if (canUndoDesign) {
          undoDesign();
        }
        return;
      }
      if (key === "y") {
        event.preventDefault();
        if (canRedoDesign) redoDesign();
        return;
      }
      if (key === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if (key === "v") {
        event.preventDefault();
        pasteSelection();
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [canRedoDesign, canUndoDesign, copySelection, pasteSelection, redoDesign, undoDesign]);

  return (
    <div className="creator-compose-card creator-unified-editor" ref={rootRef}>
      <div className="creator-compose-head">
        <h2 className="creator-editor-title">{t("creator.composeTitle")}</h2>
        <div className="creator-editor-history">
          <button type="button" className="creator-designer-icon-button" onClick={undoDesign} disabled={!canUndoDesign} aria-label={t("creator.undo")} title={t("creator.undo")}>
            <Undo2 size={15} />
          </button>
          <button type="button" className="creator-designer-icon-button" onClick={redoDesign} disabled={!canRedoDesign} aria-label={t("creator.redo")} title={t("creator.redo")}>
            <Redo2 size={15} />
          </button>
          <button type="button" className="creator-designer-icon-button" onClick={resetDesign} aria-label={t("creator.resetDesign")} title={t("creator.resetDesign")}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      <div className="creator-compose-layout creator-editor-layout">
        <div className="creator-editor-tools">
          <nav
            className="creator-editor-nav"
            role="tablist"
            aria-label={t("creator.editorNavAria")}
            onKeyDown={(event) => handleRovingTabKey(event, paneIndex, PANES.length, (index) => openPane(PANES[index].id))}
          >
            {PANES.map(({ id, labelKey, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pane === id}
                tabIndex={pane === id ? 0 : -1}
                className={pane === id ? "is-active" : ""}
                onClick={() => openPane(id)}
              >
                <Icon size={15} />
                {t(labelKey)}
              </button>
            ))}
          </nav>

          {pane === "text" ? (
            <TextPane
              values={values}
              updateValue={updateValue}
              selection={selection === "body" ? "body" : "heading"}
              textLayout={textLayout}
              setTextLayout={setTextLayout}
              textStyle={textStyle}
              setTextStyle={setTextStyle}
              capacities={capacities}
              fontSizes={fontSizes}
            />
          ) : pane === "sticker" ? (
            <StickerPane sticker={sticker} setSticker={setSticker} uploadSticker={uploadSticker} selectElement={selectElement} />
          ) : pane === "gif" ? (
            <GifPane
              motion={motion}
              mediaSettings={mediaSettings}
              setMediaSettings={setMediaSettings}
              uploadMotionGif={uploadMotionGif}
              selectElement={selectElement}
            />
          ) : (
            <MusicPane music={music} mediaSettings={mediaSettings} setMediaSettings={setMediaSettings} uploadMusic={uploadMusic} />
          )}
        </div>

        <TextLayoutEditor
          activePreset={activePreset}
          values={values}
          background={background}
          layout={textLayout}
          setLayout={setTextLayout}
          textStyle={textStyle}
          updateValue={updateValue}
          sticker={sticker}
          setSticker={setSticker}
          mediaSettings={mediaSettings}
          setMediaSettings={setMediaSettings}
          motionPreview={motionPreview}
          activeElement={selection}
          setActiveElement={selectElement}
        />
      </div>
    </div>
  );
}

function TextPane({
  values,
  updateValue,
  selection,
  textLayout,
  setTextLayout,
  textStyle,
  setTextStyle,
  capacities,
  fontSizes,
}: {
  values: CardValues;
  updateValue: (key: keyof CardValues, value: string) => void;
  selection: TextBoxRole;
  textLayout: TextLayout;
  setTextLayout: (layout: TextLayout) => void;
  textStyle: TextStyle;
  setTextStyle: (style: TextStyle) => void;
  capacities: Capacities;
  fontSizes: FontSizes;
}) {
  const { t } = useT();
  const update = (patch: Partial<TextStyle>) => setTextStyle({ ...textStyle, ...patch });
  const textCustomColorSelected = !TEXT_COLOR_CHOICES.includes(textStyle.color);
  const outlineCustomColorSelected = textStyle.outline !== "none" && !OUTLINE_COLOR_CHOICES.includes(textStyle.outline);
  const capacity = capacities[selection];
  const length = values[selection].length;
  const fontSize = textLayout[selection].fs ?? fontSizes[selection];

  const setFontSize = (size: number) => {
    const next = cloneTextLayout(textLayout);
    next[selection] = clampTextBox({ ...next[selection], fs: size }, selection);
    setTextLayout(next);
  };

  return (
    <div className="creator-editor-pane creator-text-pane" role="tabpanel" aria-label={t("creator.paneText")}>
      <label className="form-control">
        <span className="label-text">
          {selection === "heading" ? t("creator.heading") : t("creator.body")}
          <span className={`creator-char-counter ${length > capacity ? "is-over" : ""}`}>{length}/≈{capacity}</span>
        </span>
        <textarea
          className="textarea textarea-bordered textarea-sm creator-designer-textarea"
          value={values[selection]}
          onChange={(event) => updateValue(selection, event.target.value)}
        />
      </label>
      <p className="creator-capacity-hint">{t("creator.capacityHint", { count: capacity })}</p>

      <div className="creator-tool-group">
        <span className="creator-tool-label">
          {t("creator.fontSize")}
          <span className="creator-range-value">{fontSize} px</span>
        </span>
        <input
          className="creator-range"
          type="range"
          min="26"
          max="96"
          step="2"
          value={fontSize}
          onChange={(event) => setFontSize(Number(event.target.value))}
          aria-label={t("creator.fontSize")}
        />
      </div>

      <div className="creator-tool-group">
        <span className="creator-tool-label">{t("creator.textColor")}</span>
        <div className="creator-swatch-row">
          {TEXT_COLOR_CHOICES.map((color) => (
            <button
              key={color}
              type="button"
              className={`creator-swatch ${textStyle.color === color ? "is-active" : ""}`}
              style={{ background: color }}
              onClick={() => update({ color })}
              aria-label={t("creator.textColor")}
            />
          ))}
          <label
            className={`creator-custom-color-button ${textCustomColorSelected ? "is-active" : ""}`}
            style={textCustomColorSelected ? ({ "--creator-custom-color": textStyle.color } as CSSProperties) : undefined}
            title={t("creator.customColor")}
          >
            <input
              type="color"
              value={colorInputValue(textStyle.color, DEFAULT_TEXT_STYLE.color)}
              onChange={(event) => update({ color: event.target.value })}
              aria-label={t("creator.customColor")}
            />
            {textCustomColorSelected ? <span aria-hidden="true" /> : <Palette size={15} aria-hidden="true" />}
          </label>
        </div>
      </div>

      <div className="creator-tool-group">
        <span className="creator-tool-label">{t("creator.textOutline")}</span>
        <div className="creator-swatch-row">
          {OUTLINE_COLOR_CHOICES.map((color) => (
            <button
              key={color}
              type="button"
              className={`creator-swatch ${color === "none" ? "is-none" : ""} ${textStyle.outline === color ? "is-active" : ""}`}
              style={color === "none" ? undefined : { background: color }}
              onClick={() => update({ outline: color })}
              aria-label={color === "none" ? t("creator.textOutlineNone") : t("creator.textOutline")}
            />
          ))}
          <label
            className={`creator-custom-color-button ${outlineCustomColorSelected ? "is-active" : ""}`}
            style={outlineCustomColorSelected ? ({ "--creator-custom-color": textStyle.outline } as CSSProperties) : undefined}
            title={t("creator.customColor")}
          >
            <input
              type="color"
              value={colorInputValue(textStyle.outline, DEFAULT_TEXT_STYLE.outline)}
              onChange={(event) => update({ outline: event.target.value })}
              aria-label={t("creator.customColor")}
            />
            {outlineCustomColorSelected ? <span aria-hidden="true" /> : <Palette size={15} aria-hidden="true" />}
          </label>
        </div>
      </div>

      <div className="creator-tool-group">
        <span className="creator-tool-label">
          {t("creator.textBackground")}
          <span className="creator-range-value">{Math.round(textStyle.background)}%</span>
        </span>
        <input
          className="creator-range"
          type="range"
          min="0"
          max="80"
          step="1"
          value={textStyle.background}
          onChange={(event) => update({ background: Number(event.target.value) })}
          aria-label={t("creator.textBackground")}
        />
      </div>
    </div>
  );
}

function StickerPane({
  sticker,
  setSticker,
  uploadSticker,
  selectElement,
}: {
  sticker: StickerOverlay | null;
  setSticker: (sticker: StickerOverlay | null) => void;
  uploadSticker: (file: File) => Promise<void>;
  selectElement: (element: DesignerElement) => void;
}) {
  const { t } = useT();
  const [emojiUsage, setEmojiUsage] = useState<Record<string, number>>(() => readCreatorUsage(CREATOR_EMOJI_USAGE_KEY));
  const frequentEmojis = useMemo(() => {
    const ordered = Object.entries(emojiUsage)
      .filter(([emoji]) => ALL_EMOJI_SET.has(emoji))
      .sort((a, b) => b[1] - a[1])
      .map(([emoji]) => emoji);
    return ordered.slice(0, 16);
  }, [emojiUsage]);

  const updateEmoji = (emoji: string) => {
    setSticker({
      kind: "emoji",
      value: emoji,
      ...squareStickerBox(sticker ?? DEFAULT_STICKER_BOX),
    });
    selectElement("sticker");
    setEmojiUsage((current) => bumpCreatorUsage(CREATOR_EMOJI_USAGE_KEY, current, emoji));
  };

  const handleStickerUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadSticker(file).then(() => selectElement("sticker")).finally(() => {
      input.value = "";
    });
  };

  const emojiButton = (emoji: string, key: string) => (
    <button
      key={key}
      type="button"
      className={`creator-telegram-emoji ${sticker?.kind === "emoji" && sticker.value === emoji ? "is-active" : ""}`}
      draggable
      onDragStart={(event) => writePaletteDragData(event, { kind: "emoji", value: emoji }, { kind: "emoji", value: emoji })}
      onClick={() => updateEmoji(emoji)}
      aria-label={emoji}
    >
      {emoji}
    </button>
  );

  return (
    <div className="creator-editor-pane creator-sticker-pane" role="tabpanel" aria-label={t("creator.paneSticker")}>
      <div className="creator-asset-scroll creator-pane-scroll">
        {frequentEmojis.length > 0 && (
          <div className="creator-asset-frequent creator-telegram-emoji-grid">
            {frequentEmojis.map((emoji, index) => emojiButton(emoji, `frequent-${emoji}-${index}`))}
          </div>
        )}
        <div className="creator-telegram-emoji-grid">
          {ALL_EMOJIS.map((emoji, index) => emojiButton(emoji, `${emoji}-${index}`))}
        </div>
      </div>
      <div className="creator-pane-actions">
        <label className="btn btn-xs btn-outline">
          {t("creator.uploadSticker")}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleStickerUpload} />
        </label>
        {sticker && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSticker(null)}>
            {t("creator.noSticker")}
          </button>
        )}
      </div>
    </div>
  );
}

function GifPane({
  motion,
  mediaSettings,
  setMediaSettings,
  uploadMotionGif,
  selectElement,
}: {
  motion: CreatorAsset[];
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMotionGif: (file: File) => Promise<void>;
  selectElement: (element: DesignerElement) => void;
}) {
  const { t } = useT();
  const [gifUsage, setGifUsage] = useState<Record<string, number>>(() => readCreatorUsage(CREATOR_GIF_USAGE_KEY));
  const motionItems = useMemo(() => (
    mediaSettings.customMotion
      ? [{ id: "custom", name: mediaSettings.customMotionName || t("creator.customGif"), src: mediaSettings.customMotion } as CreatorAsset, ...motion]
      : motion
  ), [mediaSettings.customMotion, mediaSettings.customMotionName, motion, t]);
  const frequentMotion = useMemo(() => {
    const byId = new Map(motionItems.map((item) => [String(item.id), item]));
    const ordered = Object.entries(gifUsage)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((item): item is CreatorAsset => Boolean(item));
    return ordered.slice(0, 6);
  }, [gifUsage, motionItems]);

  const pickMotion = (id: string) => {
    setMediaSettings((current) => ({ ...current, motion: id }));
    selectElement("motion");
    setGifUsage((current) => bumpCreatorUsage(CREATOR_GIF_USAGE_KEY, current, id));
  };

  const handleGifUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadMotionGif(file).then(() => selectElement("motion")).finally(() => {
      input.value = "";
    });
  };

  const gifButton = (item: CreatorAsset, keyPrefix = "") => {
    const id = String(item.id);
    const url = id === "custom" ? mediaSettings.customMotion : creatorServiceAssetUrl(item.src);
    return (
      <button
        key={`${keyPrefix}${id}`}
        type="button"
        className={`creator-telegram-gif ${mediaSettings.motion === id ? "is-active" : ""}`}
        aria-label={String(item.name || item.id || id)}
        draggable
        onDragStart={(event) => writePaletteDragData(event, { kind: "motion", id }, { kind: "image", src: url, label: String(item.name || item.id || id) })}
        onClick={() => pickMotion(id)}
      >
        {url ? <img src={url} alt="" loading="lazy" /> : <span>{item.name || item.id}</span>}
      </button>
    );
  };

  return (
    <div className="creator-editor-pane creator-gif-pane" role="tabpanel" aria-label={t("creator.paneGif")}>
      <div className="creator-asset-scroll is-gif creator-pane-scroll">
        {frequentMotion.length > 0 && (
          <div className="creator-asset-frequent creator-telegram-gif-grid">
            {frequentMotion.map((item) => gifButton(item, "frequent-"))}
          </div>
        )}
        <div className="creator-telegram-gif-grid">
          {motionItems.map((item) => gifButton(item))}
        </div>
      </div>
      <div className="creator-pane-actions">
        <label className="btn btn-xs btn-outline">
          {t("creator.uploadGif")}
          <input type="file" accept="image/gif,.gif" onChange={handleGifUpload} />
        </label>
        {mediaSettings.motion !== "none" && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setMediaSettings((current) => ({ ...current, motion: "none" }))}>
            {t("creator.removeGif")}
          </button>
        )}
      </div>
    </div>
  );
}

function MusicPane({
  music,
  mediaSettings,
  setMediaSettings,
  uploadMusic,
}: {
  music: CreatorAsset[];
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMusic: (file: File) => Promise<void>;
}) {
  const { t } = useT();
  const [previewMusicId, setPreviewMusicId] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const tracks = mediaSettings.musicTracks;
  const selectedCount = tracks.filter((id) => id !== "auto").length;
  const isNone = tracks.length === 0;
  const isAuto = tracks.includes("auto");

  const stopMusicPreview = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    setPreviewMusicId("");
  };

  const playMusicPreview = (track: CreatorAsset) => {
    const audio = audioRef.current;
    if (!audio || !track.url || !track.id) return;
    if (previewMusicId === track.id && !audio.paused) {
      stopMusicPreview();
      return;
    }
    audio.src = String(track.url);
    audio.currentTime = 0;
    setPreviewMusicId(String(track.id));
    void audio.play().catch(() => setPreviewMusicId(""));
  };

  const toggleTrack = (track: CreatorAsset) => {
    const id = String(track.id ?? "");
    if (!id) return;
    setMediaSettings((current) => {
      const base = current.musicTracks.filter((item) => item !== "auto");
      const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
      return { ...current, musicTracks: next };
    });
    if (!tracks.includes(String(track.id))) playMusicPreview(track);
    else stopMusicPreview();
  };

  const handleMusicUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadMusic(file).finally(() => {
      input.value = "";
    });
  };

  return (
    <div className="creator-editor-pane creator-music-pane" role="tabpanel" aria-label={t("creator.paneMusic")}>
      <audio ref={audioRef} className="creator-audio-hidden" onEnded={() => setPreviewMusicId("")} />

      <div className="creator-video-duration">
        <span className="creator-tool-label">
          {t("creator.durationSec")}
          <span className="creator-range-value">{t("creator.secondsShort", { count: mediaSettings.durationSec })}</span>
        </span>
        <input
          className="creator-range"
          type="range"
          min="6"
          max="30"
          step="1"
          value={mediaSettings.durationSec}
          onChange={(event) => setMediaSettings((current) => ({ ...current, durationSec: Number(event.target.value) }))}
          aria-label={t("creator.durationSec")}
        />
      </div>

      <div className="creator-tool-group creator-video-music">
        <div className="creator-music-head">
          <span className="creator-tool-label">{t("creator.music")}</span>
          <label className="btn btn-xs btn-outline">
            {t("creator.uploadMusic")}
            <input type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/opus,.mp3,.m4a,.aac,.wav,.ogg,.opus" onChange={handleMusicUpload} />
          </label>
        </div>
        <p className="creator-capacity-hint">{t("creator.musicMultiHint")}</p>
        <div className="creator-music-list">
          <button
            type="button"
            className={`creator-music-option ${isNone ? "is-active" : ""}`}
            onClick={() => {
              setMediaSettings((current) => ({ ...current, musicTracks: [] }));
              stopMusicPreview();
            }}
          >
            <VolumeX size={14} aria-hidden="true" />
            <span>{t("creator.noMusic")}</span>
          </button>
          <button
            type="button"
            className={`creator-music-option ${isAuto ? "is-active" : ""}`}
            onClick={() => {
              setMediaSettings((current) => ({ ...current, musicTracks: current.musicTracks.includes("auto") ? [] : ["auto"] }));
              stopMusicPreview();
            }}
          >
            <Shuffle size={14} aria-hidden="true" />
            <span>{t("creator.musicAuto")}</span>
          </button>
          {music.map((track) => {
            const id = String(track.id);
            const checked = tracks.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={`creator-music-option is-track ${checked ? "is-active is-checked" : ""}`}
                aria-pressed={checked}
                onClick={() => toggleTrack(track)}
              >
                <span className={`creator-music-check ${checked ? "is-on" : ""}`} aria-hidden="true" />
                <span className="creator-music-name">{track.name || track.id}</span>
                {track.url && (
                  <span className={`creator-music-meter ${previewMusicId === track.id ? "is-playing" : ""}`} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {selectedCount > 1 && <p className="creator-capacity-hint is-accent">{t("creator.musicSelectedMany", { count: selectedCount })}</p>}
      </div>
    </div>
  );
}

function TextLayoutEditor({
  activePreset,
  values,
  background,
  layout,
  setLayout,
  textStyle,
  updateValue,
  sticker,
  setSticker,
  mediaSettings,
  setMediaSettings,
  motionPreview,
  activeElement,
  setActiveElement,
}: {
  activePreset: TemplatePreset;
  values: CardValues;
  background: string;
  layout: TextLayout;
  setLayout: (layout: TextLayout) => void;
  textStyle: TextStyle;
  updateValue: (key: keyof CardValues, value: string) => void;
  sticker: StickerOverlay | null;
  setSticker: (sticker: StickerOverlay | null) => void;
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  motionPreview: string;
  activeElement: DesignerElement;
  setActiveElement: (element: DesignerElement) => void;
}) {
  const { t } = useT();
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
  const moveableGesture = useRef<{
    element: DesignerElement;
    box: TextBoxRect;
    scaleX: number;
    scaleY: number;
    resizeStartClientX?: number;
    resizeStartClientY?: number;
    resizeDirection?: number[];
    keepRatio?: boolean;
  } | null>(null);
  const [screenPixels, setScreenPixels] = useState({ w: 0, h: 0 });
  const [targets, setTargets] = useState<Partial<Record<DesignerElement, HTMLElement | null>>>({});
  const [editingRole, setEditingRole] = useState<TextBoxRole | null>(null);

  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const previewStyle = previewBackgroundUrl
    ? ({ backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")` } as CSSProperties)
    : undefined;

  const hasElement = (element: DesignerElement): boolean => {
    if (element === "sticker") return Boolean(sticker);
    if (element === "motion") return Boolean(motionPreview);
    return true;
  };

  const selectedBoxForElement = (element: DesignerElement): TextBoxRect | null => {
    if (element === "heading" || element === "body") return clampTextBox(layout[element], element);
    if (element === "sticker") return sticker ? clampStickerBox(sticker) : null;
    return motionPreview ? clampMotionBox(mediaSettings.motionBox) : null;
  };

  const updateBoxForElement = (element: DesignerElement, box: TextBoxRect) => {
    if (element === "heading" || element === "body") {
      const next = cloneTextLayout(layout);
      next[element] = clampTextBox(box, element);
      setLayout(next);
      return;
    }
    if (element === "sticker" && sticker) {
      setSticker({ ...sticker, ...clampStickerBox(box) });
      return;
    }
    if (element === "motion") {
      setMediaSettings((current) => ({ ...current, motionBox: clampMotionBox(box) }));
    }
  };

  // Актуальные DOM-цели для Moveable (после маунта/смены элементов)
  useEffect(() => {
    const resolved: Partial<Record<DesignerElement, HTMLElement | null>> = {
      heading: headingRef.current,
      body: bodyRef.current,
      sticker: sticker ? stickerRef.current : null,
      motion: motionPreview ? motionRef.current : null,
    };
    setTargets((current) => {
      for (const key of ["heading", "body", "sticker", "motion"] as DesignerElement[]) {
        if ((current[key] ?? null) !== (resolved[key] ?? null)) return resolved;
      }
      return current;
    });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      setScreenPixels({ w: rect.width, h: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (editingRole) {
      const area = editingTextareaRef.current;
      if (area) {
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      }
    }
  }, [editingRole]);

  const startMoveableGesture = (
    element: DesignerElement,
    event?: { clientX?: number; clientY?: number; direction?: number[] },
    keepRatio = false,
  ) => {
    const screen = canvasRef.current?.getBoundingClientRect();
    const box = selectedBoxForElement(element);
    if (!screen || !box) {
      moveableGesture.current = null;
      return;
    }
    moveableGesture.current = {
      element,
      box,
      scaleX: TEMPLATE_W / screen.width,
      scaleY: TEMPLATE_H / screen.height,
      resizeStartClientX: event?.clientX,
      resizeStartClientY: event?.clientY,
      resizeDirection: event?.direction,
      keepRatio,
    };
  };

  const updateMoveableDrag = (event: { beforeTranslate?: number[]; translate?: number[] }) => {
    const current = moveableGesture.current;
    if (!current) return;
    const [dx = 0, dy = 0] = event.beforeTranslate ?? event.translate ?? [];
    updateBoxForElement(current.element, {
      ...current.box,
      x: current.box.x + dx * current.scaleX,
      y: current.box.y + dy * current.scaleY,
    });
  };

  const updateMoveableResize = (event: {
    width?: number;
    height?: number;
    clientX?: number;
    clientY?: number;
    direction?: number[];
    drag?: { beforeTranslate?: number[]; translate?: number[] };
  }) => {
    const current = moveableGesture.current;
    if (!current) return;
    const [dragDx = 0, dragDy = 0] = event.drag?.beforeTranslate ?? event.drag?.translate ?? [];
    const pointerDx =
      typeof current.resizeStartClientX === "number" && typeof event.clientX === "number"
        ? event.clientX - current.resizeStartClientX
        : dragDx;
    const pointerDy =
      typeof current.resizeStartClientY === "number" && typeof event.clientY === "number"
        ? event.clientY - current.resizeStartClientY
        : dragDy;
    const [dirX = 1, dirY = 1] = current.resizeDirection ?? event.direction ?? [];
    const dx = pointerDx * current.scaleX;
    const dy = pointerDy * current.scaleY;
    let x = current.box.x;
    let y = current.box.y;
    let w = current.box.w;
    let h = current.box.h;

    if (dirX > 0) w = current.box.w + dx;
    if (dirX < 0) {
      w = current.box.w - dx;
      x = current.box.x + dx;
    }
    if (dirY > 0) h = current.box.h + dy;
    if (dirY < 0) {
      h = current.box.h - dy;
      y = current.box.y + dy;
    }

    if (current.keepRatio) {
      const ratio = current.box.w / Math.max(1, current.box.h);
      if (dirX && dirY) {
        const widthChange = Math.abs(w - current.box.w) / Math.max(1, current.box.w);
        const heightChange = Math.abs(h - current.box.h) / Math.max(1, current.box.h);
        if (widthChange >= heightChange) h = w / ratio;
        else w = h * ratio;
      } else if (dirX) {
        h = w / ratio;
      } else if (dirY) {
        w = h * ratio;
      }
      if (dirX < 0) x = current.box.x + current.box.w - w;
      if (dirY < 0) y = current.box.y + current.box.h - h;
    }

    updateBoxForElement(current.element, {
      ...current.box,
      x,
      y,
      w,
      h,
    });
  };

  const updateMoveableRotation = (event: { beforeRotation?: number; rotation?: number; beforeRotate?: number; rotate?: number }) => {
    const current = moveableGesture.current;
    if (!current) return;
    updateBoxForElement(current.element, {
      ...current.box,
      rot: clampRotation(event.beforeRotation ?? event.rotation ?? event.beforeRotate ?? event.rotate ?? current.box.rot ?? 0),
    });
  };

  // Стрелки — сдвиг активного элемента; Delete — убрать стикер/GIF
  const handleStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT") return;
    const box = selectedBoxForElement(activeElement);
    if (!box) return;
    const step = event.shiftKey ? 60 : 12;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      updateBoxForElement(activeElement, { ...box, x: box.x + dx, y: box.y + dy });
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && (activeElement === "sticker" || activeElement === "motion")) {
      event.preventDefault();
      if (activeElement === "sticker") setSticker(null);
      else setMediaSettings((current) => ({ ...current, motion: "none" }));
      setActiveElement("heading");
    }
  };

  const selectAndFocus = (element: DesignerElement) => {
    setActiveElement(element);
    stageRef.current?.focus({ preventScroll: true });
  };

  const boxAtDropPoint = (
    event: ReactDragEvent<HTMLElement>,
    box: TextBoxRect,
    clamp: (box: TextBoxRect) => TextBoxRect,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return clamp(box);
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * TEMPLATE_W - box.w / 2;
    const y = ((event.clientY - rect.top) / rect.height) * TEMPLATE_H - box.h / 2;
    return clamp({ ...box, x, y });
  };

  const handleCanvasDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(CREATOR_PALETTE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCanvasDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    const payload = readPaletteDragData(event);
    if (!payload) return;
    event.preventDefault();
    if (payload.kind === "emoji") {
      const box = boxAtDropPoint(event, squareStickerBox(sticker ?? DEFAULT_STICKER_BOX), squareStickerBox);
      setSticker({ kind: "emoji", value: payload.value, ...box });
      setActiveElement("sticker");
      stageRef.current?.focus({ preventScroll: true });
      return;
    }
    const box = boxAtDropPoint(event, squareMotionBox(mediaSettings.motionBox), squareMotionBox);
    setMediaSettings((current) => ({ ...current, motion: payload.id, motionBox: box }));
    setActiveElement("motion");
    stageRef.current?.focus({ preventScroll: true });
  };

  // ── тулбар выравнивания активного элемента ──
  const activeBox = selectedBoxForElement(activeElement);
  const isTextActive = activeElement === "heading" || activeElement === "body";
  const align = (patch: (box: TextBoxRect) => Partial<TextBoxRect>) => {
    const box = selectedBoxForElement(activeElement);
    if (!box) return;
    updateBoxForElement(activeElement, { ...box, ...patch(box) });
    stageRef.current?.focus({ preventScroll: true });
  };

  const toolbarButtons: Array<{ key: string; icon: typeof AlignStartVertical; labelKey: string; action: () => void; hidden?: boolean }> = [
    { key: "left", icon: AlignStartVertical, labelKey: "creator.alignLeft", action: () => align(() => ({ x: 72 })) },
    { key: "center-x", icon: AlignCenterVertical, labelKey: "creator.alignCenter", action: () => align((box) => ({ x: (TEMPLATE_W - box.w) / 2 })) },
    { key: "right", icon: AlignEndVertical, labelKey: "creator.alignRight", action: () => align((box) => ({ x: TEMPLATE_W - box.w - 72 })) },
    { key: "top", icon: AlignStartHorizontal, labelKey: "creator.alignTop", action: () => align(() => ({ y: 160 })) },
    { key: "center-y", icon: AlignCenterHorizontal, labelKey: "creator.alignMiddle", action: () => align((box) => ({ y: (TEMPLATE_H - box.h) / 2 })) },
    { key: "bottom", icon: AlignEndHorizontal, labelKey: "creator.alignBottom", action: () => align((box) => ({ y: SAFE_BOTTOM_Y - box.h - 24 })) },
    { key: "full", icon: MoveHorizontal, labelKey: "creator.fullWidth", action: () => align(() => ({ x: 72, w: TEMPLATE_W - 144 })), hidden: !isTextActive },
  ];

  const renderTextBox = (role: TextBoxRole) => {
    const box = clampTextBox(layout[role], role);
    const value = role === "heading" ? values.heading : values.body;
    const editing = editingRole === role;
    const style = {
      left: `${(box.x / TEMPLATE_W) * 100}%`,
      top: `${(box.y / TEMPLATE_H) * 100}%`,
      width: `${(box.w / TEMPLATE_W) * 100}%`,
      height: `${(box.h / TEMPLATE_H) * 100}%`,
      transform: `rotate(${box.rot ?? 0}deg)`,
      transformOrigin: "center center",
      "--creator-text-color": textStyle.color,
      "--creator-text-bg": textBackgroundCss(textStyle.background) || "transparent",
      "--creator-text-shadow": textOutlineShadow(textStyle.outline) || "none",
    } as CSSProperties;
    return (
      <div
        ref={role === "heading" ? headingRef : bodyRef}
        key={role}
        className={`creator-layout-box is-${role} ${activeElement === role ? "is-active" : ""} ${editing ? "is-editing" : ""}`}
        style={style}
        onPointerDown={() => {
          if (!editing) selectAndFocus(role);
        }}
        onDoubleClick={() => {
          setActiveElement(role);
          setEditingRole(role);
        }}
      >
        {editing ? (
          <textarea
            ref={editingTextareaRef}
            className="creator-layout-box-input is-editor-input"
            value={value}
            tabIndex={0}
            onChange={(event) => updateValue(role, event.target.value)}
            onBlur={() => setEditingRole((current) => (current === role ? null : current))}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setEditingRole(null);
                stageRef.current?.focus({ preventScroll: true });
              }
            }}
            aria-label={role === "heading" ? t("creator.layoutHeading") : t("creator.layoutBody")}
          />
        ) : (
          <div className="creator-layout-box-input creator-layout-box-preview" aria-label={role === "heading" ? t("creator.layoutHeading") : t("creator.layoutBody")}>
            {value}
          </div>
        )}
      </div>
    );
  };

  const renderSticker = () => {
    if (!sticker) return null;
    const box = clampStickerBox(sticker);
    const style = {
      left: `${(box.x / TEMPLATE_W) * 100}%`,
      top: `${(box.y / TEMPLATE_H) * 100}%`,
      width: `${(box.w / TEMPLATE_W) * 100}%`,
      height: `${(box.h / TEMPLATE_H) * 100}%`,
      transform: `rotate(${box.rot ?? 0}deg)`,
      transformOrigin: "center center",
    } as CSSProperties;
    return (
      <div
        ref={stickerRef}
        className={`creator-sticker-box is-${sticker.kind} ${activeElement === "sticker" ? "is-active" : ""}`}
        style={style}
        onPointerDown={() => selectAndFocus("sticker")}
      >
        {sticker.kind === "image" ? (
          <img src={sticker.value} alt="" draggable={false} />
        ) : (
          <span className="creator-sticker-emoji">{sticker.value}</span>
        )}
      </div>
    );
  };

  const renderMotion = () => {
    if (!motionPreview) return null;
    const box = clampMotionBox(mediaSettings.motionBox);
    const style = {
      left: `${(box.x / TEMPLATE_W) * 100}%`,
      top: `${(box.y / TEMPLATE_H) * 100}%`,
      width: `${(box.w / TEMPLATE_W) * 100}%`,
      height: `${(box.h / TEMPLATE_H) * 100}%`,
      transform: `rotate(${box.rot ?? 0}deg)`,
      transformOrigin: "center center",
    } as CSSProperties;
    return (
      <div
        ref={motionRef}
        className={`creator-motion-preview-box is-editor ${activeElement === "motion" ? "is-active" : ""}`}
        style={style}
        onPointerDown={() => selectAndFocus("motion")}
      >
        <img className="creator-motion-preview-gif" src={motionPreview} alt="" draggable={false} />
      </div>
    );
  };

  const safeGuideline = screenPixels.h * (SAFE_BOTTOM_Y / TEMPLATE_H);
  const renderMoveable = (element: DesignerElement) => {
    const target = targets[element];
    if (!target || !canvasRef.current || !hasElement(element)) return null;
    const active = activeElement === element;
    const keepRatio = element === "sticker" || element === "motion";
    const elementGuidelines = (["heading", "body", "sticker", "motion"] as DesignerElement[])
      .filter((other) => other !== element)
      .map((other) => targets[other])
      .filter((el): el is HTMLElement => Boolean(el));
    return (
      <Moveable
        key={element}
        target={target}
        container={canvasRef.current}
        className={`${MOVEABLE_CLASS_NAME} ${active ? "is-active" : "is-passive"}`}
        draggable={editingRole !== element}
        resizable={active}
        rotatable={active}
        origin={false}
        keepRatio={keepRatio}
        throttleDrag={1}
        throttleResize={1}
        throttleRotate={1}
        renderDirections={active ? (keepRatio ? ["nw", "ne", "sw", "se"] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]) : []}
        hideDefaultLines={!active}
        snappable
        snapContainer={canvasRef.current}
        snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
        elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
        elementGuidelines={elementGuidelines}
        verticalGuidelines={[0, screenPixels.w / 2, screenPixels.w].filter(Number.isFinite)}
        horizontalGuidelines={[0, screenPixels.h / 2, safeGuideline, screenPixels.h].filter(Number.isFinite)}
        snapThreshold={6}
        isDisplaySnapDigit={false}
        preventClickEventOnDrag
        clickable
        checkInput
        useResizeObserver
        useMutationObserver
        onClick={(event) => {
          // двойной клик по выбранному тексту — правка (оверлей Moveable перехватывает dblclick DOM-узла)
          if (event.isDouble && (element === "heading" || element === "body")) {
            setActiveElement(element);
            setEditingRole(element);
          }
        }}
        onDragStart={() => {
          if (!active) setActiveElement(element);
          startMoveableGesture(element);
        }}
        onDrag={updateMoveableDrag}
        onResizeStart={(event) => {
          startMoveableGesture(element, event, keepRatio);
          if (event.dragStart) event.dragStart.set([0, 0]);
        }}
        onResize={updateMoveableResize}
        onRotateStart={(event) => {
          const box = selectedBoxForElement(element);
          event.set?.(box?.rot ?? 0);
          startMoveableGesture(element);
        }}
        onRotate={updateMoveableRotation}
        onDragEnd={() => { moveableGesture.current = null; }}
        onResizeEnd={() => { moveableGesture.current = null; }}
        onRotateEnd={() => { moveableGesture.current = null; }}
      />
    );
  };

  const moveableOverlay = canvasRef.current
    ? createPortal(
        <>
          {renderMoveable("heading")}
          {renderMoveable("body")}
          {renderMoveable("sticker")}
          {renderMoveable("motion")}
        </>,
        canvasRef.current,
      )
    : null;

  return (
    <div className="creator-layout-stage">
      <div
        className="creator-layout-stage-inner"
        ref={stageRef}
        tabIndex={-1}
        onKeyDown={handleStageKeyDown}
      >
        <div className={`creator-phone creator-layout-phone ${tone}`}>
          <span className="creator-device-button is-left" aria-hidden="true" />
          <span className="creator-device-button is-right" aria-hidden="true" />
          <div className="creator-phone-screen">
            <span className="creator-device-island" aria-hidden="true" />
            <div
              className="creator-phone-card creator-layout-canvas is-clean-background"
              ref={canvasRef}
              style={previewStyle}
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            >
              {renderTextBox("heading")}
              {renderTextBox("body")}
              {renderSticker()}
              {renderMotion()}
              <div className="creator-safe-zone" aria-hidden="true">
                <span>{t("creator.safeZone")}</span>
              </div>
            </div>
            {moveableOverlay}
          </div>
        </div>
      </div>

      <div className="creator-canvas-toolbar" role="toolbar" aria-label={t("creator.alignToolbarAria")}>
        {toolbarButtons.filter((button) => !button.hidden).map(({ key, icon: Icon, labelKey, action }) => (
          <button
            key={key}
            type="button"
            onClick={action}
            disabled={!activeBox}
            title={t(labelKey)}
            aria-label={t(labelKey)}
          >
            <Icon size={15} />
          </button>
        ))}
        {activeBox && (
          <button type="button" className="creator-toolbar-rotate" onClick={() => align((box) => ({ rot: (box.rot ?? 0) + 15 }))} title={t("creator.rotateElement")} aria-label={t("creator.rotateElement")}>
            <RotateCw size={15} />
          </button>
        )}
        {Boolean(activeBox?.rot) && (
          <button type="button" onClick={() => align(() => ({ rot: 0 }))} title={t("creator.resetRotation")} aria-label={t("creator.resetRotation")}>
            <span className="creator-toolbar-zero">0°</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function CreatorPreviewPanel({
  activePreset,
  background,
}: {
  activePreset: TemplatePreset;
  background: string;
}) {
  const { t } = useT();
  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const previewStyle = previewBackgroundUrl
    ? {
        backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")`,
      }
    : undefined;

  return (
    <aside className="creator-preview-panel" aria-label={t("creator.previewLive")}>
      <div className={`creator-phone ${tone}`}>
        <span className="creator-device-button is-left" aria-hidden="true" />
        <span className="creator-device-button is-right" aria-hidden="true" />
        <div className="creator-phone-screen">
          <span className="creator-device-island" aria-hidden="true" />
          <div className="creator-phone-card is-clean-background" style={previewStyle} />
        </div>
      </div>
    </aside>
  );
}
