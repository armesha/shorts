// Главный экран /creator: паки как плитки + главное действие создания шаблона.
import { ArrowRight, Plus } from "lucide-react";
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

  if (!packs.length) {
    return (
      <div className="creator-home">
        <section className="creator-empty-home" aria-label={t("creator.myProjects")}>
          <button type="button" className="btn btn-primary gap-2 creator-main-cta" onClick={onNew} disabled={disabled}>
            <Plus size={18} />
            {t("creator.newProject")}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="creator-home">
      <section className="creator-projects-section">
        <div className="creator-projects-head">
          <h1>{t("creator.myProjects")}</h1>
          <button type="button" className="btn btn-primary btn-sm gap-2 creator-main-cta" onClick={onNew} disabled={disabled}>
            <Plus size={18} />
            {t("creator.newProject")}
          </button>
        </div>
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
        </div>
      </section>
    </div>
  );
}
