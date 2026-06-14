import { useEffect, useState } from "react";
import { Layers, Loader2, Eye, Trash2, Upload, AlertTriangle, Check, X } from "lucide-react";
import { apiClient, ApiError, type PackSummary, type PackFull, type PackRoleRule } from "../lib/api";

// Хаб «Мои паки»: список кастомных паков пользователя → выбор → карточки (превью/удаление) +
// добавление карточек JSON с проверкой по правилам шаблона. Создание пака из шаблона — следующий шаг.
const valStr = (v: string | string[]) => (Array.isArray(v) ? v.join(" · ") : v);

function sampleJson(rules: PackRoleRule[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rules) obj[r.role] = r.list ? ["пункт 1", "пункт 2", "пункт 3"] : "Заголовок";
  return JSON.stringify([obj], null, 2);
}

export default function CustomPacks() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [sel, setSel] = useState("");
  const [pack, setPack] = useState<PackFull | null>(null);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errList, setErrList] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadPacks = () => apiClient.packs().then(setPacks).catch(() => setPacks([]));
  useEffect(() => { loadPacks(); }, []);
  useEffect(() => {
    if (!sel) { setPack(null); return; }
    apiClient.pack(sel).then(setPack).catch(() => setPack(null));
  }, [sel]);

  async function addCards() {
    setOk(null); setErr(null); setErrList([]);
    const txt = raw.trim();
    if (!txt) { setErr("Вставь JSON карточек"); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(txt); } catch (e) { setErr("Неверный JSON: " + (e instanceof Error ? e.message : String(e))); return; }
    setBusy(true);
    try {
      const r = await apiClient.addPackCards(sel, parsed);
      setOk(`Добавлено карточек: ${r.added}. Всего: ${r.total}.`);
      setRaw("");
      setPack(await apiClient.pack(sel));
      loadPacks();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
        const body = e.body as { errors?: { messages: string[] }[] } | undefined;
        if (body?.errors?.length) setErrList(body.errors.flatMap((x) => x.messages).slice(0, 30));
      } else setErr("Не удалось добавить");
    } finally { setBusy(false); }
  }

  async function preview(i: number) {
    setPreviewing(i); setPreviewUrl(null);
    try {
      const r = await apiClient.packPreview(sel, i);
      setPreviewUrl(r.imageUrl);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось отрисовать"); }
    finally { setPreviewing(null); }
  }

  async function delCard(i: number, addedAt: string) {
    if (!window.confirm("Удалить карточку из пака?")) return;
    setDeleting(i); setErr(null);
    try {
      await apiClient.deletePackCard(sel, i, addedAt);
      setPack(await apiClient.pack(sel));
      loadPacks();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось удалить"); }
    finally { setDeleting(null); }
  }

  const rules = pack?.rules ?? [];

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          <h2 className="font-semibold">Мои паки</h2>
          <span className="badge badge-ghost badge-sm">{packs?.length ?? 0}</span>
        </div>

        {packs && packs.length === 0 && (
          <div className="text-sm text-base-content/50">
            Пока нет ручных паков. (Создание пака из шаблона редактора — следующий шаг.)
          </div>
        )}

        {packs && packs.length > 0 && (
          <label className="form-control">
            <span className="label-text mb-1">Пак</span>
            <select className="select select-bordered select-sm w-full max-w-md" value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="">— выбери пак —</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.lang} · {p.cards} карт., {p.templates} шаблон.
                </option>
              ))}
            </select>
          </label>
        )}

        {pack && (
          <>
            {/* правила формата (из шаблона) */}
            <div className="text-xs text-base-content/70">
              Формат карточки (из шаблона):{" "}
              {rules.map((r) => (
                <span key={r.role} className="badge badge-ghost badge-sm mr-1">
                  {r.role}{r.list ? " (список)" : ""} {r.min}–{r.max}
                </span>
              ))}
            </div>

            {/* добавление JSON */}
            <label className="form-control">
              <span className="label-text mb-1">Добавить карточки (JSON-массив)</span>
              <textarea
                className="textarea textarea-bordered min-h-32 font-mono text-xs leading-relaxed"
                placeholder={sampleJson(rules)}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <button className="btn btn-primary btn-sm gap-2" onClick={addCards} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                Проверить и добавить
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setRaw(sampleJson(rules))}>Вставить пример</button>
              <span className="text-xs text-base-content/50">Ошибка формата → ничего не добавится.</span>
            </div>
            {ok && <div className="alert alert-success text-sm"><Check size={16} /><span>{ok}</span></div>}
            {err && (
              <div className="alert alert-error text-sm">
                <AlertTriangle size={16} />
                <div>
                  <div>{err}</div>
                  {errList.length > 0 && (
                    <ul className="mt-1 list-disc list-inside text-xs opacity-90">
                      {errList.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {/* карточки пака */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pack.cards.map((c, i) => (
                <div key={i} className="border border-base-300 rounded-xl p-3 space-y-2">
                  {rules.map((r) => (
                    <div key={r.role} className="text-sm">
                      <span className="text-base-content/40 text-xs">{r.role}: </span>
                      <span className="text-base-content/80">{valStr(c.values[r.role] ?? "")}</span>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button className="btn btn-xs btn-outline gap-1" onClick={() => preview(i)} disabled={previewing !== null || deleting !== null}>
                      {previewing === i ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />} Превью
                    </button>
                    <button className="btn btn-xs btn-ghost text-error gap-1" onClick={() => delCard(i, c.addedAt)} disabled={deleting !== null || previewing !== null}>
                      {deleting === i ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />} Удалить
                    </button>
                  </div>
                </div>
              ))}
              {pack.cards.length === 0 && <div className="text-sm text-base-content/50">В паке пока нет карточек.</div>}
            </div>
          </>
        )}
      </div>

      {/* модалка превью */}
      {(previewUrl || previewing !== null) && (
        <div className="modal modal-open" role="dialog">
          <div className="modal-box max-w-sm flex flex-col items-center gap-3">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={() => setPreviewUrl(null)} aria-label="Закрыть">
              <X size={16} />
            </button>
            <div className="rounded-xl overflow-hidden border border-base-300 bg-base-200" style={{ width: 270, height: 480 }}>
              {previewUrl ? (
                <img src={previewUrl} alt="preview" width={270} height={480} className="block" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>
              )}
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setPreviewUrl(null)} />
        </div>
      )}
    </div>
  );
}
