import { useEffect, useState } from "react";
import { Film, AlertTriangle, Loader2, Mic, Send, Check } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";

// Admin-only gallery of montage Shorts, grouped into themed PACKS. Reads a manifest (written live by
// temp/clip-demo/buildpack.mjs) and lets admin push any montage straight into a channel's library
// (POST /api/clip-demos/save) so the scheduler auto-posts it.
const V = "6"; // bump to bust browser/Cloudflare cache on every clip change

type Item = { id: string; title: string; theme?: string; voice?: string; dur?: string };
type Pack = { id: string; title: string; lang?: string; items: Item[] };
type Account = { id: number; name?: string; lang?: string };

const SRC = (id: string) => `/files/admin-demos/${id}.mp4?v=${V}`;
const POSTER = (id: string) => `/files/admin-demos/${id}.jpg?v=${V}`;
const shortVoice = (v?: string) => (v || "").replace(/^[a-z]{2}-[A-Z]{2}-/, "").replace(/Multilingual/, "").replace(/Neural$/, "");
type T = (k: string) => string;

function Card({ d, t, target, saving, saved, onSave }: { d: Item; t: T; target: number | ""; saving: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <figure className="bg-black">
        <video controls preload="none" poster={POSTER(d.id)} className="w-full max-h-[70vh] aspect-[9/16] object-contain bg-black">
          <source src={SRC(d.id)} type="video/mp4" />
        </video>
      </figure>
      <div className="card-body p-4 gap-2">
        <h2 className="card-title text-base leading-snug">{d.title}</h2>
        <div className="flex flex-wrap gap-1.5">
          {d.dur && <span className="badge badge-primary badge-sm">{d.dur}</span>}
          {d.voice && <span className="badge badge-ghost badge-sm">🎙 {shortVoice(d.voice)}</span>}
          <a href={SRC(d.id)} download className="badge badge-ghost badge-sm hover:badge-primary">⬇ mp4</a>
        </div>
        <button className="btn btn-sm btn-outline btn-primary mt-1" disabled={!target || saving || saved} onClick={onSave}>
          {saved ? <><Check size={14} /> {t("clipdemos.saved")}</> : saving ? <><Loader2 size={14} className="animate-spin" /> …</> : <><Send size={14} /> {t("clipdemos.saveToChannel")}</>}
        </button>
      </div>
    </div>
  );
}

export default function ClipDemos() {
  const { user } = useAuth();
  const { t } = useT();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [err, setErr] = useState(false);
  const [channels, setChannels] = useState<Account[]>([]);
  const [target, setTarget] = useState<number | "">("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  // Poll the manifest so the gallery fills in real-time as the pack builder produces videos.
  useEffect(() => {
    if (user?.role !== "admin") return;
    let stop = false, got = false;
    const load = () =>
      fetch(`/files/admin-demos/manifest.json?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no manifest"))))
        .then((d) => { if (!stop) { got = true; setPacks(d.packs || []); setErr(false); } })
        .catch(() => { if (!stop && !got) setErr(true); });
    load();
    const id = setInterval(load, 7000);
    return () => { stop = true; clearInterval(id); };
  }, [user]);

  // Load the admin's channels (save targets).
  useEffect(() => {
    if (user?.role !== "admin") return;
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((a) => { const list: Account[] = Array.isArray(a) ? a : (a.accounts || []); setChannels(list); if (list[0]) setTarget(list[0].id); })
      .catch(() => {});
  }, [user]);

  const save = async (d: Item) => {
    if (!target) return;
    setSavingId(d.id);
    try {
      const r = await fetch("/api/clip-demos/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: target, clipId: d.id, title: d.title, description: "" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "fail");
      setSaved((s) => ({ ...s, [d.id]: true }));
    } catch (e) {
      alert(`${t("clipdemos.saveFail")} ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSavingId(null);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="alert alert-warning max-w-xl">
        <AlertTriangle size={18} />
        <span>{t("users.adminOnly")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Film size={24} className="text-primary" />
          {t("clipdemos.title")}
        </h1>
        <p className="text-base-content/60">{t("clipdemos.subtitle")}</p>
      </header>

      <div className="flex items-center gap-2 flex-wrap bg-base-100 border border-base-300 rounded-box p-3">
        <span className="text-sm font-medium">{t("clipdemos.targetChannel")}:</span>
        {channels.length ? (
          <select className="select select-bordered select-sm" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name || `#${c.id}`}{c.lang ? ` (${c.lang})` : ""}</option>)}
          </select>
        ) : (
          <span className="text-sm text-base-content/50">{t("clipdemos.noChannels")}</span>
        )}
        <span className="text-xs text-base-content/40">{t("clipdemos.saveHint")}</span>
      </div>

      {err && <div className="alert alert-warning"><AlertTriangle size={18} /><span>{t("clipdemos.loadFail")}</span></div>}
      {!packs && !err && <div className="flex items-center gap-2 text-base-content/60"><Loader2 className="animate-spin" size={18} />{t("clipdemos.loading")}</div>}
      {packs && !packs.length && <div className="alert"><span>{t("clipdemos.empty")}</span></div>}

      {packs?.map((pack) => (
        <section key={pack.id} className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mic size={18} className="text-primary" />
            {pack.title}
            <span className="badge badge-neutral badge-sm">{pack.items.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pack.items.map((d) => (
              <Card key={d.id} d={d} t={t} target={target} saving={savingId === d.id} saved={!!saved[d.id]} onSave={() => save(d)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
