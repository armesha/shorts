import { useEffect, useState, useCallback } from "react";
import { confirmDialog } from "../lib/confirm";
import {
  LayoutTemplate,
  Upload,
  Loader2,
  Check,
  AlertTriangle,
  Eye,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FileText,
  Plus,
} from "lucide-react";
import {
  apiClient,
  ApiError,
  type PsychSchema,
  type PsychCardList,
  type PsychCard,
  type PsychUploadErrorBody,
  type PackSummary,
} from "../lib/api";
import PackDetail from "../components/PackDetail";
import CreatePackForm from "../components/CreatePackForm";
import { PreviewModal, usePreview } from "../components/PreviewModal";
import { useT } from "../lib/i18n";

// A valid 1-card sample (matches the standard) for the «вставить пример» button.
const SAMPLE: PsychCard[] = [
  {
    pattern: "numbered",
    title_lines: ["3 stille Zeichen", "emotionaler Erschöpfung"],
    items: [
      { lead: "Reizbarkeit", text: "Kleinigkeiten bringen Dich sofort auf die Palme." },
      { lead: "Rückzug", text: "Du sagst Treffen ab, obwohl Du Nähe brauchst." },
      { lead: "Leere", text: "Dinge, die früher Freude machten, lassen Dich kalt." },
    ],
    outro: "Erschöpfung ist kein Versagen — sie ist ein Signal.",
  },
];

// Build a ready-to-paste LLM prompt from the live schema, so it never drifts from validation.
function buildPrompt(schema: PsychSchema): string {
  const fields = schema.patterns
    .map((p) => `   ${p.id}: {${p.itemFields.map((f) => f.key).join(", ")}}`)
    .join("\n");
  const ids = schema.patterns.map((p) => p.id).join(", ");
  const L = schema.limits;
  return [
    `Du bist Content-Designer für psychologische Kurzvideo-Karten (Deutsch, Du-Form).`,
    `Erzeuge 10 Karten zum Thema "<THEMA>" als JSON-Array. Nur gültiges JSON, kein Markdown.`,
    `Jede Karte hat:`,
    `- "pattern": eines von [${ids}]`,
    `- "title_lines": GENAU ${L.titleLines.max} kurze Zeilen, je ≤ ${L.titleLines.maxLineChars} Zeichen`,
    `- "items": ${L.items.min}–${L.items.max} Objekte; Felder je nach pattern:`,
    fields,
    `- "outro": optional, kurzer Schlusssatz ≤ ${L.outroMax} Zeichen`,
    `Variiere die patterns über die Karten. Inhalt psychologisch fundiert, konkret, kein Klischee.`,
  ].join("\n");
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleString("ru-RU") : "");
const itemLine = (it: Record<string, string>) => Object.values(it).filter(Boolean).join(" — ");

export default function Cards() {
  const { t } = useT();
  const preview = usePreview();
  const [schema, setSchema] = useState<PsychSchema | null>(null);
  const [backendDown, setBackendDown] = useState(false);

  // Навигация по пакам: "psych" (встроенная) | "pack:<id>" (кастомный) | "new" (создать)
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [sel, setSel] = useState<string>("psych");
  const reloadPacks = useCallback(() => apiClient.packs().then(setPacks).catch(() => {}), []);

  const [raw, setRaw] = useState("");
  const [uploading, setUploading] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [errList, setErrList] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(true);

  const [list, setList] = useState<PsychCardList | null>(null);
  const [page, setPage] = useState(1);
  const [onlyUploaded, setOnlyUploaded] = useState(true);
  const [loadingList, setLoadingList] = useState(false);

  const [deleting, setDeleting] = useState<number | null>(null);

  const loadList = useCallback(
    async (p: number) => {
      setLoadingList(true);
      try {
        const r = await apiClient.psychCards(p, 12, onlyUploaded);
        setList(r);
        setPage(r.page);
        setBackendDown(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setBackendDown(true);
      } finally {
        setLoadingList(false);
      }
    },
    [onlyUploaded],
  );

  useEffect(() => {
    apiClient
      .psychSchema()
      .then(setSchema)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setBackendDown(true);
      });
  }, []);

  useEffect(() => {
    loadList(1);
  }, [loadList]);

  useEffect(() => {
    reloadPacks();
  }, [reloadPacks]);

  async function submit() {
    setOkMsg(null);
    setErrMsg(null);
    setErrList([]);
    const txt = raw.trim();
    if (!txt) {
      setErrMsg(t("cards.errPasteJson"));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch (e) {
      setErrMsg(t("cards.errInvalidJson") + " " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setUploading(true);
    try {
      const r = await apiClient.uploadPsychCards(parsed);
      setOkMsg(t("cards.uploadOk", { added: r.added, total: r.total }));
      setRaw("");
      setOnlyUploaded(true);
      await loadList(1);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrMsg(e.message);
        const body = e.body as PsychUploadErrorBody | undefined;
        if (body?.errors?.length) {
          setErrList(body.errors.flatMap((x) => x.messages).slice(0, 40));
        }
      } else {
        setErrMsg(t("cards.errUploadFailed"));
      }
    } finally {
      setUploading(false);
    }
  }

  function showPreview(index: number, card: PsychCard) {
    preview.show(index, async () => {
      const p = await apiClient.generateAnecdote({ deck: "psych", text: JSON.stringify(card) });
      if ((p as { error?: string })?.error || !p?.imageUrl) {
        throw new Error((p as { error?: string })?.error || t("cards.errRenderPreview"));
      }
      return p.imageUrl;
    });
  }

  async function remove(index: number, card: PsychCard) {
    if (!(await confirmDialog(t("cards.confirmDelete"), { confirmText: t("common.delete"), danger: true }))) return;
    setDeleting(index);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const r = await apiClient.deletePsychCard(index, card.addedAt);
      setOkMsg(t("cards.deleteOk", { total: r.total }));
      // если удалили последнюю на странице — шагнём назад
      const nextPage = list && list.items.length === 1 && page > 1 ? page - 1 : page;
      await loadList(nextPage);
    } catch (e) {
      setErrMsg(e instanceof ApiError ? e.message : t("cards.errDeleteFailed"));
    } finally {
      setDeleting(null);
    }
  }

  function copyPrompt() {
    if (!schema) return;
    navigator.clipboard.writeText(buildPrompt(schema)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <LayoutTemplate className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t("cards.title")}</h1>
          <p className="text-base-content/60">{t("cards.subtitle")}</p>
        </div>
      </header>

      {/* Навигация по пакам: встроенная Психология (DE) + кастомные паки + создать */}
      <div className="flex flex-wrap gap-2">
        <button
          className={`btn btn-sm ${sel === "psych" ? "btn-primary" : "btn-ghost border border-base-300"}`}
          onClick={() => setSel("psych")}
        >
          🧠 Психология (DE)
        </button>
        {packs.map((p) => (
          <button
            key={p.id}
            className={`btn btn-sm ${sel === `pack:${p.id}` ? "btn-primary" : "btn-ghost border border-base-300"}`}
            onClick={() => setSel(`pack:${p.id}`)}
          >
            {p.name} <span className="badge badge-ghost badge-xs ml-1">{p.cards}</span>
          </button>
        ))}
        <button
          className={`btn btn-sm gap-1 ${sel === "new" ? "btn-primary" : "btn-ghost border border-dashed border-base-300"}`}
          onClick={() => setSel("new")}
        >
          <Plus size={14} /> {t("cards.createPack")}
        </button>
      </div>

      {/* Контент выбранного кастомного пака */}
      {sel.startsWith("pack:") && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <PackDetail
              packId={sel.slice(5)}
              onChanged={reloadPacks}
              onDeleted={() => {
                setSel("psych");
                reloadPacks();
              }}
            />
          </div>
        </div>
      )}
      {sel === "new" && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <CreatePackForm
              onCreated={(p) => {
                reloadPacks();
                setSel(`pack:${p.id}`);
              }}
            />
          </div>
        </div>
      )}

      {/* Встроенный психо-пак (DE) */}
      {sel === "psych" && (
        <>
      {backendDown && (
        <div className="alert alert-warning text-sm">
          <AlertTriangle size={18} />
          <span>{t("cards.backendDown")}</span>
        </div>
      )}

      {/* Инструкция (стандарт формата) */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <button
            className="flex items-center gap-2 text-left font-semibold"
            onClick={() => setShowHelp((v) => !v)}
          >
            <FileText size={18} className="text-primary" />
            {t("cards.helpTitle")}
            <span className="text-base-content/40 text-sm font-normal ml-auto">
              {showHelp ? t("common.collapse") : t("common.expand")}
            </span>
          </button>

          {showHelp && schema && (
            <div className="space-y-3 text-sm">
              <p className="text-base-content/70">
                {t("cards.helpIntroStart")}{" "}
                <b>{t("cards.helpTitleLines", { n: schema.limits.titleLines.max })}</b>{" "}
                {t("cards.helpPerLine", { n: schema.limits.titleLines.maxLineChars })},{" "}
                <b>{t("cards.helpItems", { min: schema.limits.items.min, max: schema.limits.items.max })}</b>,{" "}
                {t("cards.helpOptional")} <code>outro</code> (≤ {schema.limits.outroMax}).{" "}
                {t("cards.helpItemsField1")} <code>items</code> {t("cards.helpItemsField2")} <code>pattern</code>.{" "}
                {t("cards.helpUploadArray")}
              </p>

              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>pattern</th>
                      <th>{t("cards.colPurpose")}</th>
                      <th>{t("cards.colItemFields")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schema.patterns.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code>{p.id}</code>
                        </td>
                        <td className="text-base-content/70">{p.desc}</td>
                        <td>
                          {p.itemFields.map((f) => (
                            <span key={f.key} className="badge badge-ghost badge-sm mr-1">
                              {f.key} ≤{f.max}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <pre className="bg-base-200 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed">
                {JSON.stringify(SAMPLE, null, 2)}
              </pre>

              <div className="flex flex-wrap gap-2">
                <button className="btn btn-sm btn-outline gap-2" onClick={copyPrompt}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? t("cards.promptCopied") : t("cards.copyPrompt")}
                </button>
                <button
                  className="btn btn-sm btn-ghost gap-2"
                  onClick={() => setRaw(JSON.stringify(SAMPLE, null, 2))}
                >
                  {t("cards.insertSample")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Форма загрузки */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <label className="form-control">
            <span className="label-text mb-1">{t("cards.langPackLabel")}</span>
            <select className="select select-bordered select-sm w-64" value="psych" disabled>
              <option value="psych">Психология (DE) — Psychologie</option>
            </select>
          </label>

          <label className="form-control">
            <span className="label-text mb-1">{t("cards.jsonLabel")}</span>
            <textarea
              className="textarea textarea-bordered min-h-48 font-mono text-xs leading-relaxed"
              placeholder='[ { "pattern": "numbered", "title_lines": ["…","…"], "items": [ … ], "outro": "…" } ]'
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>

          {okMsg && (
            <div className="alert alert-success text-sm">
              <Check size={18} />
              <span>{okMsg}</span>
            </div>
          )}
          {errMsg && (
            <div className="alert alert-error text-sm">
              <AlertTriangle size={18} />
              <div>
                <div>{errMsg}</div>
                {errList.length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-xs opacity-90">
                    {errList.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button className="btn btn-primary gap-2" onClick={submit} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
              {t("cards.validateUpload")}
            </button>
            <span className="text-xs text-base-content/50">{t("cards.uploadHint")}</span>
          </div>
        </div>
      </div>

      {/* Лента недавних карточек */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t("cards.recentTitle")}</h2>
            <span className="badge badge-ghost badge-sm">{list?.total ?? 0}</span>
            <label className="label cursor-pointer gap-2 ml-auto">
              <span className="label-text text-xs">{t("cards.onlyUploaded")}</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={onlyUploaded}
                onChange={(e) => setOnlyUploaded(e.target.checked)}
              />
            </label>
            <button className="btn btn-ghost btn-sm btn-square" onClick={() => loadList(page)} aria-label={t("common.refresh")}>
              <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} />
            </button>
          </div>

          {list && list.items.length === 0 && (
            <div className="text-sm text-base-content/50 py-6 text-center">
              {onlyUploaded ? t("cards.emptyUploaded") : t("cards.emptyAll")}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list?.items.map(({ index, card }) => (
              <div key={index} className="border border-base-300 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge badge-primary badge-sm">{card.pattern}</span>
                  <span className="text-xs text-base-content/40 ml-auto">{fmtDate(card.addedAt)}</span>
                </div>
                <div className="font-semibold leading-tight">{(card.title_lines || []).join(" · ")}</div>
                <ul className="text-xs text-base-content/70 space-y-0.5">
                  {(card.items || []).slice(0, 4).map((it, i) => (
                    <li key={i} className="truncate">
                      • {itemLine(it)}
                    </li>
                  ))}
                  {(card.items || []).length > 4 && (
                    <li className="text-base-content/40">{t("cards.moreItems", { n: (card.items || []).length - 4 })}</li>
                  )}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-xs btn-outline gap-1"
                    onClick={() => showPreview(index, card)}
                    disabled={preview.index !== null || deleting !== null}
                  >
                    {preview.index === index ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />}
                    {t("common.preview")}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost gap-1 text-error"
                    onClick={() => remove(index, card)}
                    disabled={deleting !== null || preview.index !== null}
                    title={t("cards.deleteCardTitle")}
                  >
                    {deleting === index ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {list && list.total > list.pageSize && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => loadList(page - 1)}
                disabled={page <= 1 || loadingList}
                aria-label={t("common.back")}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-base-content/60">
                {t("common.page")} {page} {t("common.of")} {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => loadList(page + 1)}
                disabled={page >= totalPages || loadingList}
                aria-label={t("common.forward")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Модалка превью */}
      <PreviewModal open={preview.open} url={preview.url} error={preview.error} onClose={preview.close} />
        </>
      )}
    </div>
  );
}
