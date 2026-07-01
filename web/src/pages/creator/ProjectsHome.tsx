// Главный экран /creator: проекты (creator-паки) как плитки + онбординг для пустого состояния.
import { ArrowRight, Clapperboard, LayoutTemplate, Plus, StickyNote } from "lucide-react";
import { langTag } from "../../lib/deck";
import { useT } from "../../lib/i18n";
import { creatorServiceAssetUrl, packCards, packId, templateTone } from "./model";
import type { CreatorPack } from "./types";

const TYPE_EMOJI: Array<[RegExp, string]> = [
  [/meme/, "🎭"],
  [/joke|fun/, "😂"],
  [/motivation|rule/, "🚀"],
  [/quote|thought/, "💬"],
  [/psych/, "🧠"],
  [/fact|kids/, "📚"],
];

function typeEmoji(templateType: string): string {
  const type = templateType.toLowerCase();
  for (const [re, emoji] of TYPE_EMOJI) if (re.test(type)) return emoji;
  return "✨";
}

export function ProjectsHome({
  packs,
  onOpen,
  onNew,
  disabled,
}: {
  packs: CreatorPack[];
  onOpen: (pack: CreatorPack) => void;
  onNew: () => void;
  disabled: boolean;
}) {
  const { t } = useT();
  const steps = [
    { icon: <LayoutTemplate size={17} />, title: t("creator.homeStepTemplate"), text: t("creator.homeStepTemplateText") },
    { icon: <StickyNote size={17} />, title: t("creator.homeStepCards"), text: t("creator.homeStepCardsText") },
    { icon: <Clapperboard size={17} />, title: t("creator.homeStepVideos"), text: t("creator.homeStepVideosText") },
  ];

  return (
    <div className="creator-home">
      <section className="creator-hero-card">
        <div className="creator-hero-copy">
          <h1>{t("creator.homeTitle")}</h1>
          <p>{t("creator.homeSubtitle")}</p>
          <button type="button" className="btn btn-primary gap-2 creator-hero-cta" onClick={onNew} disabled={disabled}>
            <Plus size={18} />
            {t("creator.newProject")}
          </button>
        </div>
        <ol className="creator-hero-steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="creator-hero-step-icon">{step.icon}</span>
              <span className="creator-hero-step-copy">
                <strong>{index + 1}. {step.title}</strong>
                <span>{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {packs.length > 0 && (
        <section className="creator-projects-section">
          <h2>{t("creator.myProjects")}</h2>
          <div className="creator-projects-grid">
            {packs.map((pack) => {
              const preview = creatorServiceAssetUrl(typeof pack.previewSrc === "string" ? pack.previewSrc : undefined);
              const tone = templateTone(String(pack.templateType ?? "custom"));
              const cards = packCards(pack);
              return (
                <button
                  type="button"
                  key={packId(pack)}
                  className="creator-project-tile"
                  onClick={() => onOpen(pack)}
                  disabled={disabled}
                >
                  <span
                    className={`creator-project-thumb ${tone}`}
                    style={preview ? { backgroundImage: `url("${preview.replace(/["\\]/g, "\\$&")}")` } : undefined}
                  >
                    {!preview && <span className="creator-project-emoji">{typeEmoji(String(pack.templateType ?? ""))}</span>}
                    <span className="creator-project-count">{t("creator.cardsCount", { count: cards })}</span>
                  </span>
                  <span className="creator-project-info">
                    <strong>{pack.name || t("creator.untitledPack")}</strong>
                    <span>
                      {langTag(String(pack.lang ?? "")) || String(pack.lang ?? "").toUpperCase()}
                      {" · "}
                      {String(pack.templateType ?? "custom")}
                    </span>
                  </span>
                  <span className="creator-project-open" aria-hidden="true">
                    <ArrowRight size={16} />
                  </span>
                </button>
              );
            })}
            <button type="button" className="creator-project-tile is-new" onClick={onNew} disabled={disabled}>
              <span className="creator-project-thumb is-new">
                <Plus size={26} />
              </span>
              <span className="creator-project-info">
                <strong>{t("creator.newProject")}</strong>
                <span>{t("creator.newProjectHint")}</span>
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
