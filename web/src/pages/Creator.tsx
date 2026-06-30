import { type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Check,
  FileImage,
  LayoutTemplate,
  Loader2,
  Plus,
} from "lucide-react";
import { ApiError, get, send } from "../lib/api/http";
import { CONTENT_LANGS, langTag } from "../lib/deck";
import { useT } from "../lib/i18n";

type CreatorRecord = Record<string, unknown>;

type CreatorPack = CreatorRecord & {
  id?: string;
  name?: string;
  lang?: string;
  templateType?: string;
  templates?: unknown[];
  cards?: unknown[] | number;
  cardCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

type CreatorAsset = CreatorRecord & {
  id?: string;
  name?: string;
  type?: string;
  src?: string;
  url?: string;
  dataUrl?: string;
};
type CreatorBackground = string | CreatorAsset;

type CreatorSummary = {
  feature: boolean;
  packs: CreatorPack[];
  gallery: CreatorRecord[];
  backgrounds: CreatorBackground[];
  userBackgrounds: CreatorBackground[];
  presets: TemplatePreset[];
  music: CreatorAsset[];
  motion: CreatorAsset[];
};

type TemplatePreset = {
  id: string;
  label: string;
  templateType: string;
  description: string;
  lang?: string;
  previewSrc?: string;
  templates: unknown[];
  defaults: CardValues;
};

type CardValues = {
  heading: string;
  body: string;
  text: string;
  cta: string;
  badge: string;
};

type TextBoxRole = "heading" | "body";
type TextBoxRect = { x: number; y: number; w: number; h: number };
type TextLayout = Record<TextBoxRole, TextBoxRect>;

type Notice = { type: "success" | "error" | "info"; text: string } | null;

const FALLBACK_PRESETS: TemplatePreset[] = [
  {
    id: "meme-reaction-ru",
    label: "Мемный фон",
    templateType: "memes",
    description: "Мемный пример с выразительным фоном и короткой реакцией.",
    lang: "ru",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/meme-image.png",
    templates: [],
    defaults: {
      badge: "мем",
      heading: "Когда сказал: «сейчас быстро»",
      body: "и через три часа всё ещё выбираешь идеальный фон",
      text: "",
      cta: "жиза",
    },
  },
  {
    id: "joke-short-ru",
    label: "Анекдот короткий",
    templateType: "jokes",
    description: "Короткий анекдот с тёплым чистым фоном.",
    lang: "ru",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/joke-image.png",
    templates: [],
    defaults: {
      badge: "анекдот",
      heading: "Встречаются два друга",
      body: "— Ты почему такой довольный?\n— Нашёл кнопку «сделать красиво».\n— И где она?\n— Пока ищу.",
      text: "",
      cta: "ещё",
    },
  },
  {
    id: "motivation-daily-en",
    label: "English motivation",
    templateType: "motivation",
    description: "Motivation card with an English line and a calmer background.",
    lang: "en",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/motivation-image.png",
    templates: [],
    defaults: {
      badge: "daily drive",
      heading: "Keep moving",
      body: "Small steps count\nQuiet focus wins\nFinish one thing today",
      text: "",
      cta: "Start now",
    },
  },
];

const FLOW_STEPS = [
  { id: "setup", labelKey: "creator.flowSetup" },
  { id: "compose", labelKey: "creator.flowCompose" },
] as const;

type CreatorStep = (typeof FLOW_STEPS)[number]["id"];

const CHAR_LIMITS = {
  heading: 72,
  body: 300,
  text: 180,
  cta: 48,
  badge: 28,
  narration: 700,
};

const TEMPLATE_W = 1080;
const TEMPLATE_H = 1920;
const DEFAULT_TEXT_LAYOUT: TextLayout = {
  heading: { x: 116, y: 420, w: 848, h: 180 },
  body: { x: 116, y: 660, w: 848, h: 560 },
};

function clampTextBox(box: TextBoxRect, role: TextBoxRole): TextBoxRect {
  const minW = role === "heading" ? 280 : 320;
  const minH = role === "heading" ? 92 : 160;
  const w = Math.min(TEMPLATE_W, Math.max(minW, Math.round(box.w)));
  const h = Math.min(TEMPLATE_H, Math.max(minH, Math.round(box.h)));
  const x = Math.min(TEMPLATE_W - w, Math.max(0, Math.round(box.x)));
  const y = Math.min(TEMPLATE_H - h, Math.max(0, Math.round(box.y)));
  return { x, y, w, h };
}

function cloneTextLayout(layout: TextLayout): TextLayout {
  return {
    heading: { ...layout.heading },
    body: { ...layout.body },
  };
}

function applyTextLayoutToTemplates(templates: unknown[], layout: TextLayout): unknown[] {
  return templates.map((template) => {
    if (!template || typeof template !== "object") return template;
    const copy = JSON.parse(JSON.stringify(template)) as CreatorRecord & { elements?: CreatorRecord[] };
    const boxes = {
      heading: clampTextBox(layout.heading, "heading"),
      body: clampTextBox(layout.body, "body"),
    };
    for (const el of copy.elements ?? []) {
      if (el.type !== "killbox") continue;
      const role = String(el.role ?? el.id ?? "");
      const target =
        role === "title" || role === "heading" || role === "hook"
          ? boxes.heading
          : role === "body" || role === "text" || role === "fact" || role === "points" || role === "items"
            ? boxes.body
            : null;
      if (!target) continue;
      el.x = target.x;
      el.y = target.y;
      el.w = target.w;
      el.h = target.h;
      if (target.w < 520) el.align = "center";
      if (target.h < 220) el.valign = "center";
    }
    return copy;
  });
}

function cardValuesFromSample(sample: unknown): CardValues {
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

function normalizePreset(raw: unknown): TemplatePreset | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as CreatorRecord;
  const id = String(src.id ?? "").trim();
  if (!id) return null;
  const templateType = String(src.templateType ?? src.type ?? "custom");
  return {
    id,
    label: String(src.label ?? src.name ?? id),
    templateType,
    description: String(src.description ?? `${templateType} preset`),
    lang: typeof src.lang === "string" ? src.lang : undefined,
    templates: Array.isArray(src.templates) ? src.templates : [],
    previewSrc: typeof src.previewSrc === "string" ? src.previewSrc : firstTemplateImageSrc(src.templates),
    defaults: cardValuesFromSample(src.sample ?? src.defaults),
  };
}

function localizedFallbackPresets(t: (key: string, vars?: Record<string, string | number>) => string): TemplatePreset[] {
  return FALLBACK_PRESETS.map((preset) => ({
    ...preset,
    label: t(`creator.preset.${preset.id}.label`),
    description: t(`creator.preset.${preset.id}.description`),
    defaults: {
      badge: t(`creator.preset.${preset.id}.badge`),
      heading: t(`creator.preset.${preset.id}.heading`),
      body: t(`creator.preset.${preset.id}.body`),
      text: t(`creator.preset.${preset.id}.text`),
      cta: t(`creator.preset.${preset.id}.cta`),
    },
  }));
}

function normalizeSummary(data: unknown): CreatorSummary {
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

function packId(pack: CreatorPack | null | undefined): string {
  return String(pack?.id ?? pack?.packId ?? pack?.slug ?? "");
}

function packName(pack: CreatorPack | null | undefined, fallback = "Untitled pack"): string {
  const id = packId(pack);
  return String(pack?.name ?? pack?.title ?? id ?? fallback);
}

function packCards(pack: CreatorPack | null | undefined): number {
  if (!pack) return 0;
  if (Array.isArray(pack.cards)) return pack.cards.length;
  const raw = pack.cards ?? pack.cardCount ?? pack.totalCards ?? pack.total ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function firstTemplateImageSrc(templates: unknown): string | undefined {
  const list = Array.isArray(templates) ? templates : [];
  for (const template of list) {
    const elements = Array.isArray((template as CreatorRecord)?.elements) ? ((template as CreatorRecord).elements as unknown[]) : [];
    const image = elements.find((el) => {
      const src = (el as CreatorRecord)?.src;
      return (el as CreatorRecord)?.type === "image" && typeof src === "string" && src.startsWith("assets/template-packs/");
    }) as CreatorRecord | undefined;
    if (typeof image?.src === "string") return image.src;
  }
  return undefined;
}

function creatorServiceAssetUrl(src: string | undefined): string {
  const value = String(src ?? "").trim();
  if (!value) return "";
  if (/^(data:image\/|https?:\/\/|\/)/i.test(value)) return value;
  if (!value.startsWith("assets/template-packs/")) return "";
  return `/api/creator/service-assets/${value.slice("assets/".length).split("/").map(encodeURIComponent).join("/")}`;
}

function cssUrl(url: string): string {
  return url.replace(/["\\]/g, "\\$&");
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return `${fallback}: ${err.message}`;
  if (err instanceof Error) return `${fallback}: ${err.message}`;
  return fallback;
}

function templateTone(templateType: string): string {
  const type = templateType.toLowerCase();
  if (type.includes("meme")) return "tone-meme";
  if (type.includes("joke") || type.includes("fun")) return "tone-joke";
  if (type.includes("motivation") || type.includes("rule") || type.includes("list")) return "tone-motivation";
  if (type.includes("quote") || type.includes("thought")) return "tone-quote";
  if (type.includes("fact") || type.includes("kids")) return "tone-bright";
  return "tone-calm";
}

function usableBackgroundUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(data:image\/|https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return "";
}

function dataUrlBytes(value: string): number {
  const base64 = value.split(",", 2)[1] ?? "";
  return Math.floor((base64.length * 3) / 4);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = dataUrl;
  });
}

async function prepareCreatorBackground(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
    throw new Error("bad-type");
  }
  const sourceUrl = await readFileAsDataUrl(file);
  const image = await loadImageDataUrl(sourceUrl);
  const sizes = [
    { w: 1080, h: 1920 },
    { w: 900, h: 1600 },
    { w: 720, h: 1280 },
  ];
  const qualities = [0.9, 0.82, 0.74, 0.66];
  let last = sourceUrl;
  for (const size of sizes) {
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = size.w / size.h;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (sourceRatio > targetRatio) {
      sw = image.naturalHeight * targetRatio;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / targetRatio;
      sy = (image.naturalHeight - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, size.w, size.h);
    for (const quality of qualities) {
      const next = canvas.toDataURL("image/jpeg", quality);
      last = next;
      if (dataUrlBytes(next) <= 1.9 * 1024 * 1024) return next;
    }
  }
  return last;
}

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

  const [activePackId, setActivePackId] = useState("");
  const [packNameValue, setPackNameValue] = useState(() => t("creator.defaultPackName"));
  const [packLang, setPackLang] = useState(initialPreset.lang || "ru");
  const [templateType, setTemplateType] = useState(initialPreset.templateType);
  const [presetId, setPresetId] = useState(initialPreset.id);
  const [background, setBackground] = useState("");
  const [backgroundName, setBackgroundName] = useState("");
  const [textLayout, setTextLayout] = useState<TextLayout>(() => cloneTextLayout(DEFAULT_TEXT_LAYOUT));
  const [values, setValues] = useState<CardValues>(initialPreset.defaults);
  const [narration, setNarration] = useState(() => t("creator.defaultNarration"));
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
      const generatedDescription = `${preset.templateType} preset`;
      return {
        ...preset,
        label: fallback?.label ?? preset.label,
        description:
          fallback?.description ??
          (!preset.description || preset.description === generatedDescription
            ? t("creator.presetGenericDescription", { type: preset.templateType })
            : preset.description),
        defaults: fallback?.defaults ?? preset.defaults,
      };
    });
  }, [fallbackPresets, summary?.presets, t]);
  const availablePresets = localizedSummaryPresets.length ? localizedSummaryPresets : fallbackPresets;
  const featureDisabled = summary?.feature === false;

  useEffect(() => {
    if (!activePackId) return;
    const current = packs.some((pack) => packId(pack) === activePackId);
    if (!current) setActivePackId("");
  }, [packs, activePackId]);

  const activePack = useMemo(
    () => packs.find((pack) => packId(pack) === activePackId) ?? null,
    [packs, activePackId],
  );

  const activePackCards = packCards(activePack);
  const activePreset = availablePresets.find((preset) => preset.id === presetId) ?? availablePresets[0] ?? fallbackPresets[0] ?? FALLBACK_PRESETS[0];

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
      setNotice({ type: "success", text: t("creator.backgroundUploaded") });
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
    return applyTextLayoutToTemplates(activePreset.templates, textLayout);
  }

  function cardPayload() {
    const bodyLines = values.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const nextValues: CreatorRecord = {
      ...values,
      title: values.heading,
      hook: values.heading || values.badge,
      text: values.text || values.body,
      body: values.body,
      fact: values.body || values.text,
      points: bodyLines.length ? bodyLines : [values.body || values.text].filter(Boolean),
      source: values.badge || t("creator.sourceFallback"),
      templatePreset: activePreset.id,
      templateType,
    };
    if (background) nextValues.background = background;
    return {
      values: nextValues,
      narration: narration.trim() || undefined,
    };
  }

  async function createPackRecord(): Promise<CreatorPack | null> {
    setNotice(null);
    const name = packNameValue.trim();
    if (!name) {
      setNotice({ type: "error", text: t("creator.errPackNameRequired") });
      return null;
    }
    try {
      const res = await send<{ pack: CreatorPack }>("/creator/packs", "POST", {
        name,
        lang: packLang,
        templateType,
        presetId: activePreset.id,
        templates: templatePayload(),
        background: background || undefined,
        layout: textLayout,
      });
      const nextPack = res.pack;
      setSummary((current) => {
        const normalized = current ?? { feature: true, packs: [], gallery: [], backgrounds: [], userBackgrounds: [], presets: [], music: [], motion: [] };
        return { ...normalized, packs: [nextPack, ...normalized.packs.filter((pack) => packId(pack) !== packId(nextPack))] };
      });
      setActivePackId(packId(nextPack));
      setNotice({ type: "success", text: t("creator.packCreated") });
      void loadSummary(true);
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
    try {
      let targetPackId = activePackId;
      if (!targetPackId) {
        const created = await createPackRecord();
        targetPackId = packId(created);
      }
      if (!targetPackId) return;
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
      setNotice({ type: "success", text: t("creator.cardAdded") });
      void loadSummary(true);
    } catch (err) {
      setNotice({ type: "error", text: errorText(err, t("creator.errAddCard")) });
    } finally {
      setBusy(null);
    }
  }

  const actionsDisabled = loadingSummary || featureDisabled;

  return (
    <div className="creator-page max-w-7xl space-y-4">
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
      ) : (
        <div className={`creator-workspace ${step === "compose" ? "is-compose" : ""}`}>
          <StepRail
            step={step}
            setStep={setStep}
            activePack={activePack}
            activePackCards={activePackCards}
            disabled={actionsDisabled}
          />
          <div className="creator-step-pane" key={step}>
            {step === "setup" ? (
              <SetupPanel
                packNameValue={packNameValue}
                setPackNameValue={setPackNameValue}
                packLang={packLang}
                setPackLang={setPackLang}
                presetId={presetId}
                presets={availablePresets}
                selectPreset={selectPreset}
                background={background}
                backgroundName={backgroundName}
                uploadBackground={uploadBackground}
                busy={busy}
                actionsDisabled={actionsDisabled}
                onNext={() => setStep("compose")}
              />
            ) : step === "compose" ? (
              <ComposePanel
                activePack={activePack}
                activePackCards={activePackCards}
                activePreset={activePreset}
                values={values}
                updateValue={updateValue}
                textLayout={textLayout}
                setTextLayout={setTextLayout}
                narration={narration}
                setNarration={setNarration}
                packNameValue={packNameValue}
                packLang={packLang}
                background={background}
                backgroundName={backgroundName}
                addCard={addCard}
                busy={busy}
                actionsDisabled={actionsDisabled}
                onBack={() => setStep("setup")}
              />
            ) : null}
          </div>
          {step === "setup" && (
            <CreatorPreviewPanel
              step={step}
              activePreset={activePreset}
              packLang={packLang}
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
  activePack,
  activePackCards,
  disabled,
}: {
  step: CreatorStep;
  setStep: (step: CreatorStep) => void;
  activePack: CreatorPack | null;
  activePackCards: number;
  disabled: boolean;
}) {
  const { t } = useT();

  return (
    <aside className="creator-rail" aria-label={t("creator.flowAria")}>
      <div className="creator-rail-list">
        {FLOW_STEPS.map((item, index) => {
          const active = item.id === step;
          const done = (item.id === "setup" && Boolean(activePack)) || (item.id === "compose" && activePackCards > 0);
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
      <a href="/editor" className="creator-rail-tool">
        <LayoutTemplate size={15} />
        <span className="creator-rail-title">{t("creator.openEditor")}</span>
      </a>
    </aside>
  );
}

function SetupPanel({
  packNameValue,
  setPackNameValue,
  packLang,
  setPackLang,
  presetId,
  presets,
  selectPreset,
  background,
  backgroundName,
  uploadBackground,
  busy,
  actionsDisabled,
  onNext,
}: {
  packNameValue: string;
  setPackNameValue: (value: string) => void;
  packLang: string;
  setPackLang: (value: string) => void;
  presetId: string;
  presets: TemplatePreset[];
  selectPreset: (value: string) => void;
  background: string;
  backgroundName: string;
  uploadBackground: (file: File) => Promise<void>;
  busy: string | null;
  actionsDisabled: boolean;
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
          <span className="creator-preset-copy">{preset.description}</span>
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
            <span className="label-text">{t("creator.packName")}</span>
            <input
              className="input input-bordered input-sm"
              value={packNameValue}
              onChange={(event) => setPackNameValue(event.target.value)}
              placeholder={t("creator.packName")}
            />
          </label>
          <label className="form-control">
            <span className="label-text">{t("creator.language")}</span>
            <select className="select select-bordered select-sm" value={packLang} onChange={(event) => setPackLang(event.target.value)}>
              {CONTENT_LANGS.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
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
              <span className="creator-preset-copy">{backgroundName || t("creator.uploadBackgroundHint")}</span>
              <span className="creator-preset-meta">JPG · PNG · WebP</span>
            </span>
          </label>
        </div>
      </div>

      <FlowActions>
        <button className="btn btn-sm btn-primary gap-2" onClick={onNext} disabled={actionsDisabled || busy !== null || !packNameValue.trim()}>
          {t("creator.continue")}
          <ArrowRight size={16} />
        </button>
      </FlowActions>
    </section>
  );
}

function ComposePanel({
  activePack,
  activePackCards,
  activePreset,
  values,
  updateValue,
  textLayout,
  setTextLayout,
  narration,
  setNarration,
  packNameValue,
  packLang,
  background,
  backgroundName,
  addCard,
  busy,
  actionsDisabled,
  onBack,
}: {
  activePack: CreatorPack | null;
  activePackCards: number;
  activePreset: TemplatePreset;
  values: CardValues;
  updateValue: (key: keyof CardValues, value: string) => void;
  textLayout: TextLayout;
  setTextLayout: (layout: TextLayout) => void;
  narration: string;
  setNarration: (value: string) => void;
  packNameValue: string;
  packLang: string;
  background: string;
  backgroundName: string;
  addCard: () => void;
  busy: string | null;
  actionsDisabled: boolean;
  onBack: () => void;
}) {
  const { t } = useT();
  const packTitle = activePack ? packName(activePack, t("creator.untitledPack")) : packNameValue.trim() || t("creator.defaultPackName");

  return (
    <section className="creator-card creator-compose-card">
      <div className="creator-compose-head">
        <PanelHeader number="2" title={t("creator.composeTitle")} />
        <div className="creator-current creator-compose-current">
          <div>
            <span>{t("creator.currentPack")}</span>
            <strong>{packTitle}</strong>
          </div>
          <span className="badge badge-ghost badge-sm">{t("creator.cardsCount", { count: activePackCards })}</span>
        </div>
      </div>

      <div className="creator-compose-layout">
        <TextLayoutEditor
          activePreset={activePreset}
          values={values}
          packLang={packLang}
          background={background}
          backgroundName={backgroundName}
          layout={textLayout}
          setLayout={setTextLayout}
        />

        <div className="creator-compose-fields">
          <TextInput label={t("creator.heading")} value={values.heading} limit={CHAR_LIMITS.heading} onChange={(value) => updateValue("heading", value)} wide />
          <TextArea label={t("creator.body")} value={values.body} limit={CHAR_LIMITS.body} rows={7} onChange={(value) => updateValue("body", value)} wide />

          <details className="creator-details">
            <summary>{t("creator.optionalText")}</summary>
            <div className="creator-form-grid pt-3">
              <TextInput label={t("creator.badge")} value={values.badge} limit={CHAR_LIMITS.badge} onChange={(value) => updateValue("badge", value)} />
              <TextInput label={t("creator.cta")} value={values.cta} limit={CHAR_LIMITS.cta} onChange={(value) => updateValue("cta", value)} />
              <TextArea label={t("creator.extraText")} value={values.text} limit={CHAR_LIMITS.text} rows={4} onChange={(value) => updateValue("text", value)} />
              <TextArea label={t("creator.narration")} value={narration} limit={CHAR_LIMITS.narration} rows={4} onChange={setNarration} />
            </div>
          </details>
        </div>
      </div>

      <FlowActions>
        <button className="btn btn-sm btn-ghost gap-2" onClick={onBack}>
          <ChevronLeft size={16} />
          {t("creator.prev")}
        </button>
        <button className="btn btn-sm btn-primary gap-2" onClick={addCard} disabled={actionsDisabled || busy !== null || !packNameValue.trim()}>
          {busy === "add-card" ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
          {t("creator.addCard")}
        </button>
      </FlowActions>
    </section>
  );
}

function TextLayoutEditor({
  activePreset,
  values,
  packLang,
  background,
  backgroundName,
  layout,
  setLayout,
}: {
  activePreset: TemplatePreset;
  values: CardValues;
  packLang: string;
  background: string;
  backgroundName: string;
  layout: TextLayout;
  setLayout: (layout: TextLayout) => void;
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
  const [activeRole, setActiveRole] = useState<TextBoxRole>("heading");
  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const previewStyle = previewBackgroundUrl
    ? ({ backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")` } as CSSProperties)
    : undefined;

  const startGesture = (event: ReactPointerEvent<HTMLElement>, role: TextBoxRole, mode: "move" | "resize") => {
    const screen = screenRef.current?.getBoundingClientRect();
    if (!screen) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveRole(role);
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

  const renderBox = (role: TextBoxRole) => {
    const box = clampTextBox(layout[role], role);
    const label = role === "heading" ? t("creator.layoutHeading") : t("creator.layoutBody");
    const sample = role === "heading"
      ? values.heading || t("creator.layoutHeading")
      : values.body || t("creator.layoutBody");
    const style = {
      left: `${(box.x / TEMPLATE_W) * 100}%`,
      top: `${(box.y / TEMPLATE_H) * 100}%`,
      width: `${(box.w / TEMPLATE_W) * 100}%`,
      height: `${(box.h / TEMPLATE_H) * 100}%`,
    } as CSSProperties;
    return (
      <div
        key={role}
        className={`creator-layout-box is-${role} ${activeRole === role ? "is-active" : ""}`}
        style={style}
        role="button"
        tabIndex={0}
        onPointerDown={(event) => startGesture(event, role, "move")}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <span className="creator-layout-box-label">{label}</span>
        <span className="creator-layout-box-text">{sample}</span>
        <span
          className="creator-layout-resize"
          aria-hidden="true"
          onPointerDown={(event) => startGesture(event, role, "resize")}
        />
      </div>
    );
  };

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
          </div>
        </div>
      </div>
      <div className="creator-layout-meta">
        <span>{langTag(activePreset.lang || packLang) || activePreset.lang || packLang}</span>
        <strong>{background ? (backgroundName || t("creator.uploadBackground")) : activePreset.label}</strong>
      </div>
    </div>
  );
}

function CreatorPreviewPanel({
  step,
  activePreset,
  packLang,
  background,
}: {
  step: CreatorStep;
  activePreset: TemplatePreset;
  packLang: string;
  background: string;
}) {
  const { t } = useT();
  const tone = templateTone(activePreset.templateType);
  const backgroundUrl = usableBackgroundUrl(background);
  const presetBackgroundUrl = creatorServiceAssetUrl(activePreset.previewSrc ?? firstTemplateImageSrc(activePreset.templates));
  const previewBackgroundUrl = backgroundUrl || presetBackgroundUrl;
  const stepLabel = t(FLOW_STEPS.find((item) => item.id === step)?.labelKey ?? "creator.flowSetup");
  const previewStyle = previewBackgroundUrl
    ? {
        backgroundImage: `url("${cssUrl(previewBackgroundUrl)}")`,
      }
    : undefined;

  return (
    <aside className="creator-preview-panel" aria-label={t("creator.previewLive")}>
      <div className="creator-preview-head">
        <div>
          <span>{t("creator.previewLive")}</span>
          <strong>{stepLabel}</strong>
        </div>
        <span className="creator-preview-pill">{langTag(activePreset.lang || packLang) || activePreset.lang || packLang}</span>
      </div>

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

function TextInput({
  label,
  value,
  limit,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  limit: number;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`form-control ${wide ? "lg:col-span-2" : ""}`}>
      <span className="label-text flex items-center justify-between gap-2">
        {label}
        <Counter value={value} limit={limit} />
      </span>
      <input className="input input-bordered input-sm" value={value} maxLength={limit * 2} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({
  label,
  value,
  limit,
  rows,
  onChange,
  wide = false,
}: {
  label: string;
  value: string;
  limit: number;
  rows: number;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`form-control ${wide ? "lg:col-span-2" : ""}`}>
      <span className="label-text flex items-center justify-between gap-2">
        {label}
        <Counter value={value} limit={limit} />
      </span>
      <textarea
        className="textarea textarea-bordered text-sm leading-relaxed"
        value={value}
        rows={rows}
        maxLength={limit * 2}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-error" : "text-base-content/45"}`}>
      {value.length}/{limit}
    </span>
  );
}
