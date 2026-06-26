import { useEffect, useMemo, useState } from "react";
import { Images, Loader2, Film, Save, Check } from "lucide-react";
import {
  apiClient,
  type Generator,
  type Account,
  type GeneratedPreview,
  type GeneratedVideo,
} from "../lib/api";
import { CONTENT_LANGS, DECK_LANG, deckLabel, langTag } from "../lib/deck";
import { useT } from "../lib/i18n";

type GCard = { i: number; title: string; caption: string; text: string };
const musicLabel = (f: string) => f.split("/").pop()!.replace(/\.\w+$/, "");
const PAGE_SIZE = 6;

export default function Gallery() {
  const { t } = useT();
  const [gens, setGens] = useState<Generator[]>([]);
  const [deck, setDeck] = useState("");
  const [cards, setCards] = useState<GCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [sel, setSel] = useState<GCard | null>(null);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [building, setBuilding] = useState(false);
  const [music, setMusic] = useState("");
  const [musicList, setMusicList] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const galleryGens = gens.filter((g) => g.gallery && g.total > 0);
  const galleryGroups = useMemo(() => {
    const byLang = new Map<string, Generator[]>();
    for (const gen of galleryGens) {
      const lang = DECK_LANG[gen.id] || "en";
      byLang.set(lang, [...(byLang.get(lang) ?? []), gen]);
    }
    const groups: { code: string; label: string; items: Generator[] }[] = [];
    for (const lang of CONTENT_LANGS) {
      const items = byLang.get(lang.code);
      if (items?.length) groups.push({ code: lang.code, label: lang.label, items });
      byLang.delete(lang.code);
    }
    for (const [code, items] of byLang) {
      if (items.length) groups.push({ code, label: langTag(code), items });
    }
    return groups;
  }, [galleryGens]);

  useEffect(() => {
    apiClient
      .generators()
      .then((g) => {
        setGens(g);
        const first = g.find((x) => x.gallery && x.total > 0);
        if (first) setDeck((d) => d || first.id);
      })
      .catch(() => {});
    apiClient.music().then(setMusicList).catch(() => {});
    apiClient.accounts().then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!deck) return;
    setLoadingCards(true);
    setSel(null);
    setPreview(null);
    setVideo(null);
    setPage(0);
    apiClient
      .galleryCards(deck)
      .then((r) => setCards(r.cards))
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, [deck]);

  const accountSources = (a: Account) => (a.sourceDecks?.length ? a.sourceDecks : [a.lang]);
  const saveAccounts = accounts.filter((a) => accountSources(a).includes(deck));
  useEffect(() => {
    const m = accounts.find((a) => accountSources(a).includes(deck));
    setChannelId(m ? String(m.id) : "");
  }, [deck, accounts]);

  async function pick(c: GCard) {
    setSel(c);
    setVideo(null);
    setSaved(false);
    setErr(null);
    setPreview(null);
    setPreviewing(true);
    try {
      const p = await apiClient.generateAnecdote({ deck, text: c.text, title: c.title });
      if ((p as { error?: string })?.error || !p?.imageUrl) {
        setErr((p as { error?: string })?.error || t("studio.genFailed"));
        return;
      }
      setPreview(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("studio.genError"));
    } finally {
      setPreviewing(false);
    }
  }

  async function build() {
    if (!sel) return;
    setBuilding(true);
    setErr(null);
    try {
      const v = await apiClient.generateAnecdoteVideo({ deck, text: sel.text, title: sel.title, music });
      if ((v as { error?: string })?.error || !v?.videoUrl) {
        setErr((v as { error?: string })?.error || t("studio.buildFailed"));
        return;
      }
      setVideo(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("studio.buildError"));
    } finally {
      setBuilding(false);
    }
  }

  async function save() {
    if (!sel || !channelId) return;
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      await apiClient.saveVideo({ accountId: Number(channelId), text: sel.text, title: sel.title, deck, music });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("studio.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageCards = cards.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Images className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t("gallery.title")}</h1>
          <p className="text-base-content/60">{t("gallery.subtitle")}</p>
        </div>
      </header>

      {err && (
        <div className="alert alert-warning text-sm">
          <span>{err}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="select select-bordered select-sm font-semibold"
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
        >
          {galleryGens.length === 0 && <option value="">{t("common.loading")}</option>}
          {galleryGroups.map((group) => (
            <optgroup key={group.code} label={group.label}>
              {group.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {deckLabel(g.id, g.name)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {deck && <span className="text-sm text-base-content/60">{t("gallery.cardsCount", { n: cards.length })}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Card grid */}
        <div>
          {loadingCards ? (
            <div className="flex items-center justify-center py-20 text-base-content/50">
              <Loader2 className="animate-spin text-primary" size={28} />
            </div>
          ) : cards.length === 0 ? (
            <div className="py-20 text-center text-base-content/40">{t("gallery.empty")}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {pageCards.map((c) => (
                  <button
                    key={c.i}
                    onClick={() => pick(c)}
                    title={c.caption}
                    className={`group relative rounded-xl overflow-hidden border bg-base-100 transition-all ${
                      sel?.i === c.i ? "border-primary ring-2 ring-primary" : "border-base-300 hover:border-primary/50"
                    }`}
                    style={{ aspectRatio: "9 / 16" }}
                  >
                    <img
                      src={`/api/gallery/${deck}/${c.i}/thumb`}
                      alt={c.caption}
                      loading="lazy"
                      className="block w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="mt-5 flex items-center justify-center gap-3">
                  <div className="join">
                    <button className="join-item btn btn-sm" disabled={safePage === 0} onClick={() => setPage(0)} aria-label="«">«</button>
                    <button className="join-item btn btn-sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="‹">‹</button>
                    <span className="join-item btn btn-sm btn-ghost pointer-events-none">
                      {t("gallery.page", { n: safePage + 1, total: totalPages })}
                    </span>
                    <button className="join-item btn btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} aria-label="›">›</button>
                    <button className="join-item btn btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)} aria-label="»">»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Selected card → preview + build + save */}
        <div className="lg:sticky lg:top-20 self-start flex flex-col items-center gap-3">
          <div className="text-sm text-base-content/50">{t("studio.preview916")}</div>
          <div
            className="rounded-2xl overflow-hidden border border-base-300 shadow-lg bg-base-100"
            style={{ width: 270, height: 480 }}
          >
            {video ? (
              <video src={video.videoUrl} width={270} height={480} className="block w-full h-full object-cover" controls autoPlay loop muted />
            ) : previewing || building ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-base-content/50">
                <Loader2 className="animate-spin text-primary" size={30} />
                <span className="text-sm">{building ? t("studio.buildingVideo") : t("studio.generating")}</span>
              </div>
            ) : preview ? (
              <img src={preview.imageUrl} alt={t("studio.preview")} width={270} height={480} className="block" />
            ) : sel ? (
              <img src={`/api/gallery/${deck}/${sel.i}/thumb`} alt="" className="block w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center text-base-content/40 gap-2 p-6">
                <Images size={30} />
                <span className="text-sm">{t("gallery.pickHint")}</span>
              </div>
            )}
          </div>

          {sel && (
            <div className="w-full max-w-[300px] space-y-2">
              <select
                className="select select-bordered select-sm w-full"
                aria-label={t("studio.musicLabel")}
                value={music}
                onChange={(e) => setMusic(e.target.value)}
              >
                <option value="">{t("studio.musicRandom")}</option>
                <option value="none">{t("studio.musicNone")}</option>
                {musicList.map((m) => (
                  <option key={m} value={m}>
                    {musicLabel(m)}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary btn-sm w-full gap-2" onClick={build} disabled={building}>
                {building ? <Loader2 className="animate-spin" size={16} /> : <Film size={16} />}
                {t("studio.buildVideo")}
              </button>

              <div className="border-t border-base-300 pt-2">
                <div className="text-xs text-base-content/60 mb-1">{t("studio.saveToChannel")}</div>
                <select
                  className="select select-bordered select-sm w-full mb-2"
                  aria-label={t("studio.channelToSave")}
                  value={channelId}
                  onChange={(e) => {
                    setChannelId(e.target.value);
                    setSaved(false);
                  }}
                >
                  {saveAccounts.length === 0 && <option value="">{t("studio.noChannelsForLang")}</option>}
                  {saveAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.channelName}
                    </option>
                  ))}
                </select>
                <button className="btn btn-accent btn-sm w-full gap-2" onClick={save} disabled={saving || !channelId}>
                  {saving ? <Loader2 className="animate-spin" size={16} /> : saved ? <Check size={16} /> : <Save size={16} />}
                  {saved ? t("studio.savedToLibrary") : t("studio.saveToLibrary")}
                </button>
              </div>

              {sel.caption && <div className="text-xs text-base-content/60 leading-snug whitespace-pre-line">{sel.caption}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
