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
import { useDeck } from "../lib/deck";
import { useAuth } from "../lib/auth";
import { useGenQueue } from "../lib/genQueue";

const bgLabel = (f: string) => f.replace(/\.(jpe?g|png)$/i, "");
const musicLabel = (f: string) => f.split("/").pop()!.replace(/\.\w+$/, "");

// Russian gloss for foreign deck names, shown in parentheses in the dropdown.
const DECK_RU: Record<string, string> = {
  de: "Немецкие анекдоты",
  it: "Итальянские анекдоты",
  fr: "Французские анекдоты",
  en: "Английские анекдоты",
  "tips-de": "Немецкие лайфхаки",
  psych: "Психология",
  islamic: "Ислам · арабский",
  christian: "Библия · англ.",
  "fact-en": "Интересные факты · видео",
  "quotes-de": "Цитаты политиков · нем.",
};
const deckLabel = (id: string, name: string) => (DECK_RU[id] ? `${name} (${DECK_RU[id]})` : name);

export default function Studio() {
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
  const [channelId, setChannelId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deck, setDeck] = useDeck();
  const [err, setErr] = useState<string | null>(null);
  const { user } = useAuth();
  const roleMax = user?.role === "admin" ? 100 : 50; // потолок «за раз»: админ 100, обычный юзер 50
  const [batchN, setBatchN] = useState(5);
  const q = useGenQueue();

  // Кастомный пак выбран в дропдауне (deck = "pack:<id>") — параллельный путь превью/сборки.
  const isPack = deck.startsWith("pack:");
  const packId = isPack ? deck.slice(5) : "";
  const curPack = packs.find((p) => `pack:${p.id}` === deck);
  const g = gens.find((x) => x.id === deck) ?? gens[0]; // выбранная встроенная дека (остаток/инфо)
  // «За раз» не больше, чем осталось свободных карточек в выбранной деке/паке — для всех (и юзеров, и админов).
  const remaining = isPack ? curPack?.cards ?? 0 : g?.available ?? 0;
  const maxBatch = Math.max(0, Math.min(roleMax, remaining));
  // Сохранять ролик можно ТОЛЬКО в канал, у которого этот пак (встроенный/свой) выбран источником —
  // иначе планировщик его не выложит (постит по точному паку канала) и язык бы не совпал.
  const saveAccounts = accounts.filter((a) => a.lang === deck);

  useEffect(() => {
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.packs().then(setPacks).catch(() => {});
    apiClient.backgrounds().then(setBgs).catch(() => {});
    apiClient.music().then(setMusicList).catch(() => {});
    apiClient.accounts().then(setAccounts).catch(() => {});
  }, []);

  // Сменили деку/пак с меньшим остатком — подожмём «за раз» к новому максимуму, чтоб не превысить.
  useEffect(() => {
    setBatchN((n) => Math.max(1, Math.min(maxBatch || 1, n)));
  }, [maxBatch]);

  // Keep the save-target channel matching the selected pack's language (hard language guard).
  useEffect(() => {
    const match = accounts.find((a) => a.lang === deck);
    setChannelId(match ? String(match.id) : "");
  }, [deck, accounts]);

  async function saveToLibrary() {
    if (!preview || !channelId) return;
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      if (isPack) {
        await apiClient.packBuildVideo(packId, packIdx, { accountId: Number(channelId), music });
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
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить в библиотеку");
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
          setErr(r?.error || "В этом паке пока нет видео");
          return;
        }
        setPreview(null);
        setText("");
        setVideo({ videoUrl: r.videoUrl, bg: "", music: "" } as GeneratedVideo);
        return;
      }
      if (isPack) {
        const n = curPack?.cards ?? 0;
        if (!n) { setErr("В паке нет карточек — добавьте на странице «Паки и карточки»"); return; }
        const idx = Math.floor(Math.random() * n);
        setPackIdx(idx);
        const r = await apiClient.packPreview(packId, idx);
        setPreview({ imageUrl: r.imageUrl, text: "", title: "", bg: "", fontPx: 0 } as GeneratedPreview);
        return;
      }
      const body =
        mode === "new"
          ? { bg: preview?.bg, deck } // new anecdote, keep the currently-chosen background
          : mode === "bg"
            ? { text: preview?.text, title: preview?.title, bg: bgName, deck }
            : { text, title: preview?.title, bg: preview?.bg, deck };
      const p = await apiClient.generateAnecdote(body);
      // Server returns { error } with HTTP 200 when the pack is exhausted — handle it, never crash.
      if ((p as { error?: string })?.error || !p?.text) {
        setErr((p as { error?: string })?.error || "Не удалось сгенерировать ролик");
        return;
      }
      setPreview(p);
      setText(p.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка генерации");
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
        setErr((v as { error?: string })?.error || "Не удалось собрать видео");
        return;
      }
      setVideo(v);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сборки видео");
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <Sparkles className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Студия</h1>
          <p className="text-base-content/60">Генерация и предпросмотр ролика</p>
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
                    title="Пак анекдотов"
                  >
                    {gens.length === 0 && <option value={deck}>Загрузка…</option>}
                    {gens.filter((x) => x.total > 0).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.preFact ? "🎬 " : ""}{deckLabel(x.id, x.name)}
                      </option>
                    ))}
                    {packs.length > 0 && (
                      <optgroup label={user?.role === "admin" ? "Кастомные паки" : "Мои паки"}>
                        {packs.map((p) => (
                          <option key={p.id} value={`pack:${p.id}`}>
                            {p.name} (пак)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {isPack ? (
                    <div className="text-sm text-base-content/60 mt-1">
                      <span className="text-success font-medium">{curPack?.cards ?? 0} карточек</span> ·{" "}
                      <span className="badge badge-ghost badge-sm">пак · {curPack?.templates ?? 0} шаблон.</span>
                    </div>
                  ) : (
                    g && (
                      <div className="text-sm text-base-content/60 mt-1">
                        <span className="text-success font-medium">{g.available} свободных</span>
                        {g.used > 0 && <> · {g.used} использовано</>} ·{" "}
                        <span className="badge badge-ghost badge-sm">{g.preFact ? "🎬 видео-пак" : "без ИИ"}</span>
                      </div>
                    )
                  )}
                </div>
                <button className="btn btn-primary gap-2" onClick={() => gen("new")} disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                  Сгенерировать
                </button>
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() => gen("bg")}
                  disabled={loading || !preview}
                >
                  <Dices size={16} /> Случайный фон
                </button>
                <button
                  className="btn btn-outline btn-sm gap-2"
                  onClick={() => gen("edit")}
                  disabled={loading || !preview}
                >
                  <RefreshCw size={16} /> Обновить с текстом
                </button>
                {bgs.length > 0 && (
                  <select
                    className="select select-bordered select-sm"
                    aria-label="Фон"
                    value={preview?.bg ?? ""}
                    onChange={(e) => gen("bg", e.target.value)}
                    disabled={loading || !preview}
                  >
                    <option value="" disabled>
                      Фон…
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
                      {p.name} ✓ ({p.titled})
                    </span>
                  ))}
                  {g.untitledPacks > 0 && (
                    <span className="badge badge-ghost badge-sm">
                      +{g.untitledPacks} паков ({g.untitledTotal.toLocaleString("ru-RU")}) без названия — не используются
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {preview && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
                {deck !== "psych" && deck !== "islamic" && deck !== "christian" && !isPack ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="label-text">Текст анекдота (можно править)</span>
                      <span
                        className={`badge badge-sm ${
                          (text || "").length >= 250 && (text || "").length <= 480
                            ? "badge-success"
                            : "badge-warning"
                        }`}
                      >
                        {(text || "").length} симв.
                      </span>
                    </div>
                    <textarea
                      className="textarea textarea-bordered min-h-32 leading-relaxed"
                      aria-label="Текст анекдота"
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
                      ? "✨ Карточка из пака готова. «Сгенерировать» — другая случайная; соберите видео или сохраните в канал."
                      : deck === "islamic"
                      ? "🕌 Карточка (аят / хадис / дуа) готова. Соберите видео или сохраните в канал с языком «Ислам»."
                      : deck === "christian"
                        ? "✝️ Карточка (стих из Библии, KJV) готова. Соберите видео или сохраните в канал с языком «Holy Bible · KJV»."
                        : "🧠 Психо-карточка готова. Соберите видео или сохраните в канал с языком «Психология (DE)»."}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="select select-bordered select-sm"
                    aria-label="Музыка"
                    value={music}
                    onChange={(e) => setMusic(e.target.value)}
                  >
                    <option value="">🎲 Музыка: случайная</option>
                    <option value="none">🔇 Без музыки</option>
                    {musicList.map((m) => (
                      <option key={m} value={m}>
                        🎵 {musicLabel(m)}
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
                    Собрать видео (5–6с)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-base-300 pt-3">
                  <span className="text-sm text-base-content/60">Сохранить в канал:</span>
                  <select
                    className="select select-bordered select-sm"
                    aria-label="Канал для сохранения"
                    value={channelId}
                    onChange={(e) => {
                      setChannelId(e.target.value);
                      setSaved(false);
                    }}
                  >
                    {saveAccounts.length === 0 && (
                      <option value="">{isPack ? "нет каналов с этим паком (выберите пак источником канала)" : "нет каналов на этом языке"}</option>
                    )}
                    {saveAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.channelName}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-sm btn-accent gap-2"
                    onClick={saveToLibrary}
                    disabled={saving || !channelId}
                  >
                    {saving ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : saved ? (
                      <Check size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saved ? "Сохранено в библиотеку" : "Сохранить в библиотеку"}
                  </button>
                </div>

                <div className="border-t border-base-300 pt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-base-content/60">Сразу несколько в канал:</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, maxBatch)}
                      className="input input-bordered input-sm w-20"
                      value={batchN}
                      disabled={q.running || maxBatch < 1}
                      onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                      aria-label="Сколько роликов сгенерировать"
                    />
                    <span className="text-xs text-base-content/50">
                      {maxBatch < 1 ? "нет свободных карточек" : `1–${maxBatch} за раз`}
                    </span>
                    {!q.running ? (
                      <button
                        className="btn btn-sm btn-outline gap-1"
                        onClick={() => q.run(channelId, Math.min(batchN, maxBatch))}
                        disabled={!channelId || maxBatch < 1}
                        title="Поставить в очередь генерацию роликов в библиотеку канала"
                      >
                        <Plus size={14} /> Сгенерировать
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-outline btn-error gap-1" onClick={q.cancel}>
                          <Square size={13} /> Стоп
                        </button>
                        <span className="text-xs text-base-content/60 flex items-center gap-1">
                          <Loader2 className="animate-spin" size={12} />
                          в фоне — прогресс в правом нижнем углу
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
          <div className="text-sm text-base-content/50">Превью 9:16</div>
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
                <span className="text-sm">{building ? "Собираю видео…" : "Генерирую…"}</span>
              </div>
            ) : preview ? (
              <img src={preview.imageUrl} alt="preview" width={288} height={512} className="block" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center text-base-content/40 gap-2 p-6">
                <Sparkles size={32} />
                <span>Нажмите «Сгенерировать» — здесь появится превью ролика</span>
              </div>
            )}
          </div>
          {video ? (
            <a href={video.videoUrl} download className="text-xs link link-primary">
              скачать MP4 · фон {bgLabel(video.bg)} · 🎵{" "}
              {video.music === "none" ? "нет" : musicLabel(video.music)}
            </a>
          ) : preview ? (
            <div className="text-xs text-base-content/50 text-center">
              {isPack ? `пак · карточка #${packIdx + 1}` : `шрифт ${preview.fontPx}px · фон ${bgLabel(preview.bg)}`}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
