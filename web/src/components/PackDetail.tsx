import { useEffect, useState } from "react";
import { Loader2, Eye, Trash2, Upload, AlertTriangle, Check, Lock, Save } from "lucide-react";
import { apiClient, ApiError, type PackFull, type PackRoleRule } from "../lib/api";
import { confirmDialog } from "../lib/confirm";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { CONTENT_LANGS } from "../lib/deck";
import { PreviewModal, usePreview } from "./PreviewModal";

// Вид одного кастомного пака: правила (из шаблона), добавление JSON-карточек, лента карточек с превью/удалением.
// Редактировать (имя/язык/карточки) может только владелец пака или админ; гранчёному пак выдан лишь для использования.
const valStr = (v: string | string[]) => (Array.isArray(v) ? v.join(" · ") : v);
function sampleJson(rules: PackRoleRule[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rules) obj[r.role] = r.list ? ["пункт 1", "пункт 2", "пункт 3"] : "Заголовок";
  return JSON.stringify([obj], null, 2);
}

export default function PackDetail({ packId, onChanged, onDeleted }: { packId: string; onChanged?: () => void; onDeleted?: () => void }) {
  const { t } = useT();
  const { user } = useAuth();
  const [pack, setPack] = useState<PackFull | null>(null);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [errList, setErrList] = useState<string[]>([]);
  const preview = usePreview();
  const [deleting, setDeleting] = useState<number | null>(null);
  const [page, setPage] = useState(1); // client-side pagination of the cards grid (packs can be large)
  const [name, setName] = useState(""); // редактируемое имя (владелец/админ)
  const [lang, setLang] = useState("ru"); // редактируемый язык-тег (владелец/админ)
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false); // удаление пака целиком (владелец/админ)

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
    if (!nm) { setErr(t("packDetail.nameEmpty")); return; }
    setMetaBusy(true); setErr(null); setMetaMsg(null);
    try {
      if (nm !== pack.name) await apiClient.setPackName(packId, nm);
      if (lang !== pack.lang) await apiClient.setPackLang(packId, lang);
      setMetaMsg(t("common.saved"));
      setTimeout(() => setMetaMsg(null), 1800);
      await reload();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("packDetail.saveFailed"));
    } finally {
      setMetaBusy(false);
    }
  }

  async function addCards() {
    setOk(null); setErr(null); setErrList([]);
    const txt = raw.trim();
    if (!txt) { setErr(t("packDetail.pasteJson")); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(txt); } catch (e) { setErr(t("packDetail.invalidJson") + " " + (e instanceof Error ? e.message : String(e))); return; }
    setBusy(true);
    try {
      const r = await apiClient.addPackCards(packId, parsed);
      setOk(t("packDetail.addedResult", { added: r.added, total: r.total }));
      setRaw("");
      await reload();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
        const body = e.body as { errors?: { messages: string[] }[] } | undefined;
        if (body?.errors?.length) setErrList(body.errors.flatMap((x) => x.messages).slice(0, 30));
      } else setErr(t("packDetail.addFailed"));
    } finally { setBusy(false); }
  }

  async function delCard(i: number, addedAt: string) {
    if (!(await confirmDialog(t("packDetail.confirmDeleteCard"), { confirmText: t("common.delete"), danger: true }))) return;
    setDeleting(i); setErr(null);
    try { await apiClient.deletePackCard(packId, i, addedAt); await reload(); onChanged?.(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : t("packDetail.deleteFailed")); }
    finally { setDeleting(null); }
  }

  // Удалить пак целиком. Право (владелец/админ) совпадает с canEdit; бэкенд гейтит повторно.
  async function removePack() {
    if (!pack) return;
    const msg = pack.cards.length
      ? t("packDetail.confirmDeletePackCards", { name: pack.name, n: pack.cards.length })
      : t("packDetail.confirmDeletePack", { name: pack.name });
    if (!(await confirmDialog(msg, { confirmText: t("packDetail.deletePack"), danger: true }))) return;
    setRemoving(true); setErr(null);
    try { await apiClient.deletePack(packId); onDeleted?.(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : t("packDetail.deletePackFailed")); setRemoving(false); }
  }

  if (!pack) return <div className="text-sm text-base-content/50 py-6 text-center"><Loader2 className="animate-spin inline" size={16} /> {t("packDetail.loadingPack")}</div>;
  const rules = pack.rules ?? [];
  // Редактировать пак (имя/язык/карточки) может только владелец или админ. Грант → только использование.
  const canEdit = !!user && (user.role === "admin" || pack.owners.includes(user.id));
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
            <span className="label-text text-xs mb-1">{t("packDetail.packName")}</span>
            <input
              className="input input-bordered input-sm w-56"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text text-xs mb-1">{t("packDetail.lang")}</span>
            <select
              className="select select-bordered select-sm w-44"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              title={t("packDetail.langHint")}
            >
              {CONTENT_LANGS.map((o) => (
                <option key={o.code} value={o.code}>{o.label} ({o.code.toUpperCase()})</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-sm gap-1" onClick={saveMeta} disabled={metaBusy || !metaDirty || !name.trim()}>
            {metaBusy ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} {t("common.save")}
          </button>
          {metaMsg && (
            <span className="text-success text-xs inline-flex items-center gap-1"><Check size={13} /> {metaMsg}</span>
          )}
          <div className="ml-auto flex items-center gap-2 self-center">
            {user?.role === "admin" && !pack.owners.includes(user.id) && (
              <span className="text-[11px] text-warning/90">{t("packDetail.editingAsAdmin")}</span>
            )}
            <button
              className="btn btn-error btn-outline btn-sm gap-1"
              onClick={removePack}
              disabled={removing || metaBusy}
              title={t("packDetail.deletePackHint")}
            >
              {removing ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />} {t("packDetail.deletePack")}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-base-content/60 flex items-center gap-1.5 bg-base-200/50 rounded-lg px-3 py-2 border border-base-300">
          <Lock size={13} className="shrink-0" /> {t("packDetail.useOnlyNotice")}
        </div>
      )}

      <div className="text-xs text-base-content/70">
        {t("packDetail.lang")}: <b>{pack.lang}</b> · {t("packDetail.cardsLabel")}: <b>{pack.cards.length}</b> · {t("packDetail.templatesLabel")}: <b>{pack.templates.length}</b> · {t("packDetail.formatLabel")}:{" "}
        {rules.map((r) => (
          <span key={r.role} className="badge badge-ghost badge-sm mr-1">
            {r.role}{r.list ? ` ${t("packDetail.listSuffix")}` : ""} {r.min}–{r.max}
          </span>
        ))}
      </div>

      {canEdit && (
        <>
          <label className="form-control">
            <span className="label-text mb-1">{t("packDetail.addCardsLabel")}</span>
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
              {t("packDetail.checkAndAdd")}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setRaw(sampleJson(rules))}>{t("packDetail.insertExample")}</button>
            <span className="text-xs text-base-content/50">{t("packDetail.formatErrorNote")}</span>
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
              <button
                className="btn btn-xs btn-outline gap-1"
                onClick={() => preview.show(i, async () => (await apiClient.packPreview(packId, i)).imageUrl)}
                disabled={preview.index !== null || deleting !== null}
              >
                {preview.index === i ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />} {t("common.preview")}
              </button>
              {canEdit && (
                <button className="btn btn-xs btn-ghost text-error gap-1" onClick={() => delCard(i, c.addedAt)} disabled={deleting !== null || preview.index !== null}>
                  {deleting === i ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />} {t("common.delete")}
                </button>
              )}
            </div>
          </div>
          );
        })}
        {pack.cards.length === 0 && <div className="text-sm text-base-content/50">{t("packDetail.noCards")}</div>}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <button className="btn btn-xs btn-outline" disabled={pg <= 1} onClick={() => setPage(pg - 1)}>← {t("common.back")}</button>
          <span className="text-sm text-base-content/60">{t("common.page")} {pg} {t("common.of")} {totalPages} · {t("packDetail.totalLabel", { n: pack.cards.length })}</span>
          <button className="btn btn-xs btn-outline" disabled={pg >= totalPages} onClick={() => setPage(pg + 1)}>{t("common.forward")} →</button>
        </div>
      )}

      <PreviewModal open={preview.open} url={preview.url} error={preview.error} onClose={preview.close} />
    </div>
  );
}
