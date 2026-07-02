// Главный экран /creator: паки как плитки + главное действие создания шаблона.
import { useState } from "react";
import { ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
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

const EMPTY_GHOST_PACKS = [
  {
    name: "Мемный фон",
    meta: "RU · memes",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/meme-image.png",
  },
  {
    name: "Анекдот короткий",
    meta: "RU · jokes",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/joke-image.png",
  },
  {
    name: "Мотивация",
    meta: "EN · motivation",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/motivation-image.png",
  },
] as const;

function typeEmoji(templateType: string): string {
  const type = templateType.toLowerCase();
  for (const [re, emoji] of TYPE_EMOJI) if (re.test(type)) return emoji;
  return "✨";
}

function GhostPackTile({ ghost }: { ghost: (typeof EMPTY_GHOST_PACKS)[number] }) {
  const preview = creatorServiceAssetUrl(ghost.previewSrc);
  return (
    <article className="creator-project-tile creator-project-tile-ghost" aria-hidden="true">
      <span className="creator-project-tile-main">
        <span className="creator-project-thumb" style={{ backgroundImage: `url("${cssUrl(preview)}")` }}>
          <span className="creator-project-count">0 карт.</span>
        </span>
        <span className="creator-project-info">
          <strong>{ghost.name}</strong>
          <span>{ghost.meta}</span>
        </span>
      </span>
    </article>
  );
}

export function ProjectsHome({
  packs,
  onOpen,
  onNewPack,
  onDelete,
  disabled,
  busy,
}: {
  packs: CreatorPack[];
  onOpen: (pack: CreatorPack) => void;
  onNewPack: () => void;
  onDelete: (pack: CreatorPack) => Promise<boolean>;
  disabled: boolean;
  busy: string | null;
}) {
  const { t } = useT();
  const [deleteTarget, setDeleteTarget] = useState<CreatorPack | null>(null);

  const createButton = (
    <button type="button" className="btn btn-primary gap-2 creator-main-cta" onClick={onNewPack} disabled={disabled || busy !== null}>
      <Plus size={18} />
      {t("creator.newProject")}
    </button>
  );

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
          <div className="creator-empty-ghost-grid">
            {EMPTY_GHOST_PACKS.map((ghost) => (
              <GhostPackTile key={ghost.name} ghost={ghost} />
            ))}
          </div>
          <div className="creator-empty-action">
            {createButton}
          </div>
        </section>
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
          {packs.length < EMPTY_GHOST_PACKS.length && EMPTY_GHOST_PACKS.slice(packs.length).map((ghost) => (
            <GhostPackTile key={`ghost-${ghost.name}`} ghost={ghost} />
          ))}
        </div>
      </section>
      {deleteModal}
    </div>
  );
}
