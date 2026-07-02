// /creator — отдельная студия: пак = шаблон + карточки + видео.
// Главная = плитки паков; мастер создаёт шаблон; внутри пака — вкладки
// «Карточки» (по одной / пачкой из файла), «Шаблон» (дизайн + музыка), «Видео» (экспорт + галерея).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  Info,
} from "lucide-react";
import { ApiError, get, send } from "../lib/api/http";
import { useT } from "../lib/i18n";
import type {
  AutosaveStatus,
  CardValues,
  CreatorAsset,
  CreatorDesignState,
  CreatorPack,
  CreatorRecord,
  CreatorSummary,
  MediaSettings,
  Notice,
  StickerOverlay,
  TextLayout,
  TextStyle,
} from "./creator/types";
import {
  DEFAULT_MOTION_BOX,
  DEFAULT_STICKER_BOX,
  DEFAULT_TEXT_LAYOUT,
  DEFAULT_TEXT_STYLE,
  FALLBACK_PRESETS,
} from "./creator/config";
import {
  buildCreatorDesignState,
  clampStickerBox,
  cloneTextLayout,
  readCreatorDesignState,
} from "./creator/designState";
import { useDesignHistory } from "./creator/useDesignHistory";
import {
  prepareCreatorBackground,
  prepareCreatorMotionGif,
  prepareCreatorMusic,
  prepareCreatorSticker,
} from "./creator/fileAssets";
import {
  creatorServiceAssetUrl,
  errorText,
  firstTemplateImageSrc,
  localizedFallbackPresets,
  normalizeGalleryItem,
  normalizeSummary,
  packId,
  templateTone,
  usableBackgroundUrl,
  type GalleryItem,
} from "./creator/model";
import { applyTextLayoutToTemplates, capacityForRole, fontSizeForRole } from "./creator/templateTransforms";
import { limitsFromRules } from "./creator/importCards";
import type { MiniCardStyling } from "./creator/MiniCard";
import { ProjectsHome } from "./creator/ProjectsHome";
import { ProjectWizard } from "./creator/ProjectWizard";
import { CardsPanel, type CardsOps } from "./creator/CardsPanel";
import { VideosPanel, type VideosOps } from "./creator/VideosPanel";
import { ProjectWorkspace, type ProjectTab } from "./creator/ProjectWorkspace";
import { DesignEditor, type Capacities, type FontSizes } from "./creator/editor";

export default function Creator() {
  const { t } = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackPresets = useMemo(() => localizedFallbackPresets(t), [t]);
  const initialPreset = fallbackPresets[0] ?? FALLBACK_PRESETS[0];

  const [summary, setSummary] = useState<CreatorSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Array<Exclude<Notice, null> & { id: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [activePack, setActivePack] = useState<CreatorPack | null>(null);
  const [loadingPack, setLoadingPack] = useState(false);
  const [templateSourcePackId, setTemplateSourcePackId] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const lastSavedDesignRef = useRef("");
  const autosaveStatusTimerRef = useRef<number | null>(null);
  const noticeTimersRef = useRef<number[]>([]);
  const noticeSeqRef = useRef(0);
  const appliedProjectRef = useRef("");

  // ── состояние редактора шаблона (общий для мастера и вкладки «Шаблон») ──
  const [templateNameValue, setTemplateNameValue] = useState("");
  const [packLang, setPackLang] = useState(initialPreset.lang || "ru");
  const [templateType, setTemplateType] = useState(initialPreset.templateType);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [background, setBackground] = useState("");
  const [backgroundName, setBackgroundName] = useState("");
  const [templateTargetPackId, setTemplateTargetPackId] = useState("");
  const [textLayout, setTextLayout] = useState<TextLayout>(() => cloneTextLayout(DEFAULT_TEXT_LAYOUT));
  const [textStyle, setTextStyle] = useState<TextStyle>(() => ({ ...DEFAULT_TEXT_STYLE }));
  const [sticker, setSticker] = useState<StickerOverlay | null>(null);
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>({
    musicTracks: [],
    customMusicName: "",
    motion: "none",
    customMotion: "",
    customMotionName: "",
    durationSec: 6,
    motionBox: DEFAULT_MOTION_BOX,
  });
  const [values, setValues] = useState<CardValues>(initialPreset.defaults);

  const setNotice = useCallback((next: Notice) => {
    if (!next) {
      for (const timer of noticeTimersRef.current) window.clearTimeout(timer);
      noticeTimersRef.current = [];
      setNotices([]);
      return;
    }
    const id = ++noticeSeqRef.current;
    setNotices((current) => [...current, { ...next, id }].slice(-5));
    const timer = window.setTimeout(() => {
      setNotices((current) => current.filter((notice) => notice.id !== id));
      noticeTimersRef.current = noticeTimersRef.current.filter((item) => item !== timer);
    }, next.type === "error" ? 7000 : 4200);
    noticeTimersRef.current.push(timer);
  }, []);

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

  useEffect(() => () => {
    if (autosaveStatusTimerRef.current) window.clearTimeout(autosaveStatusTimerRef.current);
    for (const timer of noticeTimersRef.current) window.clearTimeout(timer);
    noticeTimersRef.current = [];
  }, []);

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

  function updateValue(key: keyof CardValues, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
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
      musicTracks: state.media.musicTracks,
      customMusicName: state.media.customMusicName || current.customMusicName,
      motion: state.media.motion || current.motion || "none",
      customMotion: state.media.customMotion || current.customMotion,
      customMotionName: state.media.customMotionName || current.customMotionName,
      durationSec: state.media.durationSec,
      motionBox: state.media.motionBox,
    }));
  }, [availablePresets, t]);
  const applyDesignStateRef = useRef(applyDesignStateToEditor);
  applyDesignStateRef.current = applyDesignStateToEditor;

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
  const resetDesignHistoryRef = useRef(resetDesignHistory);
  resetDesignHistoryRef.current = resetDesignHistory;

  const setSettledAutosaveStatus = useCallback((status: AutosaveStatus) => {
    if (autosaveStatusTimerRef.current) window.clearTimeout(autosaveStatusTimerRef.current);
    setAutosaveStatus(status);
    if (status === "saved") {
      autosaveStatusTimerRef.current = window.setTimeout(() => setAutosaveStatus("idle"), 1400);
    }
  }, []);

  const syncPackEverywhere = useCallback((pack: CreatorPack) => {
    const id = packId(pack);
    setActivePack((current) => (current && packId(current) === id ? { ...current, ...pack } : current));
    setSummary((current) => current ? {
      ...current,
      packs: current.packs.map((item) => (packId(item) === id
        ? { ...item, name: pack.name, cards: Array.isArray(pack.cards) ? pack.cards.length : item.cards, templates: Array.isArray(pack.templates) ? pack.templates.length : item.templates }
        : item)),
    } : current);
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
    syncPackEverywhere(res.pack);
    if (!quiet) setSettledAutosaveStatus("saved");
    return res.pack;
  }, [activeTemplatePayload, background, designState, serializedDesignState, setSettledAutosaveStatus, syncPackEverywhere, templateType, textLayout]);

  // Автосохранение шаблона открытого проекта
  useEffect(() => {
    if (!templateSourcePackId || loadingSummary || featureDisabled) return;
    if (serializedDesignState === lastSavedDesignRef.current) return;
    const handle = window.setTimeout(() => {
      void saveTemplateDesign(templateSourcePackId).catch(() => {
        setSettledAutosaveStatus("error");
      });
    }, 850);
    return () => window.clearTimeout(handle);
  }, [featureDisabled, loadingSummary, saveTemplateDesign, serializedDesignState, setSettledAutosaveStatus, templateSourcePackId]);

  // ── загрузки файлов ──
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
        // загруженный трек сразу добавляем к выбранным (не сбрасывая остальные)
        setMediaSettings((current) => ({
          ...current,
          musicTracks: [...current.musicTracks.filter((id) => id !== "auto" && id !== String(asset.id)), String(asset.id)],
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

  // ── маршрутизация страницы: главная / мастер / проект ──
  const projectId = searchParams.get("project") ?? "";
  const wizardOpen = searchParams.get("new") === "1";
  const tabParam = searchParams.get("tab");
  const projectTab: ProjectTab = tabParam === "template" || tabParam === "videos" ? tabParam : "cards";

  const goHome = useCallback(() => {
    setSearchParams({}, { replace: false });
  }, [setSearchParams]);

  const openProject = useCallback((pack: CreatorPack, tab: ProjectTab = "cards") => {
    const id = packId(pack);
    if (!id) return;
    setSearchParams({ project: id, tab }, { replace: false });
  }, [setSearchParams]);

  const setProjectTab = useCallback((tab: ProjectTab) => {
    if (!projectId) return;
    setSearchParams({ project: projectId, tab }, { replace: true });
  }, [projectId, setSearchParams]);

  function resetEditorForNewProject() {
    const preset = availablePresets[0] ?? fallbackPresets[0] ?? FALLBACK_PRESETS[0];
    setTemplateNameValue("");
    setBackground("");
    setBackgroundName("");
    setTemplateTargetPackId("");
    setPresetId(preset.id);
    setTemplateType(preset.templateType);
    setPackLang(preset.lang || "ru");
    setValues(preset.defaults);
    setTextLayout(cloneTextLayout(DEFAULT_TEXT_LAYOUT));
    setTextStyle({ ...DEFAULT_TEXT_STYLE });
    setSticker(null);
    setMediaSettings({
      musicTracks: [],
      customMusicName: "",
      motion: "none",
      customMotion: "",
      customMotionName: "",
      durationSec: 6,
      motionBox: DEFAULT_MOTION_BOX,
    });
    setTemplateSourcePackId("");
    lastSavedDesignRef.current = "";
    resetDesignHistoryRef.current();
  }

  const startNewProject = useCallback(() => {
    resetEditorForNewProject();
    setSearchParams({ new: "1" }, { replace: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePresets, fallbackPresets, setSearchParams]);

  // Открытие проекта по URL: ждём summary (пресеты нужны для восстановления дизайна)
  useEffect(() => {
    if (!projectId) {
      appliedProjectRef.current = "";
      setActivePack(null);
      setTemplateSourcePackId("");
      setLoadingPack(false);
      return;
    }
    if (!summary) return;
    if (featureDisabled) {
      setLoadingPack(false);
      return;
    }
    if (appliedProjectRef.current === projectId) return;
    let cancelled = false;
    setLoadingPack(true);
    setActivePack((current) => (current && packId(current) === projectId ? current : null));
    setTemplateSourcePackId("");
    (async () => {
      try {
        const pack = await get<CreatorPack>(`/creator/packs/${encodeURIComponent(projectId)}`);
        if (cancelled) return;
        appliedProjectRef.current = projectId;
        setActivePack(pack);
        setTemplateNameValue(String(pack.name || ""));
        const restored = readCreatorDesignState(pack.creatorDesignState);
        if (restored) {
          lastSavedDesignRef.current = JSON.stringify(restored);
          setTemplateSourcePackId(projectId);
          setSettledAutosaveStatus("idle");
          resetDesignHistoryRef.current(restored);
          applyDesignStateRef.current(restored);
        } else {
          lastSavedDesignRef.current = "";
          setTemplateSourcePackId("");
          resetDesignHistoryRef.current();
        }
      } catch (err) {
        if (cancelled) return;
        appliedProjectRef.current = "";
        setNotice({ type: "error", text: errorText(err, t("creator.errOpenProject")) });
        setSearchParams({}, { replace: true });
      } finally {
        if (!cancelled) setLoadingPack(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, summary, featureDisabled, setNotice, setSearchParams, setSettledAutosaveStatus, t]);

  // ── операции ──
  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
    setNotice(null);
    setBusy(key);
    try {
      return await fn();
    } catch (err) {
      let text = errorText(err, t("creator.errGeneric"));
      if (err instanceof ApiError && err.body && typeof err.body === "object") {
        const messages = (err.body as { errors?: Array<{ messages?: string[] }> }).errors
          ?.flatMap((item) => item.messages ?? [])
          .slice(0, 4);
        if (messages?.length) text = `${err.message}: ${messages.join("; ")}`;
      }
      setNotice({ type: "error", text });
      return null;
    } finally {
      setBusy(null);
    }
  }

  function namedTemplates(name: string): unknown[] {
    const cleanName = name.trim() || activePreset.label || t("creator.createTemplate");
    return activeTemplatePayload.map((template, index) => {
      if (!template || typeof template !== "object" || Array.isArray(template)) return template;
      return {
        ...(template as CreatorRecord),
        name: activeTemplatePayload.length > 1 ? `${cleanName} ${index + 1}` : cleanName,
      };
    });
  }

  async function createProject(): Promise<void> {
    const name = templateNameValue.trim() || activePreset.label || t("creator.untitledPack");
    setNotice(null);
    setCreating(true);
    try {
      const templates = namedTemplates(name);
      if (templateTargetPackId) {
        const existing = await get<CreatorPack>(`/creator/packs/${encodeURIComponent(templateTargetPackId)}`);
        const previousTemplates = Array.isArray(existing.templates) ? existing.templates : [];
        const res = await send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(templateTargetPackId)}/design`, "PATCH", {
          templates: [...previousTemplates, ...templates],
          templateType,
          background: background || undefined,
          layout: textLayout,
          designState,
        });
        const pack = res.pack;
        const id = packId(pack);
        lastSavedDesignRef.current = serializedDesignState;
        appliedProjectRef.current = id;
        setActivePack(pack);
        setTemplateSourcePackId(id);
        syncPackEverywhere(pack);
        setSearchParams({ project: id, tab: "cards" }, { replace: false });
        setNotice({ type: "success", text: t("creator.templateCreatedInPack", { name: pack.name || t("creator.untitledPack") }) });
        void loadSummary(true);
        return;
      }
      const res = await send<{ pack: CreatorPack }>("/creator/packs", "POST", {
        name,
        lang: activePreset.lang || packLang,
        templateType,
        presetId: activePreset.id,
        templates,
        background: background || undefined,
        layout: textLayout,
        designState,
      });
      const pack = res.pack;
      const id = packId(pack);
      lastSavedDesignRef.current = serializedDesignState;
      appliedProjectRef.current = id;
      setActivePack(pack);
      setTemplateSourcePackId(id);
      setSummary((current) => {
        const normalized = current ?? { feature: true, packs: [], gallery: [], backgrounds: [], userBackgrounds: [], presets: [], music: [], motion: [] };
        return { ...normalized, packs: [pack, ...normalized.packs.filter((item) => packId(item) !== id)] };
      });
      setSearchParams({ project: id, tab: "cards" }, { replace: false });
      setNotice({ type: "success", text: t("creator.projectCreated", { name }) });
      void loadSummary(true);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errCreatePack")) });
    } finally {
      setCreating(false);
    }
  }

  async function renameProject(name: string) {
    const id = projectId;
    const trimmed = name.trim();
    if (!id || !trimmed) return;
    const res = await run("rename-pack", () => send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(id)}`, "PATCH", { name: trimmed }));
    if (res?.pack) {
      syncPackEverywhere(res.pack);
      setTemplateNameValue(trimmed);
    }
  }

  async function deleteProject() {
    const id = projectId;
    if (!id) return;
    await deletePackById(id, true);
  }

  async function deletePackById(id: string, navigateHome: boolean): Promise<boolean> {
    const res = await run("delete-pack", () => send(`/creator/packs/${encodeURIComponent(id)}`, "DELETE"));
    if (res !== null) {
      setSummary((current) => current ? { ...current, packs: current.packs.filter((pack) => packId(pack) !== id) } : current);
      setNotice({ type: "success", text: t("creator.projectDeleted") });
      if (navigateHome) goHome();
      return true;
    }
    return false;
  }

  async function deletePackFromHome(pack: CreatorPack): Promise<boolean> {
    const id = packId(pack);
    if (!id) return false;
    return deletePackById(id, false);
  }

  const cardsOps: CardsOps = {
    addCards: async (cards) => {
      const res = await run("add-cards", () => send<{ added: number; pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(projectId)}/cards`, "POST", { cards }));
      if (!res) return false;
      syncPackEverywhere(res.pack);
      setActivePack(res.pack);
      setNotice({ type: "success", text: t("creator.cardsAdded", { count: res.added }) });
      return true;
    },
    updateCard: async (index, payload) => {
      const res = await run("update-card", () => send<{ pack: CreatorPack }>(`/creator/packs/${encodeURIComponent(projectId)}/cards/${index}`, "PATCH", payload));
      if (!res) return false;
      syncPackEverywhere(res.pack);
      setActivePack(res.pack);
      setNotice({ type: "success", text: t("creator.cardSaved") });
      return true;
    },
    deleteCard: async (index, addedAt) => {
      const query = addedAt ? `?addedAt=${encodeURIComponent(addedAt)}` : "";
      const res = await run("delete-card", () => send<{ pack: CreatorPack | null }>(`/creator/packs/${encodeURIComponent(projectId)}/cards/${index}${query}`, "DELETE"));
      if (!res) return false;
      if (res.pack) {
        syncPackEverywhere(res.pack);
        setActivePack(res.pack);
      }
      return true;
    },
    renderPreview: async (index) => {
      const res = await run("render-preview", () => send<{ url: string }>(`/creator/packs/${encodeURIComponent(projectId)}/preview`, "POST", { index }));
      return res?.url ?? null;
    },
  };

  // Музыка для экспорта: [] = без музыки, иначе выбранные треки (сервер берёт случайный на каждое видео)
  const exportMusicPayload = mediaSettings.musicTracks.length ? mediaSettings.musicTracks : "none";

  const videosOps: VideosOps = {
    exportCard: async (opts) => {
      const res = await run("export-card", () => send<{ item: CreatorRecord | null; url: string }>(`/creator/packs/${encodeURIComponent(projectId)}/export`, "POST", {
        index: opts.index,
        format: opts.format,
        voiceover: opts.voiceover,
        durationSec: mediaSettings.durationSec,
        music: exportMusicPayload,
        addToGallery: true,
      }));
      if (!res) return null;
      const item = res.item ? normalizeGalleryItem(res.item) : null;
      if (item) {
        setSummary((current) => current ? { ...current, gallery: [item as unknown as CreatorRecord, ...current.gallery] } : current);
      }
      setNotice({ type: "success", text: t("creator.exportReady", { format: opts.format.toUpperCase() }) });
      return item;
    },
    exportZip: async (opts) => {
      const res = await run("export-zip", () => send<{ item: CreatorRecord | null; url: string; count: number }>(`/creator/packs/${encodeURIComponent(projectId)}/export-zip`, "POST", {
        limit: opts.limit,
        format: opts.format,
        voiceover: opts.voiceover,
        durationSec: mediaSettings.durationSec,
        music: exportMusicPayload,
      }));
      if (!res) return false;
      if (res.item) {
        setSummary((current) => current ? { ...current, gallery: [res.item as CreatorRecord, ...current.gallery] } : current);
      }
      setNotice({ type: "success", text: t("creator.zipReadyCount", { count: res.count }) });
      return true;
    },
    deleteGalleryItem: async (id) => {
      const res = await run("delete-gallery", () => send(`/creator/gallery/${id}`, "DELETE"));
      if (res === null) return false;
      setSummary((current) => current ? { ...current, gallery: current.gallery.filter((item) => Number((item as CreatorRecord).id) !== id) } : current);
      return true;
    },
  };

  // ── производные для дочерних панелей ──
  const miniStyling: MiniCardStyling = useMemo(() => ({
    backgroundUrl: usableBackgroundUrl(background) || creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates)),
    tone: templateTone(templateType),
    layout: textLayout,
    textStyle,
    sticker,
  }), [activePreset.previewSrc, activePreset.templates, background, sticker, templateType, textLayout, textStyle]);

  const cardLimits = useMemo(() => limitsFromRules(activePack?.rules), [activePack?.rules]);

  // Лимиты символов и эффективный размер шрифта считаются из уже трансформированного шаблона —
  // ровно то, что увидит сервер в deriveRules (просчёт на этапе проектирования)
  const capacities: Capacities = useMemo(() => ({
    heading: capacityForRole(activeTemplatePayload, "heading"),
    body: capacityForRole(activeTemplatePayload, "body"),
  }), [activeTemplatePayload]);
  const fontSizes: FontSizes = useMemo(() => ({
    heading: fontSizeForRole(activeTemplatePayload, "heading"),
    body: fontSizeForRole(activeTemplatePayload, "body"),
  }), [activeTemplatePayload]);

  const projectGallery: GalleryItem[] = useMemo(() => {
    const items = (summary?.gallery ?? [])
      .map(normalizeGalleryItem)
      .filter((item): item is GalleryItem => Boolean(item));
    return items.filter((item) => item.packId === projectId);
  }, [summary?.gallery, projectId]);

  const view: "home" | "wizard" | "project" = wizardOpen ? "wizard" : projectId ? "project" : "home";
  const showAutosaveStatus = view === "project" && Boolean(templateSourcePackId) && autosaveStatus !== "idle";

  return (
    <div className="creator-page creator-projects-page">
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
      {notices.length > 0 && (
        <div className="creator-notice-stack" aria-live="polite" aria-relevant="additions">
          {notices.map((notice) => (
            <div key={notice.id} className={`creator-notice is-${notice.type}`} role="status">
              <span className="creator-notice-icon">
                {notice.type === "error" ? <AlertTriangle size={17} /> : notice.type === "success" ? <Check size={17} /> : <Info size={17} />}
              </span>
              <span>{notice.text}</span>
            </div>
          ))}
        </div>
      )}

      {loadingSummary && !summary ? (
        <div className="flex items-center gap-2 py-16 text-base-content/60">
          <span className="loading loading-spinner loading-lg text-primary" />
          {t("creator.loading")}
        </div>
      ) : view === "wizard" ? (
        <div className="creator-view" key="wizard">
          <ProjectWizard
            presets={availablePresets}
            presetId={presetId}
            selectPreset={selectPreset}
            templateNameValue={templateNameValue}
            setTemplateNameValue={setTemplateNameValue}
            background={background}
            backgroundName={backgroundName}
            uploadBackground={uploadBackground}
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
            music={summary?.music ?? []}
            mediaSettings={mediaSettings}
            setMediaSettings={setMediaSettings}
            uploadMotionGif={uploadMotionGif}
            uploadMusic={uploadMusic}
            capacities={capacities}
            fontSizes={fontSizes}
            canUndoDesign={canUndoDesign}
            canRedoDesign={canRedoDesign}
            undoDesign={undoDesign}
            redoDesign={redoDesign}
            busy={busy}
            creating={creating}
            onCancel={goHome}
            onCreate={() => void createProject()}
            packs={packs}
            targetPackId={templateTargetPackId}
            setTargetPackId={setTemplateTargetPackId}
          />
        </div>
      ) : view === "project" ? (
        <div className="creator-view" key={`project-${projectId}`}>
          {featureDisabled ? (
            <ProjectsHome
              packs={packs}
              onOpen={(pack) => openProject(pack, "cards")}
              onNewPack={startNewProject}
              onDelete={deletePackFromHome}
              disabled
              busy={busy}
            />
          ) : loadingPack || !activePack ? (
            <div className="flex items-center gap-2 py-16 text-base-content/60">
              <span className="loading loading-spinner loading-lg text-primary" />
              {t("creator.loading")}
            </div>
          ) : (
            <ProjectWorkspace
              pack={activePack}
              tab={projectTab}
              setTab={setProjectTab}
              onBack={goHome}
              onRename={renameProject}
              onDelete={() => void deleteProject()}
              busy={busy}
              autosaveStatus={showAutosaveStatus ? autosaveStatus : null}
            >
              {projectTab === "cards" ? (
                <CardsPanel
                  pack={activePack}
                  limits={cardLimits}
                  styling={miniStyling}
                  ops={cardsOps}
                  busy={busy}
                  onCreateTemplate={() => setProjectTab("template")}
                />
              ) : projectTab === "template" ? (
                <div className="creator-template-tab">
                  {!templateSourcePackId && (
                    <div className="alert alert-info text-sm" role="status">
                      <Info size={16} />
                      <span>{t("creator.templateManualSaveHint")}</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        onClick={() => {
                          void saveTemplateDesign(projectId)
                            .then(() => setTemplateSourcePackId(projectId))
                            .catch((err) => setNotice({ type: "error", text: errorText(err, t("creator.errGeneric")) }));
                        }}
                      >
                        {t("creator.templateManualSave")}
                      </button>
                    </div>
                  )}
                  <div className="creator-card">
                    <DesignEditor
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
                      music={summary?.music ?? []}
                      uploadMusic={uploadMusic}
                      mediaSettings={mediaSettings}
                      setMediaSettings={setMediaSettings}
                      uploadMotionGif={uploadMotionGif}
                      background={background}
                      capacities={capacities}
                      fontSizes={fontSizes}
                      canUndoDesign={canUndoDesign}
                      canRedoDesign={canRedoDesign}
                      undoDesign={undoDesign}
                      redoDesign={redoDesign}
                    />
                  </div>
                </div>
              ) : (
                <VideosPanel
                  pack={activePack}
                  styling={miniStyling}
                  gallery={projectGallery}
                  music={summary?.music ?? []}
                  motion={summary?.motion ?? []}
                  mediaSettings={mediaSettings}
                  onOpenTemplate={() => setProjectTab("template")}
                  ops={videosOps}
                  busy={busy}
                />
              )}
            </ProjectWorkspace>
          )}
        </div>
      ) : (
        <div className="creator-view" key="home">
          <ProjectsHome
            packs={packs}
            onOpen={(pack) => openProject(pack, "cards")}
            onNewPack={startNewProject}
            onDelete={deletePackFromHome}
            disabled={featureDisabled}
            busy={busy}
          />
        </div>
      )}
    </div>
  );
}
