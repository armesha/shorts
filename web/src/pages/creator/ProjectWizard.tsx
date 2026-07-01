// Мастер нового проекта: 1) основа (название+фон) → 2) дизайн → 3) музыка и видео → создать.
import { type ChangeEvent, type CSSProperties, type Dispatch, type SetStateAction, useState } from "react";
import { ArrowRight, Check, ChevronLeft, FileImage, Loader2, X } from "lucide-react";
import { langTag } from "../../lib/deck";
import { useT } from "../../lib/i18n";
import { CreatorPreviewPanel, DesignEditor, MediaSettingsPanel } from "./editor";
import { creatorServiceAssetUrl, cssUrl, firstTemplateImageSrc, templateTone, usableBackgroundUrl } from "./model";
import type {
  CardValues,
  CreatorAsset,
  CreatorDesignState,
  MediaSettings,
  StickerOverlay,
  TemplatePreset,
  TextLayout,
  TextStyle,
} from "./types";

const WIZARD_STEPS = ["basis", "design", "media"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export function ProjectWizard({
  presets,
  presetId,
  selectPreset,
  templateNameValue,
  setTemplateNameValue,
  background,
  backgroundName,
  uploadBackground,
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
  mediaSettings,
  setMediaSettings,
  uploadMotionGif,
  uploadMusic,
  applyDesignState,
  canUndoDesign,
  canRedoDesign,
  undoDesign,
  redoDesign,
  busy,
  creating,
  onCancel,
  onCreate,
}: {
  presets: TemplatePreset[];
  presetId: string;
  selectPreset: (id: string) => void;
  templateNameValue: string;
  setTemplateNameValue: (value: string) => void;
  background: string;
  backgroundName: string;
  uploadBackground: (file: File) => Promise<void>;
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
  mediaSettings: MediaSettings;
  setMediaSettings: Dispatch<SetStateAction<MediaSettings>>;
  uploadMotionGif: (file: File) => Promise<void>;
  uploadMusic: (file: File) => Promise<void>;
  applyDesignState: (state: CreatorDesignState) => void;
  canUndoDesign: boolean;
  canRedoDesign: boolean;
  undoDesign: () => void;
  redoDesign: () => void;
  busy: string | null;
  creating: boolean;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const { t } = useT();
  const [step, setStep] = useState<WizardStep>("basis");
  const stepIndex = WIZARD_STEPS.indexOf(step);
  const stepLabels: Record<WizardStep, string> = {
    basis: t("creator.wizardBasis"),
    design: t("creator.wizardDesign"),
    media: t("creator.wizardMedia"),
  };
  const canCreate = Boolean(templateNameValue.trim());

  const handleBackgroundUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void uploadBackground(file).finally(() => {
      input.value = "";
    });
  };

  const customPreview = usableBackgroundUrl(background);
  const customStyle = customPreview
    ? ({ "--creator-preset-image": `url("${cssUrl(customPreview)}")` } as CSSProperties)
    : undefined;

  return (
    <section className="creator-wizard">
      <header className="creator-wizard-head">
        <div className="creator-wizard-title">
          <h1>{t("creator.newProject")}</h1>
          <span>{templateNameValue.trim() || t("creator.newProjectHint")}</span>
        </div>
        <ol className="creator-wizard-steps" aria-label={t("creator.flowAria")}>
          {WIZARD_STEPS.map((id, index) => (
            <li key={id}>
              <button
                type="button"
                className={`creator-wizard-step ${id === step ? "is-active" : ""} ${index < stepIndex ? "is-done" : ""}`}
                onClick={() => setStep(id)}
                disabled={creating}
              >
                <span className="creator-wizard-step-number">{index < stepIndex ? <Check size={13} /> : index + 1}</span>
                {stepLabels[id]}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={onCancel} aria-label={t("creator.wizardCancel")} title={t("creator.wizardCancel")}>
          <X size={18} />
        </button>
      </header>

      <div className="creator-wizard-body" key={step}>
        {step === "basis" ? (
          <div className="creator-wizard-basis">
            <div className="creator-card creator-basis-card">
              <label className="form-control creator-basis-name">
                <span className="label-text">{t("creator.projectName")}</span>
                <input
                  className="input input-bordered"
                  value={templateNameValue}
                  onChange={(event) => setTemplateNameValue(event.target.value)}
                  placeholder={t("creator.projectNamePlaceholder")}
                  maxLength={60}
                  autoFocus
                />
              </label>

              <span className="creator-basis-label">{t("creator.chooseTemplate")}</span>
              <div className="creator-preset-grid">
                {presets.map((preset) => {
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
                          {preset.templateType} · {langTag(preset.lang || "ru") || preset.lang}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <label className={`creator-preset creator-upload-preset ${background ? "is-active" : ""} ${busy === "upload-background" ? "is-busy" : ""}`}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleBackgroundUpload}
                    disabled={busy !== null || creating}
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
            <CreatorPreviewPanel activePreset={activePreset} background={background} />
          </div>
        ) : step === "design" ? (
          <div className="creator-card">
            <DesignEditor
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
              motion={motion}
              mediaSettings={mediaSettings}
              setMediaSettings={setMediaSettings}
              uploadMotionGif={uploadMotionGif}
              background={background}
              applyDesignState={applyDesignState}
              canUndoDesign={canUndoDesign}
              canRedoDesign={canRedoDesign}
              undoDesign={undoDesign}
              redoDesign={redoDesign}
            />
          </div>
        ) : (
          <div className="creator-card">
            <MediaSettingsPanel
              activePreset={activePreset}
              values={values}
              background={background}
              music={music}
              motion={motion}
              mediaSettings={mediaSettings}
              setMediaSettings={setMediaSettings}
              uploadMusic={uploadMusic}
            />
          </div>
        )}
      </div>

      <footer className="creator-wizard-footer">
        {stepIndex > 0 ? (
          <button type="button" className="btn btn-sm btn-ghost gap-2" onClick={() => setStep(WIZARD_STEPS[stepIndex - 1])} disabled={creating}>
            <ChevronLeft size={16} />
            {t("creator.prev")}
          </button>
        ) : (
          <span />
        )}
        {stepIndex < WIZARD_STEPS.length - 1 ? (
          <button type="button" className="btn btn-sm btn-primary gap-2" onClick={() => setStep(WIZARD_STEPS[stepIndex + 1])}>
            {t("creator.next")}
            <ArrowRight size={16} />
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary gap-2" onClick={onCreate} disabled={creating || !canCreate}>
            {creating ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {t("creator.createProject")}
          </button>
        )}
      </footer>
    </section>
  );
}
