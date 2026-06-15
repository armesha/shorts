import { useEffect, useState, useCallback } from "react";
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
  X,
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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<number | null>(null);
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
      setErrMsg("Вставь JSON карточек");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch (e) {
      setErrMsg("Неверный JSON: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    setUploading(true);
    try {
      const r = await apiClient.uploadPsychCards(parsed);
      setOkMsg(`Добавлено карточек: ${r.added}. Всего в паке: ${r.total}.`);
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
        setErrMsg("Не удалось загрузить");
      }
    } finally {
      setUploading(false);
    }
  }

  async function preview(index: number, card: PsychCard) {
    setPreviewing(index);
    setPreviewUrl(null);
    try {
      const p = await apiClient.generateAnecdote({ deck: "psych", text: JSON.stringify(card) });
      if ((p as { error?: string })?.error || !p?.imageUrl) {
        setErrMsg((p as { error?: string })?.error || "Не удалось отрисовать превью");
        return;
      }
      setPreviewUrl(p.imageUrl);
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Ошибка превью");
    } finally {
      setPreviewing(null);
    }
  }

  async function remove(index: number, card: PsychCard) {
    if (!window.confirm("Удалить эту карточку из пака? Действие необратимо.")) return;
    setDeleting(index);
    setErrMsg(null);
    setOkMsg(null);
    try {
      const r = await apiClient.deletePsychCard(index, card.addedAt);
      setOkMsg(`Карточка удалена. Всего в паке: ${r.total}.`);
      // если удалили последнюю на странице — шагнём назад
      const nextPage = list && list.items.length === 1 && page > 1 ? page - 1 : page;
      await loadList(nextPage);
    } catch (e) {
      setErrMsg(e instanceof ApiError ? e.message : "Не удалось удалить");
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
          <h1 className="text-2xl font-bold">Паки и карточки</h1>
          <p className="text-base-content/60">
            Свои паки из шаблонов редактора + встроенный психо-пак (DE)
          </p>
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
          <Plus size={14} /> Создать пак
        </button>
      </div>

      {/* Контент выбранного кастомного пака */}
      {sel.startsWith("pack:") && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <PackDetail packId={sel.slice(5)} onChanged={reloadPacks} />
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
          <span>
            Бэкенд ещё не знает про этот раздел — нужен перезапуск сервера (новые роуты не подхватываются на
            лету). Форма и инструкция работают, но загрузка/список заработают после рестарта.
          </span>
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
            Как готовить карточки (стандарт формата)
            <span className="text-base-content/40 text-sm font-normal ml-auto">
              {showHelp ? "свернуть" : "развернуть"}
            </span>
          </button>

          {showHelp && schema && (
            <div className="space-y-3 text-sm">
              <p className="text-base-content/70">
                Карточка = JSON-объект. <b>Заголовок ровно {schema.limits.titleLines.max} строки</b> (по ≤{" "}
                {schema.limits.titleLines.maxLineChars} символов), <b>{schema.limits.items.min}–
                {schema.limits.items.max} пунктов</b>, необязательный <code>outro</code> (≤{" "}
                {schema.limits.outroMax}). Поле <code>items</code> зависит от <code>pattern</code>. Загружай
                массив таких объектов — сервер проверит формат и допишет в пак.
              </p>

              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>pattern</th>
                      <th>назначение</th>
                      <th>поля пункта</th>
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
                  {copied ? "Промпт скопирован" : "Скопировать промпт для LLM"}
                </button>
                <button
                  className="btn btn-sm btn-ghost gap-2"
                  onClick={() => setRaw(JSON.stringify(SAMPLE, null, 2))}
                >
                  Вставить пример в форму
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
            <span className="label-text mb-1">Язык / пак</span>
            <select className="select select-bordered select-sm w-64" value="psych" disabled>
              <option value="psych">Психология (DE) — Psychologie</option>
            </select>
          </label>

          <label className="form-control">
            <span className="label-text mb-1">JSON карточек (одна или массив)</span>
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
              Проверить и загрузить
            </button>
            <span className="text-xs text-base-content/50">
              Любая ошибка формата → ничего не загружается, покажем что починить.
            </span>
          </div>
        </div>
      </div>

      {/* Лента недавних карточек */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Недавно загруженные</h2>
            <span className="badge badge-ghost badge-sm">{list?.total ?? 0}</span>
            <label className="label cursor-pointer gap-2 ml-auto">
              <span className="label-text text-xs">только загруженные</span>
              <input
                type="checkbox"
                className="toggle toggle-sm"
                checked={onlyUploaded}
                onChange={(e) => setOnlyUploaded(e.target.checked)}
              />
            </label>
            <button className="btn btn-ghost btn-sm btn-square" onClick={() => loadList(page)} aria-label="Обновить">
              <RefreshCw size={16} className={loadingList ? "animate-spin" : ""} />
            </button>
          </div>

          {list && list.items.length === 0 && (
            <div className="text-sm text-base-content/50 py-6 text-center">
              {onlyUploaded ? "Пока ничего не загружено через эту форму." : "Карточек нет."}
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
                    <li className="text-base-content/40">…ещё {(card.items || []).length - 4}</li>
                  )}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-xs btn-outline gap-1"
                    onClick={() => preview(index, card)}
                    disabled={previewing !== null || deleting !== null}
                  >
                    {previewing === index ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />}
                    Предпросмотр
                  </button>
                  <button
                    className="btn btn-xs btn-ghost gap-1 text-error"
                    onClick={() => remove(index, card)}
                    disabled={deleting !== null || previewing !== null}
                    title="Удалить карточку из пака"
                  >
                    {deleting === index ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                    Удалить
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
                aria-label="Назад"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-base-content/60">
                стр. {page} из {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-square"
                onClick={() => loadList(page + 1)}
                disabled={page >= totalPages || loadingList}
                aria-label="Вперёд"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Модалка превью */}
      {(previewUrl || previewing !== null) && (
        <div className="modal modal-open" role="dialog">
          <div className="modal-box max-w-sm flex flex-col items-center gap-3">
            <button
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              onClick={() => {
                setPreviewUrl(null);
                setPreviewing(null);
              }}
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
            <div
              className="rounded-xl overflow-hidden border border-base-300 bg-base-200"
              style={{ width: 270, height: 480 }}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="preview" width={270} height={480} className="block" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              )}
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => {
              setPreviewUrl(null);
              setPreviewing(null);
            }}
          />
        </div>
      )}
        </>
      )}
    </div>
  );
}
