import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Check, Plus, Upload, Loader2, ChevronLeft, ChevronRight, RefreshCw, Play, Download, X, AlertTriangle } from "lucide-react";
import { apiClient, type Account, type VideoItem, type Generator, type PackSummary, type OAuthClient } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import { confirmDialog } from "../lib/confirm";
import { useAuth } from "../lib/auth";
import { useGenQueue } from "../lib/genQueue";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { BUILTIN_DECKS, CONTENT_LANGS, DECK_LANG, langTag } from "../lib/deck";
import { cleanDisplayText } from "../lib/text";
import { formatDateTime } from "../lib/format";

// N posts/day spread ~evenly across 24h, but with a small RANDOM per-channel offset + jitter,
// so two channels with the same N never all fire at the same minute. `avoid` = minutes already
// used elsewhere (the user's other channels) — collisions are nudged forward a minute.
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const ACCOUNT_DAILY_SLOT_CAP = 20;
const USER_DAILY_SLOT_CAP = 92;
const GENERATE_ALL_DECKS = "__all_decks__";
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
  const [slotDecks, setSlotDecks] = useState<Record<string, string>>({});
  const sourceDecksRef = useRef<string[]>([]);
  const [sourceDecks, setSourceDecksState] = useState<string[]>([]);
  const setSourceDecks = (next: string[]) => {
    sourceDecksRef.current = next;
    setSourceDecksState(next);
  };
  const [generateDeck, setGenerateDeck] = useState("");
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
  const channelLangRef = useRef("ru");
  const [channelLang, setChannelLangState] = useState("ru"); // язык канала (стабилен) — пак должен совпадать по языку
  const setChannelLang = (next: string) => {
    channelLangRef.current = next;
    setChannelLangState(next);
  };
  const [otherSlots, setOtherSlots] = useState(0); // schedule slots on the user's OTHER channels (aggregate cap)
  const [otherTimes, setOtherTimes] = useState<string[]>([]); // their actual times — avoid colliding minute-for-minute
  const [perDayInput, setPerDayInput] = useState(4); // "сколько раз в день" for the generator
  const [notice, setNotice] = useState<{ text: string; kind: "info" | "success" | "error"; title?: string } | null>(null);
  const [keyChoices, setKeyChoices] = useState<OAuthClient[] | null>(null); // shown when the owner has >1 Google key
  const [clients, setClients] = useState<OAuthClient[]>([]); // owner's Google keys — to show which one a channel is bound to
  const notify = (text: string, kind: "info" | "success" | "error" = "info", title?: string) => {
    setNotice({ text, kind, title });
    (kind === "error" ? console.error : console.log)("[привязка]", text);
  };

  const reloadVideos = () => apiClient.videos(id!).then(setVideos).catch(() => {});

  // «Сделать сразу» не больше остатка свободных карточек выбранного контента (дека/пак) — для всех ролей.
  const roleMax = user?.role === "admin" ? 100 : 50; // потолок: админ 100, обычный юзер 50
  const selectedSources = (sourceDecks.length ? sourceDecks : [lang]).filter(Boolean);
  // Остаток = СВОБОДНЫЕ (неиспользованные) карточки. Для пака — available (cards − used), не общее число.
  const sourceRemaining = (deckId: string) => {
    if (deckId.startsWith("pack:")) {
      const p = packs.find((pp) => `pack:${pp.id}` === deckId);
      return p?.available ?? p?.cards ?? 0;
    }
    return gens.find((gg) => gg.id === deckId)?.available ?? 0;
  };
  const canGenerateAllSources = selectedSources.length > 1;
  const activeGenerateDeck =
    generateDeck === GENERATE_ALL_DECKS && canGenerateAllSources
      ? GENERATE_ALL_DECKS
      : selectedSources.includes(generateDeck)
        ? generateDeck
        : selectedSources[0] || lang;
  const generateAllSources = activeGenerateDeck === GENERATE_ALL_DECKS;
  const generateDeckIds = generateAllSources
    ? selectedSources.filter((deckId) => sourceRemaining(deckId) > 0)
    : activeGenerateDeck
      ? [activeGenerateDeck]
      : [];
  const remaining = generateDeckIds.reduce((sum, deckId) => sum + sourceRemaining(deckId), 0);
  const maxBatch = Math.max(0, Math.min(roleMax, remaining));

  // Сменили контент канала с меньшим остатком — подожмём «сразу» к новому максимуму.
  useEffect(() => {
    setBatchN((n) => Math.max(1, Math.min(maxBatch || 1, n)));
  }, [maxBatch]);

  useEffect(() => {
    if (avatarOpen && avatarList.length === 0) apiClient.avatars().then(setAvatarList).catch(() => {});
  }, [avatarOpen, avatarList.length]);

  // Load the user's Google keys so a connected channel can show which key/project it posts under.
  useEffect(() => {
    apiClient.youtubeClients().then((r) => setClients(r.clients)).catch(() => {});
  }, []);

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
        {
          const sources = (a.sourceDecks?.length ? a.sourceDecks : [a.lang]).filter(Boolean);
          setSourceDecks(sources);
          setGenerateDeck(sources[0] || a.lang);
        }
        setChannelLang(a.channelLang || DECK_LANG[a.lang] || "ru");
        setTimes(a.schedule);
        setSlotVideos(a.slotVideos || {});
        setSlotDecks(a.slotDecks || {});
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
    // Schedule of the user's OTHER channels — for the aggregate cap counter AND so the
    // time generator can avoid minutes already taken by other channels.
    apiClient
      .accounts()
      .then((accs) => {
        const myKey = accs.find((a) => a.id === Number(id))?.oauthClientId ?? null;
        const others = accs.filter((a) => a.id !== Number(id));
        // Per-key daily cap: only channels sharing THIS channel's Google key count toward its 92/day.
        const sameKey = others.filter((a) => (a.oauthClientId ?? null) === myKey);
        setOtherSlots(sameKey.reduce((s, a) => s + (a.schedule?.length ?? 0), 0));
        setOtherTimes(others.flatMap((a) => a.schedule ?? []));
      })
      .catch(() => {});
  }, [id]);

  // Когда фоновая генерация (глобальная очередь) завершилась для ЭТОГО канала — обновить библиотеку.
  // Остатки свободных карточек (деки/паки) перечитываем всегда — они per-user, не per-channel, и
  // после генерации число свободных уменьшается, поэтому «сразу» сразу подожмётся к новому максимуму.
  useEffect(() => {
    if (!q.completions) return;
    if (q.accountId === Number(id)) reloadVideos();
    apiClient.generators().then(setGens).catch(() => {});
    apiClient.packs().then(setPacks).catch(() => {});
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [preview]);

  async function save(): Promise<boolean> {
    setSaving(true);
    setSaved(false);
    try {
      const latestSources = sourceDecksRef.current.length ? sourceDecksRef.current : sourceDecks;
      const cleanSources = [...new Set((latestSources.length ? latestSources : [lang]).filter(Boolean))];
      const sourceLangs = [...new Set(cleanSources.map(contentLang).filter(Boolean))];
      const effectiveChannelLang = sourceLangs.length === 1 ? sourceLangs[0] : channelLangRef.current || channelLang;
      const cleanSlotDecks = Object.fromEntries(
        Object.entries(slotDecks).filter(([time, deck]) => times.includes(time) && cleanSources.includes(deck)),
      );
      if (times.length > ACCOUNT_DAILY_SLOT_CAP) {
        notify(t("account.accountDayLimitReached", { n: ACCOUNT_DAILY_SLOT_CAP }), "error", t("account.scheduleLimitToastTitle"));
        return false;
      }
      if (otherSlots + times.length > USER_DAILY_SLOT_CAP) {
        notify(
          t("account.dayLimitReached", {
            limit: USER_DAILY_SLOT_CAP,
            other: otherSlots,
            available: Math.max(0, USER_DAILY_SLOT_CAP - otherSlots),
          }),
          "error",
          t("account.scheduleLimitToastTitle"),
        );
        return false;
      }
      const updated = await apiClient.updateAccount(id!, {
        channelName,
        theme,
        lang: cleanSources[0] || lang,
        sourceDecks: cleanSources,
        channelLang: effectiveChannelLang,
        schedule: times,
        slotVideos,
        slotDecks: cleanSlotDecks,
      });
      setAccount(updated);
      setLang(updated.lang);
      setSourceDecks(updated.sourceDecks?.length ? updated.sourceDecks : [updated.lang]);
      setChannelLang(updated.channelLang || DECK_LANG[updated.lang] || channelLang);
      setSlotDecks(updated.slotDecks || {});
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

  // Owned by the current user? (account.userId is only populated on the admin scope=all listing.)
  const ownedByMe = !account?.userId || account.userId === user?.id;

  // Which Google key this channel is bound to — for the "connected via" badge (resolvable for the owner).
  const boundClient = account?.oauthClientId ? clients.find((c) => c.id === account.oauthClientId) ?? null : null;
  // Option B: until a channel is connected to YouTube you can't schedule it or prepare/queue videos.
  const isConnected = account?.status === "connected";

  // Decide how to connect: 0 keys → prompt; 1 key → use it; >1 → let the user pick which Google key.
  async function startConnect() {
    if (!ownedByMe) {
      connect(); // admin connecting someone else's channel — let the server resolve the owner's key
      return;
    }
    try {
      const { clients } = await apiClient.youtubeClients();
      if (!clients.length) {
        notify(t("account.noKeysConnect"), "error");
        return;
      }
      if (clients.length === 1) {
        connect(clients[0].id);
        return;
      }
      setKeyChoices(clients);
    } catch (e) {
      notify(e instanceof Error ? e.message : t("account.connectStartFailed"), "error");
    }
  }

  async function connect(clientId?: number) {
    setKeyChoices(null);
    console.log("[привязка] старт: запрашиваю ссылку авторизации Google", { accountId: id, clientId });
    notify(t("account.openingGoogleAuth"), "info");
    try {
      const { url } = await apiClient.youtubeAuthUrl(id!, clientId);
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

  const PAGE_SIZE = 6;
  const pageCount = Math.max(1, Math.ceil(sortedVideos.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, page), pageCount);
  const pageVideos = sortedVideos.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const postedTwicePlus = videos.filter((v) => v.postCount > 1).length;

  // Only offer packs (languages) the user is allowed to see — generators are filtered server-side.
  // While generators load, show all to avoid an empty dropdown; always keep the channel's current value.
  const currentDeckIds = new Set([lang, ...selectedSources]);
  const gensIds = new Set(gens.map((g) => g.id));
  const visibleLangs =
    gens.length === 0 ? BUILTIN_DECKS : BUILTIN_DECKS.filter(({ id }) => gensIds.has(id) || currentDeckIds.has(id));
  const genById = (id: string) => gens.find((g) => g.id === id);
  const hasVideoSources = visibleLangs.some(({ id }) => !!genById(id)?.preFact);
  const hasTextSources = visibleLangs.some(({ id }) => !genById(id)?.preFact) || packs.length > 0;
  const showPackKind = hasVideoSources && hasTextSources;

  // Опции дропдаунов контента канала: встроенные паки + группа «Кастомные паки» (свои паки по имени) —
  // тот же набор, что в Студии, чтобы пак можно было назначить каналу и генерить из него.
  const packIds = new Set(packs.map((p) => `pack:${p.id}`));
  // язык выбранного контента (встроенный или свой пак) — для тега и проверки совпадения с языком канала
  const contentLang = (id: string): string =>
    id.startsWith("pack:") ? packs.find((p) => `pack:${p.id}` === id)?.lang || "" : DECK_LANG[id] || id;
  const curContentLang = contentLang(activeGenerateDeck);
  const mismatchedSources = selectedSources.filter((deckId) => {
    const lng = contentLang(deckId);
    return !!channelLang && !!lng && lng !== channelLang;
  });
  const langMismatch = mismatchedSources.length > 0;
  const deckName = (deckId: string) => {
    if (deckId.startsWith("pack:")) {
      const p = packs.find((x) => `pack:${x.id}` === deckId);
      return p ? p.name : `${deckId.slice(5)} ${t("account.noAccess")}`;
    }
    return genById(deckId)?.name || BUILTIN_DECKS.find((d) => d.id === deckId)?.label || deckId;
  };
  const deckMeta = (deckId: string) => {
    const lng = contentLang(deckId);
    const count = sourceRemaining(deckId);
    const suffix = deckId.startsWith("pack:") ? t("account.cardsCount", { n: count }) : t("account.availableCount", { n: count });
    return `${langTag(lng)} · ${suffix}`;
  };
  const updateSources = (next: string[]) => {
    const clean = [...new Set(next.filter(Boolean))];
    const fallback = clean.length ? clean : [lang];
    setSourceDecks(fallback);
    setLang(fallback[0] || lang);
    const sourceLangs = [...new Set(fallback.map(contentLang).filter(Boolean))];
    if (sourceLangs.length === 1) setChannelLang(sourceLangs[0]);
    setGenerateDeck((cur) =>
      cur === GENERATE_ALL_DECKS && fallback.length > 1 ? cur : fallback.includes(cur) ? cur : fallback[0] || "",
    );
    setSlotDecks((prev) => Object.fromEntries(Object.entries(prev).filter(([, deckId]) => fallback.includes(deckId))));
  };
  const savedSources = account ? (account.sourceDecks?.length ? account.sourceDecks : [account.lang]) : selectedSources;
  const sourcesDirty = savedSources.join("\u001f") !== selectedSources.join("\u001f");
  const deckOptions = (excludeSelected = false) => (
    <>
      {visibleLangs.length > 0 && (
        <optgroup label={t("account.builtinPacks")}>
          {visibleLangs.filter(({ id: code }) => !excludeSelected || !selectedSources.includes(code)).map(({ id: code, label }) => (
            <option key={code} value={code}>
              {/* полное имя пака (как в Студии: «Русские анекдоты» и т.п.), а не язык */}
              {showPackKind ? `[${genById(code)?.preFact ? t("packKind.video") : t("packKind.text")}] ` : ""}
              {genById(code)?.name || label} · {langTag(DECK_LANG[code] || code)}
            </option>
          ))}
        </optgroup>
      )}
      {(packs.length > 0 || selectedSources.some((x) => x.startsWith("pack:") && !packIds.has(x))) && (
        <optgroup label={isAdmin ? t("account.customPacks") : t("account.myPacks")}>
          {packs.filter((p) => !excludeSelected || !selectedSources.includes(`pack:${p.id}`)).map((p) => (
            <option key={p.id} value={`pack:${p.id}`}>
              {showPackKind ? `[${t("packKind.text")}] ` : ""}
              {p.name} · {langTag(p.lang)}
            </option>
          ))}
          {selectedSources
            .filter((x) => x.startsWith("pack:") && !packIds.has(x) && (!excludeSelected || !selectedSources.includes(x)))
            .map((x) => (
              <option key={x} value={x}>{x.slice(5)} {t("account.noAccess")}</option>
            ))}
        </optgroup>
      )}
    </>
  );
  const libraryDeckCounts = videos.reduce((map, v) => map.set(v.deck, (map.get(v.deck) || 0) + 1), new Map<string, number>());
  const slotDeckOptions = selectedSources.filter((deckId) => (libraryDeckCounts.get(deckId) || 0) > 0);

  // Per-channel cap: ≤20 slots/day; per-user aggregate cap stays separate.
  const isAdmin = user?.role === "admin";
  const dayUsed = otherSlots + times.length; // posts/day across all the user's channels
  const scheduleRemaining = Math.max(0, USER_DAILY_SLOT_CAP - otherSlots); // max slots this channel may hold
  const takenMinutes = new Set(otherTimes.map(toMin)); // minutes busy on other channels → generator avoids them
  const perDayMax = Math.min(ACCOUNT_DAILY_SLOT_CAP, scheduleRemaining); // cap for the «раз в день» generator
  const notifyScheduleLimit = () =>
    notify(
      t("account.dayLimitReached", {
        limit: USER_DAILY_SLOT_CAP,
        other: otherSlots,
        available: scheduleRemaining,
      }),
      "error",
      t("account.scheduleLimitToastTitle"),
    );

  const noticeToast =
    notice && typeof document !== "undefined"
      ? createPortal(
          <div className="toast toast-bottom toast-end z-[1000] pointer-events-none">
            <div
              role="alert"
              className={`pointer-events-auto w-[min(22rem,calc(100vw-2rem))] rounded-md border px-3 py-2.5 shadow-2xl ring-1 ${
                notice.kind === "error"
                  ? "border-error/40 border-l-4 bg-error text-error-content ring-error/25"
                  : notice.kind === "success"
                    ? "border-success/40 border-l-4 bg-success text-success-content ring-success/25"
                    : "border-info/40 border-l-4 bg-info text-info-content ring-info/25"
              }`}
            >
              <div className="flex items-start gap-2">
                {notice.kind === "success" ? (
                  <Check size={18} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold leading-tight">
                    {notice.title ?? (notice.kind === "success" ? t("common.saved") : t("common.error"))}
                  </div>
                  <div className="mt-1 whitespace-normal break-words text-xs font-semibold leading-snug">{notice.text}</div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (!account) return <div className="text-base-content/60">{t("common.loading")}</div>;

  return (
    <div className="space-y-6 max-w-screen-2xl">
      {noticeToast}
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
        {account.authError ? (
          <span className="badge badge-error gap-1">
            <AppIcon name="warning" size={13} /> {t("account.reconnectBadge")}
          </span>
        ) : account.status === "connected" ? (
          <span className="badge badge-success">{t("account.connected")}</span>
        ) : (
          <span className="badge badge-warning">{t("account.needsAuth")}</span>
        )}
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] gap-6 items-start">
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
              <span className={`text-xs ${dayUsed > USER_DAILY_SLOT_CAP ? "text-error font-medium" : "text-base-content/50"}`}>
                {t("account.perDayAllChannels", { n: dayUsed, limit: USER_DAILY_SLOT_CAP })}
              </span>
            </div>

            {!isConnected && (
              <div className="text-xs text-warning mb-2 flex items-center gap-1.5">
                <AppIcon name="warning" size={13} /> {t("account.connectFirstHint")}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-1 items-center">
              <span className="text-sm text-base-content/60">{t("account.timesPerDay")}</span>
              {[1, 2, 3, 4, 6].map((n) => (
                <button
                  key={n}
                  className="btn btn-xs btn-outline"
                  disabled={!isConnected}
                  onClick={() => {
                    if (n > ACCOUNT_DAILY_SLOT_CAP) {
                      notify(t("account.accountDayLimitReached", { n: ACCOUNT_DAILY_SLOT_CAP }), "error", t("account.scheduleLimitToastTitle"));
                      return;
                    }
                    if (otherSlots + n > USER_DAILY_SLOT_CAP) {
                      notifyScheduleLimit();
                      return;
                    }
                    setTimes(randomDayTimes(n, takenMinutes));
                  }}
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
                max={Math.max(1, perDayMax)}
                className="input input-bordered input-xs w-16"
                value={perDayInput}
                onChange={(e) =>
                  setPerDayInput(Math.max(1, Math.min(Math.max(1, perDayMax), Number(e.target.value) || 1)))
                }
                aria-label={t("account.timesPerDayAria")}
              />
              <button
                className="btn btn-xs btn-primary gap-1"
                disabled={!isConnected}
                onClick={() => {
                  if (perDayInput > ACCOUNT_DAILY_SLOT_CAP) {
                    notify(t("account.accountDayLimitReached", { n: ACCOUNT_DAILY_SLOT_CAP }), "error", t("account.scheduleLimitToastTitle"));
                    return;
                  }
                  if (otherSlots + perDayInput > USER_DAILY_SLOT_CAP) {
                    notifyScheduleLimit();
                    return;
                  }
                  setTimes(randomDayTimes(Math.min(perDayInput, perDayMax), takenMinutes));
                }}
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
                disabled={!isConnected}
                onClick={() => {
                  const v = newTime.trim();
                  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
                    notify(t("account.invalidTime"), "error");
                    return;
                  }
                  if (times.length >= ACCOUNT_DAILY_SLOT_CAP) {
                    notify(t("account.accountDayLimitReached", { n: ACCOUNT_DAILY_SLOT_CAP }), "error", t("account.scheduleLimitToastTitle"));
                    return;
                  }
                  if (times.length >= scheduleRemaining) {
                    notifyScheduleLimit();
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
            <button
              className="btn btn-primary gap-2"
              onClick={save}
              disabled={saving || langMismatch}
              title={langMismatch ? t("account.genTitleMismatch") : undefined}
            >
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
          {account.authError && (
            <div className="alert alert-error text-sm items-start py-2.5">
              <AppIcon name="warning" size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold">{t("account.authErrorTitle")}</div>
                <div className="opacity-90">{account.authError}</div>
                {account.authFailedAt && (
                  <div className="text-xs opacity-70 mt-0.5">
                    {t("account.authErrorSince", { time: formatDateTime(account.authFailedAt) })}
                  </div>
                )}
                <button className="btn btn-sm btn-neutral mt-2 gap-1" onClick={startConnect}>
                  <RefreshCw size={14} /> {t("account.reconnect")}
                </button>
              </div>
            </div>
          )}
          {account.ytChannelTitle ? (
            <>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {account.authError ? (
                <span className="badge badge-error gap-1">
                  <AppIcon name="warning" size={12} /> {t("account.reconnectBadge")}
                </span>
              ) : (
                <span className="badge badge-success">{t("account.connected")}</span>
              )}
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
                onClick={startConnect}
                title={t("account.reconnectTitle")}
              >
                <RefreshCw size={13} /> {t("account.reconnect")}
              </button>
            </div>
            {clients.length > 1 && boundClient && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/60 flex-wrap">
                <BrandIcon name="youtube" size={12} />
                <span>{t("account.connectedViaKey")}:</span>
                <b className="truncate max-w-[14rem]">{boundClient.label}</b>
                {boundClient.projectId && (
                  <span className="text-base-content/45 truncate">· {boundClient.projectId}</span>
                )}
              </div>
            )}
            </>
          ) : (
            <>
              <p className="text-sm text-base-content/60">
                {t("account.connectIntro")}
              </p>
              {justConnected && (
                <p className="text-success text-sm">{t("account.connectedRefresh")}</p>
              )}
              <div>
                <button className="btn btn-primary btn-sm" onClick={startConnect}>
                  {t("account.connectChannel")}
                </button>
              </div>
            </>
          )}

          {/* Key picker — shown when the owner has more than one Google key (each channel binds to one). */}
          {keyChoices && (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="text-sm font-medium">{t("account.chooseKey")}</div>
              <div className="flex flex-col gap-1.5">
                {keyChoices.map((k) => (
                  <button
                    key={k.id}
                    className="btn btn-sm btn-outline justify-start gap-2 normal-case"
                    onClick={() => connect(k.id)}
                  >
                    <BrandIcon name="youtube" size={14} />
                    <span className="truncate">{k.label}</span>
                    {k.projectId && <span className="text-xs text-base-content/50 truncate">· {k.projectId}</span>}
                  </button>
                ))}
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => setKeyChoices(null)}>
                {t("common.cancel")}
              </button>
            </div>
          )}
        </div>
      </section>
      </div>

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
          <div className="mt-3 pt-3 border-t border-base-300 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(380px,auto)] gap-3 items-start">
            <div className="rounded-md border border-base-300 bg-base-200/30 p-3 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-medium text-sm">{t("account.channelPacks")}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSources.map((deckId, index) => (
                  <span
                    key={deckId}
                    className={`inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                      index === 0 ? "border-primary/50 bg-primary/10 text-primary" : "border-base-300 bg-base-100"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold max-w-[15rem]" title={deckName(deckId)}>
                        {deckName(deckId)}
                      </span>
                      <span className="block text-[11px] opacity-70 leading-tight">{deckMeta(deckId)}</span>
                    </span>
                    {selectedSources.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-square shrink-0"
                        title={t("account.removePack")}
                        onClick={() => updateSources(selectedSources.filter((x) => x !== deckId))}
                      >
                        <AppIcon name="close" size={12} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <select
                className="select select-bordered select-sm w-full max-w-sm mt-2"
                aria-label={t("account.addPack")}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  updateSources([...selectedSources, e.target.value]);
                  setGenerateDeck(e.target.value);
                }}
                title={t("account.channelPackTitle")}
              >
                <option value="">{t("account.addPack")}</option>
                {deckOptions(true)}
              </select>
            </div>

            <div className="rounded-md border border-base-300 bg-base-200/30 p-3">
              <div className="font-medium text-sm mb-2">{t("account.generateToLibrary")}</div>
              {!isConnected && (
                <div className="text-xs text-warning mb-2 flex items-center gap-1.5">
                  <AppIcon name="warning" size={13} /> {t("account.connectFirstHint")}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="select select-bordered select-sm min-w-[12rem] flex-1"
                  value={activeGenerateDeck}
                  onChange={(e) => setGenerateDeck(e.target.value)}
                  aria-label={t("account.generatePack")}
                >
                  {canGenerateAllSources && (
                    <option value={GENERATE_ALL_DECKS}>{t("account.generateAll")}</option>
                  )}
                  {selectedSources.map((deckId) => (
                    <option key={deckId} value={deckId}>
                      {deckName(deckId)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, maxBatch)}
                  className="input input-bordered input-sm w-[4.5rem]"
                  value={batchN}
                  disabled={maxBatch < 1}
                  onChange={(e) => setBatchN(Math.max(1, Math.min(maxBatch, Number(e.target.value) || 1)))}
                  aria-label={t("account.howManyVideosAria")}
                />
                <span className="text-xs text-base-content/50 shrink-0">
                  {maxBatch < 1 ? t("account.noCards") : `1–${maxBatch}`}
                </span>
                <button
                  className="btn btn-sm btn-primary gap-1"
                  onClick={async () => {
                    if (sourcesDirty && !(await save())) return;
                    q.run(id!, Math.min(batchN, maxBatch), generateDeckIds);
                  }}
                  disabled={langMismatch || saving || maxBatch < 1 || !isConnected}
                  title={langMismatch ? t("account.genTitleMismatch") : t("account.generateSelectedTitle")}
                >
                  <Plus size={14} /> {t("account.generateButton")}
                </button>
              </div>
              <div className="flex flex-wrap justify-end gap-2 mt-2">
                {q.running && (
                  <button className="btn btn-sm btn-outline btn-error gap-1" onClick={q.cancel}>
                    <Loader2 className="animate-spin" size={14} /> {t("account.stop")}
                  </button>
                )}
              </div>
            </div>

            {/* Предупреждения и доп-действия — отдельными строками, тулбар не ломают */}
            {langMismatch && (
              <div
                role="alert"
                className="xl:col-span-2 flex items-start gap-2 rounded-md border border-error/40 bg-error/10 px-3 py-2 text-sm font-semibold text-error"
              >
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <span>
                  {t("account.langMismatchWarn", {
                    content: mismatchedSources.map((x) => langTag(contentLang(x))).join(", ") || langTag(curContentLang),
                    channel: langTag(channelLang),
                  })}
                </span>
              </div>
            )}
            {sourcesDirty && videos.length > 0 && (
              <span className="xl:col-span-2 text-xs text-warning">{t("account.oldVideosWarn")}</span>
            )}
            {postedTwicePlus > 0 && (
              <div className="xl:col-span-2 flex justify-end">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-4 mt-3">
              {pageVideos.map((v) => (
                <div key={v.id} className="group min-w-0">
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] rounded-lg overflow-hidden border border-base-300 bg-base-200">
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
                  <div className="mx-auto mt-1.5 max-w-[280px] text-sm font-medium leading-tight line-clamp-2" title={cleanDisplayText(v.title)}>
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

      {preview &&
        createPortal(
          <div
            className="modal modal-open modal-middle z-[1000]"
            role="dialog"
            aria-modal="true"
            onClick={() => setPreview(null)}
          >
            <div
              className="modal-box relative w-[calc(100vw-1.5rem)] max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-xl bg-base-100 p-0 shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label={t("common.close")}
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 z-20 bg-base-100/70 hover:bg-base-100"
              >
                <X size={16} />
              </button>
              <div className="flex min-h-0 w-full flex-col sm:flex-row">
                <div className="flex min-h-0 shrink-0 items-center justify-center bg-black sm:order-2 sm:w-[300px]">
                  <VideoPlayer
                    src={`/files/${preview.videoRel}`}
                    poster={preview.imageRel ? `/files/${preview.imageRel}` : undefined}
                    className="h-[50dvh] max-h-[460px] w-full object-contain sm:aspect-[9/16] sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
                  />
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:order-1 sm:p-4">
                  <h3 className="font-bold text-base leading-snug">{cleanDisplayText(preview.title)}</h3>
                  {preview.text && (
                    <p className="max-h-[14dvh] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-base-content/80 sm:max-h-[40vh]">
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
            <div className="modal-backdrop bg-black/55" />
          </div>,
          document.body,
        )}

      {avatarOpen && (
        <div className="modal modal-open modal-middle" onClick={() => !avatarBusy && setAvatarOpen(false)}>
          <div className="modal-box max-w-2xl max-h-[88vh] p-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3">
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
              <div className="flex flex-wrap items-center gap-2">
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
            </div>
            <div className="max-h-[calc(88vh-8.5rem)] overflow-y-auto p-4">
              <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-2 p-1">
              {avatarList.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setAvatar(u)}
                  disabled={avatarBusy}
                  title={t("account.pickAvatar")}
                  className={`rounded-full overflow-hidden border-2 transition w-full aspect-square ${
                    account.avatar === u ? "border-primary" : "border-transparent hover:border-base-300"
                  }`}
                >
                  <img src={u} alt="" className="w-full aspect-square object-cover bg-base-200" loading="lazy" />
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {times.length > 0 && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body">
            <h2 className="card-title text-base">{t("account.slotVideoTitle")}</h2>
            <p className="text-sm text-base-content/60">
              {t("account.slotVideoHint")}
            </p>
            <div className="space-y-2 mt-2">
              {[...times].sort().map((time) => (
                <div key={time} className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                  <span className="badge badge-primary badge-lg w-20 justify-center">{time}</span>
                  <select
                    className="select select-bordered select-sm flex-1"
                    value={slotDecks[time] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSlotVideos((prev) => {
                        const n = { ...prev };
                        delete n[time];
                        return n;
                      });
                      setSlotDecks((prev) => {
                        const n = { ...prev };
                        if (v) n[time] = v;
                        else delete n[time];
                        return n;
                      });
                    }}
                  >
                    <option value="">{t("account.slotAuto")}</option>
                    {slotDeckOptions.map((deckId) => (
                      <option key={deckId} value={deckId}>
                        {deckName(deckId)} · {t("account.libraryVideosCount", { n: libraryDeckCounts.get(deckId) || 0 })}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="text-xs text-base-content/50 mt-1">
              {slotDeckOptions.length === 0 ? t("account.slotNeedsLibrary") : t("account.slotSaveReminder")}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
