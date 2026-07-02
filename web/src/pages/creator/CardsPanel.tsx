// Вкладка «Карточки» проекта: выбор шаблона, добавление по одной, массовый импорт из текста/файла
// (формат «заголовок + текст», разделитель — пустая строка; или JSON) и сетка карточек.
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Eye,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useT } from "../../lib/i18n";
import { MiniCard, type MiniCardStyling } from "./MiniCard";
import {
  parseImport,
  toCardPayload,
  validateImportedCard,
  type CardLimits,
  type ImportedCard,
  limitsFromTemplate,
} from "./importCards";
import { cardAddedAt, cardTitleText, packCardItems } from "./model";
import type { CreatorPack, CreatorRecord } from "./types";

export type CardsOps = {
  addCards: (cards: CreatorRecord[]) => Promise<boolean>;
  updateCard: (index: number, payload: CreatorRecord) => Promise<boolean>;
  deleteCard: (index: number, addedAt: string) => Promise<boolean>;
  renderPreview: (index: number) => Promise<string | null>;
};

export function CardsPanel({
  pack,
  limits,
  styling,
  ops,
  busy,
  onCreateTemplate,
}: {
  pack: CreatorPack;
  limits: CardLimits;
  styling: MiniCardStyling;
  ops: CardsOps;
  busy: string | null;
  onCreateTemplate: () => void;
}) {
  const { t } = useT();
  const cards = packCardItems(pack);
  const [adderMode, setAdderMode] = useState<"single" | "bulk">("single");
  const templates = useMemo(() => (Array.isArray(pack.templates) ? pack.templates : []), [pack.templates]);
  const [templateIndex, setTemplateIndex] = useState(0);
  const selectedTemplate = templates[templateIndex] ?? templates[0] ?? null;
  const selectedLimits = useMemo(
    () => (selectedTemplate ? limitsFromTemplate(selectedTemplate) : limits),
    [limits, selectedTemplate],
  );

  useEffect(() => {
    if (templateIndex >= templates.length) setTemplateIndex(Math.max(0, templates.length - 1));
  }, [templateIndex, templates.length]);

  if (!templates.length) {
    return (
      <div className="creator-cards-panel">
        <section className="creator-card creator-cards-empty">
          <p>{t("creator.noTemplatesTitle")}</p>
          <span>{t("creator.noTemplatesText")}</span>
          <button type="button" className="btn btn-sm btn-primary gap-2" onClick={onCreateTemplate}>
            <Plus size={15} />
            {t("creator.createTemplate")}
          </button>
        </section>
        <CardsGrid pack={pack} cards={cards} limits={limits} styling={styling} ops={ops} busy={busy} />
      </div>
    );
  }

  return (
    <div className="creator-cards-panel">
      <section className="creator-card creator-adder-card">
        <div className="creator-template-picker">
          <label>
            <span>{t("creator.templatePickerLabel")}</span>
            <select
              className="select select-bordered select-sm"
              value={templateIndex}
              onChange={(event) => setTemplateIndex(Number(event.target.value))}
            >
              {templates.map((template, index) => {
                const name = String((template as CreatorRecord)?.name ?? "").trim() || t("creator.templateFallbackName", { n: index + 1 });
                return (
                  <option key={index} value={index}>
                    {name}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <div className="creator-adder-head">
          <div
            className="creator-mode-switch"
            role="tablist"
            aria-label={t("creator.addCardsAria")}
          >
            <button
              type="button"
              className={adderMode === "single" ? "is-active" : ""}
              role="tab"
              aria-selected={adderMode === "single"}
              onClick={() => setAdderMode("single")}
            >
              <Plus size={15} />
              {t("creator.addSingle")}
            </button>
            <button
              type="button"
              className={adderMode === "bulk" ? "is-active" : ""}
              role="tab"
              aria-selected={adderMode === "bulk"}
              onClick={() => setAdderMode("bulk")}
            >
              <FileUp size={15} />
              {t("creator.addBulk")}
            </button>
          </div>
          <span className="creator-adder-count">{t("creator.cardsCount", { count: cards.length })}</span>
        </div>
        {adderMode === "single" ? (
          <SingleCardForm limits={selectedLimits} styling={styling} ops={ops} busy={busy} templateIndex={templateIndex} />
        ) : (
          <BulkImportForm limits={selectedLimits} ops={ops} busy={busy} templateIndex={templateIndex} />
        )}
      </section>

      <CardsGrid pack={pack} cards={cards} limits={selectedLimits} styling={styling} ops={ops} busy={busy} />
    </div>
  );
}

function CharCounter({ value, max }: { value: number; max: number }) {
  return <span className={`creator-char-counter ${value > max ? "is-over" : ""}`}>{value}/{max}</span>;
}

function PhoneMiniPreview({
  styling,
  title,
  text,
}: {
  styling: MiniCardStyling;
  title: string;
  text: string;
}) {
  return (
    <div className={`creator-phone creator-card-preview-phone ${styling.tone}`}>
      <span className="creator-device-button is-left" aria-hidden="true" />
      <span className="creator-device-button is-right" aria-hidden="true" />
      <div className="creator-phone-screen">
        <span className="creator-device-island" aria-hidden="true" />
        <MiniCard
          styling={styling}
          title={title}
          text={text}
          className="is-large is-phone-preview"
        />
      </div>
    </div>
  );
}

function SingleCardForm({
  limits,
  styling,
  ops,
  busy,
  templateIndex,
}: {
  limits: CardLimits;
  styling: MiniCardStyling;
  ops: CardsOps;
  busy: string | null;
  templateIndex: number;
}) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [narration, setNarration] = useState("");
  const card: ImportedCard = { title, text, ...(narration.trim() ? { narration } : {}) };
  const issues = validateImportedCard(card, limits);
  const canAdd = issues.length === 0 && !busy;

  const add = async () => {
    const ok = await ops.addCards([toCardPayload(card, templateIndex)]);
    if (ok) {
      setTitle("");
      setText("");
      setNarration("");
    }
  };

  return (
    <div className="creator-single-form">
      <div className="creator-single-fields">
        <label className="form-control">
          <span className="label-text">
            {t("creator.heading")}
            <CharCounter value={title.trim().length} max={limits.titleMax} />
          </span>
          <input
            className="input input-bordered input-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("creator.singleTitlePlaceholder")}
          />
        </label>
        <label className="form-control">
          <span className="label-text">
            {t("creator.body")}
            <CharCounter value={text.trim().length} max={limits.textMax} />
          </span>
          <textarea
            className="textarea textarea-bordered textarea-sm creator-single-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t("creator.singleTextPlaceholder")}
          />
        </label>
        <details className="creator-narration-details">
          <summary>{t("creator.narrationOptional")}</summary>
          <textarea
            className="textarea textarea-bordered textarea-sm"
            value={narration}
            onChange={(event) => setNarration(event.target.value)}
            placeholder={t("creator.narrationPlaceholder")}
          />
        </details>
        <div className="creator-single-actions">
          <button type="button" className="btn btn-sm btn-primary gap-2" onClick={() => void add()} disabled={!canAdd}>
            {busy === "add-cards" ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            {t("creator.addCard")}
          </button>
        </div>
      </div>
      <div className="creator-single-preview">
        <PhoneMiniPreview
          styling={styling}
          title={title.trim() || t("creator.previewHeadingFallback")}
          text={text.trim() || t("creator.previewBodyFallback")}
        />
      </div>
    </div>
  );
}

function BulkImportForm({
  limits,
  ops,
  busy,
  templateIndex,
}: {
  limits: CardLimits;
  ops: CardsOps;
  busy: string | null;
  templateIndex: number;
}) {
  const { t } = useT();
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseImport(raw, limits), [raw, limits]);
  const valid = parsed.entries.filter((entry) => entry.issues.length === 0);
  const invalid = parsed.entries.filter((entry) => entry.issues.length > 0);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((content) => {
      setRaw(content);
      setFileName(file.name);
    }).finally(() => {
      input.value = "";
    });
  };

  const add = async () => {
    if (!valid.length) return;
    const ok = await ops.addCards(valid.map((entry) => toCardPayload(entry.card, templateIndex)));
    if (ok) {
      setRaw("");
      setFileName("");
    }
  };

  return (
    <div className="creator-bulk-form">
      <div className="creator-bulk-help">
        <div className="creator-import-guide" role="note">
          <Sparkles size={15} aria-hidden="true" />
          <div>
            <strong>{t("creator.bulkGuideTitle")}</strong>
            <p>{t("creator.bulkFormatHint", { titleMax: limits.titleMax, textMax: limits.textMax })}</p>
          </div>
        </div>
      </div>

      <div className="creator-bulk-input">
        <textarea
          className="textarea textarea-bordered creator-bulk-textarea"
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
            setFileName("");
          }}
          placeholder={t("creator.bulkPlaceholder")}
        />
        <div className="creator-bulk-input-actions">
          <input ref={fileRef} type="file" accept=".txt,.json,.md,text/plain,application/json" className="hidden" onChange={handleFile} />
          <button type="button" className="btn btn-xs btn-outline gap-1" onClick={() => fileRef.current?.click()}>
            <FileUp size={13} />
            {fileName || t("creator.bulkPickFile")}
          </button>
          {raw.trim() && (
            <button type="button" className="btn btn-xs btn-ghost gap-1" onClick={() => { setRaw(""); setFileName(""); }}>
              <X size={13} />
              {t("creator.bulkClear")}
            </button>
          )}
        </div>
      </div>

      {parsed.format === "invalid-json" && (
        <div className="creator-bulk-status is-error" role="alert">
          <AlertTriangle size={15} />
          {t("creator.bulkInvalidJson")}
        </div>
      )}

      {parsed.entries.length > 0 && (
        <div className="creator-bulk-result">
          <div className="creator-bulk-summary">
            <span className="creator-bulk-chip">{t("creator.bulkParsed", { count: parsed.entries.length })}</span>
            <span className="creator-bulk-chip is-ok">{t("creator.bulkReady", { count: valid.length })}</span>
            {invalid.length > 0 && <span className="creator-bulk-chip is-bad">{t("creator.bulkBroken", { count: invalid.length })}</span>}
          </div>
          {invalid.length > 0 && (
            <ul className="creator-bulk-errors">
              {invalid.slice(0, 6).map((entry) => {
                const index = parsed.entries.indexOf(entry);
                return (
                  <li key={index}>
                    <strong>#{index + 1}{entry.card.title ? ` · ${entry.card.title.slice(0, 40)}` : ""}</strong>
                    <span>{entry.issues.map((issue) => t(issue.key, issue.vars)).join("; ")}</span>
                  </li>
                );
              })}
              {invalid.length > 6 && <li className="creator-bulk-errors-more">{t("creator.bulkMoreErrors", { count: invalid.length - 6 })}</li>}
            </ul>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary gap-2 creator-bulk-add"
            onClick={() => void add()}
            disabled={!valid.length || busy !== null}
          >
            {busy === "add-cards" ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
            {t("creator.bulkAdd", { count: valid.length })}
          </button>
        </div>
      )}
    </div>
  );
}

function CardsGrid({
  pack,
  cards,
  limits,
  styling,
  ops,
  busy,
}: {
  pack: CreatorPack;
  cards: CreatorRecord[];
  limits: CardLimits;
  styling: MiniCardStyling;
  ops: CardsOps;
  busy: string | null;
}) {
  const { t } = useT();
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ index: number; url: string | null } | null>(null);
  const [deleteArmedIndex, setDeleteArmedIndex] = useState<number | null>(null);

  if (!cards.length) {
    return (
      <section className="creator-card creator-cards-empty">
        <p>{t("creator.noCardsYet")}</p>
        <span>{t("creator.noCardsYetHint")}</span>
      </section>
    );
  }

  const openPreview = async (index: number) => {
    setPreview({ index, url: null });
    const url = await ops.renderPreview(index);
    setPreview((current) => (current && current.index === index ? (url ? { index, url } : null) : current));
  };

  const removeCard = async (index: number) => {
    if (deleteArmedIndex !== index) {
      setDeleteArmedIndex(index);
      window.setTimeout(() => setDeleteArmedIndex((current) => (current === index ? null : current)), 2600);
      return;
    }
    setDeleteArmedIndex(null);
    await ops.deleteCard(index, cardAddedAt(cards[index]));
  };

  return (
    <section className="creator-cards-grid-wrap">
      <div className="creator-cards-grid">
        {cards.map((card, index) => {
          const { title, text } = cardTitleText(card);
          return (
            <article className="creator-card-tile" key={`${cardAddedAt(card)}-${index}`}>
              <button type="button" className="creator-card-tile-preview" onClick={() => setEditIndex(index)} title={t("creator.editCard")}>
                <MiniCard styling={styling} title={title} text={text} />
              </button>
              <span className="creator-card-tile-number">#{index + 1}</span>
              <div className="creator-card-tile-actions">
                <button type="button" title={t("creator.previewRender")} aria-label={t("creator.previewRender")} onClick={() => void openPreview(index)} disabled={busy !== null}>
                  <Eye size={14} />
                </button>
                <button type="button" title={t("creator.editCard")} aria-label={t("creator.editCard")} onClick={() => setEditIndex(index)}>
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className={deleteArmedIndex === index ? "is-danger" : ""}
                  title={deleteArmedIndex === index ? t("creator.confirmDeleteCard") : t("creator.deleteCard")}
                  aria-label={t("creator.deleteCard")}
                  onClick={() => void removeCard(index)}
                  disabled={busy === "delete-card"}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {editIndex !== null && cards[editIndex] && (
        <EditCardModal
          key={editIndex}
          index={editIndex}
          card={cards[editIndex]}
          limits={limits}
          styling={styling}
          busy={busy}
          onClose={() => setEditIndex(null)}
          onSave={async (payload) => {
            const ok = await ops.updateCard(editIndex, payload);
            if (ok) setEditIndex(null);
          }}
        />
      )}

      {preview && (
        <div className="creator-modal" role="dialog" aria-label={t("creator.previewRender")} onClick={() => setPreview(null)}>
          <div className="creator-modal-box is-preview" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>{t("creator.previewOfCard", { n: preview.index + 1, name: String(pack.name ?? "") })}</strong>
              <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={() => setPreview(null)} aria-label={t("creator.close")}>
                <X size={16} />
              </button>
            </header>
            {preview.url ? (
              <img className="creator-preview-image" src={preview.url} alt="" />
            ) : (
              <div className="creator-preview-loading">
                <Loader2 className="animate-spin" size={22} />
                {t("creator.previewRendering")}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function EditCardModal({
  index,
  card,
  limits,
  styling,
  busy,
  onClose,
  onSave,
}: {
  index: number;
  card: CreatorRecord;
  limits: CardLimits;
  styling: MiniCardStyling;
  busy: string | null;
  onClose: () => void;
  onSave: (payload: CreatorRecord) => Promise<void>;
}) {
  const { t } = useT();
  const initial = cardTitleText(card);
  const [title, setTitle] = useState(initial.title);
  const [text, setText] = useState(initial.text);
  const [narration, setNarration] = useState(initial.narration);
  const issues = validateImportedCard({ title, text }, limits);

  const save = () => {
    void onSave({
      values: { title: title.trim(), text: text.trim() },
      narration: narration.trim(),
    });
  };

  return (
    <div className="creator-modal" role="dialog" aria-label={t("creator.editCard")} onClick={onClose}>
      <div className="creator-modal-box is-edit" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{t("creator.editCardTitle", { n: index + 1 })}</strong>
          <button type="button" className="btn btn-ghost btn-xs btn-square" onClick={onClose} aria-label={t("creator.close")}>
            <X size={16} />
          </button>
        </header>
        <div className="creator-edit-layout">
          <div className="creator-edit-fields">
            <label className="form-control">
              <span className="label-text">
                {t("creator.heading")}
                <CharCounter value={title.trim().length} max={limits.titleMax} />
              </span>
              <input className="input input-bordered input-sm" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text">
                {t("creator.body")}
                <CharCounter value={text.trim().length} max={limits.textMax} />
              </span>
              <textarea className="textarea textarea-bordered textarea-sm creator-single-text" value={text} onChange={(event) => setText(event.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text">{t("creator.narrationOptional")}</span>
              <textarea className="textarea textarea-bordered textarea-sm" value={narration} onChange={(event) => setNarration(event.target.value)} placeholder={t("creator.narrationPlaceholder")} />
            </label>
            {issues.length > 0 && (
              <p className="creator-edit-issues">
                <AlertTriangle size={14} />
                {issues.map((issue) => t(issue.key, issue.vars)).join("; ")}
              </p>
            )}
          </div>
          <div className="creator-single-preview">
            <PhoneMiniPreview styling={styling} title={title.trim() || t("creator.previewHeadingFallback")} text={text.trim() || t("creator.previewBodyFallback")} />
          </div>
        </div>
        <footer>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>{t("creator.cancel")}</button>
          <button type="button" className="btn btn-sm btn-primary gap-2" onClick={save} disabled={issues.length > 0 || busy !== null}>
            {busy === "update-card" ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
            {t("creator.saveCard")}
          </button>
        </footer>
      </div>
    </div>
  );
}
