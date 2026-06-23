import { useEffect, useState } from "react";
import { Download, Film, Loader2, Eye, Trash2, Upload, AlertTriangle, Check, Lock, Save, Music2 } from "lucide-react";
import {
  apiClient,
  ApiError,
  type MusicTrack,
  type PackFull,
  type PackMusic,
  type PackMusicUploadFile,
  type PackRoleRule,
} from "../lib/api";
import { confirmDialog } from "../lib/confirm";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { CONTENT_LANGS } from "../lib/deck";
import { PreviewModal, usePreview } from "./PreviewModal";

// Вид одного кастомного пака: правила (из шаблона), добавление JSON-карточек, лента карточек с превью/удалением.
// Редактировать (имя/язык/карточки) может только владелец пака или админ; гранчёному пак выдан лишь для использования.
const valStr = (v: string | string[]) => (Array.isArray(v) ? v.join(" · ") : v);
const fileLabel = (f: string) => f.split("/").pop()!.replace(/\.\w+$/, "").replace(/[-_]+/g, " ");
const fmtBytes = (n: number) => {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
};

function readMusicFile(file: File): Promise<PackMusicUploadFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Не удалось прочитать файл"));
        return;
      }
      resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  });
}

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
  const [musicData, setMusicData] = useState<PackMusic | null>(null);
  const [music, setMusic] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicMsg, setMusicMsg] = useState<string | null>(null);
  const [buildingVideo, setBuildingVideo] = useState<number | null>(null);
  const [builtVideo, setBuiltVideo] = useState<{ index: number; videoUrl: string; music: string } | null>(null);

  const reload = () =>
    apiClient
      .pack(packId)
      .then((p) => { setPack(p); setName(p.name); setLang(p.lang); })
      .catch(() => setPack(null));
  const reloadMusic = () =>
    apiClient
      .packMusic(packId)
      .then(setMusicData)
      .catch(() => setMusicData(null));
  useEffect(() => {
    setPack(null);
    setOk(null);
    setErr(null);
    setErrList([]);
    setMetaMsg(null);
    setMusicMsg(null);
    setBuiltVideo(null);
    setPage(1);
    reload();
    reloadMusic();
    /* eslint-disable-next-line */
  }, [packId]);

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

  async function uploadMusic(files: FileList | null) {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    setMusicBusy(true);
    setErr(null);
    setMusicMsg(null);
    try {
      const payload = await Promise.all(picked.map(readMusicFile));
      const r = await apiClient.uploadPackMusic(packId, payload);
      setMusicData((cur) => (cur ? { ...cur, custom: r.tracks } : cur));
      if (r.added[0]) setMusic(r.added[0].id);
      const skipped = r.errors.length ? `, ${r.errors.length} не загружено` : "";
      setMusicMsg(t("packDetail.musicUploaded", { n: r.added.length, skipped }));
      if (r.errors.length) setErr(r.errors.map((x) => `${x.name}: ${x.message}`).join("\n"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t("packDetail.musicUploadFailed"));
    } finally {
      setMusicBusy(false);
    }
  }

  async function removeMusic(track: MusicTrack) {
    if (!(await confirmDialog(t("packDetail.confirmDeleteMusic", { name: track.name }), { confirmText: t("common.delete"), danger: true }))) return;
    setMusicBusy(true);
    setErr(null);
    setMusicMsg(null);
    try {
      const r = await apiClient.deletePackMusic(packId, track.fileName);
      setMusicData((cur) => (cur ? { ...cur, custom: r.tracks } : cur));
      if (music === track.id) setMusic("");
      setMusicMsg(t("packDetail.musicDeleted"));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("packDetail.musicDeleteFailed"));
    } finally {
      setMusicBusy(false);
    }
  }

  async function buildCardVideo(i: number) {
    setBuildingVideo(i);
    setErr(null);
    setBuiltVideo(null);
    try {
      const v = await apiClient.packBuildVideo(packId, i, { music });
      setBuiltVideo({ index: i, videoUrl: v.videoUrl, music: v.music });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("studio.buildError"));
    } finally {
      setBuildingVideo(null);
    }
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
  // Редактировать пак (имя/язык/карточки) может только владелец или главный админ. Грант → только использование.
  const canEdit = !!user && (!!user.isSuperAdmin || pack.owners.includes(user.id));
  const metaDirty = name.trim() !== pack.name || lang !== pack.lang;
  const PER_PAGE = 24;
  const totalPages = Math.max(1, Math.ceil(pack.cards.length / PER_PAGE));
  const pg = Math.min(page, totalPages);
  const start = (pg - 1) * PER_PAGE;
  const shown = pack.cards.slice(start, start + PER_PAGE);
  const builtinMusic = musicData?.builtin ?? [];
  const customMusic = musicData?.custom ?? [];
  const allMusic = [...builtinMusic, ...customMusic];
  const selectedMusic = allMusic.find((track) => track.id === music);
  const musicLabel = (id: string) => {
    if (!id) return t("studio.musicRandom");
    if (id === "none") return t("studio.musicNoneShort");
    return allMusic.find((track) => track.id === id)?.name ?? fileLabel(id);
  };
  const canManageMusic = canEdit && musicData?.canEdit !== false;

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

      <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Music2 size={16} className="text-primary" />
          <span className="font-semibold text-sm">{t("packDetail.musicTitle")}</span>
          {customMusic.length > 0 && <span className="badge badge-ghost badge-sm">{customMusic.length}</span>}
          {canManageMusic && (
            <label className={`btn btn-sm btn-outline gap-1 ml-auto ${musicBusy ? "btn-disabled" : ""}`}>
              {musicBusy ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
              {t("packDetail.uploadMusic")}
              <input
                type="file"
                className="hidden"
                multiple
                accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,audio/opus,.mp3,.m4a,.aac,.wav,.ogg,.opus"
                disabled={musicBusy}
                onChange={(e) => {
                  const files = e.currentTarget.files;
                  e.currentTarget.value = "";
                  void uploadMusic(files);
                }}
              />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="select select-bordered select-sm min-w-56"
            value={music}
            onChange={(e) => setMusic(e.target.value)}
            aria-label={t("studio.musicLabel")}
          >
            <option value="">{t("studio.musicRandom")}</option>
            <option value="none">{t("studio.musicNone")}</option>
            {customMusic.length > 0 && (
              <optgroup label={t("packDetail.customMusic")}>
                {customMusic.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t("packDetail.existingMusic")}>
              {builtinMusic.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </optgroup>
          </select>
          {selectedMusic && music !== "none" && (
            <audio controls src={selectedMusic.url} className="h-9 max-w-[260px]" />
          )}
          {musicMsg && <span className="text-xs text-success inline-flex items-center gap-1"><Check size={13} /> {musicMsg}</span>}
        </div>
        {customMusic.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customMusic.map((track) => (
              <span key={track.id} className="badge badge-ghost gap-1.5 h-auto min-h-7 py-1">
                <span className="max-w-48 truncate" title={track.name}>{track.name}</span>
                {track.bytes > 0 && <span className="text-base-content/40">{fmtBytes(track.bytes)}</span>}
                {canManageMusic && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square text-error min-h-0 h-5 w-5"
                    onClick={() => void removeMusic(track)}
                    disabled={musicBusy}
                    aria-label={t("packDetail.deleteMusic")}
                    title={t("packDetail.deleteMusic")}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
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
            <div className="whitespace-pre-line">{err}</div>
            {errList.length > 0 && <ul className="mt-1 list-disc list-inside text-xs opacity-90">{errList.map((m, i) => <li key={i}>{m}</li>)}</ul>}
          </div>
        </div>
      )}

      {builtVideo && (
        <div className="rounded-lg border border-base-300 bg-base-200/30 p-3 flex flex-wrap items-center gap-3">
          <video controls src={builtVideo.videoUrl} className="w-28 rounded border border-base-300 bg-black" />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("packDetail.videoReady", { n: builtVideo.index + 1 })}</div>
            <div className="text-xs text-base-content/60 truncate">{t("studio.musicLabel")}: {musicLabel(builtVideo.music)}</div>
            <a href={builtVideo.videoUrl} download className="link link-primary text-xs inline-flex items-center gap-1 mt-1">
              <Download size={13} /> {t("common.download")}
            </a>
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
                disabled={preview.index !== null || deleting !== null || buildingVideo !== null}
              >
                {preview.index === i ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />} {t("common.preview")}
              </button>
              <button
                className="btn btn-xs btn-outline gap-1"
                onClick={() => void buildCardVideo(i)}
                disabled={preview.index !== null || deleting !== null || buildingVideo !== null}
                title={t("packDetail.buildVideoTitle")}
              >
                {buildingVideo === i ? <Loader2 className="animate-spin" size={13} /> : <Film size={13} />} {t("packDetail.buildVideo")}
              </button>
              {canEdit && (
                <button className="btn btn-xs btn-ghost text-error gap-1" onClick={() => delCard(i, c.addedAt)} disabled={deleting !== null || preview.index !== null || buildingVideo !== null}>
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
