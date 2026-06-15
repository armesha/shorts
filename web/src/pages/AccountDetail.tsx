import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Check, Plus, Upload, Loader2, ChevronLeft, ChevronRight, RefreshCw, Play, Download, X } from "lucide-react";
import { apiClient, type Account, type VideoItem, type Generator, type PackSummary } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import { useAuth } from "../lib/auth";
import { useGenQueue } from "../lib/genQueue";

const LANGS: [string, string][] = [
  ["de", "Немецкий"],
  ["ru", "Русский"],
  ["it", "Итальянский"],
  ["fr", "Французский"],
  ["en", "Английский"],
  ["tips", "Народные лайфхаки"],
  ["tips-de", "Немецкие лайфхаки"],
  ["psych", "Психология (DE)"],
  ["islamic", "Ислам · арабский (Коран и хадисы)"],
  ["christian", "Христианство · Библия (англ., KJV)"],
  ["fact-en", "Интересные факты (видео, EN)"],
  ["quotes-de", "Цитаты политиков (видео, DE)"],
];

// «Язык канала» — стабильный язык (отдельно от выбора контента). Пак должен совпадать по языку.
const LANG_LABELS: [string, string][] = [
  ["ru", "Русский"],
  ["de", "Немецкий"],
  ["it", "Итальянский"],
  ["fr", "Французский"],
  ["en", "Английский"],
  ["ar", "Арабский"],
];
// Язык встроенного пака (для тега и проверки совпадения). Свои паки несут свой lang.
const DECK_LANG: Record<string, string> = {
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
  tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-de": "de",
};
const LANG_TAG: Record<string, string> = { ru: "RU", de: "DE", it: "IT", fr: "FR", en: "EN", ar: "AR" };
const tagOf = (code: string) => LANG_TAG[code] || (code || "").toUpperCase();

// N posts/day spread ~evenly across 24h, but with a small RANDOM per-channel offset + jitter,
// so two channels with the same N never all fire at the same minute. `avoid` = minutes already
// used elsewhere (the user's other channels) — collisions are nudged forward a minute.
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const randomDayTimes = (n: number, avoid: Set<number> = new Set()): string[] => {
  if (n <= 0) return [];
  const interval = 1440 / n;
  const phase = Math.random() * interval; // per-channel random start within the first slot
  const jitter = Math.min(interval * 0.35, 20); // small → intervals stay roughly equal
  const used = new Set<number>();
  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = Math.round(phase + i * interval + (Math.random() * 2 - 1) * jitter);
    m = ((m % 1440) + 1440) % 1440;
    let guard = 0;
    while ((used.has(m) || avoid.has(m)) && guard++ < 120) m = (m + 1) % 1440;
    used.add(m);
    mins.push(m);
  }
  return mins
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
};

export default function AccountDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justConnected = params.get("connected") === "1";
  const connectError = params.get("error");
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
  const maxBatch = user?.role === "admin" ? 100 : 20;
  const [batchN, setBatchN] = useState(5);
  const q = useGenQueue();
  const [clearing, setClearing] = useState(false);
  const [page, setPage] = useState(1);
  const [gens, setGens] = useState<Generator[]>([]);
  const [packs, setPacks] = useState<PackSummary[]>([]); // кастомные паки, доступные юзеру (для дропдауна канала)
  const [channelLang, setChannelLang] = useState("ru"); // язык канала (стабилен) — пак должен совпадать по языку
  const [otherSlots, setOtherSlots] = useState(0); // schedule slots on the user's OTHER channels (100/day cap)
  const [otherTimes, setOtherTimes] = useState<string[]>([]); // their actual times — avoid colliding minute-for-minute
  const [perDayInput, setPerDayInput] = useState(4); // "сколько раз в день" for the generator
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "success" | "error" } | null>(null);
  const notify = (text: string, kind: "info" | "success" | "error" = "info") => {
    setNotice({ text, kind });
    (kind === "error" ? console.error : console.log)("[привязка]", text);
  };

  const reloadVideos = () => apiClient.videos(id!).then(setVideos).catch(() => {});

  useEffect(() => {
    apiClient
      .account(id!)
      .then((a) => {
        setAccount(a);
        setChannelName(a.channelName);
        setTheme(a.theme);
        setLang(a.lang);
        setChannelLang(a.channelLang || DECK_LANG[a.lang] || "ru");
        setTimes(a.schedule);
        setSlotVideos(a.slotVideos || {});
        console.log("[привязка] канал загружен:", {
          id: a.id,
          status: a.status,
          ytChannelId: a.ytChannelId,
          ytChannelTitle: a.ytChannelTitle,
        });
      })
      .catch(() => {});
    reloadVideos();
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.packs().then(setPacks).catch(() => {}); // доступные паки → в дропдаун канала (по имени)
    // Schedule of the user's OTHER channels — for the «≤100 posts/day» cap counter AND so the
    // time generator can avoid minutes already taken by other channels.
    apiClient
      .accounts()
      .then((accs) => {
        const others = accs.filter((a) => a.id !== Number(id));
        setOtherSlots(others.reduce((s, a) => s + (a.schedule?.length ?? 0), 0));
        setOtherTimes(others.flatMap((a) => a.schedule ?? []));
      })
      .catch(() => {});
  }, [id]);

  // Когда фоновая генерация (глобальная очередь) завершилась для ЭТОГО канала — обновить библиотеку.
  useEffect(() => {
    if (q.completions && q.accountId === Number(id)) reloadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.completions]);

  // Авто-скрытие всплывающего уведомления.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Результат привязки (возврат из Google OAuth) → тост + лог в консоль (F12).
  useEffect(() => {
    if (justConnected) notify("Канал успешно подключён к YouTube ✓", "success");
    else if (connectError) notify("Не удалось подключить канал: " + connectError, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function save(): Promise<boolean> {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await apiClient.updateAccount(id!, {
        channelName,
        theme,
        lang,
        channelLang,
        schedule: times,
        slotVideos,
      });
      setAccount(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e) {
      alert("Не удалось сохранить настройки канала: " + String(e));
      return false;
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
    console.log("[привязка] старт: запрашиваю ссылку авторизации Google", { accountId: id });
    notify("Открываю авторизацию Google…", "info");
    try {
      const { url } = await apiClient.youtubeAuthUrl(id!);
      console.log("[привязка] получена ссылка авторизации, перенаправляю на Google:", url);
      window.location.href = url;
    } catch (e) {
      console.error("[привязка] не удалось получить ссылку авторизации:", e);
      notify(e instanceof Error ? e.message : "Не удалось начать привязку канала", "error");
    }
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

  // Only offer packs (languages) the user is allowed to see — generators are filtered server-side.
  // While generators load, show all to avoid an empty dropdown; always keep the channel's current value.
  const gensIds = new Set(gens.map((g) => g.id));
  const visibleLangs =
    gens.length === 0 ? LANGS : LANGS.filter(([code]) => gensIds.has(code) || code === lang);

  // Опции дропдаунов контента канала: встроенные паки + группа «Кастомные паки» (свои паки по имени) —
  // тот же набор, что в Студии, чтобы пак можно было назначить каналу и генерить из него.
  const packIds = new Set(packs.map((p) => `pack:${p.id}`));
  // язык выбранного контента (встроенный или свой пак) — для тега и проверки совпадения с языком канала
  const contentLang = (id: string): string =>
    id.startsWith("pack:") ? packs.find((p) => `pack:${p.id}` === id)?.lang || "" : DECK_LANG[id] || id;
  const curContentLang = contentLang(lang);
  const langMismatch = !!channelLang && !!curContentLang && curContentLang !== channelLang;
  const deckOptions = () => (
    <>
      {visibleLangs.length > 0 && (
        <optgroup label="Встроенные паки">
          {visibleLangs.map(([code, name]) => (
            <option key={code} value={code}>
              {/* полное имя пака (как в Студии: «Русские анекдоты» и т.п.), а не язык */}
              {gens.find((g) => g.id === code)?.name || name} · {tagOf(DECK_LANG[code] || code)}
              {gens.find((g) => g.id === code)?.preFact ? " · 🎬 видео-пак" : ""}
            </option>
          ))}
        </optgroup>
      )}
      {(packs.length > 0 || (lang.startsWith("pack:") && !packIds.has(lang))) && (
        <optgroup label={isAdmin ? "Кастомные паки" : "Мои паки"}>
          {packs.map((p) => (
            <option key={p.id} value={`pack:${p.id}`}>
              {p.name} · {tagOf(p.lang)}
            </option>
          ))}
          {lang.startsWith("pack:") && !packIds.has(lang) && (
            <option value={lang}>{lang.slice(5)} (нет доступа)</option>
          )}
        </optgroup>
      )}
    </>
  );

  // Per-user cap: ≤ 100 scheduled posts/day across ALL channels (admins exempt).
  const isAdmin = user?.role === "admin";
  const dayUsed = otherSlots + times.length; // posts/day across all the user's channels
  const scheduleRemaining = Math.max(0, 100 - otherSlots); // max slots this channel may hold
  const takenMinutes = new Set(otherTimes.map(toMin)); // minutes busy on other channels → generator avoids them
  const perDayMax = isAdmin ? 100 : Math.max(1, scheduleRemaining); // cap for the «раз в день» generator

  if (!account) return <div className="text-base-content/60">Загрузка…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {notice && (
        <div className="toast toast-top toast-end z-50">
          <div
            className={`alert shadow-lg ${
              notice.kind === "error"
                ? "alert-error"
                : notice.kind === "success"
                  ? "alert-success"
                  : "alert-info"
            }`}
          >
            <span>{notice.text}</span>
          </div>
        </div>
      )}
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
            <span className="label-text mb-1">Язык канала</span>
            <select
              className="select select-bordered"
              value={channelLang}
              onChange={(e) => setChannelLang(e.target.value)}
            >
              {LANG_LABELS.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
            <span className="label-text-alt mt-1 text-base-content/50">Пак ниже должен быть этого языка</span>
          </label>

          <div className="form-control">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="label-text">Расписание загрузки (по серверному времени)</span>
              {!isAdmin && (
                <span className={`text-xs ${dayUsed > 100 ? "text-error font-medium" : "text-base-content/50"}`}>
                  В сутки по всем каналам: {dayUsed} / 100
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-1 items-center">
              <span className="text-sm text-base-content/60">Раз в день:</span>
              {[1, 2, 3, 4, 6].map((n) => (
                <button
                  key={n}
                  className="btn btn-xs btn-outline"
                  disabled={!isAdmin && otherSlots + n > 100}
                  onClick={() => setTimes(randomDayTimes(n, takenMinutes))}
                  title={`${n} публикаций в сутки, равномерно со случайным сдвигом`}
                >
                  {n}×
                </button>
              ))}
              <span className="mx-1 text-base-content/30">|</span>
              <span className="text-sm text-base-content/60">своё:</span>
              <input
                type="number"
                min={1}
                max={perDayMax}
                className="input input-bordered input-xs w-16"
                value={perDayInput}
                onChange={(e) =>
                  setPerDayInput(Math.max(1, Math.min(perDayMax, Number(e.target.value) || 1)))
                }
                aria-label="Сколько раз в день"
              />
              <button
                className="btn btn-xs btn-primary gap-1"
                disabled={perDayMax < 1 || (!isAdmin && otherSlots + perDayInput > 100)}
                onClick={() => setTimes(randomDayTimes(Math.min(perDayInput, perDayMax), takenMinutes))}
                title="Расставить это число публикаций по суткам"
              >
                <RefreshCw size={12} /> Сгенерировать
              </button>
            </div>
            <p className="text-xs text-base-content/50 mb-3 leading-snug">
              Время раскидывается равномерно по суткам, но с небольшим случайным сдвигом — у каждого канала
              свои минуты, чтобы каналы не публиковали всё в одно и то же время. Можно поправить вручную ниже.
            </p>

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
              {/* Plain text input on purpose: native <input type="time"> shows AM/PM in 12-hour
                  browser locales (and lang= does NOT override it in Chrome). 24-hour only. */}
              <input
                type="text"
                inputMode="numeric"
                placeholder="14:30"
                maxLength={5}
                aria-label="Время в 24-часовом формате (ЧЧ:ММ)"
                className="input input-bordered input-sm w-32"
                value={newTime}
                onChange={(e) => {
                  let s = e.target.value.replace(/[^\d:]/g, "").slice(0, 5);
                  if (!s.includes(":") && s.length >= 3) s = s.slice(0, 2) + ":" + s.slice(2); // 1430 → 14:30
                  setNewTime(s);
                }}
              />
              <button
                className="btn btn-sm btn-outline gap-1"
                disabled={!isAdmin && times.length >= scheduleRemaining}
                onClick={() => {
                  const t = newTime.trim();
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) {
                    alert("Введите время в 24-часовом формате — например 09:00 или 14:30");
                    return;
                  }
                  if (!isAdmin && times.length >= scheduleRemaining) {
                    alert(`Лимит 100 публикаций в сутки на пользователя. На остальных каналах уже ${otherSlots}.`);
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
                  disabled={clearing || q.running}
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
          <div className="mt-3 pt-3 border-t border-base-300 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Слева — выбор пака (mr-auto толкает блок генерации вправо; на десктопе одна строка, ниже sm бейдж уходит вниз) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mr-auto">
              <span className="text-sm text-base-content/70 shrink-0">Пак канала:</span>
              <select
                className="select select-bordered select-sm min-w-[10rem] max-w-[16rem]"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title="Из какого пака генерировать ролики. После выбора нажми «Сохранить пак»."
              >
                {deckOptions()}
              </select>
              {lang.startsWith("pack:")
                ? (() => {
                    const p = packs.find((x) => `pack:${x.id}` === lang);
                    return p ? <span className="text-xs text-success shrink-0">{p.cards} карточек</span> : null;
                  })()
                : gens.find((g) => g.id === lang) && (
                    <span className="text-xs text-success shrink-0">
                      {gens.find((g) => g.id === lang)!.available} свободных
                    </span>
                  )}
              {lang !== account.lang && (
                <button
                  className="btn btn-sm btn-primary gap-1 shrink-0"
                  onClick={save}
                  disabled={saving || langMismatch}
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Сохранить пак
                </button>
              )}
            </div>

            {/* Справа — «сколько» + кнопка генерации: на десктопе цельный блок (кнопка у поля),
                ниже sm — своя строка, кнопка во всю ширину (без горизонтального переполнения) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 basis-full sm:basis-auto sm:shrink-0">
              <span className="text-sm text-base-content/70 shrink-0">Сделать сразу:</span>
              <input
                type="number"
                min={1}
                max={maxBatch}
                className="input input-bordered input-sm w-16"
                value={batchN}
                disabled={q.running}
                onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                aria-label="Сколько роликов сгенерировать"
              />
              <span className="text-xs text-base-content/50 shrink-0">1–{maxBatch}</span>
              {!q.running ? (
                <button
                  className="btn btn-sm btn-primary gap-1 w-full sm:w-auto"
                  onClick={async () => {
                    // «Сгенерировать» = сохранить выбранный пак (если поменяли) + поставить генерацию.
                    // Иначе генерилось бы из ПРЕЖНЕГО сохранённого контента канала.
                    if (lang !== account.lang && !(await save())) return;
                    q.run(id!, batchN);
                  }}
                  disabled={langMismatch || saving}
                  title={
                    langMismatch
                      ? "Язык контента не совпадает с языком канала"
                      : lang !== account.lang
                        ? "Сохранит выбранный контент и сгенерирует из него"
                        : "Поставить в очередь генерацию роликов в библиотеку"
                  }
                >
                  <Plus size={14} /> {lang !== account.lang ? "Сохранить и сгенерировать" : "Сгенерировать"}
                </button>
              ) : (
                <button className="btn btn-sm btn-outline btn-error gap-1 w-full sm:w-auto" onClick={q.cancel}>
                  <Loader2 className="animate-spin" size={14} /> Стоп
                </button>
              )}
            </div>

            {/* Предупреждения и доп-действия — отдельными строками, тулбар не ломают */}
            {langMismatch && (
              <span className="basis-full text-xs text-error font-medium">
                ⚠ контент {tagOf(curContentLang)} ≠ язык канала {tagOf(channelLang)} — смени язык канала или выбери {tagOf(channelLang)}-пак
              </span>
            )}
            {lang !== account.lang && videos.length > 0 && (
              <span className="basis-full text-xs text-warning">старые ролики другого пака — очисти библиотеку</span>
            )}
            {postedTwicePlus > 0 && (
              <div className="basis-full flex justify-end">
                <button
                  className="btn btn-sm btn-ghost text-error gap-1"
                  onClick={removePosted}
                  disabled={q.running}
                  title="Удалить ролики, которые выкладывались больше одного раза"
                >
                  <Trash2 size={14} /> вылож. ≥2× ({postedTwicePlus})
                </button>
              </div>
            )}
          </div>
          {q.running && (
            <div className="mt-1 text-xs text-base-content/60 flex items-center gap-1">
              <Loader2 className="animate-spin" size={12} />
              Идёт генерация в фоне — прогресс в правом нижнем углу, можно уходить на другие страницы.
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
              {pageVideos.map((v) => (
                <div key={v.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setPreview(v)}
                    title="Открыть и посмотреть"
                    className="block w-full aspect-[9/16] rounded-lg overflow-hidden border border-base-300 bg-base-200 relative"
                  >
                    {v.imageRel ? (
                      <img src={`/files/${v.imageRel}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-base-content/30">
                        <Play size={28} />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/35 transition">
                      <Play
                        size={34}
                        fill="currentColor"
                        className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition"
                      />
                    </span>
                    {v.postCount > 0 ? (
                      <span className="absolute top-1 left-1 badge badge-success badge-sm">×{v.postCount}</span>
                    ) : (
                      <span className="absolute top-1 left-1 badge badge-ghost badge-sm">new</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeVid(v.id)}
                    title="Удалить из библиотеки"
                    className="absolute top-1 right-1 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={12} />
                  </button>
                  <div className="mt-1 text-xs font-medium leading-tight line-clamp-2" title={v.title}>
                    {v.title}
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
          <div className="modal-box max-w-sm p-0 overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label="Закрыть"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-10 bg-base-100/70 hover:bg-base-100"
            >
              <X size={16} />
            </button>
            <VideoPlayer
              src={`/files/${preview.videoRel}`}
              poster={preview.imageRel ? `/files/${preview.imageRel}` : undefined}
              className="w-full aspect-[9/16] max-h-[68vh]"
            />
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-base leading-snug">{preview.title}</h3>
              {preview.text && (
                <p className="text-sm whitespace-pre-wrap leading-relaxed max-h-28 overflow-auto text-base-content/80">
                  {preview.text}
                </p>
              )}
              <div className="text-xs text-base-content/50">
                {preview.text.length} симв.
                {preview.lastPostedAt && ` · выложен ${new Date(preview.lastPostedAt).toLocaleDateString("ru-RU")}`}
                {preview.music && preview.music !== "none"
                  ? ` · 🎵 ${preview.music.split("/").pop()?.replace(/\.\w+$/, "")}`
                  : " · 🔇 без музыки"}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a href={`/files/${preview.videoRel}`} download className="btn btn-sm btn-ghost gap-1">
                  <Download size={14} /> MP4
                </a>
                <button
                  className="btn btn-sm btn-ghost text-error gap-1"
                  onClick={() => {
                    const pid = preview.id;
                    setPreview(null);
                    removeVid(pid);
                  }}
                >
                  <Trash2 size={14} /> Удалить
                </button>
                <button
                  className="btn btn-sm btn-primary gap-1 ml-auto"
                  disabled={account.status !== "connected" || posting === preview.id}
                  onClick={() => {
                    const pid = preview.id;
                    setPreview(null);
                    postNow(pid);
                  }}
                >
                  <Upload size={14} /> Выложить
                </button>
              </div>
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
