import { useEffect, useState } from "react";
import { Sparkles, Dices, RefreshCw, Wand2, Loader2, Film, Save, Check, Plus, Square } from "lucide-react";
import {
  apiClient,
  type Generator,
  type GeneratedPreview,
  type GeneratedVideo,
  type Account,
  type PackSummary,
} from "../lib/api";
import { useDeck, buildDeckGroups } from "../lib/deck";
import { FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS } from "../lib/deck";
import { useAuth } from "../lib/auth";
import { useGenQueue } from "../lib/genQueue";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { isMainAdmin } from "../lib/authz";
import { isMgsLegacyUser } from "../lib/accountLimits";

const bgLabel = (f: string) => f.replace(/\.(jpe?g|png)$/i, "");
const musicLabel = (f: string) => f.split("/").pop()!.replace(/\.\w+$/, "");

function PackKindBadge({ video, longVideo }: { video: boolean; longVideo?: boolean }) {
  const { t } = useT();
  const label = longVideo ? t("packKind.longVideo") : video ? t("packKind.video") : t("packKind.text");
  return (
    <span className={`badge badge-sm gap-1 ${video ? "badge-primary" : "badge-ghost"}`}>
      <AppIcon name={video ? "video" : "cards"} size={12} />
      {label}
    </span>
  );
}

const packKindLabel = (t: ReturnType<typeof useT>["t"], item: { video?: boolean; longVideo?: boolean }) =>
  item.longVideo ? t("packKind.longVideo") : item.video ? t("packKind.video") : t("packKind.text");

export default function Studio() {
  const { t } = useT();
  const [gens, setGens] = useState<Generator[]>([]);
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [packIdx, setPackIdx] = useState(0);
  const [bgs, setBgs] = useState<string[]>([]);
  const [preview, setPreview] = useState<GeneratedPreview | null>(null);
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [musicList, setMusicList] = useState<string[]>([]);
  const [music, setMusic] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [videoCounts, setVideoCounts] = useState<Record<number, number>>({});
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deck, setDeck] = useDeck();
  const [err, setErr] = useState<string | null>(null);
  const { user } = useAuth();
  const forbiddenSourceIds = isMainAdmin(user) ? FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS : undefined;
  const sourcePacks = forbiddenSourceIds
    ? packs.filter((p) => !forbiddenSourceIds.has(`pack:${p.id}`))
    : packs;
  const [batchN, setBatchN] = useState(5);
  const q = useGenQueue();

  // Кастомный пак выбран в дропдауне (deck = "pack:<id>") — параллельный путь превью/сборки.
  const isPack = deck.startsWith("pack:");
  const packId = isPack ? deck.slice(5) : "";
  const curPack = sourcePacks.find((p) => `pack:${p.id}` === deck);
  const g = gens.find((x) => x.id === deck) ?? gens[0]; // выбранная встроенная дека (остаток/инфо)
  const hasVideoSources = gens.some((x) => x.total > 0 && x.preFact);
  const hasTextSources = gens.some((x) => x.total > 0 && !x.preFact) || sourcePacks.length > 0;
  const showPackKind = hasVideoSources && hasTextSources;
  const selectedIsVideo = !isPack && !!g?.preFact;
  const selectedIsLongVideo = !isPack && !!g?.longVideo;
  // «За раз» не больше, чем осталось СВОБОДНЫХ (неиспользованных) карточек в выбранной деке/паке —
  // для всех (и юзеров, и админов). Для пака берём available (cards − used), не общее число карточек.
  const remaining = isPack ? curPack?.available ?? curPack?.cards ?? 0 : g?.available ?? 0;
  // Сохранять ролик можно ТОЛЬКО в канал, у которого этот пак (встроенный/свой) выбран источником —
  // иначе планировщик его не выложит (постит по точному паку канала) и язык бы не совпал.
  const accountSources = (a: Account) => (a.sourceDecks?.length ? a.sourceDecks : [a.lang]);
  const saveAccounts = accounts.filter((a) => accountSources(a).includes(deck));
  const selectedAccount = accounts.find((a) => String(a.id) === channelId) ?? null;
  const selectedOwnerId = selectedAccount?.userId ?? user?.id ?? null;
  const selectedOwnerUsername = selectedAccount?.ownerUsername ?? user?.username ?? "";
  const selectedOwnerRole = selectedAccount?.ownerRole ?? user?.role ?? "";
  const selectedOwnerIsMgs = isMgsLegacyUser({ id: selectedOwnerId, username: selectedOwnerUsername });
  const roleMax = user?.role === "admin" || selectedOwnerIsMgs ? 100 : 10; // потолок «за раз»: админ/mgs выше, обычный юзер 10
  const selectedLibraryCap = selectedOwnerRole === "admin" || selectedOwnerIsMgs ? null : 50;
  const selectedLibraryUsed = selectedAccount ? videoCounts[selectedAccount.id] ?? 0 : 0;
  const selectedInFlight = q.accountId === Number(channelId) ? Math.max(0, q.total - q.done) : 0;
  const selectedLibraryAvailable =
    selectedLibraryCap == null ? Number.MAX_SAFE_INTEGER : Math.max(0, selectedLibraryCap - selectedLibraryUsed - selectedInFlight);
  const libraryFull = selectedLibraryCap != null && selectedLibraryAvailable <= 0;
  const maxBatch = Math.max(0, Math.min(roleMax, remaining, selectedLibraryAvailable));

  // Единый пикер: встроенные деки + кастомные паки в одном списке, сгруппированы только по языку.
  const deckGroups = buildDeckGroups(gens, sourcePacks, { requireTotal: true, excludeIds: forbiddenSourceIds });

  const reloadVideoCounts = () =>
    apiClient
      .videoCounts()
      .then((res) => setVideoCounts(Object.fromEntries(res.accounts.map((row) => [row.accountId, row.total]))))
      .catch(() => {});

  useEffect(() => {
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.packs().then(setPacks).catch(() => {});
    apiClient.backgrounds().then(setBgs).catch(() => {});
    apiClient.music().then(setMusicList).catch(() => {});
    apiClient.accounts().then(setAccounts).catch(() => {});
    reloadVideoCounts();
  }, []);

  // Сменили деку/пак с меньшим остатком — подожмём «за раз» к новому максимуму, чтоб не превысить.
  useEffect(() => {
    setBatchN((n) => Math.max(1, Math.min(maxBatch || 1, n)));
  }, [maxBatch]);

  // Фоновая генерация завершилась — обновим остатки свободных карточек (дек и паков), чтобы
  // «за раз» сразу показывал актуальное число и нельзя было поставить больше, чем реально осталось.
  useEffect(() => {
    if (!q.completions) return;
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.packs().then(setPacks).catch(() => {});
    reloadVideoCounts();
  }, [q.completions]);

  useEffect(() => {
    if (!forbiddenSourceIds?.has(deck)) return;
    const first = deckGroups[0]?.items[0]?.id;
    if (first) setDeck(first);
  }, [deck, deckGroups, forbiddenSourceIds, setDeck]);

  // Keep the save-target channel matching the selected pack's language (hard language guard).
  useEffect(() => {
    const match = accounts.find((a) => accountSources(a).includes(deck));
    setChannelId(match ? String(match.id) : "");
  }, [deck, accounts]);

  async function saveToLibrary() {
    if (!preview || !channelId) return;
    if (libraryFull && selectedLibraryCap != null) {
      setErr(t("account.libraryLimitReached", { n: selectedLibraryCap }));
      return;
    }
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      if (isPack) {
        await apiClient.packBuildVideo(packId, packIdx, { accountId: Number(channelId), music });
        reloadVideoCounts();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        return;
      }
      await apiClient.saveVideo({
        accountId: Number(channelId),
        text: preview.text,
        title: preview.title,
        bg: preview.bg,
        music,
        deck,
      });
      setSaved(true);
      reloadVideoCounts();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("studio.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function gen(mode: "new" | "bg" | "edit", bgName?: string) {
    setLoading(true);
    setVideo(null);
    setErr(null);
    try {
      // preFact deck (e.g. fact-en): not rendered from text — just play a random PRE-BUILT video.
      const cur = gens.find((x) => x.id === deck);
      if (cur?.preFact) {
        const r = await apiClient.factRandom(deck);
        if (r?.error || !r?.videoUrl) {
          setErr(r?.error || t("studio.noVideosInPack"));
          return;
        }
        setPreview(null);
        setText("");
        setVideo({ videoUrl: r.videoUrl, bg: "", music: "" } as GeneratedVideo);
        return;
      }
      if (isPack) {
        const n = curPack?.cards ?? 0;
        if (!n) { setErr(t("studio.noCardsInPack")); return; }
        const idx = Math.floor(Math.random() * n);
        const r = await apiClient.packPreview(packId, idx);
        setPackIdx(r.index ?? idx);
        setPreview({ imageUrl: r.imageUrl, text: "", title: "", bg: "", fontPx: 0 } as GeneratedPreview);
        return;
      }
      const body =
        mode === "new"
          ? { deck, avoidBg: preview?.bg } // new anecdote + a fresh random background
          : mode === "bg"
            ? { text: preview?.text, title: preview?.title, bg: bgName, avoidBg: bgName ? undefined : preview?.bg, deck }
            : { text, title: preview?.title, bg: preview?.bg, deck };
      const p = await apiClient.generateAnecdote(body);
      // Server returns { error } with HTTP 200 when the pack is exhausted — handle it, never crash.
      if ((p as { error?: string })?.error || !p?.text) {
        setErr((p as { error?: string })?.error || t("studio.genFailed"));
        return;
      }
      setPreview(p);
      setText(p.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("studio.genError"));
    } finally {
      setLoading(false);
    }
  }

  async function buildVideo() {
    if (!preview) return;
    setBuilding(true);
    setErr(null);
    try {
      if (isPack) {
        const v = await apiClient.packBuildVideo(packId, packIdx, { music });
        setVideo({ videoUrl: v.videoUrl, bg: "", music: v.music } as GeneratedVideo);
        return;
      }
      const v = await apiClient.generateAnecdoteVideo({
        text: preview.text,
        title: preview.title,
        bg: preview.bg,
        music,
        deck,
      });
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

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Sparkles className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t("studio.title")}</h1>
          <p className="text-base-content/60">{t("studio.subtitle")}</p>
        </div>
      </header>

      {err && (
        <div className="alert alert-warning text-sm">
          <span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <select
                    className="select select-bordered select-sm font-semibold"
                    value={deck}
                    onChange={(e) => setDeck(e.target.value)}
                    title={t("studio.deckSelectTitle")}
                  >
                    {gens.length === 0 && <option value={deck}>{t("common.loading")}</option>}
                    {deckGroups.map((grp) => (
                      <optgroup key={grp.key} label={grp.title}>
                        {grp.items.map((it) => (
                          <option key={it.id} value={it.id}>
                            {showPackKind ? `[${packKindLabel(t, it)}] ` : ""}
                            {it.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {isPack ? (
                    <div className="text-sm text-base-content/60 mt-1 flex flex-wrap items-center gap-1.5">
                      {showPackKind && <PackKindBadge video={false} />}
                      <span className="text-success font-medium">
                        {t("studio.availableCount", { n: curPack?.available ?? curPack?.cards ?? 0 })}
                      </span>
                      {(curPack?.used ?? 0) > 0 && <> · {t("studio.usedCount", { n: curPack?.used ?? 0 })}</>} ·{" "}
                      <span className="badge badge-ghost badge-sm">{t("studio.packTemplates", { n: curPack?.templates ?? 0 })}</span>
                    </div>
                  ) : (
                    g && (
                      <div className="text-sm text-base-content/60 mt-1 flex flex-wrap items-center gap-1.5">
                        {showPackKind && <PackKindBadge video={selectedIsVideo} longVideo={selectedIsLongVideo} />}
                        <span className="text-success font-medium">{t("studio.availableCount", { n: g.available })}</span>
                        {g.used > 0 && <> · {t("studio.usedCount", { n: g.used })}</>}
                      </div>
                    )
                  )}
                </div>
                <button className="btn btn-primary gap-2" onClick={() => gen("new")} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                  {t("common.generate")}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() => gen("bg")}
                  disabled={loading || !preview}
                >
                  <Dices size={16} /> {t("studio.randomBg")}
                </button>
                <button
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() => gen("edit")}
                  disabled={loading || !preview}
                >
                  <RefreshCw size={16} /> {t("studio.refreshWithText")}
                </button>
                {bgs.length > 0 && (
                  <select
                    className="select select-bordered select-sm"
                    aria-label={t("studio.bgLabel")}
                    value={preview?.bg ?? ""}
                    onChange={(e) => gen("bg", e.target.value)}
                    disabled={loading || !preview}
                  >
                    <option value="" disabled>
                      {t("studio.bgPlaceholder")}
                    </option>
                    {bgs.map((b) => (
                      <option key={b} value={b}>
                        {bgLabel(b)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!isPack && g && (
                <div className="border-t border-base-300 pt-3 flex flex-wrap gap-2 items-center">
                  {g.readyPacks.map((p) => (
                    <span key={p.n} className="badge badge-success badge-sm gap-1">
                      <AppIcon name="check" size={12} />
                      {p.name} ({p.titled})
                    </span>
                  ))}
                  {g.untitledPacks > 0 && (
                    <span className="badge badge-ghost badge-sm">
                      {t("studio.untitledPacks", { n: g.untitledPacks, total: g.untitledTotal.toLocaleString("ru-RU") })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {preview && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
                {deck !== "psych" && deck !== "islamic" && deck !== "christian" && !deck.startsWith("memes-") && !isPack ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="label-text">{t("studio.anecdoteTextEditable")}</span>
                      <span
                        className={`badge badge-sm ${
                          (text || "").length >= 250 && (text || "").length <= 480
                            ? "badge-success"
                            : "badge-warning"
                        }`}
                      >
                        {t("studio.charsCount", { n: (text || "").length })}
                      </span>
                    </div>
                    <textarea
                      className="textarea textarea-bordered min-h-32 leading-relaxed"
                      aria-label={t("studio.anecdoteText")}
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setSaved(false);
                      }}
                    />
                  </>
                ) : (
                  <div className="text-sm text-base-content/60">
                    {isPack
                      ? t("studio.hintPack")
                      : deck === "islamic"
                      ? t("studio.hintIslamic")
                      : deck === "christian"
                        ? t("studio.hintChristian")
                        : deck.startsWith("memes-")
                          ? t("studio.hintMeme")
                          : t("studio.hintPsych")}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="select select-bordered select-sm"
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
                  {music && music !== "none" && (
                    <audio controls src={`/audio/${music}`} className="max-w-[200px]" />
                  )}
                  <button
                    className="btn btn-secondary gap-2 ml-auto"
                    onClick={buildVideo}
                    disabled={building}
                  >
                    {building ? <Loader2 className="animate-spin" size={18} /> : <Film size={18} />}
                    {t("studio.buildVideo")}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,22rem)_auto] items-start gap-2 border-t border-base-300 pt-3">
                  <span className="text-sm text-base-content/60 leading-8 whitespace-nowrap">{t("studio.saveToChannel")}</span>
                  <div className="min-w-0 w-full">
                    <select
                      className="select select-bordered select-sm w-full min-w-0 truncate"
                      aria-label={t("studio.channelToSave")}
                      value={channelId}
                      onChange={(e) => {
                        setChannelId(e.target.value);
                        setSaved(false);
                      }}
                    >
                      {saveAccounts.length === 0 && (
                        <option value="">{isPack ? t("studio.noChannelsWithPack") : t("studio.noChannelsForLang")}</option>
                      )}
                      {saveAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.channelName}
                        </option>
                      ))}
                    </select>
                    {saveAccounts.length === 0 && isPack && (
                      <div className="mt-1 text-xs text-base-content/50 leading-snug">
                        {t("studio.noChannelsWithPackHint")}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-sm btn-accent gap-2 justify-self-start"
                    onClick={saveToLibrary}
                    disabled={saving || !channelId || libraryFull}
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : saved ? (
                      <Check size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saved ? t("studio.savedToLibrary") : t("studio.saveToLibrary")}
                  </button>
                </div>

                <div className="border-t border-base-300 pt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-base-content/60">{t("studio.batchToChannel")}</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, maxBatch)}
                      className="input input-bordered input-sm w-20"
                      value={batchN}
                      disabled={maxBatch < 1}
                      onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                      aria-label={t("studio.batchCountLabel")}
                    />
                    <span className="text-xs text-base-content/50">
                      {libraryFull && selectedLibraryCap != null
                        ? t("account.libraryLimitReached", { n: selectedLibraryCap })
                        : maxBatch < 1
                          ? t("studio.noFreeCards")
                          : t("studio.batchRange", { n: maxBatch })}
                    </span>
                    <button
                      className="btn btn-sm btn-outline gap-1"
                      onClick={() => q.run(channelId, Math.min(batchN, maxBatch), [deck])}
                      disabled={!channelId || maxBatch < 1 || libraryFull}
                      title={t("studio.batchQueueTitle")}
                    >
                      <Plus size={14} /> {t("common.generate")}
                    </button>
                    {q.running && (
                      <>
                        <button className="btn btn-sm btn-outline btn-error gap-1" onClick={() => void q.cancel()} disabled={q.canceling}>
                          {q.canceling ? <Loader2 className="animate-spin" size={13} /> : <Square size={13} />}
                          {q.canceling ? t("account.cancelingQueue") : t("account.cancelQueue")}
                        </button>
                        <span className="text-xs text-base-content/60 flex items-center gap-1">
                          <Loader2 className="animate-spin" size={12} />
                          {t("studio.runningInBackground")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-sm text-base-content/50">{t("studio.preview916")}</div>
          <div
            className="rounded-2xl overflow-hidden border border-base-300 shadow-lg bg-base-100"
            style={{ width: 288, height: 512 }}
          >
            {video ? (
              <video
                src={video.videoUrl}
                width={288}
                height={512}
                className="block w-full h-full object-cover"
                controls
                autoPlay
                loop
                muted
              />
            ) : loading || building ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-base-content/50">
                <Loader2 className="animate-spin text-primary" size={32} />
                <span className="text-sm">{building ? t("studio.buildingVideo") : t("studio.generating")}</span>
              </div>
            ) : preview ? (
              <img src={preview.imageUrl} alt={t("studio.preview")} width={288} height={512} className="block" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center text-base-content/40 gap-2 p-6">
                <Sparkles size={32} />
                <span>{t("studio.emptyState")}</span>
              </div>
            )}
          </div>
          {video ? (
            <a href={video.videoUrl} download className="text-xs link link-primary">
              {t("studio.downloadMp4", {
                bg: bgLabel(video.bg),
                music: video.music === "none" ? t("studio.musicNoneShort") : musicLabel(video.music),
              })}
            </a>
          ) : preview ? (
            <div className="text-xs text-base-content/50 text-center">
              {isPack
                ? t("studio.packCardMeta", { n: packIdx + 1 })
                : t("studio.fontBgMeta", { font: preview.fontPx, bg: bgLabel(preview.bg) })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
