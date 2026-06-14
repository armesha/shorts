import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Check, Plus, Upload, Loader2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { apiClient, type Account, type VideoItem, type Generator } from "../lib/api";
import { useAuth } from "../lib/auth";

const LANGS: [string, string][] = [
  ["de", "Немецкий"],
  ["ru", "Русский"],
  ["it", "Итальянский"],
  ["fr", "Французский"],
  ["en", "Английский"],
  ["tips", "Народные лайфхаки"],
  ["tips-de", "Немецкие лайфхаки"],
  ["psych", "Психология (DE)"],
];

// Evenly distribute N uploads across the day (e.g. 4 → 00:00, 06:00, 12:00, 18:00).
const evenTimes = (n: number) =>
  Array.from({ length: n }, (_, i) => `${String(Math.round((i * 24) / n) % 24).padStart(2, "0")}:00`);

export default function AccountDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justConnected = params.get("connected") === "1";
  const [account, setAccount] = useState<Account | null>(null);
  const [channelName, setChannelName] = useState("");
  const [theme, setTheme] = useState("");
  const [lang, setLang] = useState("de");
  const [times, setTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("12:00");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [sort, setSort] = useState<"date" | "title" | "posts">("date");
  const [posting, setPosting] = useState<number | null>(null);
  const [slotVideos, setSlotVideos] = useState<Record<string, number>>({});
  const [lastPosted, setLastPosted] = useState<{ title: string; url: string } | null>(null);
  const [preview, setPreview] = useState<VideoItem | null>(null);
  const [batching, setBatching] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(1);
  const [gens, setGens] = useState<Generator[]>([]);

  const reloadVideos = () => apiClient.videos(id!).then(setVideos).catch(() => {});

  useEffect(() => {
    apiClient
      .account(id!)
      .then((a) => {
        setAccount(a);
        setChannelName(a.channelName);
        setTheme(a.theme);
        setLang(a.lang);
        setTimes(a.schedule);
        setSlotVideos(a.slotVideos || {});
      })
      .catch(() => {});
    reloadVideos();
    apiClient.generators().then(setGens).catch(() => {});
  }, [id]);

  // Сброс на первую страницу при смене сортировки.
  useEffect(() => {
    setPage(1);
  }, [sort]);

  // Escape закрывает модалку превью (клавиатурная доступность).
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await apiClient.updateAccount(id!, {
        channelName,
        theme,
        lang,
        schedule: times,
        slotVideos,
      });
      setAccount(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("Не удалось сохранить настройки канала: " + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Удалить этот канал?")) return;
    await apiClient.deleteAccount(id!);
    navigate("/accounts");
  }

  async function connect() {
    const { url } = await apiClient.youtubeAuthUrl(id!);
    window.location.href = url;
  }

  async function postNow(vid: number) {
    setPosting(vid);
    try {
      const v = videos.find((x) => x.id === vid);
      const r = await apiClient.postVideoNow(vid);
      if (r.url) setLastPosted({ title: v?.title ?? "Ролик", url: r.url });
      await reloadVideos(); // posted video is removed server-side → disappears from the list
    } catch (e) {
      alert("Не удалось выложить: " + String(e));
    } finally {
      setPosting(null);
    }
  }

  // Сгенерировать сразу N роликов (случайные неиспользованные анекдоты) в этот канал.
  async function makeBatch(n: number) {
    setBatching(n);
    try {
      const r = await apiClient.batchVideos(Number(id), n);
      await reloadVideos();
      if (r.exhausted)
        alert(`Сделано ${r.made} из ${n} — свободные (неиспользованные) анекдоты закончились.`);
    } catch (e) {
      alert("Не удалось сгенерировать: " + String(e));
    } finally {
      setBatching(null);
    }
  }

  async function removeVid(vid: number) {
    if (!confirm("Удалить ролик из библиотеки?")) return;
    await apiClient.deleteVideo(vid);
    await reloadVideos();
  }

  // Удалить все ролики, которые выкладывались больше одного раза (postCount > 1).
  async function removePosted() {
    const targets = videos.filter((v) => v.postCount > 1);
    if (targets.length === 0) return;
    if (!confirm(`Удалить ${targets.length} ролик(ов), которые выкладывались больше одного раза?`)) return;
    for (const v of targets) await apiClient.deleteVideo(v.id);
    await reloadVideos();
  }

  // Очистить ВСЮ библиотеку канала (например, после смены пака — старый контент больше не подходит).
  async function clearLibrary() {
    if (videos.length === 0) return;
    if (!confirm(`Удалить ВСЕ ${videos.length} ролик(ов) из библиотеки? Это необратимо.`)) return;
    setClearing(true);
    try {
      for (const v of [...videos]) await apiClient.deleteVideo(v.id);
      await reloadVideos();
    } catch (e) {
      alert("Не удалось очистить библиотеку: " + String(e));
    } finally {
      setClearing(false);
    }
  }

  const sortedVideos = [...videos].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : sort === "posts"
        ? a.postCount - b.postCount
        : b.id - a.id,
  );

  const PAGE_SIZE = 8;
  const pageCount = Math.max(1, Math.ceil(sortedVideos.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, page), pageCount);
  const pageVideos = sortedVideos.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const postedTwicePlus = videos.filter((v) => v.postCount > 1).length;

  if (!account) return <div className="text-base-content/60">Загрузка…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link to="/accounts" className="btn btn-ghost btn-sm gap-2">
        <ArrowLeft size={16} /> Назад к каналам
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{channelName || "Канал"}</h1>
          <p className="text-base-content/60">Настройки генерации и расписания</p>
        </div>
        {account.status === "connected" ? (
          <span className="badge badge-success">подключён</span>
        ) : (
          <span className="badge badge-warning">нужна авторизация</span>
        )}
      </header>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-5">
          <label className="form-control">
            <span className="label-text mb-1">Название канала</span>
            <input
              className="input input-bordered"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1">Общая тема канала</span>
            <input
              className="input input-bordered"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="напр. Русские анекдоты"
            />
          </label>

          <label className="form-control max-w-xs">
            <span className="label-text mb-1">Язык контента</span>
            <select
              className="select select-bordered"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              {LANGS.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="form-control">
            <span className="label-text mb-2">Расписание загрузки (по серверному времени)</span>

            <div className="flex flex-wrap gap-2 mb-3 items-center">
              <span className="text-sm text-base-content/60">Быстро:</span>
              {[1, 2, 3, 4, 6].map((n) => (
                <button
                  key={n}
                  className="btn btn-xs btn-outline"
                  onClick={() => setTimes(evenTimes(n))}
                >
                  {n}× в день
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mb-3 min-h-8 items-center">
              {[...times].sort().map((t) => (
                <span key={t} className="badge badge-primary badge-lg gap-2 py-3">
                  {t}
                  <button
                    className="font-bold hover:text-error"
                    onClick={() => setTimes(times.filter((x) => x !== t))}
                    title="убрать"
                  >
                    ✕
                  </button>
                </span>
              ))}
              {times.length === 0 && (
                <span className="text-sm text-base-content/50">Время не выбрано</span>
              )}
            </div>

            <div className="flex gap-2 items-center">
              <input
                type="time"
                className="input input-bordered input-sm w-32"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <button
                className="btn btn-sm btn-outline gap-1"
                onClick={() => {
                  const t = newTime.trim();
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
                    alert("Введите время в 24-часовом формате — например 09:00 или 14:30");
                    return;
                  }
                  if (!times.includes(t)) setTimes([...times, t]);
                }}
              >
                <Plus size={14} /> Добавить время
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            <button className="btn btn-ghost btn-sm text-error gap-2" onClick={remove}>
              <Trash2 size={16} /> Удалить
            </button>
            <button className="btn btn-primary gap-2" onClick={save} disabled={saving}>
              {saving ? (
                <span className="loading loading-spinner loading-sm" />
              ) : saved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-base">Подключение к YouTube</h2>
          {account.ytChannelTitle ? (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="badge badge-success">подключён</span>
              <span>
                Канал: <b>{account.ytChannelTitle}</b>
              </span>
              {account.ytChannelId && (
                <a
                  href={`https://www.youtube.com/channel/${account.ytChannelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary inline-flex items-center gap-1"
                >
                  ▶ Открыть на YouTube ↗
                </a>
              )}
              <button
                className="btn btn-ghost btn-xs gap-1"
                onClick={connect}
                title="Переподключить через Google — перевыпустить токены (например, после смены client_secret.json)"
              >
                <RefreshCw size={13} /> Переподключить
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/60">
                Чтобы ролики загружались автоматически, авторизуй канал через Google — один раз.
              </p>
              {justConnected && (
                <p className="text-success text-sm">Канал подключён ✓ — обнови страницу.</p>
              )}
              <div>
                <button className="btn btn-primary btn-sm" onClick={connect}>
                  Подключить канал
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="card-title text-base">Библиотека роликов ({videos.length})</h2>
            <div className="flex items-center gap-2">
              {videos.length > 0 && (
                <button
                  className="btn btn-sm btn-error btn-outline gap-1"
                  onClick={clearLibrary}
                  disabled={clearing || batching !== null}
                  title="Удалить все ролики из библиотеки этого канала"
                >
                  {clearing ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                  Очистить всё
                </button>
              )}
              <select
                className="select select-bordered select-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as "date" | "title" | "posts")}
              >
                <option value="date">сначала новые</option>
                <option value="title">по названию</option>
                <option value="posts">по числу выкладок</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-base-300">
            <span className="text-sm text-base-content/70">Пак (= язык канала):</span>
            <select
              className="select select-bordered select-sm"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              title="Из какого пака генерировать ролики. После выбора нажми «Сохранить пак»."
            >
              {LANGS.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            {gens.find((g) => g.id === lang) && (
              <span className="text-xs text-success">
                {gens.find((g) => g.id === lang)!.available} свободных
              </span>
            )}
            {lang !== account.lang && (
              <button className="btn btn-sm btn-primary gap-1" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                Сохранить пак
              </button>
            )}
            {lang !== account.lang && videos.length > 0 && (
              <span className="text-xs text-warning">старые ролики другого пака — очисти библиотеку</span>
            )}
            <span className="text-sm text-base-content/70 ml-1">Сделать сразу:</span>
            {(user?.role === "admin" ? [5, 10, 20] : [1, 5, 10]).map((n) => (
              <button
                key={n}
                className="btn btn-sm btn-outline gap-1"
                onClick={() => makeBatch(n)}
                disabled={batching !== null}
                title={`Сгенерировать ${n} случайных роликов в библиотеку`}
              >
                {batching === n ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                {n}
              </button>
            ))}
            {postedTwicePlus > 0 && (
              <button
                className="btn btn-sm btn-ghost text-error gap-1 ml-auto"
                onClick={removePosted}
                disabled={batching !== null}
                title="Удалить ролики, которые выкладывались больше одного раза"
              >
                <Trash2 size={14} /> вылож. ≥2× ({postedTwicePlus})
              </button>
            )}
          </div>
          {batching !== null && (
            <div className="text-xs text-base-content/60 mt-1 flex items-center gap-1">
              <Loader2 className="animate-spin" size={12} /> Генерирую {batching} роликов… (~
              {batching * 6} сек)
            </div>
          )}
          {lastPosted && (
            <div className="alert alert-success py-2 text-sm mt-2">
              <span>
                ✓ Выложено: <b>{lastPosted.title}</b> —{" "}
                <a href={lastPosted.url} target="_blank" rel="noreferrer" className="link font-medium">
                  {lastPosted.url}
                </a>
              </span>
            </div>
          )}
          {videos.length === 0 ? (
            <div className="text-sm text-base-content/50 py-6 text-center">
              Пусто. Сгенерируй ролик в «Студии» и сохрани в этот канал.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {pageVideos.map((v) => (
                <div key={v.id} className="border border-base-300 rounded-lg p-2 flex flex-col gap-2">
                  <div className="flex gap-3 items-center">
                    <div
                      className="flex gap-3 items-center flex-1 min-w-0 cursor-pointer hover:opacity-80"
                      onClick={() => setPreview(v)}
                      title="Открыть превью"
                    >
                      {v.imageRel && (
                        <img src={`/files/${v.imageRel}`} alt="" className="w-11 h-20 object-cover rounded shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{v.title}</div>
                        <div className="text-xs text-base-content/60 mt-1 flex items-center gap-1 flex-wrap">
                          {v.postCount > 0 ? (
                            <span className="badge badge-success badge-sm">x{v.postCount}</span>
                          ) : (
                            <span className="badge badge-ghost badge-sm">не выкладывался</span>
                          )}
                          {v.lastPostedAt && <span>· {new Date(v.lastPostedAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn btn-xs btn-ghost text-error"
                      onClick={() => removeVid(v.id)}
                      title="Удалить из библиотеки"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn btn-xs btn-primary gap-1"
                      onClick={() => postNow(v.id)}
                      disabled={posting === v.id || account.status !== "connected"}
                      title={account.status !== "connected" ? "Сначала подключи канал" : "Выложить сейчас"}
                    >
                      {posting === v.id ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                      Выложить сейчас
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                className="btn btn-xs btn-outline gap-1"
                disabled={clampedPage <= 1}
                onClick={() => setPage(clampedPage - 1)}
              >
                <ChevronLeft size={14} /> Назад
              </button>
              <span className="text-sm text-base-content/60">
                Стр. {clampedPage} из {pageCount}
              </span>
              <button
                className="btn btn-xs btn-outline gap-1"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage(clampedPage + 1)}
              >
                Вперёд <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </section>

      {preview && (
        <div className="modal modal-open" onClick={() => setPreview(null)}>
          <div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-3">{preview.title}</h3>
            <div className="flex gap-4">
              <video
                src={`/files/${preview.videoRel}`}
                className="w-40 rounded-lg border border-base-300 shrink-0"
                controls
                autoPlay
                loop
                muted
              />
              <div className="flex-1 min-w-0 text-sm space-y-2">
                <p className="whitespace-pre-wrap leading-relaxed">{preview.text}</p>
                <div className="text-xs text-base-content/50">
                  {preview.text.length} симв. · фон {preview.bg || "—"}
                  {preview.music && preview.music !== "none"
                    ? ` · 🎵 ${preview.music.split("/").pop()?.replace(/\.\w+$/, "")}`
                    : " · 🔇 без музыки"}
                </div>
              </div>
            </div>
            <div className="modal-action">
              <a href={`/files/${preview.videoRel}`} download className="btn btn-sm btn-ghost">
                Скачать MP4
              </a>
              <button className="btn btn-sm" onClick={() => setPreview(null)}>
                Закрыть
              </button>
              <button
                className="btn btn-sm btn-primary gap-1"
                disabled={account.status !== "connected" || posting === preview.id}
                onClick={() => {
                  const pid = preview.id;
                  setPreview(null);
                  postNow(pid);
                }}
              >
                <Upload size={14} /> Выложить сейчас
              </button>
            </div>
          </div>
        </div>
      )}

      {times.length > 0 && videos.length > 0 && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-base">Ролик на каждый слот</h2>
            <p className="text-sm text-base-content/60">
              По умолчанию — авто (наименее выкладываемый). Можно закрепить конкретный ролик за временем.
            </p>
            <div className="space-y-2 mt-2">
              {[...times].sort().map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <span className="badge badge-primary badge-lg w-20 justify-center">{t}</span>
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={slotVideos[t] ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSlotVideos((prev) => {
                        const n = { ...prev };
                        if (v) n[t] = v;
                        else delete n[t];
                        return n;
                      });
                    }}
                  >
                    <option value={0}>Авто (наименее выложенный)</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} (x{v.postCount})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-base-content/50 mt-1">Не забудь «Сохранить» в настройках выше.</p>
          </div>
        </section>
      )}
    </div>
  );
}
