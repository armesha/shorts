import { useEffect, useState } from "react";
import { Lightbulb, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { apiClient, type IdeaItem } from "../lib/api";
import { useT } from "../lib/i18n";

function formatDate(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short", hour12: false });
}

export default function Ideas() {
  const { t } = useT();
  const [ideas, setIdeas] = useState<IdeaItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setIdeas(await apiClient.ideas());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ideas.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function addIdea(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const idea = await apiClient.createIdea({ title: title.trim(), description: description.trim() });
      setIdeas((current) => [idea, ...current]);
      setTitle("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function removeIdea(id: number) {
    if (!window.confirm("Удалить эту идею из общего списка?")) return;
    try {
      await apiClient.deleteIdea(id);
      setIdeas((current) => current.filter((idea) => idea.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  }

  return (
    <div className="route-page space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Lightbulb className="text-warning" />{t("ideas.title")}</h1>
          <p className="mt-1 text-base-content/60">{t("ideas.subtitle")}</p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />{t("common.refresh")}
        </button>
      </header>

      <form className="card border border-base-300 bg-base-100" onSubmit={addIdea}>
        <div className="card-body gap-4">
          <h2 className="font-semibold">{t("ideas.addTitle")}</h2>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end">
            <label className="form-control"><span className="label-text mb-1">{t("ideas.titleLabel")}</span><input className="input input-bordered" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("ideas.titlePlaceholder")} /></label>
            <label className="form-control"><span className="label-text mb-1">{t("ideas.descriptionLabel")}</span><input className="input input-bordered" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("ideas.descriptionPlaceholder")} /></label>
            <button className="btn btn-primary gap-2" disabled={saving || !title.trim()}>{saving ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}{t("ideas.add")}</button>
          </div>
        </div>
      </form>

      {error && <div className="alert alert-error"><span>{error}</span></div>}
      {loading ? <div className="flex justify-center py-12"><LoaderCircle className="animate-spin text-primary" /></div> : ideas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-300 py-12 text-center text-base-content/60">{t("ideas.empty")}</div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ideas.map((idea) => <article className="card border border-base-300 bg-base-100 shadow-sm" key={idea.id}>
            <div className="card-body gap-3">
              <div className="flex items-start gap-3"><Lightbulb size={19} className="mt-0.5 shrink-0 text-warning" /><h2 className="font-semibold leading-snug">{idea.title}</h2></div>
              {idea.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-base-content/70">{idea.description}</p>}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-base-200 pt-3 text-xs text-base-content/50">
                <span>{t("ideas.by", { name: idea.authorName || "команда" })}{idea.createdAt ? ` · ${formatDate(idea.createdAt)}` : ""}</span>
                <button className="btn btn-ghost btn-xs btn-square text-error" aria-label={t("ideas.delete")} title={t("ideas.delete")} onClick={() => void removeIdea(idea.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          </article>)}
        </section>
      )}
    </div>
  );
}
