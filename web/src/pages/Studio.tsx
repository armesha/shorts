import { useEffect, useState } from "react";
import { Sparkles, Dices, RefreshCw, Wand2, Loader2, Film, Save, Check } from "lucide-react";
import {
  apiClient,
  type Generator,
  type GeneratedPreview,
  type GeneratedVideo,
  type Account,
} from "../lib/api";
import { useDeck } from "../lib/deck";

const bgLabel = (f: string) => f.replace(/\.(jpe?g|png)$/i, "");
const musicLabel = (f: string) => f.split("/").pop()!.replace(/\.\w+$/, "");

export default function Studio() {
  const [gens, setGens] = useState<Generator[]>([]);
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

  useEffect(() => {
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.backgrounds().then(setBgs).catch(() => {});
    apiClient.music().then(setMusicList).catch(() => {});
    apiClient.accounts().then(setAccounts).catch(() => {});
  }, []);

  // Keep the save-target channel matching the selected pack's language (hard language guard).
  useEffect(() => {
    const match = accounts.find((a) => a.lang === deck);
    setChannelId(match ? String(match.id) : "");
  }, [deck, accounts]);

  async function saveToLibrary() {
    if (!preview || !channelId) return;
    setSaving(true);
    setSaved(false);
    try {
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
    } finally {
      setSaving(false);
    }
  }

  async function gen(mode: "new" | "bg" | "edit", bgName?: string) {
    setLoading(true);
    setVideo(null);
    setErr(null);
    try {
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

  const g = gens.find((x) => x.id === deck) ?? gens[0];

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
                        {x.name}
                      </option>
                    ))}
                  </select>
                  {g && (
                    <div className="text-sm text-base-content/60 mt-1">
                      <span className="text-success font-medium">{g.available} свободных</span>
                      {g.used > 0 && <> · {g.used} использовано</>} ·{" "}
                      <span className="badge badge-ghost badge-sm">без ИИ</span>
                    </div>
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

              {g && (
                <div className="border-t border-base-300 pt-3 flex flex-wrap gap-2 items-center">
                  {g.readyPacks.map((p) => (
                    <span key={p.n} className="badge badge-success badge-sm gap-1">
                      {p.name} ✓ ({p.titled})
                    </span>
                  ))}
                  {g.untitledPacks > 0 && (
                    <span className="badge badge-ghost badge-sm">
                      +{g.untitledPacks} паков ({g.untitledTotal.toLocaleString()}) без названия — не используются
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {preview && (
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-3">
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
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="select select-bordered select-sm"
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
                    <audio controls src={`/audio/${music}`} className="h-8" style={{ maxWidth: 200 }} />
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
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  >
                    {accounts.filter((a) => a.lang === deck).length === 0 && (
                      <option value="">нет каналов на этом языке</option>
                    )}
                    {accounts.filter((a) => a.lang === deck).map((a) => (
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
            ) : preview ? (
              <img src={preview.imageUrl} alt="preview" width={288} height={512} className="block" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center text-base-content/40 gap-2 p-6">
                <Sparkles size={32} />
                <span>Нажми «Сгенерировать» — здесь появится превью ролика</span>
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
              шрифт {preview.fontPx}px · фон {bgLabel(preview.bg)}
            </div>
          ) : null}
        </div>
      </div>

      <PsychPreview />
    </div>
  );
}

const PSYCH_PATTERNS = [
  "numbered",
  "numbered_tight",
  "bullet",
  "bullet_color",
  "term",
  "myth",
  "quote",
  "premium",
];

// Standalone preview of the generated German psychology cards (not part of the deck pipeline).
function PsychPreview() {
  const [img, setImg] = useState<string | null>(null);
  const [pat, setPat] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function gen(pattern?: string) {
    setLoading(true);
    try {
      const r = await apiClient.generatePsych(pattern);
      if (r.imageUrl) {
        setImg(r.imageUrl);
        setPat(r.pattern ?? null);
      }
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="card-title text-base">🧠 Психо-карточки (DE) — превью</h2>
            <p className="text-sm text-base-content/60">
              24 пробных карточки · 8 паттернов · «Notizen eines Psychologen»
            </p>
          </div>
          <button className="btn btn-primary btn-sm gap-2" onClick={() => gen()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />} Случайная
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {PSYCH_PATTERNS.map((p) => (
            <button
              key={p}
              className={`btn btn-xs ${pat === p ? "btn-primary" : "btn-outline"}`}
              onClick={() => gen(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
        </div>
        {img && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <img
              src={img}
              alt="psych preview"
              className="rounded-xl border border-base-300 shadow"
              style={{ width: 288, height: 512, objectFit: "cover" }}
            />
            {pat && <span className="text-xs text-base-content/50">паттерн: {pat}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
