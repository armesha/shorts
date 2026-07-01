// Компоненты редактора шаблона: канва с Moveable, панели стиля/дизайнера,
// настройки видео (музыка/длительность/GIF) и телефон-превью.
// Вынесены из Creator.tsx при переходе на проектную структуру страницы.
import {
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Moveable from "react-moveable";
import { Copy, Palette, Redo2, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";
import { useT } from "../../lib/i18n";
import type {
  CardValues,
  CreatorAsset,
  CreatorDesignState,
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
  CHAR_LIMITS,
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
  buildCreatorDesignState,
  clampMotionBox,
  clampRotation,
  clampStickerBox,
  clampTextBox,
  cloneTextLayout,
  colorInputValue,
  parseCreatorDesignState,
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

export function DesignEditor({
  templateNameValue,
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
  mediaSettings,
  setMediaSettings,
  uploadMotionGif,
  background,
  applyDesignState,
  canUndoDesign,
  canRedoDesign,
  undoDesign,
  redoDesign,
}: {
  templateNameValue: string;
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
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMotionGif: (file: File) => Promise<void>;
  background: string;
  applyDesignState: (state: CreatorDesignState) => void;
  canUndoDesign: boolean;
  canRedoDesign: boolean;
  undoDesign: () => void;
  redoDesign: () => void;
}) {
  const { t } = useT();
  const [designerMode, setDesignerMode] = useState(false);
  const [designerSelection, setDesignerSelection] = useState<DesignerElement>("heading");
  const selectedMotion = motion.find((item) => item.id === mediaSettings.motion);
  const motionPreview =
    mediaSettings.motion === "custom"
      ? mediaSettings.customMotion
      : selectedMotion?.src
        ? creatorServiceAssetUrl(selectedMotion.src)
        : "";

  return (
    <div className={`creator-compose-card ${designerMode ? "is-designer-mode" : ""}`}>
      <div className="creator-compose-head">
        <h2 className="creator-editor-title">{t("creator.composeTitle")}</h2>
        <div
          className="creator-mode-switch"
          role="tablist"
          aria-label={t("creator.designerMode")}
          onKeyDown={(event) => handleRovingTabKey(event, designerMode ? 1 : 0, 2, (index) => setDesignerMode(index === 1))}
        >
          <button
            type="button"
            className={!designerMode ? "is-active" : ""}
            role="tab"
            aria-selected={!designerMode}
            aria-controls="creator-card-tools-panel"
            tabIndex={!designerMode ? 0 : -1}
            onClick={() => setDesignerMode(false)}
          >
            {t("creator.cardMode")}
          </button>
          <button
            type="button"
            className={designerMode ? "is-active" : ""}
            role="tab"
            aria-selected={designerMode}
            aria-controls="creator-designer-tools-panel"
            tabIndex={designerMode ? 0 : -1}
            onClick={() => setDesignerMode(true)}
          >
            <SlidersHorizontal size={15} />
            {t("creator.designerMode")}
          </button>
        </div>
      </div>

      <div className={`creator-compose-layout ${designerMode ? "is-designer" : ""}`}>
        {designerMode ? (
          <TemplateDesignerControls
            panelId="creator-designer-tools-panel"
            panelLabel={t("creator.designerMode")}
            templateNameValue={templateNameValue}
            activePreset={activePreset}
            values={values}
            updateValue={updateValue}
            textLayout={textLayout}
            setTextLayout={setTextLayout}
            textStyle={textStyle}
            setTextStyle={setTextStyle}
            sticker={sticker}
            setSticker={setSticker}
            mediaSettings={mediaSettings}
            setMediaSettings={setMediaSettings}
            background={background}
            selection={designerSelection}
            setSelection={setDesignerSelection}
            applyDesignState={applyDesignState}
            canUndoDesign={canUndoDesign}
            canRedoDesign={canRedoDesign}
            undoDesign={undoDesign}
            redoDesign={redoDesign}
          />
        ) : (
          <TextStyleControls
            panelId="creator-card-tools-panel"
            panelLabel={t("creator.cardMode")}
            textStyle={textStyle}
            setTextStyle={setTextStyle}
            sticker={sticker}
            setSticker={setSticker}
            uploadSticker={uploadSticker}
            motion={motion}
            mediaSettings={mediaSettings}
            setMediaSettings={setMediaSettings}
            uploadMotionGif={uploadMotionGif}
          />
        )}

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
          activeElement={designerSelection}
          setActiveElement={setDesignerSelection}
        />
      </div>
    </div>
  );
}

export function MediaSettingsPanel({
  activePreset,
  values,
  background,
  music,
  motion,
  mediaSettings,
  setMediaSettings,
  uploadMusic,
}: {
  activePreset: TemplatePreset;
  values: CardValues;
  background: string;
  music: CreatorAsset[];
  motion: CreatorAsset[];
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMusic: (file: File) => Promise<void>;
}) {
  const { t } = useT();
  const [previewMusicId, setPreviewMusicId] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const selectedMotion = motion.find((item) => item.id === mediaSettings.motion);
  const motionPreview =
    mediaSettings.motion === "custom"
      ? mediaSettings.customMotion
      : selectedMotion?.src
        ? creatorServiceAssetUrl(selectedMotion.src)
        : "";
  const screenRef = useRef<HTMLDivElement>(null);
  const motionGesture = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    box: TextBoxRect;
  } | null>(null);
  const previewStyle = previewBackgroundUrl
    ? ({ backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")` } as CSSProperties)
    : undefined;
  const update = (patch: Partial<MediaSettings>) => setMediaSettings((current) => ({ ...current, ...patch }));
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
  const handleMusicUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadMusic(file).finally(() => {
      input.value = "";
    });
  };
  const startMotionGesture = (event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
    const screen = screenRef.current?.getBoundingClientRect();
    if (!screen || !motionPreview) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    motionGesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: TEMPLATE_W / screen.width,
      scaleY: TEMPLATE_H / screen.height,
      box: clampMotionBox(mediaSettings.motionBox),
    };
  };
  const moveMotionGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const current = motionGesture.current;
    if (!current) return;
    event.preventDefault();
    const dx = (event.clientX - current.startX) * current.scaleX;
    const dy = (event.clientY - current.startY) * current.scaleY;
    const nextBox = current.mode === "move"
      ? { ...current.box, x: current.box.x + dx, y: current.box.y + dy }
      : { ...current.box, w: current.box.w + dx, h: current.box.h + dy };
    update({ motionBox: clampMotionBox(nextBox) });
  };
  const endMotionGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!motionGesture.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
    motionGesture.current = null;
  };

  return (
    <div className="creator-media-card">
      <div className="creator-media-layout">
        <div className="creator-media-tools">
          <div className="creator-video-settings">
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
                onChange={(event) => update({ durationSec: Number(event.target.value) })}
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
              <div className="creator-music-list">
                <button
                  type="button"
                  className={`creator-music-option ${mediaSettings.music === "none" ? "is-active" : ""}`}
                  onClick={() => {
                    update({ music: "none" });
                    stopMusicPreview();
                  }}
                >
                  <span>{t("creator.noMusic")}</span>
                </button>
                {music.map((track) => (
                  <button
                    type="button"
                    key={String(track.id)}
                    className={`creator-music-option ${mediaSettings.music === track.id ? "is-active" : ""}`}
                    onClick={() => {
                      update({ music: String(track.id) });
                      playMusicPreview(track);
                    }}
                  >
                    <span className="creator-music-name">
                      {track.name || track.id}
                    </span>
                    {track.url && (
                      <span className={`creator-music-meter ${previewMusicId === track.id ? "is-playing" : ""}`} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="creator-media-preview">
          <div className={`creator-phone creator-layout-phone ${tone}`}>
            <span className="creator-device-button is-left" aria-hidden="true" />
            <span className="creator-device-button is-right" aria-hidden="true" />
            <div className="creator-phone-screen">
              <span className="creator-device-island" aria-hidden="true" />
              <div
                className="creator-phone-card creator-media-canvas is-clean-background"
                style={previewStyle}
                ref={screenRef}
                onPointerMove={moveMotionGesture}
                onPointerUp={endMotionGesture}
                onPointerCancel={endMotionGesture}
              >
                <div className="creator-media-copy">
                  <strong>{values.heading}</strong>
                  <span>{values.body}</span>
                </div>
                {motionPreview && (
                  <div
                    className="creator-motion-preview-box"
                    style={{
                      left: `${(clampMotionBox(mediaSettings.motionBox).x / TEMPLATE_W) * 100}%`,
                      top: `${(clampMotionBox(mediaSettings.motionBox).y / TEMPLATE_H) * 100}%`,
                      width: `${(clampMotionBox(mediaSettings.motionBox).w / TEMPLATE_W) * 100}%`,
                      height: `${(clampMotionBox(mediaSettings.motionBox).h / TEMPLATE_H) * 100}%`,
                      transform: `rotate(${clampMotionBox(mediaSettings.motionBox).rot ?? 0}deg)`,
                      transformOrigin: "center center",
                    }}
                    onPointerDown={(event) => startMotionGesture(event, "move")}
                  >
                    <img className="creator-motion-preview-gif" src={motionPreview} alt="" draggable={false} />
                    <span
                      className="creator-layout-resize"
                      aria-hidden="true"
                      onPointerDown={(event) => startMotionGesture(event, "resize")}
                    />
                  </div>
                )}
                <span className="creator-video-pill">{t("creator.secondsShort", { count: mediaSettings.durationSec })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TextStyleControls({
  panelId,
  panelLabel,
  textStyle,
  setTextStyle,
  sticker,
  setSticker,
  uploadSticker,
  motion,
  mediaSettings,
  setMediaSettings,
  uploadMotionGif,
}: {
  panelId: string;
  panelLabel: string;
  textStyle: TextStyle;
  setTextStyle: (style: TextStyle) => void;
  sticker: StickerOverlay | null;
  setSticker: (sticker: StickerOverlay | null) => void;
  uploadSticker: (file: File) => Promise<void>;
  motion: CreatorAsset[];
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMotionGif: (file: File) => Promise<void>;
}) {
  const { t } = useT();
  const [assetTab, setAssetTab] = useState<"emoji" | "gif">("emoji");
  const [emojiUsage, setEmojiUsage] = useState<Record<string, number>>(() => readCreatorUsage(CREATOR_EMOJI_USAGE_KEY));
  const [gifUsage, setGifUsage] = useState<Record<string, number>>(() => readCreatorUsage(CREATOR_GIF_USAGE_KEY));
  const frequentEmojis = useMemo(() => {
    const ordered = Object.entries(emojiUsage)
      .filter(([emoji]) => ALL_EMOJI_SET.has(emoji))
      .sort((a, b) => b[1] - a[1])
      .map(([emoji]) => emoji);
    return ordered.slice(0, 16);
  }, [emojiUsage]);
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
  const update = (patch: Partial<TextStyle>) => setTextStyle({ ...textStyle, ...patch });
  const updateMedia = (patch: Partial<MediaSettings>) => setMediaSettings((current) => ({ ...current, ...patch }));
  const textCustomColorSelected = !TEXT_COLOR_CHOICES.includes(textStyle.color);
  const outlineCustomColorSelected = textStyle.outline !== "none" && !OUTLINE_COLOR_CHOICES.includes(textStyle.outline);
  const updateEmoji = (emoji: string) => {
    setSticker({
      kind: "emoji",
      value: emoji,
      ...clampStickerBox(sticker ?? DEFAULT_STICKER_BOX),
    });
    setEmojiUsage((current) => bumpCreatorUsage(CREATOR_EMOJI_USAGE_KEY, current, emoji));
  };
  const handleStickerUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadSticker(file).finally(() => {
      input.value = "";
    });
  };
  const handleGifUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadMotionGif(file).finally(() => {
      input.value = "";
    });
  };

  return (
    <div id={panelId} className="creator-compose-tools" role="tabpanel" aria-label={panelLabel}>
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

      <div className="creator-tool-group creator-tool-group-assets">
        <span className="creator-tool-label">{t("creator.assetPicker")}</span>
        <div className="creator-asset-picker">
          <div
            className="creator-asset-tabs"
            role="tablist"
            aria-label={t("creator.assetPicker")}
            onKeyDown={(event) => handleRovingTabKey(event, assetTab === "gif" ? 1 : 0, 2, (index) => setAssetTab(index === 0 ? "emoji" : "gif"))}
          >
            <button
              type="button"
              className={assetTab === "emoji" ? "is-active" : ""}
              role="tab"
              aria-selected={assetTab === "emoji"}
              aria-controls="creator-emoji-panel"
              tabIndex={assetTab === "emoji" ? 0 : -1}
              onClick={() => setAssetTab("emoji")}
            >
              {t("creator.emoji")}
            </button>
            <button
              type="button"
              className={assetTab === "gif" ? "is-active" : ""}
              role="tab"
              aria-selected={assetTab === "gif"}
              aria-controls="creator-gif-panel"
              tabIndex={assetTab === "gif" ? 0 : -1}
              onClick={() => setAssetTab("gif")}
            >
              {t("creator.gif")}
            </button>
          </div>

          {assetTab === "emoji" ? (
            <div id="creator-emoji-panel" className="creator-asset-scroll" role="tabpanel" aria-label={t("creator.emoji")}>
              {frequentEmojis.length > 0 && (
                <div className="creator-asset-frequent creator-telegram-emoji-grid">
                  {frequentEmojis.map((emoji, index) => (
                    <button
                      key={`frequent-${emoji}-${index}`}
                      type="button"
                      className={`creator-telegram-emoji ${sticker?.kind === "emoji" && sticker.value === emoji ? "is-active" : ""}`}
                      onClick={() => updateEmoji(emoji)}
                      aria-label={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <div className="creator-telegram-emoji-grid">
                {ALL_EMOJIS.map((emoji, index) => (
                  <button
                    key={`${emoji}-${index}`}
                    type="button"
                    className={`creator-telegram-emoji ${sticker?.kind === "emoji" && sticker.value === emoji ? "is-active" : ""}`}
                    onClick={() => updateEmoji(emoji)}
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div id="creator-gif-panel" className="creator-asset-scroll is-gif" role="tabpanel" aria-label={t("creator.gif")}>
              {frequentMotion.length > 0 && (
                <div className="creator-asset-frequent creator-telegram-gif-grid">
                  {frequentMotion.map((item) => {
                    const id = String(item.id);
                    const url = creatorServiceAssetUrl(item.src);
                    return (
                      <button
                        key={`frequent-${id}`}
                        type="button"
                        className={`creator-telegram-gif ${mediaSettings.motion === id ? "is-active" : ""}`}
                        aria-label={String(item.name || item.id || id)}
                        onClick={() => {
                          updateMedia({ motion: id });
                          setGifUsage((current) => bumpCreatorUsage(CREATOR_GIF_USAGE_KEY, current, id));
                        }}
                      >
                        {url ? <img src={url} alt="" loading="lazy" /> : <span>{item.name || item.id}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="creator-telegram-gif-grid">
                {motionItems.map((item) => {
                  const id = String(item.id);
                  const url = creatorServiceAssetUrl(item.src);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`creator-telegram-gif ${mediaSettings.motion === id ? "is-active" : ""}`}
                      aria-label={String(item.name || item.id || id)}
                      onClick={() => {
                        updateMedia({ motion: id });
                        setGifUsage((current) => bumpCreatorUsage(CREATOR_GIF_USAGE_KEY, current, id));
                      }}
                    >
                      {url ? <img src={url} alt="" loading="lazy" /> : <span>{item.name || item.id}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="creator-asset-upload-bar">
            <span>{t("creator.assetUploads")}</span>
            <div>
              <label className="btn btn-xs btn-outline">
                {t("creator.uploadSticker")}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleStickerUpload} />
              </label>
              <label className="btn btn-xs btn-outline">
                {t("creator.uploadGif")}
                <input type="file" accept="image/gif,.gif" onChange={handleGifUpload} />
              </label>
              {sticker && (
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSticker(null)}>
                  {t("creator.noSticker")}
                </button>
              )}
              {mediaSettings.motion !== "none" && (
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => updateMedia({ motion: "none" })}>
                  {t("creator.removeGif")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateDesignerControls({
  panelId,
  panelLabel,
  templateNameValue,
  activePreset,
  values,
  updateValue,
  textLayout,
  setTextLayout,
  textStyle,
  setTextStyle,
  sticker,
  setSticker,
  mediaSettings,
  setMediaSettings,
  background,
  selection,
  setSelection,
  applyDesignState,
  canUndoDesign,
  canRedoDesign,
  undoDesign,
  redoDesign,
}: {
  panelId: string;
  panelLabel: string;
  templateNameValue: string;
  activePreset: TemplatePreset;
  values: CardValues;
  updateValue: (key: keyof CardValues, value: string) => void;
  textLayout: TextLayout;
  setTextLayout: (layout: TextLayout) => void;
  textStyle: TextStyle;
  setTextStyle: (style: TextStyle) => void;
  sticker: StickerOverlay | null;
  setSticker: (sticker: StickerOverlay | null) => void;
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  background: string;
  selection: DesignerElement;
  setSelection: (selection: DesignerElement) => void;
  applyDesignState: (state: CreatorDesignState) => void;
  canUndoDesign: boolean;
  canRedoDesign: boolean;
  undoDesign: () => void;
  redoDesign: () => void;
}) {
  const { t } = useT();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [importText, setImportText] = useState("");
  const [importState, setImportState] = useState<"idle" | "error">("idle");
  const designState = useMemo(() => buildCreatorDesignState({
    templateName: templateNameValue,
    presetId: activePreset.id,
    background,
    values,
    layout: textLayout,
    textStyle,
    sticker,
    mediaSettings,
  }), [activePreset.id, background, mediaSettings, sticker, templateNameValue, textLayout, textStyle, values]);
  const exportText = useMemo(() => JSON.stringify(designState, null, 2), [designState]);
  const textCustomColorSelected = !TEXT_COLOR_CHOICES.includes(textStyle.color);
  const outlineCustomColorSelected = textStyle.outline !== "none" && !OUTLINE_COLOR_CHOICES.includes(textStyle.outline);
  const selectedBox = (() => {
    if (selection === "heading") return clampTextBox(textLayout.heading, "heading");
    if (selection === "body") return clampTextBox(textLayout.body, "body");
    if (selection === "sticker") return sticker ? clampStickerBox(sticker) : null;
    return mediaSettings.motion !== "none" ? clampMotionBox(mediaSettings.motionBox) : null;
  })();
  const updateStyle = (patch: Partial<TextStyle>) => setTextStyle({ ...textStyle, ...patch });
  const updateSelectedBox = (patch: Partial<TextBoxRect>) => {
    if (!selectedBox) return;
    const nextBox = { ...selectedBox, ...patch };
    if (selection === "heading" || selection === "body") {
      setTextLayout({
        ...cloneTextLayout(textLayout),
        [selection]: clampTextBox(nextBox, selection),
      });
      return;
    }
    if (selection === "sticker" && sticker) {
      setSticker({ ...sticker, ...clampStickerBox(nextBox) });
      return;
    }
    if (selection === "motion") {
      setMediaSettings((current) => ({ ...current, motionBox: clampMotionBox(nextBox) }));
    }
  };
  const alignSelected = (xAlign: "left" | "center" | "right") => {
    if (!selectedBox) return;
    const x = xAlign === "left" ? 72 : xAlign === "center" ? (TEMPLATE_W - selectedBox.w) / 2 : TEMPLATE_W - selectedBox.w - 72;
    updateSelectedBox({ x });
  };
  const placeSelected = (yAlign: "top" | "middle" | "bottom") => {
    if (!selectedBox) return;
    const y = yAlign === "top" ? 160 : yAlign === "middle" ? (TEMPLATE_H - selectedBox.h) / 2 : TEMPLATE_H - selectedBox.h - 180;
    updateSelectedBox({ y });
  };
  const resetDesign = () => {
    setTextLayout(cloneTextLayout(DEFAULT_TEXT_LAYOUT));
    setTextStyle({ ...DEFAULT_TEXT_STYLE });
    setSticker(null);
    setMediaSettings((current) => ({ ...current, motion: "none", motionBox: DEFAULT_MOTION_BOX }));
    setSelection("heading");
  };
  const copyDesignState = async () => {
    setCopyState("idle");
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  };
  const importDesignState = () => {
    try {
      const nextState = parseCreatorDesignState(importText);
      applyDesignState(nextState);
      setImportState("idle");
      setSelection("heading");
    } catch {
      setImportState("error");
    }
  };
  const setNumber = (key: keyof TextBoxRect, value: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    updateSelectedBox({ [key]: numeric });
  };
  const selectionItems: Array<{ id: DesignerElement; label: string; disabled?: boolean }> = [
    { id: "heading", label: t("creator.layoutHeading") },
    { id: "body", label: t("creator.layoutBody") },
    { id: "sticker", label: t("creator.sticker"), disabled: !sticker },
    { id: "motion", label: t("creator.gif"), disabled: mediaSettings.motion === "none" },
  ];

  return (
    <div id={panelId} className="creator-compose-tools creator-designer-tools" role="tabpanel" aria-label={panelLabel}>
      <div className="creator-designer-panel">
        <div className="creator-designer-title">
          <span><SlidersHorizontal size={16} />{t("creator.designerMode")}</span>
          <div className="creator-designer-icon-row">
            <button type="button" className="creator-designer-icon-button" onClick={undoDesign} disabled={!canUndoDesign} aria-label={t("creator.undo")} title={t("creator.undo")}>
              <Undo2 size={14} />
            </button>
            <button type="button" className="creator-designer-icon-button" onClick={redoDesign} disabled={!canRedoDesign} aria-label={t("creator.redo")} title={t("creator.redo")}>
              <Redo2 size={14} />
            </button>
          </div>
        </div>

        <div className="creator-designer-layer-grid" role="radiogroup" aria-label={t("creator.designerElement")}>
          {selectionItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={selection === item.id ? "is-active" : ""}
              disabled={item.disabled}
              onClick={() => setSelection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(selection === "heading" || selection === "body") && (
          <label className="form-control">
            <span className="label-text">{selection === "heading" ? t("creator.heading") : t("creator.body")}</span>
            <textarea
              className="textarea textarea-bordered textarea-sm creator-designer-textarea"
              value={selection === "heading" ? values.heading : values.body}
              onChange={(event) => updateValue(selection, event.target.value)}
              maxLength={CHAR_LIMITS[selection] * 2}
            />
          </label>
        )}

        <div className="creator-designer-grid">
          {(["x", "y", "w", "h", "rot"] as const).map((key) => (
            <label key={key}>
              <span>{key.toUpperCase()}</span>
              <input
                type="number"
                value={selectedBox ? selectedBox[key] ?? 0 : ""}
                disabled={!selectedBox}
                onChange={(event) => setNumber(key, event.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="creator-designer-actions">
          <button type="button" onClick={() => alignSelected("left")} disabled={!selectedBox}>{t("creator.alignLeft")}</button>
          <button type="button" onClick={() => alignSelected("center")} disabled={!selectedBox}>{t("creator.alignCenter")}</button>
          <button type="button" onClick={() => alignSelected("right")} disabled={!selectedBox}>{t("creator.alignRight")}</button>
          <button type="button" onClick={() => placeSelected("top")} disabled={!selectedBox}>{t("creator.alignTop")}</button>
          <button type="button" onClick={() => placeSelected("middle")} disabled={!selectedBox}>{t("creator.alignMiddle")}</button>
          <button type="button" onClick={() => placeSelected("bottom")} disabled={!selectedBox}>{t("creator.alignBottom")}</button>
        </div>
      </div>

      <div className="creator-designer-panel">
        <div className="creator-tool-group">
          <span className="creator-tool-label">{t("creator.textColor")}</span>
          <div className="creator-swatch-row">
            {TEXT_COLOR_CHOICES.map((color) => (
              <button
                key={color}
                type="button"
                className={`creator-swatch ${textStyle.color === color ? "is-active" : ""}`}
                style={{ background: color }}
                onClick={() => updateStyle({ color })}
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
                onChange={(event) => updateStyle({ color: event.target.value })}
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
                onClick={() => updateStyle({ outline: color })}
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
                onChange={(event) => updateStyle({ outline: event.target.value })}
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
            onChange={(event) => updateStyle({ background: Number(event.target.value) })}
            aria-label={t("creator.textBackground")}
          />
        </div>
      </div>

      <div className="creator-designer-panel">
        <div className="creator-designer-title">
          <span>{t("creator.timeline")}</span>
          <button type="button" className="creator-designer-icon-button" onClick={copyDesignState} aria-label={t("creator.copyDesignState")}>
            <Copy size={15} />
          </button>
        </div>
        <div className="creator-designer-timeline" aria-label={t("creator.timeline")}>
          <div className="creator-designer-timebar">
            <span>{t("creator.secondsShort", { count: 0 })}</span>
            <span>{t("creator.secondsShort", { count: mediaSettings.durationSec })}</span>
          </div>
          {[
            { id: "background", label: t("creator.background"), active: false, width: 100 },
            { id: "heading", label: t("creator.layoutHeading"), active: selection === "heading", width: 72 },
            { id: "body", label: t("creator.layoutBody"), active: selection === "body", width: 86 },
            ...(sticker ? [{ id: "sticker", label: t("creator.sticker"), active: selection === "sticker", width: 34 }] : []),
            ...(mediaSettings.motion !== "none" ? [{ id: "motion", label: t("creator.gif"), active: selection === "motion", width: 44 }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              className={`creator-designer-track ${item.active ? "is-active" : ""}`}
              onClick={() => {
                if (item.id === "heading" || item.id === "body" || item.id === "sticker" || item.id === "motion") {
                  setSelection(item.id);
                }
              }}
            >
              <span>{item.label}</span>
              <i style={{ width: `${item.width}%` }} />
            </button>
          ))}
        </div>
        <details className="creator-designer-advanced">
          <summary>{t("creator.designState")}</summary>
          <textarea className="creator-design-state" value={exportText} readOnly aria-label={t("creator.designState")} />
          <div className="creator-designer-footer">
            <button type="button" className="btn btn-xs btn-outline gap-1" onClick={copyDesignState}>
              <Copy size={14} />
              {copyState === "copied" ? t("creator.designStateCopied") : t("creator.copyDesignState")}
            </button>
            <button type="button" className="btn btn-xs btn-ghost gap-1" onClick={resetDesign}>
              <RotateCcw size={14} />
              {t("creator.resetDesign")}
            </button>
          </div>
          <textarea
            className="creator-design-state is-import"
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportState("idle");
            }}
            placeholder={t("creator.importDesignState")}
            aria-label={t("creator.importDesignState")}
          />
          <button type="button" className="btn btn-xs btn-primary" onClick={importDesignState} disabled={!importText.trim()}>
            {importState === "error" ? t("creator.designStateInvalid") : t("creator.applyDesignState")}
          </button>
        </details>
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
  const screenRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    role: TextBoxRole;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    layout: TextLayout;
  } | null>(null);
  const stickerGesture = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    box: TextBoxRect;
  } | null>(null);
  const motionGesture = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    box: TextBoxRect;
  } | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickerRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const moveableGesture = useRef<{
    element: DesignerElement;
    box: TextBoxRect;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const [moveableTarget, setMoveableTarget] = useState<HTMLElement | null>(null);
  const [screenPixels, setScreenPixels] = useState({ w: 0, h: 0 });
  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const previewStyle = previewBackgroundUrl
    ? ({ backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")` } as CSSProperties)
    : undefined;

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
      updateMotionBox(box);
    }
  };

  const resolveMoveableTarget = (): HTMLElement | null => {
    if (activeElement === "heading") return headingRef.current;
    if (activeElement === "body") return bodyRef.current;
    if (activeElement === "sticker") return stickerRef.current;
    if (activeElement === "motion") return motionRef.current;
    return null;
  };

  useEffect(() => {
    const updateTarget = () => setMoveableTarget((current) => {
      const next = resolveMoveableTarget();
      return current === next ? current : next;
    });
    updateTarget();
  });

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;
    const updateSize = () => {
      const rect = screen.getBoundingClientRect();
      setScreenPixels({ w: rect.width, h: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(screen);
    return () => observer.disconnect();
  }, []);

  const startGesture = (event: ReactPointerEvent<HTMLElement>, role: TextBoxRole, mode: "move" | "resize") => {
    const screen = screenRef.current?.getBoundingClientRect();
    if (!screen) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveElement(role);
    gesture.current = {
      role,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: TEMPLATE_W / screen.width,
      scaleY: TEMPLATE_H / screen.height,
      layout: cloneTextLayout(layout),
    };
  };

  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    event.preventDefault();
    const dx = (event.clientX - current.startX) * current.scaleX;
    const dy = (event.clientY - current.startY) * current.scaleY;
    const base = current.layout[current.role];
    const nextBox = current.mode === "move"
      ? { ...base, x: base.x + dx, y: base.y + dy }
      : { ...base, w: base.w + dx, h: base.h + dy };
    const next = cloneTextLayout(current.layout);
    next[current.role] = clampTextBox(nextBox, current.role);
    setLayout(next);
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesture.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
    gesture.current = null;
  };

  const startStickerGesture = (event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (!sticker) return;
    const screen = screenRef.current?.getBoundingClientRect();
    if (!screen) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    stickerGesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: TEMPLATE_W / screen.width,
      scaleY: TEMPLATE_H / screen.height,
      box: clampStickerBox(sticker),
    };
  };

  const moveStickerGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const current = stickerGesture.current;
    if (!current) return;
    event.preventDefault();
    const dx = (event.clientX - current.startX) * current.scaleX;
    const dy = (event.clientY - current.startY) * current.scaleY;
    const nextBox = current.mode === "move"
      ? { ...current.box, x: current.box.x + dx, y: current.box.y + dy }
      : { ...current.box, w: current.box.w + dx, h: current.box.h + dy };
    setSticker(sticker ? { ...sticker, ...clampStickerBox(nextBox) } : null);
  };

  const endStickerGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!stickerGesture.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
    stickerGesture.current = null;
  };

  const updateMotionBox = (box: TextBoxRect) => {
    setMediaSettings((current) => ({ ...current, motionBox: clampMotionBox(box) }));
  };

  const startMoveableGesture = (element: DesignerElement) => {
    const screen = screenRef.current?.getBoundingClientRect();
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

  const updateMoveableResize = (event: { width?: number; height?: number; drag?: { beforeTranslate?: number[]; translate?: number[] } }) => {
    const current = moveableGesture.current;
    if (!current || !event.width || !event.height) return;
    const [dx = 0, dy = 0] = event.drag?.beforeTranslate ?? event.drag?.translate ?? [];
    updateBoxForElement(current.element, {
      ...current.box,
      x: current.box.x + dx * current.scaleX,
      y: current.box.y + dy * current.scaleY,
      w: event.width * current.scaleX,
      h: event.height * current.scaleY,
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

  const startMotionGesture = (event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize") => {
    if (!motionPreview) return;
    const screen = screenRef.current?.getBoundingClientRect();
    if (!screen) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    motionGesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: TEMPLATE_W / screen.width,
      scaleY: TEMPLATE_H / screen.height,
      box: clampMotionBox(mediaSettings.motionBox),
    };
  };

  const moveMotionGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const current = motionGesture.current;
    if (!current) return;
    event.preventDefault();
    const dx = (event.clientX - current.startX) * current.scaleX;
    const dy = (event.clientY - current.startY) * current.scaleY;
    const nextBox = current.mode === "move"
      ? { ...current.box, x: current.box.x + dx, y: current.box.y + dy }
      : { ...current.box, w: current.box.w + dx, h: current.box.h + dy };
    updateMotionBox(nextBox);
  };

  const endMotionGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (!motionGesture.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
    motionGesture.current = null;
  };

  const renderBox = (role: TextBoxRole) => {
    const box = clampTextBox(layout[role], role);
    const label = role === "heading" ? t("creator.layoutHeading") : t("creator.layoutBody");
    const value = role === "heading" ? values.heading : values.body;
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
        className={`creator-layout-box is-${role} ${activeElement === role ? "is-active" : ""}`}
        style={style}
        onFocus={() => setActiveElement(role)}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <button
          type="button"
          className="creator-layout-box-label"
          onPointerDown={(event) => startGesture(event, role, "move")}
        >
          {label}
        </button>
        <textarea
          className="creator-layout-box-input"
          value={value}
          maxLength={CHAR_LIMITS[role] * 2}
          onChange={(event) => updateValue(role, event.target.value)}
          onFocus={() => setActiveElement(role)}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={label}
        />
        <span
          className="creator-layout-resize"
          aria-hidden="true"
          onPointerDown={(event) => startGesture(event, role, "resize")}
        />
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
        onPointerDown={(event) => {
          setActiveElement("sticker");
          startStickerGesture(event, "move");
        }}
        onPointerMove={moveStickerGesture}
        onPointerUp={endStickerGesture}
        onPointerCancel={endStickerGesture}
      >
        {sticker.kind === "image" ? (
          <img src={sticker.value} alt="" draggable={false} />
        ) : (
          <span className="creator-sticker-emoji">{sticker.value}</span>
        )}
        <span
          className="creator-layout-resize"
          aria-hidden="true"
          onPointerDown={(event) => {
            setActiveElement("sticker");
            startStickerGesture(event, "resize");
          }}
        />
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
        onPointerDown={(event) => {
          setActiveElement("motion");
          startMotionGesture(event, "move");
        }}
        onPointerMove={moveMotionGesture}
        onPointerUp={endMotionGesture}
        onPointerCancel={endMotionGesture}
      >
        <img className="creator-motion-preview-gif" src={motionPreview} alt="" draggable={false} />
        <span
          className="creator-layout-resize"
          aria-hidden="true"
          onPointerDown={(event) => {
            setActiveElement("motion");
            startMotionGesture(event, "resize");
          }}
        />
      </div>
    );
  };

  const moveableOverlay = moveableTarget && screenRef.current ? createPortal(
    <Moveable
      target={moveableTarget}
      container={screenRef.current}
      className={MOVEABLE_CLASS_NAME}
      draggable
      resizable
      rotatable
      snappable
      snapContainer={screenRef.current}
      verticalGuidelines={[0, screenPixels.w / 2, screenPixels.w].filter(Boolean)}
      horizontalGuidelines={[0, screenPixels.h / 2, screenPixels.h].filter(Boolean)}
      snapThreshold={7}
      snapGap
      isDisplaySnapDigit={false}
      origin={false}
      keepRatio={activeElement === "sticker" || activeElement === "motion"}
      throttleDrag={1}
      throttleResize={1}
      throttleRotate={1}
      renderDirections={["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
      preventClickEventOnDrag
      checkInput
      useResizeObserver
      useMutationObserver
      onDragStart={() => startMoveableGesture(activeElement)}
      onDrag={updateMoveableDrag}
      onResizeStart={(event) => {
        startMoveableGesture(activeElement);
        if (event.dragStart) event.dragStart.set([0, 0]);
      }}
      onResize={updateMoveableResize}
      onRotateStart={(event) => {
        const box = selectedBoxForElement(activeElement);
        event.set?.(box?.rot ?? 0);
        startMoveableGesture(activeElement);
      }}
      onRotate={updateMoveableRotation}
      onDragEnd={() => { moveableGesture.current = null; }}
      onResizeEnd={() => { moveableGesture.current = null; }}
      onRotateEnd={() => { moveableGesture.current = null; }}
    />,
    screenRef.current,
  ) : null;

  return (
    <div className="creator-layout-stage">
      <div className={`creator-phone creator-layout-phone ${tone}`}>
        <span className="creator-device-button is-left" aria-hidden="true" />
        <span className="creator-device-button is-right" aria-hidden="true" />
        <div className="creator-phone-screen" ref={screenRef}>
          <span className="creator-device-island" aria-hidden="true" />
          <div className="creator-phone-card creator-layout-canvas is-clean-background" style={previewStyle}>
            {renderBox("heading")}
            {renderBox("body")}
            {renderSticker()}
            {renderMotion()}
          </div>
          {moveableOverlay}
        </div>
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
