import { type ChangeEvent, type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Moveable from "react-moveable";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Check,
  Copy,
  FileImage,
  Loader2,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { get, send } from "../lib/api/http";
import { langTag } from "../lib/deck";
import { useT } from "../lib/i18n";
import type {
  AutosaveStatus,
  CardValues,
  CreatorAsset,
  CreatorDesignState,
  CreatorPack,
  CreatorRecord,
  CreatorSummary,
  DesignerElement,
  MediaSettings,
  Notice,
  StickerOverlay,
  TemplatePreset,
  TextBoxRect,
  TextBoxRole,
  TextLayout,
  TextStyle,
} from "./creator/types";
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
  FALLBACK_PRESETS,
  FLOW_STEPS,
  MOVEABLE_CLASS_NAME,
  OUTLINE_COLOR_CHOICES,
  TEMPLATE_H,
  TEMPLATE_W,
  TEXT_COLOR_CHOICES,
  type CreatorStep,
} from "./creator/config";
import {
  buildCreatorDesignState,
  clampMotionBox,
  clampRotation,
  clampStickerBox,
  clampTextBox,
  cloneTextLayout,
  colorInputValue,
  parseCreatorDesignState,
  readCreatorDesignState,
  textBackgroundCss,
  textOutlineShadow,
} from "./creator/designState";
import { bumpCreatorUsage, readCreatorUsage } from "./creator/usage";
import { useDesignHistory } from "./creator/useDesignHistory";
import {
  prepareCreatorBackground,
  prepareCreatorMotionGif,
  prepareCreatorMusic,
  prepareCreatorSticker,
} from "./creator/fileAssets";
import {
  creatorServiceAssetUrl,
  cssUrl,
  errorText,
  firstTemplateImageSrc,
  localizedFallbackPresets,
  normalizeSummary,
  packCardItems,
  packCards,
  packHasTemplates,
  packId,
  templateTone,
  usableBackgroundUrl,
} from "./creator/model";
import { handleRovingTabKey } from "./creator/keyboard";
import { applyTextLayoutToTemplates } from "./creator/templateTransforms";

export default function Creator() {
  const { t } = useT();
  const fallbackPresets = useMemo(() => localizedFallbackPresets(t), [t]);
  const initialPreset = fallbackPresets[0] ?? FALLBACK_PRESETS[0];
  const [step, setStep] = useState<CreatorStep>("setup");
  const [summary, setSummary] = useState<CreatorSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [view, setView] = useState<"builder" | "library">("builder");
  const [libraryFocusPackId, setLibraryFocusPackId] = useState("");
  const [templateSourcePackId, setTemplateSourcePackId] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const lastSavedDesignRef = useRef("");
  const autosaveStatusTimerRef = useRef<number | null>(null);

  const [activePackId, setActivePackId] = useState("");
  const [templateNameValue, setTemplateNameValue] = useState(() => t("creator.defaultPackName"));
  const [saveMode, setSaveMode] = useState<"existing" | "new">("new");
  const [newPackName, setNewPackName] = useState("");
  const [packLang, setPackLang] = useState(initialPreset.lang || "ru");
  const [templateType, setTemplateType] = useState(initialPreset.templateType);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [background, setBackground] = useState("");
  const [backgroundName, setBackgroundName] = useState("");
  const [textLayout, setTextLayout] = useState<TextLayout>(() => cloneTextLayout(DEFAULT_TEXT_LAYOUT));
  const [textStyle, setTextStyle] = useState<TextStyle>(() => ({ ...DEFAULT_TEXT_STYLE }));
  const [sticker, setSticker] = useState<StickerOverlay | null>(null);
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>({
    music: "none",
    customMusicName: "",
    motion: "none",
    customMotion: "",
    customMotionName: "",
    durationSec: 6,
    motionBox: DEFAULT_MOTION_BOX,
  });
  const [values, setValues] = useState<CardValues>(initialPreset.defaults);
  const loadSummary = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await get<unknown>("/creator/summary");
      setSummary(normalizeSummary(data));
    } catch (err) {
      setSummaryError(errorText(err, t("creator.errSummary")));
      if (!quiet) setSummary(null);
    } finally {
      if (!quiet) setLoadingSummary(false);
    }
  }, [t]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const packs = summary?.packs ?? [];
  const localizedSummaryPresets = useMemo(() => {
    const known = new Map(fallbackPresets.map((preset) => [preset.id, preset]));
    return (summary?.presets ?? []).map((preset) => {
      const fallback = known.get(preset.id);
      return {
        ...preset,
        label: fallback?.label ?? preset.label,
        defaults: fallback?.defaults ?? preset.defaults,
      };
    });
  }, [fallbackPresets, summary?.presets]);
  const availablePresets = localizedSummaryPresets.length ? localizedSummaryPresets : fallbackPresets;
  const featureDisabled = summary?.feature === false;

  useEffect(() => {
    if (!activePackId) return;
    const current = packs.some((pack) => packId(pack) === activePackId);
    if (!current) setActivePackId("");
  }, [packs, activePackId]);

  useEffect(() => {
    if (!packs.length) {
      setSaveMode("new");
      return;
    }
    setSaveMode((mode) => (mode === "new" && !newPackName.trim() ? "existing" : mode));
    if (!activePackId) setActivePackId(packId(packs[0]));
  }, [packs, activePackId, newPackName]);

  const activePreset = availablePresets.find((preset) => preset.id === presetId) ?? availablePresets[0] ?? fallbackPresets[0] ?? FALLBACK_PRESETS[0];
  const activeTemplatePayload = useMemo(
    () => applyTextLayoutToTemplates(activePreset.templates, textLayout, textStyle, sticker),
    [activePreset.templates, sticker, textLayout, textStyle],
  );
  const designState = useMemo(() => buildCreatorDesignState({
    templateName: templateNameValue.trim() || activePreset.label,
    presetId: activePreset.id,
    background,
    values,
    layout: textLayout,
    textStyle,
    sticker,
    mediaSettings,
  }), [activePreset.id, activePreset.label, background, mediaSettings, sticker, templateNameValue, textLayout, textStyle, values]);
  const serializedDesignState = useMemo(() => JSON.stringify(designState), [designState]);

  useEffect(() => {
    if (!availablePresets.length) return;
    const current = availablePresets.find((preset) => preset.id === presetId);
    if (current) return;
    const next = availablePresets[0];
    setTemplateType(next.templateType);
    setPresetId(next.id);
    setPackLang(next.lang || "ru");
    setValues(next.defaults);
  }, [availablePresets, presetId]);

  function selectPreset(nextId: string) {
    const nextPreset = availablePresets.find((preset) => preset.id === nextId) ?? availablePresets[0] ?? fallbackPresets[0] ?? FALLBACK_PRESETS[0];
    setBackground("");
    setBackgroundName("");
    setPresetId(nextPreset.id);
    setTemplateType(nextPreset.templateType);
    setValues(nextPreset.defaults);
    setPackLang(nextPreset.lang || packLang);
  }

  async function uploadBackground(file: File) {
    setNotice(null);
    setBusy("upload-background");
    try {
      const dataUrl = await prepareCreatorBackground(file);
      const res = await send<{ asset: CreatorAsset }>("/creator/assets/backgrounds", "POST", {
        name: file.name,
        dataUrl,
      });
      setBackground(String(res.asset?.dataUrl || dataUrl));
      setBackgroundName(String(res.asset?.name || file.name || t("creator.uploadBackground")));
      void loadSummary(true);
    } catch (err) {
      const text = err instanceof Error && err.message === "bad-type"
        ? t("creator.errBackgroundType")
        : errorText(err, t("creator.errUploadBackground"));
      setNotice({ type: "error", text });
    } finally {
      setBusy(null);
    }
  }

  function updateValue(key: keyof CardValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function templatePayload(): unknown[] {
    return activeTemplatePayload;
  }

  const applyDesignStateToEditor = useCallback((state: CreatorDesignState) => {
    const restoredPreset = availablePresets.find((preset) => preset.id === state.presetId);
    if (restoredPreset) {
      setPresetId(restoredPreset.id);
      setTemplateType(restoredPreset.templateType);
      setPackLang(restoredPreset.lang || "ru");
    }
    if (state.templateName.trim()) setTemplateNameValue(state.templateName.trim());
    setBackground(state.background);
    setBackgroundName(state.background ? t("creator.backgroundTemplate") : "");
    setValues((current) => ({
      ...current,
      heading: state.values.heading || current.heading,
      body: state.values.body || current.body,
    }));
    setTextLayout(cloneTextLayout(state.layout));
    setTextStyle({ ...state.textStyle });
    setSticker(state.sticker);
    setMediaSettings((current) => ({
      ...current,
      music: state.media.music || current.music || "none",
      customMusicName: state.media.customMusicName || current.customMusicName,
      motion: state.media.motion || current.motion || "none",
      customMotion: state.media.customMotion || current.customMotion,
      customMotionName: state.media.customMotionName || current.customMotionName,
      durationSec: state.media.durationSec,
      motionBox: state.media.motionBox,
    }));
  }, [availablePresets, t]);

  function currentDesignState(): CreatorDesignState {
    return designState;
  }

  const {
    canUndoDesign,
    canRedoDesign,
    undoDesign,
    redoDesign,
    resetDesignHistory,
  } = useDesignHistory({
    designState,
    applyDesignState: applyDesignStateToEditor,
  });

  const setSettledAutosaveStatus = useCallback((status: AutosaveStatus) => {
    if (autosaveStatusTimerRef.current) window.clearTimeout(autosaveStatusTimerRef.current);
    setAutosaveStatus(status);
    if (status === "saved") {
      autosaveStatusTimerRef.current = window.setTimeout(() => setAutosaveStatus("idle"), 1400);
    }
  }, []);

  const saveTemplateDesign = useCallback(async (id: string, quiet = false): Promise<CreatorPack | null> => {
    if (!id) return null;
    if (!quiet) setSettledAutosaveStatus("saving");
    const res = await send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(id)}/design`, "PATCH", {
      templates: activeTemplatePayload,
      templateType,
      background: background || undefined,
      layout: textLayout,
      designState,
    });
    lastSavedDesignRef.current = serializedDesignState;
    setSummary((current) => current ? {
      ...current,
      packs: current.packs.map((pack) => (packId(pack) === id ? { ...pack, ...res.pack } : pack)),
    } : current);
    if (!quiet) setSettledAutosaveStatus("saved");
    return res.pack;
  }, [activeTemplatePayload, background, designState, serializedDesignState, setSettledAutosaveStatus, templateType, textLayout]);

  useEffect(() => () => {
    if (autosaveStatusTimerRef.current) window.clearTimeout(autosaveStatusTimerRef.current);
  }, []);

  useEffect(() => {
    if (!templateSourcePackId || view !== "builder" || loadingSummary || featureDisabled) return;
    if (serializedDesignState === lastSavedDesignRef.current) return;
    const handle = window.setTimeout(() => {
      void saveTemplateDesign(templateSourcePackId).catch(() => {
        setSettledAutosaveStatus("error");
      });
    }, 850);
    return () => window.clearTimeout(handle);
  }, [featureDisabled, loadingSummary, saveTemplateDesign, serializedDesignState, setSettledAutosaveStatus, templateSourcePackId, view]);

  async function uploadSticker(file: File) {
    setNotice(null);
    try {
      const dataUrl = await prepareCreatorSticker(file);
      setSticker({
        kind: "image",
        value: dataUrl,
        name: file.name,
        ...clampStickerBox(sticker ?? DEFAULT_STICKER_BOX),
      });
    } catch (err) {
      const text = err instanceof Error && err.message === "bad-type"
        ? t("creator.errStickerType")
        : errorText(err, t("creator.errUploadSticker"));
      setNotice({ type: "error", text });
    }
  }

  async function uploadMotionGif(file: File) {
    setNotice(null);
    try {
      const dataUrl = await prepareCreatorMotionGif(file);
      setMediaSettings((current) => ({
        ...current,
        motion: "custom",
        customMotion: dataUrl,
        customMotionName: file.name || t("creator.customGif"),
      }));
    } catch (err) {
      const text =
        err instanceof Error && err.message === "bad-type"
          ? t("creator.errGifType")
          : err instanceof Error && err.message === "too-large"
            ? t("creator.errGifTooLarge")
            : errorText(err, t("creator.errUploadGif"));
      setNotice({ type: "error", text });
    }
  }

  async function uploadMusic(file: File) {
    setNotice(null);
    try {
      const dataUrl = await prepareCreatorMusic(file);
      const res = await send<{ asset: CreatorAsset }>("/creator/assets/music", "POST", {
        name: file.name,
        dataUrl,
      });
      const asset = res.asset;
      if (asset?.id) {
        setMediaSettings((current) => ({
          ...current,
          music: String(asset.id),
          customMusicName: String(asset.name || file.name || t("creator.customMusic")),
        }));
        setSummary((current) => current ? { ...current, music: [asset, ...current.music.filter((item) => item.id !== asset.id)] } : current);
      }
    } catch (err) {
      const text =
        err instanceof Error && err.message === "bad-type"
          ? t("creator.errMusicType")
          : err instanceof Error && err.message === "too-large"
            ? t("creator.errMusicTooLarge")
            : errorText(err, t("creator.errUploadMusic"));
      setNotice({ type: "error", text });
    }
  }

  function cardPayload() {
    const bodyLines = values.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const motion = mediaSettings.motion === "custom" ? mediaSettings.customMotionName || "custom" : mediaSettings.motion;
    const nextValues: CreatorRecord = {
      title: values.heading,
      heading: values.heading,
      hook: values.heading,
      text: values.body,
      body: values.body,
      fact: values.body,
      points: bodyLines.length ? bodyLines : [values.body].filter(Boolean),
      templatePreset: activePreset.id,
      templateType,
      creatorTemplateName: templateNameValue.trim() || activePreset.label,
      creatorMusic: mediaSettings.music || "auto",
      creatorMotion: motion || "none",
      creatorDurationSec: String(mediaSettings.durationSec),
      creatorMotionBox: clampMotionBox(mediaSettings.motionBox),
    };
    if (background) nextValues.background = background;
    return { values: nextValues };
  }

  async function createPackRecord(nameValue: string, announce = true): Promise<CreatorPack | null> {
    setNotice(null);
    const name = nameValue.trim();
    if (!name) {
      setNotice({ type: "error", text: t("creator.errPackNameRequired") });
      return null;
    }
    try {
      const res = await send<{ pack: CreatorPack }>("/creator/packs", "POST", {
        name,
        lang: activePreset.lang || packLang,
        templateType,
        presetId: activePreset.id,
        templates: templatePayload(),
        background: background || undefined,
        layout: textLayout,
        designState: currentDesignState(),
      });
      const nextPack = res.pack;
      const nextPackId = packId(nextPack);
      lastSavedDesignRef.current = serializedDesignState;
      setSummary((current) => {
        const normalized = current ?? { feature: true, packs: [], gallery: [], backgrounds: [], userBackgrounds: [], presets: [], music: [], motion: [] };
        return { ...normalized, packs: [nextPack, ...normalized.packs.filter((pack) => packId(pack) !== packId(nextPack))] };
      });
      setActivePackId(nextPackId);
      setTemplateSourcePackId(nextPackId);
      if (announce) {
        void loadSummary(true);
      }
      return nextPack;
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errCreatePack")) });
      return null;
    }
  }

  async function addCard() {
    setNotice(null);
    if (!values.heading.trim() || !values.body.trim()) {
      setNotice({ type: "error", text: t("creator.errCardRequired") });
      return;
    }
    setBusy("add-card");
    let createdPackId = "";
    try {
      let targetPackId = saveMode === "existing" ? activePackId : "";
      if (saveMode === "new") {
        const created = await createPackRecord(newPackName, false);
        targetPackId = packId(created);
        createdPackId = targetPackId;
      }
      if (!targetPackId) return;
      if (templateSourcePackId && targetPackId === templateSourcePackId) {
        await saveTemplateDesign(targetPackId, true);
      }
      const res = await send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(targetPackId)}/cards`, "POST", {
        cards: [cardPayload()],
      });
      setSummary((current) => {
        if (!current) return current;
        return {
          ...current,
          packs: current.packs.map((pack) => (packId(pack) === targetPackId ? res.pack : pack)),
        };
      });
      setActivePackId(targetPackId);
      setLibraryFocusPackId(targetPackId);
      setView("library");
      void loadSummary(true);
    } catch (err) {
      if (createdPackId) {
        try {
          await send(`/creator/packs/${encodeURIComponent(createdPackId)}`, "DELETE");
          setSummary((current) => current ? { ...current, packs: current.packs.filter((pack) => packId(pack) !== createdPackId) } : current);
        } catch {
          /* best-effort cleanup; keep the original save error visible */
        }
      }
      setNotice({ type: "error", text: errorText(err, t("creator.errAddCard")) });
    } finally {
      setBusy(null);
    }
  }

  async function renameActivePack(name: string) {
    const id = activePackId;
    if (!id || !name.trim()) return;
    setBusy("rename-pack");
    setNotice(null);
    try {
      const res = await send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(id)}`, "PATCH", { name });
      setSummary((current) => current ? {
        ...current,
        packs: current.packs.map((pack) => (packId(pack) === id ? res.pack : pack)),
      } : current);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errRenamePack")) });
    } finally {
      setBusy(null);
    }
  }

  async function deleteActivePack() {
    const id = activePackId;
    if (!id) return;
    setBusy("delete-pack");
    setNotice(null);
    try {
      await send(`/creator/packs/${encodeURIComponent(id)}`, "DELETE");
      setSummary((current) => current ? { ...current, packs: current.packs.filter((pack) => packId(pack) !== id) } : current);
      setActivePackId("");
      void loadSummary(true);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errDeletePack")) });
    } finally {
      setBusy(null);
    }
  }

  const actionsDisabled = loadingSummary || featureDisabled;
  const canAddToPack = saveMode === "existing" ? Boolean(activePackId) : Boolean(newPackName.trim());
  const canContinueSetup = true;
  const showAutosaveStatus = view === "builder" && Boolean(templateSourcePackId) && autosaveStatus !== "idle";
  const openPackForCard = async (pack: CreatorPack) => {
    const id = packId(pack);
    if (!id) return;
    setNotice(null);
    setActivePackId(id);
    setTemplateSourcePackId(id);
    setSaveMode("existing");
    setView("builder");
    let fullPack = pack;
    try {
      fullPack = await get<CreatorPack>(`/creator/packs/${encodeURIComponent(id)}`);
      setSummary((current) => current ? {
        ...current,
        packs: current.packs.map((item) => (packId(item) === id ? { ...item, ...fullPack } : item)),
      } : current);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errSummary")) });
    }
    setTemplateNameValue(String(fullPack.name || t("creator.defaultPackName")));
    const restored = readCreatorDesignState(fullPack.creatorDesignState);
    if (restored) {
      const restoredSerialized = JSON.stringify(restored);
      lastSavedDesignRef.current = restoredSerialized;
      resetDesignHistory(restored);
      setSettledAutosaveStatus("idle");
      applyDesignStateToEditor(restored);
    } else {
      lastSavedDesignRef.current = "";
      resetDesignHistory();
    }
    setStep(packHasTemplates(fullPack) ? "compose" : "setup");
  };

  return (
    <div className="creator-page max-w-7xl space-y-4">
      <div className="creator-hero">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("creator.title")}</h1>
          {showAutosaveStatus && (
            <div className={`creator-autosave-status is-${autosaveStatus}`} role={autosaveStatus === "error" ? "alert" : "status"}>
              {autosaveStatus === "saving" ? <Loader2 className="animate-spin" size={13} /> : autosaveStatus === "error" ? <AlertTriangle size={13} /> : <Check size={13} />}
              <span>{t(`creator.autosave.${autosaveStatus}`)}</span>
            </div>
          )}
        </div>
        <div
          className="creator-view-tabs"
          role="tablist"
          aria-label={t("creator.title")}
          onKeyDown={(event) => handleRovingTabKey(event, view === "builder" ? 0 : 1, 2, (index) => setView(index === 0 ? "builder" : "library"))}
        >
          <button
            type="button"
            className={`btn btn-sm ${view === "builder" ? "btn-primary" : "btn-outline"}`}
            role="tab"
            aria-selected={view === "builder"}
            aria-controls="creator-builder-panel"
            tabIndex={view === "builder" ? 0 : -1}
            onClick={() => setView("builder")}
          >
            {t("creator.builderTab")}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view === "library" ? "btn-primary" : "btn-outline"}`}
            role="tab"
            aria-selected={view === "library"}
            aria-controls="creator-library-panel"
            tabIndex={view === "library" ? 0 : -1}
            onClick={() => setView("library")}
          >
            {t("creator.libraryTab")}
          </button>
        </div>
      </div>

      {summaryError && (
        <div className="alert alert-warning text-sm" role="alert">
          <AlertTriangle size={18} />
          <span>{summaryError}</span>
        </div>
      )}
      {featureDisabled && (
        <div className="alert alert-warning text-sm" role="alert">
          <AlertTriangle size={18} />
          <span>{t("creator.featureDisabled")}</span>
        </div>
      )}
      {notice && (
        <div className={`alert text-sm ${notice.type === "error" ? "alert-error" : notice.type === "success" ? "alert-success" : "alert-info"}`} role="status">
          {notice.type === "error" ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{notice.text}</span>
        </div>
      )}

      {loadingSummary && !summary ? (
        <div className="flex items-center gap-2 py-16 text-base-content/60">
          <span className="loading loading-spinner loading-lg text-primary" />
          {t("creator.loading")}
        </div>
      ) : view === "library" ? (
        <div id="creator-library-panel" role="tabpanel" aria-label={t("creator.libraryTab")}>
          <CreatorLibrary packs={packs} focusPackId={libraryFocusPackId} onAddCard={openPackForCard} />
        </div>
      ) : (
        <div id="creator-builder-panel" className={`creator-workspace ${step !== "setup" ? "is-compose" : ""}`} role="tabpanel" aria-label={t("creator.builderTab")}>
          <StepRail
            step={step}
            setStep={setStep}
            disabled={actionsDisabled}
          />
          <div className="creator-step-pane" key={step}>
            {step === "setup" ? (
              <SetupPanel
                templateNameValue={templateNameValue}
                setTemplateNameValue={setTemplateNameValue}
                packLang={packLang}
                presetId={presetId}
                presets={availablePresets}
                selectPreset={selectPreset}
                background={background}
                backgroundName={backgroundName}
                uploadBackground={uploadBackground}
                busy={busy}
                actionsDisabled={actionsDisabled}
                canContinue={canContinueSetup}
                onNext={() => setStep("compose")}
              />
            ) : step === "compose" ? (
              <ComposePanel
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
                uploadSticker={uploadSticker}
                motion={summary?.motion ?? []}
                mediaSettings={mediaSettings}
                setMediaSettings={setMediaSettings}
                uploadMotionGif={uploadMotionGif}
                background={background}
                applyDesignState={applyDesignStateToEditor}
                canUndoDesign={canUndoDesign}
                canRedoDesign={canRedoDesign}
                undoDesign={undoDesign}
                redoDesign={redoDesign}
                actionsDisabled={actionsDisabled}
                onBack={() => setStep("setup")}
                onNext={() => setStep("media")}
              />
            ) : step === "media" ? (
              <MediaPanel
                activePreset={activePreset}
                values={values}
                background={background}
                music={summary?.music ?? []}
                motion={summary?.motion ?? []}
                mediaSettings={mediaSettings}
                setMediaSettings={setMediaSettings}
                uploadMusic={uploadMusic}
                actionsDisabled={actionsDisabled}
                onBack={() => setStep("compose")}
                onNext={() => setStep("save")}
              />
            ) : step === "save" ? (
              <SavePanel
                packs={packs}
                activePackId={activePackId}
                setActivePackId={setActivePackId}
                saveMode={saveMode}
                setSaveMode={setSaveMode}
                newPackName={newPackName}
                setNewPackName={setNewPackName}
                addCard={addCard}
                renameActivePack={renameActivePack}
                deleteActivePack={deleteActivePack}
                busy={busy}
                actionsDisabled={actionsDisabled}
                canAddCard={canAddToPack}
                onBack={() => setStep("media")}
              />
            ) : null}
          </div>
          {step === "setup" && (
            <CreatorPreviewPanel
              activePreset={activePreset}
              background={background}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StepRail({
  step,
  setStep,
  disabled,
}: {
  step: CreatorStep;
  setStep: (step: CreatorStep) => void;
  disabled: boolean;
}) {
  const { t } = useT();
  const currentIndex = FLOW_STEPS.findIndex((item) => item.id === step);

  return (
    <aside className="creator-rail" aria-label={t("creator.flowAria")}>
      <div className="creator-rail-list">
        {FLOW_STEPS.map((item, index) => {
          const active = item.id === step;
          const done = index < currentIndex;
          return (
            <button
              key={item.id}
              type="button"
              className={`creator-rail-step ${active ? "is-active" : ""} ${done ? "is-done" : ""}`}
              onClick={() => setStep(item.id)}
              disabled={disabled}
            >
              <span className="creator-rail-number">{done ? <Check size={14} /> : index + 1}</span>
              <span className="min-w-0">
                <span className="creator-rail-title">{t(item.labelKey)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function CreatorLibrary({ packs, focusPackId, onAddCard }: { packs: CreatorPack[]; focusPackId: string; onAddCard: (pack: CreatorPack) => void | Promise<void> }) {
  const { t } = useT();
  if (!packs.length) {
    return (
      <section className="creator-card creator-library-empty">
        <PanelHeader number="1" title={t("creator.libraryTab")} />
        <p className="creator-library-muted">{t("creator.noCreatorPacks")}</p>
      </section>
    );
  }
  const visiblePacks = focusPackId
    ? [...packs].sort((a, b) => Number(packId(b) === focusPackId) - Number(packId(a) === focusPackId))
    : packs;
  return (
    <section className="creator-library">
      {visiblePacks.map((pack) => {
        const cards = packCardItems(pack);
        return (
          <article className={`creator-card creator-library-pack ${packId(pack) === focusPackId ? "is-focused" : ""}`} key={packId(pack)}>
            <div className="creator-library-pack-head">
              <div className="min-w-0">
                <h2>{pack.name || t("creator.untitledPack")}</h2>
                <span>{t("creator.cardsCount", { count: packCards(pack) })}</span>
              </div>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { void onAddCard(pack); }}>
                <Plus size={16} />
                {packHasTemplates(pack) ? t("creator.addCardFromPack") : t("creator.createTemplate")}
              </button>
            </div>
            {cards.length ? (
              <div className="creator-library-cards">
                {cards.slice(0, 8).map((card, index) => {
                  const values = (card.values && typeof card.values === "object" ? card.values : card) as CreatorRecord;
                  const title = String(values.title ?? values.heading ?? values.hook ?? t("creator.previewHeadingFallback"));
                  const text = String(values.text ?? values.body ?? values.fact ?? "");
                  return (
                    <div className="creator-library-card" key={`${packId(pack)}-${index}`}>
                      <strong>{title}</strong>
                      {text && <span>{text}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="creator-library-muted">{t("creator.noCardsInPack")}</p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function SetupPanel({
  templateNameValue,
  setTemplateNameValue,
  packLang,
  presetId,
  presets,
  selectPreset,
  background,
  backgroundName,
  uploadBackground,
  busy,
  actionsDisabled,
  canContinue,
  onNext,
}: {
  templateNameValue: string;
  setTemplateNameValue: (value: string) => void;
  packLang: string;
  presetId: string;
  presets: TemplatePreset[];
  selectPreset: (value: string) => void;
  background: string;
  backgroundName: string;
  uploadBackground: (file: File) => Promise<void>;
  busy: string | null;
  actionsDisabled: boolean;
  canContinue: boolean;
  onNext: () => void;
}) {
  const { t } = useT();
  const visiblePresets = presets.slice(0, 3);
  const customPreview = usableBackgroundUrl(background);
  const customStyle = customPreview
    ? ({ "--creator-preset-image": `url("${cssUrl(customPreview)}")` } as CSSProperties)
    : undefined;
  const renderPreset = (preset: TemplatePreset) => {
    const active = !background && preset.id === presetId;
    const tone = templateTone(preset.templateType);
    const previewImage = creatorServiceAssetUrl(preset.previewSrc ?? firstTemplateImageSrc(preset.templates));
    const previewStyle = previewImage
      ? ({ "--creator-preset-image": `url("${cssUrl(previewImage)}")` } as CSSProperties)
      : undefined;
    return (
      <button
        key={preset.id}
        type="button"
        className={`creator-preset ${tone} ${active ? "is-active" : ""}`}
        onClick={() => selectPreset(preset.id)}
      >
        <span className="creator-preset-art" style={previewStyle} aria-hidden="true" />
        <span className="creator-preset-body">
          <span className="creator-preset-title">{preset.label}</span>
          <span className="creator-preset-meta">
            {preset.templateType} · {langTag(preset.lang || packLang) || preset.lang || packLang}
          </span>
        </span>
      </button>
    );
  };
  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadBackground(file).finally(() => {
      input.value = "";
    });
  };

  return (
    <section className="creator-card">
      <div className="creator-tile-card">
        <div className="creator-tile-head">
          <span>1</span>
          <strong>{t("creator.nameStep")}</strong>
        </div>
        <div className="creator-form-grid">
          <label className="form-control">
            <span className="label-text">{t("creator.templateName")}</span>
            <input
              className="input input-bordered input-sm"
              value={templateNameValue}
              onChange={(event) => setTemplateNameValue(event.target.value)}
              placeholder={t("creator.templateName")}
            />
          </label>
        </div>
      </div>

      <div className="creator-tile-card">
        <div className="creator-tile-head">
          <span>2</span>
          <strong>{t("creator.templateStep")}</strong>
        </div>
        <div className="creator-preset-grid">
          {visiblePresets.map(renderPreset)}
          <label className={`creator-preset creator-upload-preset ${background ? "is-active" : ""} ${busy === "upload-background" ? "is-busy" : ""}`}>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleBackgroundUpload}
              disabled={busy !== null || actionsDisabled}
            />
            <span className={`creator-preset-art ${customPreview ? "" : "creator-upload-art"}`} style={customStyle} aria-hidden="true">
              {!customPreview && <FileImage size={28} />}
            </span>
            <span className="creator-preset-body">
              <span className="creator-preset-title">{t("creator.uploadBackground")}</span>
              <span className="creator-preset-meta">{backgroundName || "JPG · PNG · WebP"}</span>
            </span>
          </label>
        </div>
      </div>

      <FlowActions>
        <button className="btn btn-sm btn-primary gap-2" onClick={onNext} disabled={actionsDisabled || busy !== null || !canContinue}>
          {t("creator.continue")}
          <ArrowRight size={16} />
        </button>
      </FlowActions>
    </section>
  );
}

function ComposePanel({
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
  actionsDisabled,
  onBack,
  onNext,
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
  actionsDisabled: boolean;
  onBack: () => void;
  onNext: () => void;
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
    <section className={`creator-card creator-compose-card ${designerMode ? "is-designer-mode" : ""}`}>
      <div className="creator-compose-head">
        <PanelHeader number="2" title={t("creator.composeTitle")} />
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

      <FlowActions>
        <button className="btn btn-sm btn-ghost gap-2" onClick={onBack}>
          <ChevronLeft size={16} />
          {t("creator.prev")}
        </button>
        <button className="btn btn-sm btn-primary gap-2" onClick={onNext} disabled={actionsDisabled}>
          {t("creator.next")}
          <ArrowRight size={16} />
        </button>
      </FlowActions>
    </section>
  );
}

function MediaPanel({
  activePreset,
  values,
  background,
  music,
  motion,
  mediaSettings,
  setMediaSettings,
  uploadMusic,
  actionsDisabled,
  onBack,
  onNext,
}: {
  activePreset: TemplatePreset;
  values: CardValues;
  background: string;
  music: CreatorAsset[];
  motion: CreatorAsset[];
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMusic: (file: File) => Promise<void>;
  actionsDisabled: boolean;
  onBack: () => void;
  onNext: () => void;
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
    <section className="creator-card creator-media-card">
      <div className="creator-compose-head">
        <PanelHeader number="3" title={t("creator.mediaTitle")} />
      </div>

      <div className="creator-media-layout">
        <div className="creator-media-tools">
          <div className="creator-tool-group">
            <span className="creator-tool-label">{t("creator.music")}</span>
            <audio ref={audioRef} className="creator-audio-hidden" onEnded={() => setPreviewMusicId("")} />
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
            <div className="creator-sticker-actions">
              <label className="btn btn-xs btn-outline">
                {t("creator.uploadMusic")}
                <input type="file" accept="audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/opus,.mp3,.m4a,.aac,.wav,.ogg,.opus" onChange={handleMusicUpload} />
              </label>
            </div>
          </div>

          <div className="creator-tool-group">
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

      <FlowActions>
        <button className="btn btn-sm btn-ghost gap-2" onClick={onBack}>
          <ChevronLeft size={16} />
          {t("creator.prev")}
        </button>
        <button className="btn btn-sm btn-primary gap-2" onClick={onNext} disabled={actionsDisabled}>
          {t("creator.next")}
          <ArrowRight size={16} />
        </button>
      </FlowActions>
    </section>
  );
}

function SavePanel({
  packs,
  activePackId,
  setActivePackId,
  saveMode,
  setSaveMode,
  newPackName,
  setNewPackName,
  addCard,
  renameActivePack,
  deleteActivePack,
  busy,
  actionsDisabled,
  canAddCard,
  onBack,
}: {
  packs: CreatorPack[];
  activePackId: string;
  setActivePackId: (id: string) => void;
  saveMode: "existing" | "new";
  setSaveMode: (mode: "existing" | "new") => void;
  newPackName: string;
  setNewPackName: (value: string) => void;
  addCard: () => void;
  renameActivePack: (name: string) => void;
  deleteActivePack: () => void;
  busy: string | null;
  actionsDisabled: boolean;
  canAddCard: boolean;
  onBack: () => void;
}) {
  const { t } = useT();
  const activePack = packs.find((pack) => packId(pack) === activePackId);
  const [renameValue, setRenameValue] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [packQuery, setPackQuery] = useState("");
  const filteredPacks = useMemo(() => {
    const query = packQuery.trim().toLocaleLowerCase();
    if (!query) return packs;
    return packs.filter((pack) => {
      const name = String(pack.name || t("creator.untitledPack")).toLocaleLowerCase();
      return name.includes(query) || packId(pack).toLocaleLowerCase().includes(query);
    });
  }, [packQuery, packs, t]);

  useEffect(() => {
    setRenameValue(activePack?.name || "");
    setDeleteArmed(false);
  }, [activePack?.name, activePackId]);

  return (
    <section className="creator-card creator-save-card">
      <div className="creator-compose-head">
        <PanelHeader number="4" title={t("creator.saveTitle")} />
      </div>

      <div className="creator-save-layout">
        {packs.length > 8 && (
          <label className="form-control creator-pack-search">
            <span className="label-text">{t("creator.packSearch")}</span>
            <input
              className="input input-bordered input-sm"
              value={packQuery}
              onChange={(event) => setPackQuery(event.target.value)}
              placeholder={t("creator.packSearch")}
            />
          </label>
        )}

        <div className="creator-pack-choice-list" aria-label={t("creator.saveExistingPack")}>
          {filteredPacks.length ? (
            filteredPacks.map((pack) => {
              const id = packId(pack);
              const selected = saveMode === "existing" && id === activePackId;
              return (
                <button
                  key={id}
                  type="button"
                  className={`creator-pack-choice ${selected ? "is-active" : ""}`}
                  onClick={() => {
                    setSaveMode("existing");
                    setActivePackId(id);
                  }}
                >
                  <span>
                    <strong>{pack.name || t("creator.untitledPack")}</strong>
                    <small>{t("creator.cardsCount", { count: packCards(pack) })}</small>
                  </span>
                  {selected && <Check size={16} />}
                </button>
              );
            })
          ) : (
            <div className="creator-pack-choice-empty">{t("creator.noPackMatches")}</div>
          )}
          <button
            type="button"
            className={`creator-pack-choice is-create ${saveMode === "new" ? "is-active" : ""}`}
            onClick={() => setSaveMode("new")}
          >
            <Plus size={18} />
            <span>
              <strong>{t("creator.saveNewPack")}</strong>
              <small>{t("creator.newPackName")}</small>
            </span>
          </button>
        </div>

        {saveMode === "new" && (
          <label className="form-control creator-new-pack-name">
            <span className="label-text">{t("creator.newPackName")}</span>
            <input
              className="input input-bordered input-sm"
              value={newPackName}
              onChange={(event) => setNewPackName(event.target.value)}
              placeholder={t("creator.newPackName")}
            />
          </label>
        )}
        {saveMode === "existing" && activePack && (
          <div className="creator-pack-manage">
            <label className="form-control">
              <span className="label-text">{t("creator.renamePack")}</span>
              <input
                className="input input-bordered input-sm"
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder={t("creator.renamePack")}
              />
            </label>
            <div className="creator-pack-manage-actions">
              <button
                type="button"
                className="btn btn-xs btn-outline"
                onClick={() => renameActivePack(renameValue)}
                disabled={actionsDisabled || busy !== null || !renameValue.trim() || renameValue.trim() === (activePack.name || "").trim()}
              >
                {busy === "rename-pack" ? <Loader2 className="animate-spin" size={14} /> : null}
                {t("creator.renamePackAction")}
              </button>
              <button
                type="button"
                className="btn btn-xs btn-error btn-outline"
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true);
                    return;
                  }
                  deleteActivePack();
                }}
                disabled={actionsDisabled || busy !== null}
              >
                {busy === "delete-pack" ? <Loader2 className="animate-spin" size={14} /> : null}
                {deleteArmed ? t("creator.confirmDeletePack") : t("creator.deletePack")}
              </button>
            </div>
          </div>
        )}
      </div>

      <FlowActions>
        <button className="btn btn-sm btn-ghost gap-2" onClick={onBack}>
          <ChevronLeft size={16} />
          {t("creator.prev")}
        </button>
        <button className="btn btn-sm btn-primary gap-2" onClick={addCard} disabled={actionsDisabled || busy !== null || !canAddCard}>
          {busy === "add-card" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          {t("creator.saveCard")}
        </button>
      </FlowActions>
    </section>
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

function CreatorPreviewPanel({
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

function PanelHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="creator-panel-header">
      <span className="creator-panel-number">{number}</span>
      <div>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function FlowActions({ children }: { children: React.ReactNode }) {
  return <div className="creator-flow-actions">{children}</div>;
}
