import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";

// Admin-only gallery of montage Shorts, grouped into themed PACKS. Reads a manifest (written live by
// temp/clip-demo/buildpack.mjs). Pure viewer — watch and download mp4, no posting.
const V = "6"; // bump to bust browser/Cloudflare cache on every clip change

type Item = { id: string; title: string; theme?: string; voice?: string; dur?: string };
type Pack = { id: string; title: string; lang?: string; items: Item[] };

const SRC = (id: string) => `/files/admin-demos/${id}.mp4?v=${V}`;
const POSTER = (id: string) => `/files/admin-demos/${id}.jpg?v=${V}`;
const shortVoice = (v?: string) => (v || "").replace(/^[a-z]{2}-[A-Z]{2}-/, "").replace(/Multilingual/, "").replace(/Neural$/, "");

function Card({ d }: { d: Item }) {
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
          {d.voice && (
            <span className="badge badge-ghost badge-sm gap-1">
              <AppIcon name="music" size={12} />
              {shortVoice(d.voice)}
            </span>
          )}
          <a href={SRC(d.id)} download className="badge badge-ghost badge-sm gap-1 hover:badge-primary">
            <AppIcon name="external" size={12} />
            mp4
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ClipDemos() {
  const { user } = useAuth();
  const { t } = useT();
  const [packs, setPacks] = useState<Pack[] | null>(null);
  const [err, setErr] = useState(false);

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

  if (user?.role !== "admin") {
    return (
      <div className="alert alert-warning max-w-xl">
        <AppIcon name="warning" size={18} />
        <span>{t("users.adminOnly")}</span>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AppIcon name="clips" size={24} className="text-primary" />
          {t("clipdemos.title")}
        </h1>
        <p className="text-base-content/60">{t("clipdemos.subtitle")}</p>
      </header>

      {err && <div className="alert alert-warning"><AppIcon name="warning" size={18} /><span>{t("clipdemos.loadFail")}</span></div>}
      {!packs && !err && <div className="flex items-center gap-2 text-base-content/60"><span className="loading loading-spinner loading-sm" />{t("clipdemos.loading")}</div>}
      {packs && !packs.length && <div className="alert"><span>{t("clipdemos.empty")}</span></div>}

      {packs?.map((pack) => (
        <section key={pack.id} className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AppIcon name="music" size={18} className="text-primary" />
            {pack.title}
            <span className="badge badge-neutral badge-sm">{pack.items.length}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pack.items.map((d) => (
              <Card key={d.id} d={d} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
