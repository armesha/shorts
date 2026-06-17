import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Check, Plus, Upload, Loader2, ChevronLeft, ChevronRight, RefreshCw, Play, Download, X } from "lucide-react";
import { apiClient, type Account, type VideoItem, type Generator, type PackSummary } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import { confirmDialog } from "../lib/confirm";
import { useAuth } from "../lib/auth";
import { useGenQueue } from "../lib/genQueue";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { BUILTIN_DECKS, CONTENT_LANGS, DECK_LANG, langTag } from "../lib/deck";
import { cleanDisplayText } from "../lib/text";

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

function PackKindBadge({ video }: { video: boolean }) {
  const { t } = useT();
  return (
    <span className={`badge badge-sm gap-1 shrink-0 ${video ? "badge-primary" : "badge-ghost"}`}>
      <AppIcon name={video ? "video" : "cards"} size={12} />
      {video ? t("packKind.video") : t("packKind.text")}
    </span>
  );
}

export default function AccountDetail() {
  const { t } = useT();
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
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarList, setAvatarList] = useState<string[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
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

  // «Сделать сразу» не больше остатка свободных карточек выбранного контента (дека/пак) — для всех ролей.
  const roleMax = user?.role === "admin" ? 100 : 50; // потолок: админ 100, обычный юзер 50
  const selPack = lang.startsWith("pack:") ? packs.find((p) => `pack:${p.id}` === lang) : undefined;
  const selGen = lang.startsWith("pack:") ? undefined : gens.find((gg) => gg.id === lang);
  const remaining = lang.startsWith("pack:") ? selPack?.cards ?? 0 : selGen?.available ?? 0;
  const maxBatch = Math.max(0, Math.min(roleMax, remaining));

  // Сменили контент канала с меньшим остатком — подожмём «сразу» к новому максимуму.
  useEffect(() => {
    setBatchN((n) => Math.max(1, Math.min(maxBatch || 1, n)));
  }, [maxBatch]);

  useEffect(() => {
    if (avatarOpen && avatarList.length === 0) apiClient.avatars().then(setAvatarList).catch(() => {});
  }, [avatarOpen, avatarList.length]);

  async function setAvatar(url: string) {
    setAvatarBusy(true);
    try {
      const a = await apiClient.updateAccount(id!, { avatar: url });
      setAccount(a);
      setAvatarOpen(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : t("account.avatarChangeFailed"), "error");
    } finally {
      setAvatarBusy(false);
    }
  }
  async function onUploadAvatar(file: File) {
    if (!file) return;
    if (file.size > 3_000_000) return notify(t("account.fileTooBig"), "error");
    setAvatarBusy(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(new Error("read error"));
        fr.readAsDataURL(file);
      });
      const a = await apiClient.uploadAvatar(id!, dataUrl);
      setAccount(a);
      setAvatarOpen(false);
    } catch (e) {
      notify(e instanceof Error ? e.message : t("account.avatarUploadFailed"), "error");
    } finally {
      setAvatarBusy(false);
    }
  }

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
    if (justConnected) notify(t("account.connectSuccess"), "success");
    else if (connectError) notify(t("account.connectFailed") + " " + connectError, "error");
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
      notify(t("account.saveSettingsFailed") + " " + String(e), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog(t("account.deleteChannelConfirm"), { title: t("account.deleteChannelTitle"), confirmText: t("common.delete"), danger: true }))) return;
    await apiClient.deleteAccount(id!);
    navigate("/accounts");
  }

  async function connect() {
    console.log("[привязка] старт: запрашиваю ссылку авторизации Google", { accountId: id });
    notify(t("account.openingGoogleAuth"), "info");
    try {
      const { url } = await apiClient.youtubeAuthUrl(id!);
      console.log("[привязка] получена ссылка авторизации, перенаправляю на Google:", url);
      window.location.href = url;
    } catch (e) {
      console.error("[привязка] не удалось получить ссылку авторизации:", e);
      notify(e instanceof Error ? e.message : t("account.connectStartFailed"), "error");
    }
  }

  async function postNow(vid: number) {
    setPosting(vid);
    try {
      const v = videos.find((x) => x.id === vid);
      const r = await apiClient.postVideoNow(vid);
      if (r.url) setLastPosted({ title: v?.title ?? t("account.videoFallbackTitle"), url: r.url });
      await reloadVideos(); // posted video is removed server-side → disappears from the list
    } catch (e) {
      notify(t("account.postFailed") + " " + String(e), "error");
    } finally {
      setPosting(null);
    }
  }


  async function removeVid(vid: number) {
    if (!(await confirmDialog(t("account.deleteVideoConfirm"), { confirmText: t("common.delete"), danger: true }))) return;
    await apiClient.deleteVideo(vid);
    await reloadVideos();
  }

  // Удалить все ролики, которые выкладывались больше одного раза (postCount > 1).
  async function removePosted() {
    const targets = videos.filter((v) => v.postCount > 1);
    if (targets.length === 0) return;
    if (!(await confirmDialog(t("account.deletePostedConfirm", { n: targets.length }), { confirmText: t("common.delete"), danger: true }))) return;
    for (const v of targets) await apiClient.deleteVideo(v.id);
    await reloadVideos();
  }

  // Очистить ВСЮ библиотеку канала (например, после смены пака — старый контент больше не подходит).
  async function clearLibrary() {
    if (videos.length === 0) return;
    if (!(await confirmDialog(t("account.clearLibraryConfirm", { n: videos.length }), { title: t("account.clearLibraryTitle"), confirmText: t("account.deleteAll"), danger: true }))) return;
    setClearing(true);
    try {
      for (const v of [...videos]) await apiClient.deleteVideo(v.id);
      await reloadVideos();
    } catch (e) {
      notify(t("account.clearLibraryFailed") + " " + String(e), "error");
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
    gens.length === 0 ? BUILTIN_DECKS : BUILTIN_DECKS.filter(({ id }) => gensIds.has(id) || id === lang);
  const genById = (id: string) => gens.find((g) => g.id === id);
  const hasVideoSources = visibleLangs.some(({ id }) => !!genById(id)?.preFact);
  const hasTextSources = visibleLangs.some(({ id }) => !genById(id)?.preFact) || packs.length > 0;
  const showPackKind = hasVideoSources && hasTextSources;
  const selectedIsVideo = !lang.startsWith("pack:") && !!genById(lang)?.preFact;

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
        <optgroup label={t("account.builtinPacks")}>
          {visibleLangs.map(({ id: code, label }) => (
            <option key={code} value={code}>
              {/* полное имя пака (как в Студии: «Русские анекдоты» и т.п.), а не язык */}
              {showPackKind ? `[${genById(code)?.preFact ? t("packKind.video") : t("packKind.text")}] ` : ""}
              {genById(code)?.name || label} · {langTag(DECK_LANG[code] || code)}
            </option>
          ))}
        </optgroup>
      )}
      {(packs.length > 0 || (lang.startsWith("pack:") && !packIds.has(lang))) && (
        <optgroup label={isAdmin ? t("account.customPacks") : t("account.myPacks")}>
          {packs.map((p) => (
            <option key={p.id} value={`pack:${p.id}`}>
              {showPackKind ? `[${t("packKind.text")}] ` : ""}
              {p.name} · {langTag(p.lang)}
            </option>
          ))}
          {lang.startsWith("pack:") && !packIds.has(lang) && (
            <option value={lang}>{lang.slice(5)} {t("account.noAccess")}</option>
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

  if (!account) return <div className="text-base-content/60">{t("common.loading")}</div>;

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
        <ArrowLeft size={16} /> {t("account.backToChannels")}
      </Link>

      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            title={t("account.changeAvatarTitle")}
            className="relative group shrink-0 rounded-full"
          >
            {account.avatar ? (
              <img
                src={account.avatar}
                alt=""
                className="w-14 h-14 rounded-full object-cover border border-base-300 bg-base-200"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
                {(channelName || "?").trim()[0] || "?"}
              </div>
            )}
            <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/45 flex items-center justify-center text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition">
              {t("account.changeAvatarOverlay")}
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{channelName || t("account.channelFallback")}</h1>
            <p className="text-base-content/60">{t("account.headerSubtitle")}</p>
          </div>
        </div>
        {account.status === "connected" ? (
          <span className="badge badge-success">{t("account.connected")}</span>
        ) : (
          <span className="badge badge-warning">{t("account.needsAuth")}</span>
        )}
      </header>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-5">
          <label className="form-control">
            <span className="label-text mb-1">{t("account.channelName")}</span>
            <input
              className="input input-bordered"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1">{t("account.channelTheme")}</span>
            <input
              className="input input-bordered"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={t("account.channelThemePlaceholder")}
            />
          </label>

          <label className="form-control max-w-xs">
            <span className="label-text mb-1">{t("account.channelLang")}</span>
            <select
              className="select select-bordered"
              value={channelLang}
              onChange={(e) => setChannelLang(e.target.value)}
            >
              {CONTENT_LANGS.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <span className="label-text-alt mt-1 text-base-content/50">{t("account.channelLangHint")}</span>
          </label>

          <div className="form-control">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="label-text">{t("account.scheduleLabel")}</span>
              {!isAdmin && (
                <span className={`text-xs ${dayUsed > 100 ? "text-error font-medium" : "text-base-content/50"}`}>
                  {t("account.perDayAllChannels", { n: dayUsed })}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-1 items-center">
              <span className="text-sm text-base-content/60">{t("account.timesPerDay")}</span>
              {[1, 2, 3, 4, 6].map((n) => (
                <button
                  key={n}
                  className="btn btn-xs btn-outline"
                  disabled={!isAdmin && otherSlots + n > 100}
                  onClick={() => setTimes(randomDayTimes(n, takenMinutes))}
                  title={t("account.perDayBtnTitle", { n })}
                >
                  {n}×
                </button>
              ))}
              <span className="mx-1 text-base-content/30">|</span>
              <span className="text-sm text-base-content/60">{t("account.custom")}</span>
              <input
                type="number"
                min={1}
                max={perDayMax}
                className="input input-bordered input-xs w-16"
                value={perDayInput}
                onChange={(e) =>
                  setPerDayInput(Math.max(1, Math.min(perDayMax, Number(e.target.value) || 1)))
                }
                aria-label={t("account.timesPerDayAria")}
              />
              <button
                className="btn btn-xs btn-primary gap-1"
                disabled={perDayMax < 1 || (!isAdmin && otherSlots + perDayInput > 100)}
                onClick={() => setTimes(randomDayTimes(Math.min(perDayInput, perDayMax), takenMinutes))}
                title={t("account.spreadTitle")}
              >
                <RefreshCw size={12} /> {t("common.generate")}
              </button>
            </div>
            <p className="text-xs text-base-content/50 mb-3 leading-snug">
              {t("account.scheduleHint")}
            </p>

            <div className="flex flex-wrap gap-2 mb-3 min-h-8 items-center">
              {[...times].sort().map((time) => (
                <span key={time} className="badge badge-primary badge-lg gap-2 py-3">
                  {time}
                  <button
                    className="hover:text-error"
                    onClick={() => setTimes(times.filter((x) => x !== time))}
                    title={t("account.removeTime")}
                  >
                    <AppIcon name="close" size={12} />
                  </button>
                </span>
              ))}
              {times.length === 0 && (
                <span className="text-sm text-base-content/50">{t("account.noTimes")}</span>
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
                aria-label={t("account.timeInputAria")}
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
                  const v = newTime.trim();
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
                    notify(t("account.invalidTime"), "error");
                    return;
                  }
                  if (!isAdmin && times.length >= scheduleRemaining) {
                    notify(t("account.dayLimitReached", { n: otherSlots }), "error");
                    return;
                  }
                  if (!times.includes(v)) setTimes([...times, v]);
                }}
              >
                <Plus size={14} /> {t("account.addTime")}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-1">
            <button className="btn btn-ghost btn-sm text-error gap-2" onClick={remove}>
              <Trash2 size={16} /> {t("common.delete")}
            </button>
            <button className="btn btn-primary gap-2" onClick={save} disabled={saving}>
              {saving ? (
                <span className="loading loading-spinner loading-sm" />
              ) : saved ? (
                <Check size={16} />
              ) : (
                <Save size={16} />
              )}
              {saved ? t("common.saved") : t("common.save")}
            </button>
          </div>
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-base">{t("account.youtubeConnection")}</h2>
          {account.ytChannelTitle ? (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="badge badge-success">{t("account.connected")}</span>
              <span>
                {t("account.channelColon")} <b>{account.ytChannelTitle}</b>
              </span>
              {account.ytChannelId && (
                <a
                  href={`https://www.youtube.com/channel/${account.ytChannelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary inline-flex items-center gap-1"
                >
                  <BrandIcon name="youtube" size={14} />
                  {t("account.openOnYouTube")}
                  <AppIcon name="external" size={13} />
                </a>
              )}
              <button
                className="btn btn-ghost btn-xs gap-1"
                onClick={connect}
                title={t("account.reconnectTitle")}
              >
                <RefreshCw size={13} /> {t("account.reconnect")}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-base-content/60">
                {t("account.connectIntro")}
              </p>
              {justConnected && (
                <p className="text-success text-sm">{t("account.connectedRefresh")}</p>
              )}
              <div>
                <button className="btn btn-primary btn-sm" onClick={connect}>
                  {t("account.connectChannel")}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="card-title text-base">{t("account.libraryTitle", { n: videos.length })}</h2>
            <div className="flex items-center gap-2">
              {videos.length > 0 && (
                <button
                  className="btn btn-sm btn-error btn-outline gap-1"
                  onClick={clearLibrary}
                  disabled={clearing || q.running}
                  title={t("account.clearAllTitle")}
                >
                  {clearing ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                  {t("account.clearAll")}
                </button>
              )}
              <select
                className="select select-bordered select-sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as "date" | "title" | "posts")}
              >
                <option value="date">{t("account.sortNewest")}</option>
                <option value="title">{t("account.sortByTitle")}</option>
                <option value="posts">{t("account.sortByPosts")}</option>
              </select>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-base-300 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Слева — выбор пака (mr-auto толкает блок генерации вправо; на десктопе одна строка, ниже sm бейдж уходит вниз) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 mr-auto">
              <span className="text-sm text-base-content/70 shrink-0">{t("account.channelPack")}</span>
              <select
                className="select select-bordered select-sm min-w-[10rem] max-w-[16rem]"
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                title={t("account.channelPackTitle")}
              >
                {deckOptions()}
              </select>
              {showPackKind && <PackKindBadge video={selectedIsVideo} />}
              {lang.startsWith("pack:")
                ? (() => {
                    const p = packs.find((x) => `pack:${x.id}` === lang);
                    return p ? <span className="text-xs text-success shrink-0">{t("account.cardsCount", { n: p.cards })}</span> : null;
                  })()
                : gens.find((g) => g.id === lang) && (
                    <span className="text-xs text-success shrink-0">
                      {t("account.availableCount", { n: gens.find((g) => g.id === lang)!.available })}
                    </span>
                  )}
              {lang !== account.lang && (
                <button
                  className="btn btn-sm btn-primary gap-1 shrink-0"
                  onClick={save}
                  disabled={saving || langMismatch}
                >
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  {t("account.savePack")}
                </button>
              )}
            </div>

            {/* Справа — «сколько» + кнопка генерации: на десктопе цельный блок (кнопка у поля),
                ниже sm — своя строка, кнопка во всю ширину (без горизонтального переполнения) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 basis-full sm:basis-auto sm:shrink-0">
              <span className="text-sm text-base-content/70 shrink-0">{t("account.makeNow")}</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, maxBatch)}
                className="input input-bordered input-sm w-16"
                value={batchN}
                disabled={q.running || maxBatch < 1}
                onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                aria-label={t("account.howManyVideosAria")}
              />
              <span className="text-xs text-base-content/50 shrink-0">
                {maxBatch < 1 ? t("account.noCards") : `1–${maxBatch}`}
              </span>
              {!q.running ? (
                <button
                  className="btn btn-sm btn-primary gap-1 w-full sm:w-auto"
                  onClick={async () => {
                    // «Сгенерировать» = сохранить выбранный пак (если поменяли) + поставить генерацию.
                    // Иначе генерилось бы из ПРЕЖНЕГО сохранённого контента канала.
                    if (lang !== account.lang && !(await save())) return;
                    q.run(id!, Math.min(batchN, maxBatch));
                  }}
                  disabled={langMismatch || saving || maxBatch < 1}
                  title={
                    langMismatch
                      ? t("account.genTitleMismatch")
                      : lang !== account.lang
                        ? t("account.genTitleSaveAndGen")
                        : t("account.genTitleQueue")
                  }
                >
                  <Plus size={14} /> {lang !== account.lang ? t("account.saveAndGenerate") : t("common.generate")}
                </button>
              ) : (
                <button className="btn btn-sm btn-outline btn-error gap-1 w-full sm:w-auto" onClick={q.cancel}>
                  <Loader2 className="animate-spin" size={14} /> {t("account.stop")}
                </button>
              )}
            </div>

            {/* Предупреждения и доп-действия — отдельными строками, тулбар не ломают */}
            {langMismatch && (
              <span className="basis-full text-xs text-error font-medium">
                {t("account.langMismatchWarn", { content: langTag(curContentLang), channel: langTag(channelLang) })}
              </span>
            )}
            {lang !== account.lang && videos.length > 0 && (
              <span className="basis-full text-xs text-warning">{t("account.oldVideosWarn")}</span>
            )}
            {postedTwicePlus > 0 && (
              <div className="basis-full flex justify-end">
                <button
                  className="btn btn-sm btn-ghost text-error gap-1"
                  onClick={removePosted}
                  disabled={q.running}
                  title={t("account.removePostedTitle")}
                >
                  <Trash2 size={14} /> {t("account.postedTwicePlus", { n: postedTwicePlus })}
                </button>
              </div>
            )}
          </div>
          {q.running && (
            <div className="mt-1 text-xs text-base-content/60 flex items-center gap-1">
              <Loader2 className="animate-spin" size={12} />
              {t("account.genInBackground")}
            </div>
          )}
          {lastPosted && (
            <div className="alert alert-success py-2 text-sm mt-2">
              <span>
                {t("account.postedPrefix")} <b>{cleanDisplayText(lastPosted.title)}</b> —{" "}
                <a href={lastPosted.url} target="_blank" rel="noreferrer" className="link font-medium">
                  {lastPosted.url}
                </a>
              </span>
            </div>
          )}
          {videos.length === 0 ? (
            <div className="text-sm text-base-content/50 py-6 text-center">
              {t("account.libraryEmpty")}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-2">
              {pageVideos.map((v) => (
                <div key={v.id} className="group">
                  <div className="relative aspect-[9/16] rounded-lg overflow-hidden border border-base-300 bg-base-200">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPreview(v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPreview(v);
                        }
                      }}
                      title={t("account.openAndWatch")}
                      className="absolute inset-0 cursor-pointer"
                    >
                      {v.imageRel ? (
                        <img src={`/files/${v.imageRel}`} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-base-content/30">
                          <Play size={28} />
                        </span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition">
                        <Play
                          size={34}
                          fill="currentColor"
                          className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition"
                        />
                      </span>
                      {v.postCount > 0 ? (
                        <span className="absolute top-1 left-1 badge badge-success badge-sm">×{v.postCount}</span>
                      ) : (
                        <span className="absolute top-1 left-1 badge badge-ghost badge-sm">{t("account.newBadge")}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVid(v.id)}
                      title={t("account.removeFromLibrary")}
                      className="absolute top-1 right-1 z-10 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => postNow(v.id)}
                      disabled={posting === v.id || account.status !== "connected"}
                      title={account.status !== "connected" ? t("account.connectFirst") : t("account.postNowTitle")}
                      className="absolute bottom-1.5 inset-x-1.5 z-10 btn btn-xs btn-primary gap-1 opacity-0 group-hover:opacity-100 transition"
                    >
                      {posting === v.id ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                      {t("account.post")}
                    </button>
                  </div>
                  <div className="mt-1 text-xs font-medium leading-tight line-clamp-2" title={cleanDisplayText(v.title)}>
                    {cleanDisplayText(v.title)}
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
                <ChevronLeft size={14} /> {t("common.back")}
              </button>
              <span className="text-sm text-base-content/60">
                {t("common.page")} {clampedPage} {t("common.of")} {pageCount}
              </span>
              <button
                className="btn btn-xs btn-outline gap-1"
                disabled={clampedPage >= pageCount}
                onClick={() => setPage(clampedPage + 1)}
              >
                {t("common.forward")} <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      </section>

      {preview && (
        <div className="modal modal-open" onClick={() => setPreview(null)}>
          <div className="modal-box max-w-2xl p-0 overflow-hidden relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label={t("common.close")}
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-20 bg-base-100/70 hover:bg-base-100"
            >
              <X size={16} />
            </button>
            <div className="flex flex-col sm:flex-row">
              {/* видео — само по себе, справа */}
              <div className="bg-black shrink-0 sm:order-2 sm:w-[300px]">
                <VideoPlayer
                  src={`/files/${preview.videoRel}`}
                  poster={preview.imageRel ? `/files/${preview.imageRel}` : undefined}
                  className="w-full aspect-[9/16] max-h-[75vh]"
                />
              </div>
              {/* описание + характеристики + действия — слева */}
              <div className="flex-1 min-w-0 p-4 flex flex-col gap-2 sm:order-1">
                <h3 className="font-bold text-base leading-snug">{cleanDisplayText(preview.title)}</h3>
                {preview.text && (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed overflow-auto max-h-[40vh] text-base-content/80">
                    {preview.text}
                  </p>
                )}
                <div className="text-xs text-base-content/50">
                  {t("account.charCount", { n: preview.text.length })}
                  {preview.postCount > 0 ? ` · ${t("account.postedTimes", { n: preview.postCount })}` : ` · ${t("account.notPosted")}`}
                  {preview.lastPostedAt && ` · ${new Date(preview.lastPostedAt).toLocaleDateString("ru-RU")}`}
                  {preview.music && preview.music !== "none"
                    ? ` · ${t("studio.musicLabel").toLowerCase()} ${preview.music.split("/").pop()?.replace(/\.\w+$/, "")}`
                    : ` · ${t("account.noMusic")}`}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 mt-auto">
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
                    <Trash2 size={14} /> {t("common.delete")}
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
                    <Upload size={14} /> {t("account.post")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {avatarOpen && (
        <div className="modal modal-open" onClick={() => !avatarBusy && setAvatarOpen(false)}>
          <div className="modal-box max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">{t("account.avatarModalTitle")}</h3>
              <button
                className="btn btn-sm btn-circle btn-ghost"
                onClick={() => setAvatarOpen(false)}
                disabled={avatarBusy}
                aria-label={t("common.close")}
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className={`btn btn-sm btn-primary gap-1 ${avatarBusy ? "btn-disabled" : ""}`}>
                <Upload size={14} /> {t("account.uploadOwnPhoto")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadAvatar(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="btn btn-sm btn-ghost gap-1"
                disabled={avatarBusy || avatarList.length === 0}
                onClick={() => setAvatar(avatarList[Math.floor(Math.random() * avatarList.length)])}
              >
                <RefreshCw size={14} /> {t("account.randomAvatar")}
              </button>
              {avatarBusy && <Loader2 className="animate-spin self-center" size={16} />}
              <span className="text-xs text-base-content/50 ml-auto">{t("account.orPickFromSet")}</span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-[50vh] overflow-auto p-1">
              {avatarList.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setAvatar(u)}
                  disabled={avatarBusy}
                  title={t("account.pickAvatar")}
                  className={`rounded-full overflow-hidden border-2 transition ${
                    account.avatar === u ? "border-primary" : "border-transparent hover:border-base-300"
                  }`}
                >
                  <img src={u} alt="" className="w-full aspect-square object-cover bg-base-200" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {times.length > 0 && videos.length > 0 && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-base">{t("account.slotVideoTitle")}</h2>
            <p className="text-sm text-base-content/60">
              {t("account.slotVideoHint")}
            </p>
            <div className="space-y-2 mt-2">
              {[...times].sort().map((time) => (
                <div key={time} className="flex items-center gap-2">
                  <span className="badge badge-primary badge-lg w-20 justify-center">{time}</span>
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={slotVideos[time] ?? 0}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSlotVideos((prev) => {
                        const n = { ...prev };
                        if (v) n[time] = v;
                        else delete n[time];
                        return n;
                      });
                    }}
                  >
                    <option value={0}>{t("account.slotAuto")}</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {cleanDisplayText(v.title)} (x{v.postCount})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-base-content/50 mt-1">{t("account.slotSaveReminder")}</p>
          </div>
        </section>
      )}
    </div>
  );
}
