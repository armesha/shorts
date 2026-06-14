import { useState } from "react";
import { Loader2, Plus, ExternalLink, AlertTriangle } from "lucide-react";
import { apiClient, ApiError, type PackSummary } from "../lib/api";

// Создание кастомного пака: имя + язык + JSON шаблона из редактора (/editor → Экспорт → вставить).
export default function CreatePackForm({ onCreated }: { onCreated: (p: PackSummary) => void }) {
  const [name, setName] = useState("");
  const [lang, setLang] = useState("de");
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    if (!name.trim()) { setErr("Введи имя пака"); return; }
    let templates: unknown[] = [];
    if (tpl.trim()) {
      try { const p = JSON.parse(tpl); templates = Array.isArray(p) ? p : [p]; }
      catch (e) { setErr("Шаблон: неверный JSON — " + (e instanceof Error ? e.message : String(e))); return; }
    }
    setBusy(true);
    try {
      const p = await apiClient.createPack(name.trim(), lang.trim() || "ru", templates);
      setName(""); setTpl("");
      onCreated(p);
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Не удалось создать пак"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-base-content/70">
        Новый ручной пак. Шаблон рисуешь в редакторе, экспортируешь JSON и вставляешь сюда.
        По умолчанию пак виден только тебе (админу) — доступ другим выдаёшь в матрице Админки.
      </p>
      <div className="flex flex-wrap gap-2">
        <input className="input input-bordered input-sm flex-1 min-w-48" placeholder="Имя пака" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input input-bordered input-sm w-24" placeholder="язык" value={lang} onChange={(e) => setLang(e.target.value)} title="язык пака (de, ru, en…)" />
      </div>
      <label className="form-control">
        <span className="label-text text-xs mb-1 flex items-center gap-2">
          Шаблон(ы) — JSON из редактора
          <a href="/editor" target="_blank" rel="noreferrer" className="link link-primary inline-flex items-center gap-1">
            <ExternalLink size={12} /> открыть редактор
          </a>
        </span>
        <textarea
          className="textarea textarea-bordered min-h-28 font-mono text-xs"
          placeholder="Нарисуй шаблон в /editor → Экспорт → вставь JSON (один объект или массив для нескольких цветовых вариантов)"
          value={tpl}
          onChange={(e) => setTpl(e.target.value)}
        />
      </label>
      {err && <div className="alert alert-error text-sm"><AlertTriangle size={16} /><span>{err}</span></div>}
      <button className="btn btn-primary btn-sm gap-2" onClick={create} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
        Создать пак
      </button>
    </div>
  );
}
