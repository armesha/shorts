import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Clapperboard,
  LayoutTemplate,
  Loader2,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";
import { langTag } from "../../lib/deck";
import { useT } from "../../lib/i18n";
import { packCards } from "./model";
import type { AutosaveStatus, CreatorPack } from "./types";

export type ProjectTab = "cards" | "template" | "videos";

const PROJECT_TABS: Array<{ id: ProjectTab; labelKey: string; icon: typeof StickyNote }> = [
  { id: "cards", labelKey: "creator.tabCards", icon: StickyNote },
  { id: "template", labelKey: "creator.tabTemplate", icon: LayoutTemplate },
  { id: "videos", labelKey: "creator.tabVideos", icon: Clapperboard },
];

export function ProjectWorkspace({
  pack,
  tab,
  setTab,
  onBack,
  onRename,
  onDelete,
  busy,
  autosaveStatus,
  children,
}: {
  pack: CreatorPack;
  tab: ProjectTab;
  setTab: (tab: ProjectTab) => void;
  onBack: () => void;
  onRename: (name: string) => Promise<void>;
  onDelete: () => void;
  busy: string | null;
  autosaveStatus: AutosaveStatus | null;
  children: ReactNode;
}) {
  const { t } = useT();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(String(pack.name ?? ""));
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setNameValue(String(pack.name ?? ""));
    setEditingName(false);
    setConfirmDeleteOpen(false);
  }, [pack.name]);

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== String(pack.name ?? "").trim()) void onRename(trimmed);
    else setNameValue(String(pack.name ?? ""));
  };

  return (
    <section className="creator-workspace-shell">
      <header className="creator-project-head">
        <button type="button" className="btn btn-ghost btn-sm btn-square creator-back-button" onClick={onBack} aria-label={t("creator.backToProjects")} title={t("creator.backToProjects")}>
          <ChevronLeft size={19} />
        </button>
        <div className="creator-project-title">
          {editingName ? (
            <input
              className="input input-bordered input-sm creator-project-name-input"
              value={nameValue}
              autoFocus
              maxLength={60}
              onChange={(event) => setNameValue(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitName();
                if (event.key === "Escape") {
                  setNameValue(String(pack.name ?? ""));
                  setEditingName(false);
                }
              }}
            />
          ) : (
            <button type="button" className="creator-project-name" onClick={() => setEditingName(true)} title={t("creator.renameProject")}>
              <h1>{pack.name || t("creator.untitledPack")}</h1>
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          <span className="creator-project-meta">
            {langTag(String(pack.lang ?? "")) || String(pack.lang ?? "").toUpperCase()}
            {" · "}
            {t("creator.cardsCount", { count: packCards(pack) })}
            {autosaveStatus && (
              <span className={`creator-autosave-status is-${autosaveStatus}`} role={autosaveStatus === "error" ? "alert" : "status"}>
                {autosaveStatus === "saving" ? <Loader2 className="animate-spin" size={12} /> : autosaveStatus === "error" ? <AlertTriangle size={12} /> : <Check size={12} />}
                {t(`creator.autosave.${autosaveStatus}`)}
              </span>
            )}
          </span>
        </div>
        <nav className="creator-project-tabs" aria-label={t("creator.projectSectionsAria")}>
          {PROJECT_TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`creator-project-tab ${tab === id ? "is-active" : ""}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={15} />
              {t(labelKey)}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-square creator-project-delete"
          title={t("creator.deletePack")}
          aria-label={t("creator.deletePack")}
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={busy === "delete-pack"}
        >
          {busy === "delete-pack" ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
        </button>
      </header>

      <div className="creator-project-body" key={tab}>
        {children}
      </div>

      {confirmDeleteOpen && (
        <div className="creator-modal" role="dialog" aria-modal="true" aria-label={t("creator.deletePackConfirmTitle")} onClick={() => setConfirmDeleteOpen(false)}>
          <div className="creator-modal-box is-confirm" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{t("creator.deletePackConfirmTitle")}</strong>
            </header>
            <p>{t("creator.deletePackConfirmText", { name: pack.name || t("creator.untitledPack") })}</p>
            <footer>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmDeleteOpen(false)} disabled={busy === "delete-pack"}>
                {t("creator.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-error gap-2"
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  onDelete();
                }}
                disabled={busy === "delete-pack"}
              >
                {busy === "delete-pack" ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                {t("creator.deletePack")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
