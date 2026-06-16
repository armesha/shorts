import { useEffect, useRef, useState } from "react";
import { Loader2, Eye, Trash2, Upload, AlertTriangle, Check, X, Lock, Save } from "lucide-react";
import { apiClient, ApiError, type PackFull, type PackRoleRule } from "../lib/api";
import { confirmDialog } from "../lib/confirm";
import { useAuth } from "../lib/auth";

// Вид одного кастомного пака: правила (из шаблона), добавление JSON-карточек, лента карточек с превью/удалением.
// Редактировать (имя/язык/карточки) может только владелец пака или админ; гранчёному пак выдан лишь для использования.
const valStr = (v: string | string[]) => (Array.isArray(v) ? v.join(" · ") : v);
const LANG_OPTS: { code: string; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "de", label: "Немецкий" },
  { code: "it", label: "Итальянский" },
  { code: "fr", label: "Французский" },
  { code: "en", label: "Английский" },
  { code: "ar", label: "Арабский" },
];
function sampleJson(rules: PackRoleRule[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rules) obj[r.role] = r.list ? ["пункт 1", "пункт 2", "пункт 3"] : "Заголовок";
  return JSON.stringify([obj], null, 2);
}

export default function PackDetail({ packId, onChanged }: { packId: string; onChanged?: () => void }) {
  const { user } = useAuth();
  const [pack, setPack] = useState<PackFull | null>(null);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errList, setErrList] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const previewReq = useRef(0); // invalidates an in-flight preview if the modal is closed mid-load
  const [page, setPage] = useState(1); // client-side pagination of the cards grid (packs can be large)
  const [name, setName] = useState(""); // редактируемое имя (владелец/админ)
  const [lang, setLang] = useState("ru"); // редактируемый язык-тег (владелец/админ)
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);

  const reload = () =>
    apiClient
      .pack(packId)
      .then((p) => { setPack(p); setName(p.name); setLang(p.lang); })
      .catch(() => setPack(null));
  useEffect(() => { setPack(null); setOk(null); setErr(null); setErrList([]); setMetaMsg(null); setPage(1); reload(); /* eslint-disable-next-line */ }, [packId]);

  // Сохранить имя/язык — только если поменялись (отдельные роуты). Доступно владельцу/админу.
  async function saveMeta() {
    if (!pack) return;
    const nm = name.trim();
    if (!nm) { setErr("Имя пака не может быть пустым"); return; }
    setMetaBusy(true); setErr(null); setMetaMsg(null);
    try {
      if (nm !== pack.name) await apiClient.setPackName(packId, nm);
      if (lang !== pack.lang) await apiClient.setPackLang(packId, lang);
      setMetaMsg("Сохранено");
      setTimeout(() => setMetaMsg(null), 1800);
      await reload();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не удалось сохранить");
    } finally {
      setMetaBusy(false);
    }
  }

  async function addCards() {
    setOk(null); setErr(null); setErrList([]);
    const txt = raw.trim();
    if (!txt) { setErr("Вставьте JSON карточек"); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(txt); } catch (e) { setErr("Неверный JSON: " + (e instanceof Error ? e.message : String(e))); return; }
    setBusy(true);
    try {
      const r = await apiClient.addPackCards(packId, parsed);
      setOk(`Добавлено карточек: ${r.added}. Всего: ${r.total}.`);
      setRaw("");
      await reload();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
        const body = e.body as { errors?: { messages: string[] }[] } | undefined;
        if (body?.errors?.length) setErrList(body.errors.flatMap((x) => x.messages).slice(0, 30));
      } else setErr("Не удалось добавить");
    } finally { setBusy(false); }
  }

  async function preview(i: number) {
    const my = ++previewReq.current;
    setPreviewing(i); setPreviewUrl(null);
    try { const r = await apiClient.packPreview(packId, i); if (previewReq.current === my) setPreviewUrl(r.imageUrl); }
    catch (e) { if (previewReq.current === my) setErr(e instanceof ApiError ? e.message : "Не удалось отрисовать"); }
    finally { if (previewReq.current === my) setPreviewing(null); }
  }

  async function delCard(i: number, addedAt: string) {
    if (!(await confirmDialog("Удалить карточку из пака?", { confirmText: "Удалить", danger: true }))) return;
    setDeleting(i); setErr(null);
    try { await apiClient.deletePackCard(packId, i, addedAt); await reload(); onChanged?.(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось удалить"); }
    finally { setDeleting(null); }
  }

  if (!pack) return <div className="text-sm text-base-content/50 py-6 text-center"><Loader2 className="animate-spin inline" size={16} /> загрузка пака…</div>;
  const rules = pack.rules ?? [];
  // Редактировать пак (имя/язык/карточки) может только владелец или админ. Грант → только использование.
  const canEdit = !!user && (user.role === "admin" || pack.userId === user.id);
  const metaDirty = name.trim() !== pack.name || lang !== pack.lang;
  const PER_PAGE = 24;
  const totalPages = Math.max(1, Math.ceil(pack.cards.length / PER_PAGE));
  const pg = Math.min(page, totalPages);
  const start = (pg - 1) * PER_PAGE;
  const shown = pack.cards.slice(start, start + PER_PAGE);

  return (
    <div className="space-y-4">
      {/* Редактирование имени/языка — только владелец/админ. Гранчёному — пометка «только для использования». */}
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2 bg-base-200/40 rounded-lg p-3 border border-base-300">
          <label className="form-control">
            <span className="label-text text-xs mb-1">Название пака</span>
            <input
              className="input input-bordered input-sm w-56"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs mb-1">Язык</span>
            <select
              className="select select-bordered select-sm w-44"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              title="язык пака — должен совпадать с языком канала"
            >
              {LANG_OPTS.map((o) => (
                <option key={o.code} value={o.code}>{o.label} ({o.code.toUpperCase()})</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-sm gap-1" onClick={saveMeta} disabled={metaBusy || !metaDirty || !name.trim()}>
            {metaBusy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Сохранить
          </button>
          {metaMsg && (
            <span className="text-success text-xs inline-flex items-center gap-1"><Check size={13} /> {metaMsg}</span>
          )}
          {user?.role === "admin" && pack.userId !== user.id && (
            <span className="text-[11px] text-warning/90 self-center ml-auto">правите как админ</span>
          )}
        </div>
      ) : (
        <div className="text-xs text-base-content/60 flex items-center gap-1.5 bg-base-200/50 rounded-lg px-3 py-2 border border-base-300">
          <Lock size={13} className="shrink-0" /> Пак выдан вам только для использования — редактировать его (имя, язык, карточки) может владелец.
        </div>
      )}

      <div className="text-xs text-base-content/70">
        Язык: <b>{pack.lang}</b> · карточек: <b>{pack.cards.length}</b> · шаблонов: <b>{pack.templates.length}</b> · формат:{" "}
        {rules.map((r) => (
          <span key={r.role} className="badge badge-ghost badge-sm mr-1">
            {r.role}{r.list ? " (список)" : ""} {r.min}–{r.max}
          </span>
        ))}
      </div>

      {canEdit && (
        <>
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
        </>
      )}
      {ok && <div className="alert alert-success text-sm"><Check size={16} /><span>{ok}</span></div>}
      {err && (
        <div className="alert alert-error text-sm">
          <AlertTriangle size={16} />
          <div>
            <div>{err}</div>
            {errList.length > 0 && <ul className="mt-1 list-disc list-inside text-xs opacity-90">{errList.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map((c, j) => {
          const i = start + j; // исходный индекс в pack.cards — нужен для preview/delete
          return (
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
              {canEdit && (
                <button className="btn btn-xs btn-ghost text-error gap-1" onClick={() => delCard(i, c.addedAt)} disabled={deleting !== null || previewing !== null}>
                  {deleting === i ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />} Удалить
                </button>
              )}
            </div>
          </div>
          );
        })}
        {pack.cards.length === 0 && <div className="text-sm text-base-content/50">В паке пока нет карточек.</div>}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button className="btn btn-xs btn-outline" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>← Назад</button>
          <span className="text-sm text-base-content/60">Стр. {pg} из {totalPages} · всего {pack.cards.length}</span>
          <button className="btn btn-xs btn-outline" disabled={pg >= totalPages} onClick={() => setPage(pg + 1)}>Вперёд →</button>
        </div>
      )}

      {(previewUrl || previewing !== null) && (
        <div className="modal modal-open" role="dialog">
          <div className="modal-box max-w-sm flex flex-col items-center gap-3">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onClick={() => { previewReq.current++; setPreviewUrl(null); setPreviewing(null); }} aria-label="Закрыть"><X size={16} /></button>
            <div className="rounded-xl overflow-hidden border border-base-300 bg-base-200" style={{ width: 270, height: 480 }}>
              {previewUrl ? <img src={previewUrl} alt="preview" width={270} height={480} className="block" /> : <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>}
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => { previewReq.current++; setPreviewUrl(null); setPreviewing(null); }} />
        </div>
      )}
    </div>
  );
}
