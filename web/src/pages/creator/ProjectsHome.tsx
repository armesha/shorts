// Главный экран /creator: паки как плитки + главное действие создания шаблона.
import { useState } from "react";
import { ArrowRight, Loader2, Plus, Trash2, X } from "lucide-react";
import { langTag } from "../../lib/deck";
import { useT } from "../../lib/i18n";
import { creatorServiceAssetUrl, cssUrl, packCards, packId, templateTone } from "./model";
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
  onNewPack,
  onNewInPack,
  onDelete,
  disabled,
  busy,
}: {
  packs: CreatorPack[];
  onOpen: (pack: CreatorPack) => void;
  onNewPack: () => void;
  onNewInPack: (pack: CreatorPack) => void;
  onDelete: (pack: CreatorPack) => Promise<boolean>;
  disabled: boolean;
  busy: string | null;
}) {
  const { t } = useT();
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CreatorPack | null>(null);

  const createButton = (
    <button type="button" className="btn btn-primary gap-2 creator-main-cta" onClick={() => setDestinationOpen(true)} disabled={disabled || busy !== null}>
      <Plus size={18} />
      {t("creator.newProject")}
    </button>
  );

  const destinationModal = destinationOpen ? (
    <div className="creator-modal" role="dialog" aria-modal="true" aria-label={t("creator.createDestinationTitle")} onClick={() => setDestinationOpen(false)}>
      <div className="creator-modal-box creator-destination-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{t("creator.createDestinationTitle")}</strong>
          <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={() => setDestinationOpen(false)} aria-label={t("creator.close")}>
            <X size={14} />
          </button>
        </header>
        <div className="creator-destination-list">
          <button
            type="button"
            className="creator-destination-option"
            onClick={() => {
              setDestinationOpen(false);
              onNewPack();
            }}
            disabled={disabled || busy !== null}
          >
            <span className="creator-destination-icon">
              <Plus size={18} />
            </span>
            <span>
              <strong>{t("creator.createDestinationNewPack")}</strong>
              <small>{t("creator.createDestinationNewPackHint")}</small>
            </span>
          </button>
          {packs.map((pack) => {
            const id = packId(pack);
            return (
              <button
                type="button"
                key={id}
                className="creator-destination-option"
                onClick={() => {
                  setDestinationOpen(false);
                  onNewInPack(pack);
                }}
                disabled={disabled || busy !== null || !id}
              >
                <span className="creator-destination-icon">
                  <ArrowRight size={17} />
                </span>
                <span>
                  <strong>{pack.name || t("creator.untitledPack")}</strong>
                  <small>{t("creator.createDestinationExistingPackHint", { count: packCards(pack) })}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  ) : null;

  const deleteModal = deleteTarget ? (
    <div className="creator-modal" role="dialog" aria-modal="true" aria-label={t("creator.deletePackConfirmTitle")} onClick={() => setDeleteTarget(null)}>
      <div className="creator-modal-box is-confirm" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{t("creator.deletePackConfirmTitle")}</strong>
        </header>
        <p>{t("creator.deletePackConfirmText", { name: deleteTarget.name || t("creator.untitledPack") })}</p>
        <footer>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDeleteTarget(null)} disabled={busy === "delete-pack"}>
            {t("creator.cancel")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-error gap-2"
            onClick={() => {
              void onDelete(deleteTarget).then((ok) => {
                if (ok) setDeleteTarget(null);
              });
            }}
            disabled={busy === "delete-pack"}
          >
            {busy === "delete-pack" ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
            {t("creator.deletePack")}
          </button>
        </footer>
      </div>
    </div>
  ) : null;

  if (!packs.length) {
    return (
      <div className="creator-home">
        <section className="creator-empty-home" aria-label={t("creator.myProjects")}>
          {createButton}
        </section>
        {destinationModal}
      </div>
    );
  }

  return (
    <div className="creator-home">
      <section className="creator-projects-section">
        <div className="creator-projects-head">
          <h1>{t("creator.myProjects")}</h1>
          {createButton}
        </div>
        <div className="creator-projects-grid">
          {packs.map((pack) => {
            const preview = creatorServiceAssetUrl(typeof pack.previewSrc === "string" ? pack.previewSrc : undefined);
            const tone = templateTone(String(pack.templateType ?? "custom"));
            const cards = packCards(pack);
            return (
              <article key={packId(pack)} className="creator-project-tile">
                <button
                  type="button"
                  className="creator-project-tile-main"
                  onClick={() => onOpen(pack)}
                  disabled={disabled || busy !== null}
                >
                  <span className={`creator-project-thumb ${tone}`} style={preview ? { backgroundImage: `url("${cssUrl(preview)}")` } : undefined}>
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
                <button
                  type="button"
                  className="creator-project-delete-home"
                  onClick={() => setDeleteTarget(pack)}
                  disabled={disabled || busy !== null}
                  title={t("creator.deletePack")}
                  aria-label={t("creator.deletePack")}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            );
          })}
        </div>
      </section>
      {destinationModal}
      {deleteModal}
    </div>
  );
}
