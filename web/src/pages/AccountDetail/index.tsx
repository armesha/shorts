import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Save, Trash2, Check, Plus, RefreshCw, Loader2, Play, Upload } from "lucide-react";
import { apiClient, type Account, type VideoItem, type Generator, type PackSummary, type OAuthClient, type AccountReadiness } from "../../lib/api";
import { confirmDialog } from "../../lib/confirm";
import { useAuth } from "../../lib/auth";
import { useGenQueue } from "../../lib/genQueue";
import { useT } from "../../lib/i18n";
import { AppIcon } from "../../components/AppIcon";
import { BUILTIN_DECKS, CONTENT_LANGS, DECK_LANG, type DeckGroup } from "../../lib/deck";
import { cleanDisplayText } from "../../lib/text";
import { toMin, randomDayTimes, accountDailySlotCap, USER_DAILY_SLOT_CAP } from "./schedule";
import {
  GENERATE_ALL_DECKS,
  genById as srcGenById,
  sourceRemaining as srcSourceRemaining,
  contentLang as srcContentLang,
  mismatchedSources as srcMismatchedSources,
  deckName as srcDeckName,
  deckMeta as srcDeckMeta,
  deckGroups as srcDeckGroups,
} from "./sources";
import VideoPreviewModal from "./VideoPreviewModal";
import NoticeToast from "./NoticeToast";
import YouTubeConnectionCard from "./YouTubeConnectionCard";
import LibrarySection from "./LibrarySection";
import SlotDeckAssignments from "./SlotDeckAssignments";

function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(new Error("read error"));
    fr.readAsDataURL(file);
  });
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
  const [readiness, setReadiness] = useState<AccountReadiness | null>(null);
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
  const longVideoDecksRef = useRef<string[]>([]);
  const [longVideoDecks, setLongVideoDecksState] = useState<string[]>([]);
  const setLongVideoDecks = (next: string[]) => {
    longVideoDecksRef.current = next;
    setLongVideoDecksState(next);
  };
  const [generateDeck, setGenerateDeck] = useState("");
  const [addingLongVideoDeck, setAddingLongVideoDeck] = useState<string | null>(null);
  const [lastPosted, setLastPosted] = useState<{ title: string; url: string } | null>(null);
  const [preview, setPreview] = useState<VideoItem | null>(null);
  const [batchN, setBatchN] = useState(5);
  const q = useGenQueue();
  const [clearing, setClearing] = useState(false);
  const [manualUploading, setManualUploading] = useState(false);
  const [manualLimits, setManualLimits] = useState<{ maxFileMb: number; uploadsPerHour: number; durationSec: number } | null>(null);
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

  const reloadReadiness = () => apiClient.accountReadiness(id!).then(setReadiness).catch(() => {});
  const reloadVideos = () =>
    apiClient
      .videos(id!)
      .then((items) => {
        setVideos(items);
        void reloadReadiness();
      })
      .catch(() => {});

  // «Сделать сразу» не больше остатка свободных карточек выбранного контента (дека/пак) — для всех ролей.
  const roleMax = user?.role === "admin" ? 100 : 50; // потолок: админ 100, обычный юзер 50
  // Кап «видео в сутки на канал» зависит от роли ВЛАДЕЛЬЦА канала: админ 20, остальные 18.
  // (Бэкенд — источник истины; здесь это только для UX-валидации/счётчиков.)
  const ownerIsAdmin = user?.role === "admin" && (!account?.userId || account.userId === user?.id);
  const perChannelCap = accountDailySlotCap(ownerIsAdmin);
  const selectedSources = (sourceDecks.length ? sourceDecks : [lang]).filter(Boolean);
  // Остаток = СВОБОДНЫЕ (неиспользованные) карточки. Для пака — available (cards − used), не общее число.
  const sourceRemaining = (deckId: string) => srcSourceRemaining(packs, gens, deckId);
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

  // Load the user's Google keys so a connected channel can show which key/project it posts under.
  useEffect(() => {
    apiClient.youtubeClients().then((r) => setClients(r.clients)).catch(() => {});
  }, []);

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
        setLongVideoDecks(a.longVideoDecks ?? []);
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
    reloadReadiness();
    apiClient.manualVideoLimits().then(setManualLimits).catch(() => {});
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
    if (q.accountId === Number(id)) {
      reloadVideos();
      reloadReadiness();
    }
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
      const cleanLongVideoDecks = [...new Set(longVideoDecksRef.current.filter(Boolean))];
      const sourceLangs = [...new Set(cleanSources.map(contentLang).filter(Boolean))];
      const effectiveChannelLang = sourceLangs.length === 1 ? sourceLangs[0] : channelLangRef.current || channelLang;
      const cleanSlotDecks = Object.fromEntries(
        Object.entries(slotDecks).filter(([time, deck]) => times.includes(time) && (cleanSources.includes(deck) || deck === "manual")),
      );
      if (times.length > perChannelCap) {
        notify(t("account.accountDayLimitReached", { n: perChannelCap }), "error", t("account.scheduleLimitToastTitle"));
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
        longVideoDecks: cleanLongVideoDecks,
        channelLang: effectiveChannelLang,
        schedule: times,
        slotVideos,
        slotDecks: cleanSlotDecks,
      });
      setAccount(updated);
      setLang(updated.lang);
      setSourceDecks(updated.sourceDecks?.length ? updated.sourceDecks : [updated.lang]);
      setLongVideoDecks(updated.longVideoDecks ?? []);
      setChannelLang(updated.channelLang || DECK_LANG[updated.lang] || channelLang);
      setSlotDecks(updated.slotDecks || {});
      setSaved(true);
      void reloadReadiness();
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

  async function uploadManualVideo(file: File | null) {
    if (!file) return;
    if (!/\.mp4$/i.test(file.name)) {
      notify(t("account.manualUploadTypeError"), "error");
      return;
    }
    const maxFileMb = manualLimits?.maxFileMb ?? 40;
    if (file.size > maxFileMb * 1024 * 1024) {
      notify(t("account.manualUploadTooBig", { mb: maxFileMb }), "error");
      return;
    }
    setManualUploading(true);
    try {
      const dataUrl = await readDataUrl(file);
      const v = await apiClient.uploadVideo({
        accountId: Number(id),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
      });
      setVideos((cur) => [v, ...cur]);
      setPage(1);
      notify(t("account.manualUploadSuccess"), "success");
    } catch (e) {
      notify(t("account.manualUploadFailed") + " " + String(e), "error");
    } finally {
      setManualUploading(false);
    }
  }

  async function addLongVideoToLibrary(deckId: string) {
    if (!deckId) return;
    if (!longVideoDecks.includes(deckId)) {
      notify(t("account.longVideoEnableFirst"), "error");
      return;
    }
    if ((sourcesDirty || longVideoDecksDirty) && !(await save())) return;
    setAddingLongVideoDeck(deckId);
    try {
      const v = await apiClient.addLongVideoToLibrary(id!, deckId);
      setVideos((cur) => [v, ...cur]);
      setPage(1);
      notify(t("account.longVideoAdded"), "success");
      void reloadReadiness();
      apiClient.generators().then(setGens).catch(() => {});
    } catch (e) {
      notify(t("account.longVideoAddFailed") + " " + String(e), "error");
    } finally {
      setAddingLongVideoDeck(null);
    }
  }

  async function removeVid(vid: number) {
    if (!(await confirmDialog(t("account.deleteVideoConfirm"), { confirmText: t("common.delete"), danger: true }))) return;
    await apiClient.deleteVideo(vid);
    await reloadVideos();
  }

  // Удалить все ролики, которые выкладывались больше одного раза (postCount > 1).
  async function removePosted(candidates = videos) {
    const targets = candidates.filter((v) => v.postCount > 1);
    if (targets.length === 0) return;
    if (!(await confirmDialog(t("account.deletePostedConfirm", { n: targets.length }), { confirmText: t("common.delete"), danger: true }))) return;
    for (const v of targets) await apiClient.deleteVideo(v.id);
    await reloadVideos();
  }

  // Очистить ВСЮ библиотеку канала (например, после смены пака — старый контент больше не подходит).
  async function clearLibrary(targets = videos) {
    if (targets.length === 0) return;
    if (!(await confirmDialog(t("account.clearLibraryConfirm", { n: targets.length }), { title: t("account.clearLibraryTitle"), confirmText: t("account.deleteAll"), danger: true }))) return;
    setClearing(true);
    try {
      for (const v of [...targets]) await apiClient.deleteVideo(v.id);
      await reloadVideos();
    } catch (e) {
      notify(t("account.clearLibraryFailed") + " " + String(e), "error");
    } finally {
      setClearing(false);
    }
  }

  const allLongVideoGens = gens.filter((g) => g.longVideo);
  const longVideoGens = allLongVideoGens.filter((g) => !channelLang || (DECK_LANG[g.id] || g.id) === channelLang);
  const normalGens = gens.filter((g) => !g.longVideo);
  const longVideoDeckIds = new Set(allLongVideoGens.map((g) => g.id));
  const isLongVideoDeck = (deckId: string) => longVideoDeckIds.has(deckId) || longVideoDecks.includes(deckId);
  const regularVideos = videos.filter((v) => !isLongVideoDeck(v.deck));
  const longLibraryVideos = videos.filter((v) => isLongVideoDeck(v.deck));
  const sortedVideos = [...regularVideos].sort((a, b) =>
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
  const postedTwicePlus = regularVideos.filter((v) => v.postCount > 1).length;

  // Only offer packs (languages) the user is allowed to see — generators are filtered server-side.
  // While generators load, show all to avoid an empty dropdown; always keep the channel's current value.
  const currentDeckIds = new Set([lang, ...selectedSources]);
  const gensIds = new Set(normalGens.map((g) => g.id));
  const visibleLangs =
    gens.length === 0 ? BUILTIN_DECKS : BUILTIN_DECKS.filter(({ id }) => gensIds.has(id) || currentDeckIds.has(id));
  const genById = (id: string) => srcGenById(normalGens, id);
  const hasVideoSources = visibleLangs.some(({ id }) => !!genById(id)?.preFact);
  const hasTextSources = visibleLangs.some(({ id }) => !genById(id)?.preFact) || packs.length > 0;
  const showPackKind = hasVideoSources && hasTextSources;

  // Опции дропдаунов контента канала: встроенные паки + группа «Кастомные паки» (свои паки по имени) —
  // тот же набор, что в Студии, чтобы пак можно было назначить каналу и генерить из него.
  const packIds = new Set(packs.map((p) => `pack:${p.id}`));
  // язык выбранного контента (встроенный или свой пак) — для тега и проверки совпадения с языком канала
  const contentLang = (id: string): string => srcContentLang(packs, id);
  const curContentLang = contentLang(activeGenerateDeck);
  const mismatchedSources = srcMismatchedSources(packs, selectedSources, channelLang);
  const langMismatch = mismatchedSources.length > 0;
  const deckName = (deckId: string) => srcDeckName(packs, gens, t, deckId);
  const deckMeta = (deckId: string) => srcDeckMeta(packs, gens, t, deckId);
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
    setSlotDecks((prev) => Object.fromEntries(Object.entries(prev).filter(([, deckId]) => fallback.includes(deckId) || deckId === "manual")));
  };
  useEffect(() => {
    if (longVideoDeckIds.size === 0) return;
    const misplaced = selectedSources.filter((deckId) => longVideoDeckIds.has(deckId));
    if (misplaced.length === 0) return;
    const normalSources = selectedSources.filter((deckId) => !longVideoDeckIds.has(deckId));
    const fallback = normalSources.length
      ? normalSources
      : [normalGens.find((g) => contentLang(g.id) === channelLang)?.id || normalGens[0]?.id || "ru"];
    setSourceDecks(fallback);
    setLang(fallback[0] || "ru");
    setLongVideoDecks([...new Set([...longVideoDecks, ...misplaced])]);
    setGenerateDeck((cur) => (fallback.includes(cur) ? cur : fallback[0] || ""));
    setSlotDecks((prev) => Object.fromEntries(Object.entries(prev).filter(([, deckId]) => fallback.includes(deckId) || deckId === "manual")));
  }, [channelLang, contentLang, longVideoDeckIds, longVideoDecks, normalGens, selectedSources]);
  const savedSources = account ? (account.sourceDecks?.length ? account.sourceDecks : [account.lang]) : selectedSources;
  const sourcesDirty = savedSources.join("") !== selectedSources.join("");
  const savedLongVideoDecks = account?.longVideoDecks ?? [];
  const longVideoDecksDirty = savedLongVideoDecks.join("") !== longVideoDecks.join("");
  const updateLongVideoDecks = (next: string[]) => setLongVideoDecks([...new Set(next.filter(Boolean))]);
  // Единый пикер источников: встроенные деки + кастомные паки, сгруппированы только по языку.
  // Группы (данные) считает чистый хелпер sources.ts; здесь только JSX-рендер <optgroup>.
  const deckOptions = (excludeSelected = false) => {
    const groups: DeckGroup[] = srcDeckGroups(packs, normalGens, visibleLangs, selectedSources, packIds, t, excludeSelected);
    return groups.map((grp) => (
      <optgroup key={grp.key} label={grp.title}>
        {grp.items.map((it) => (
          <option key={it.id} value={it.id}>
            {showPackKind ? `[${it.longVideo ? t("packKind.longVideo") : it.video ? t("packKind.video") : t("packKind.text")}] ` : ""}
            {it.label}
          </option>
        ))}
      </optgroup>
    ));
  };
  const libraryDeckCounts = videos.reduce((map, v) => map.set(v.deck, (map.get(v.deck) || 0) + 1), new Map<string, number>());
  const slotDeckOptions = [
    ...selectedSources.filter((deckId) => (libraryDeckCounts.get(deckId) || 0) > 0),
    ...(libraryDeckCounts.get("manual") ? ["manual"] : []),
  ];
  const librarySourceName = (deckId: string) => deckId === "manual" ? t("account.manualVideoBadge") : deckName(deckId);
  const manualMaxFileMb = manualLimits?.maxFileMb ?? 40;
  const manualDurationSec = manualLimits?.durationSec ?? 60;
  const manualUploadsPerHour = manualLimits?.uploadsPerHour ?? 100;

  // Per-channel cap: ≤20 slots/day; per-user aggregate cap stays separate.
  const dayUsed = otherSlots + times.length; // posts/day across all the user's channels
  const scheduleRemaining = Math.max(0, USER_DAILY_SLOT_CAP - otherSlots); // max slots this channel may hold
  const takenMinutes = new Set(otherTimes.map(toMin)); // minutes busy on other channels → generator avoids them
  const perDayMax = Math.min(perChannelCap, scheduleRemaining); // cap for the «раз в день» generator
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

  const readinessBadge =
    readiness?.status === "ready" ? "badge-success" : readiness?.status === "warning" ? "badge-warning" : "badge-error";
  const readinessTitle =
    readiness?.status === "ready"
      ? t("account.readinessReady")
      : readiness?.status === "warning"
        ? t("account.readinessWarning")
        : t("account.readinessBlocked");
  const readinessReason = (code: string) => t(`account.readinessReason.${code}`);
  const readinessAction = (action: string) => {
    if (action === "connect_youtube") return t("account.readinessActionConnect");
    if (action === "set_schedule") return t("account.readinessActionSchedule");
    if (action === "fix_sources") return t("account.readinessActionSources");
    if (action === "generate_or_upload") return t("account.readinessActionContent");
    return t("account.readinessActionQueue");
  };
  const readinessRunway =
    readiness?.runwayDays == null ? "—" : readiness.runwayDays < 1 ? "<1" : readiness.runwayDays.toFixed(readiness.runwayDays < 10 ? 1 : 0);
  const deckRunwayText = (days: number | null) => (days == null ? "—" : days < 1 ? "<1" : days.toFixed(days < 10 ? 1 : 0));
  const deckReadinessClass = (status: string) =>
    status === "ok" ? "badge-success" : status === "idle" ? "badge-ghost" : status === "low" ? "badge-warning" : "badge-error";
  const deckReadinessLabel = (status: string) =>
    status === "ok"
      ? t("account.deckReadinessOk")
      : status === "idle"
        ? t("account.deckReadinessIdle")
        : status === "low"
          ? t("account.deckReadinessLow")
          : t("account.deckReadinessEmpty");

  if (!account) return <div className="text-base-content/60">{t("common.loading")}</div>;
  const youtubeChannelUrl = account.ytChannelId ? `https://www.youtube.com/channel/${account.ytChannelId}` : null;
  const avatarNode = account.avatar ? (
    <img
      src={account.avatar}
      alt=""
      className="w-14 h-14 rounded-full object-cover border border-base-300 bg-base-200"
    />
  ) : (
    <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl font-bold">
      {(channelName || "?").trim()[0] || "?"}
    </div>
  );

  return (
    <div className="space-y-6 max-w-screen-2xl">
      <NoticeToast notice={notice} t={t} />
      <Link to="/accounts" className="btn btn-ghost btn-sm gap-2">
        <ArrowLeft size={16} /> {t("account.backToChannels")}
      </Link>

      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {youtubeChannelUrl ? (
            <a
              href={youtubeChannelUrl}
              target="_blank"
              rel="noreferrer"
              title={t("account.openYouTubeChannel")}
              aria-label={t("account.openYouTubeChannel")}
              className="relative group shrink-0 rounded-full"
            >
              {avatarNode}
              <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/45 flex items-center justify-center text-white text-[10px] font-medium opacity-0 group-hover:opacity-100 transition">
                YouTube
              </span>
            </a>
          ) : (
            <div className="shrink-0 rounded-full">{avatarNode}</div>
          )}
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

      {readiness && (
        <section className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${readinessBadge}`}>{readinessTitle}</span>
                  <h2 className="card-title text-base">{t("account.cockpitTitle")}</h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-base-content/60">{t("account.cockpitSubtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {readiness.actions.map((action) =>
                  action === "connect_youtube" ? (
                    <button key={action} className="btn btn-sm btn-primary" onClick={startConnect}>
                      {readinessAction(action)}
                    </button>
                  ) : action === "open_queue" ? (
                    user?.role === "admin" ? (
                      <Link key={action} to="/queue" className="btn btn-sm btn-outline">
                        {readinessAction(action)}
                      </Link>
                    ) : null
                  ) : (
                    <a
                      key={action}
                      href={action === "generate_or_upload" ? "#channel-content" : "#channel-settings"}
                      className="btn btn-sm btn-outline"
                    >
                      {readinessAction(action)}
                    </a>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-base-200 p-3">
                <div className="text-2xl font-black">{readiness.queuedVideos}</div>
                <div className="text-xs text-base-content/55">{t("account.cockpitQueued")}</div>
              </div>
              <div className="rounded-2xl bg-base-200 p-3">
                <div className="text-2xl font-black">{readiness.postsPerDay}</div>
                <div className="text-xs text-base-content/55">{t("account.cockpitPerDay")}</div>
              </div>
              <div className="rounded-2xl bg-base-200 p-3">
                <div className="text-2xl font-black">{readinessRunway}</div>
                <div className="text-xs text-base-content/55">{t("account.cockpitRunway")}</div>
              </div>
            </div>

            {!!readiness.decks?.length && (
              <div className="rounded-2xl border border-base-300">
                <div className="border-b border-base-300 px-4 py-3">
                  <div className="font-bold">{t("account.deckReadinessTitle")}</div>
                  <div className="text-xs text-base-content/55">
                    {t("account.deckReadinessHint", { n: readiness.minRunwayDays })}
                  </div>
                </div>
                <div className="divide-y divide-base-300">
                  {readiness.decks.map((deck) => (
                    <div key={deck.deckId} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={deckName(deck.deckId)}>
                          {librarySourceName(deck.deckId)}
                        </div>
                        <div className="text-xs text-base-content/45">{deck.deckId}</div>
                      </div>
                      <span className={`badge ${deckReadinessClass(deck.status)}`}>{deckReadinessLabel(deck.status)}</span>
                      <div className="text-sm">
                        <b>{deck.queued}</b> <span className="text-base-content/50">{t("account.deckReadinessQueued")}</span>
                      </div>
                      <div className="text-sm">
                        <b>{deck.postsPerDay}</b> <span className="text-base-content/50">{t("account.deckReadinessPerDay")}</span>
                      </div>
                      <div className="text-sm">
                        <b>{deckRunwayText(deck.runwayDays)}</b> <span className="text-base-content/50">{t("account.deckReadinessDays")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {[...readiness.blockers, ...readiness.warnings].map((code) => (
                <span key={code} className={`badge ${readiness.blockers.includes(code) ? "badge-error" : "badge-warning"} badge-outline`}>
                  {readinessReason(code)}
                </span>
              ))}
              {readiness.blockers.length === 0 && readiness.warnings.length === 0 && (
                <span className="badge badge-success badge-outline">{t("account.cockpitNoIssues")}</span>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] gap-6 items-start">
      <section id="channel-settings" className="card bg-base-100 border border-base-300">
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
                    if (n > perChannelCap) {
                      notify(t("account.accountDayLimitReached", { n: perChannelCap }), "error", t("account.scheduleLimitToastTitle"));
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
                  if (perDayInput > perChannelCap) {
                    notify(t("account.accountDayLimitReached", { n: perChannelCap }), "error", t("account.scheduleLimitToastTitle"));
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
                  if (times.length >= perChannelCap) {
                    notify(t("account.accountDayLimitReached", { n: perChannelCap }), "error", t("account.scheduleLimitToastTitle"));
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

      <YouTubeConnectionCard
        account={account}
        clients={clients}
        boundClient={boundClient}
        keyChoices={keyChoices}
        justConnected={justConnected}
        startConnect={startConnect}
        connect={connect}
        setKeyChoices={setKeyChoices}
        t={t}
      />
      </div>

      <LibrarySection
        account={account}
        accountId={id!}
        videos={regularVideos}
        pageVideos={pageVideos}
        sort={sort}
        setSort={setSort}
        clearing={clearing}
        clearLibrary={() => clearLibrary(regularVideos)}
        selectedSources={selectedSources}
        deckName={deckName}
        deckMeta={deckMeta}
        updateSources={updateSources}
        deckOptions={deckOptions}
        isConnected={isConnected}
        activeGenerateDeck={activeGenerateDeck}
        setGenerateDeck={setGenerateDeck}
        canGenerateAllSources={canGenerateAllSources}
        maxBatch={maxBatch}
        batchN={batchN}
        setBatchN={setBatchN}
        sourcesDirty={sourcesDirty}
        save={save}
        queue={q}
        generateDeckIds={generateDeckIds}
        langMismatch={langMismatch}
        saving={saving}
        manualMaxFileMb={manualMaxFileMb}
        manualDurationSec={manualDurationSec}
        manualUploadsPerHour={manualUploadsPerHour}
        manualUploading={manualUploading}
        uploadManualVideo={uploadManualVideo}
        mismatchedSources={mismatchedSources}
        contentLang={contentLang}
        curContentLang={curContentLang}
        channelLang={channelLang}
        postedTwicePlus={postedTwicePlus}
        removePosted={() => removePosted(regularVideos)}
        lastPosted={lastPosted}
        setPreview={setPreview}
        removeVid={removeVid}
        posting={posting}
        postNow={postNow}
        isLongVideoDeck={isLongVideoDeck}
        librarySourceName={librarySourceName}
        pageCount={pageCount}
        clampedPage={clampedPage}
        setPage={setPage}
        t={t}
      />

      {preview && (
        <VideoPreviewModal
          preview={preview}
          accountStatus={account.status}
          posting={posting}
          onClose={() => setPreview(null)}
          onRemove={removeVid}
          onPost={postNow}
          t={t}
        />
      )}

      <SlotDeckAssignments
        times={times}
        slotDecks={slotDecks}
        slotDeckOptions={slotDeckOptions}
        libraryDeckCounts={libraryDeckCounts}
        librarySourceName={librarySourceName}
        setSlotVideos={setSlotVideos}
        setSlotDecks={setSlotDecks}
        t={t}
      />

      {(longVideoGens.length > 0 || longLibraryVideos.length > 0) && (
        <section id="channel-long-content" className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="card-title text-base">{t("account.longContentTitle")}</h2>
              <div className="flex items-center gap-2">
                {longVideoDecksDirty && (
                  <button className="btn btn-sm btn-outline gap-1" onClick={save} disabled={saving}>
                    {saving ? <span className="loading loading-spinner loading-xs" /> : <Save size={14} />}
                    {t("common.save")}
                  </button>
                )}
                {longLibraryVideos.length > 0 && (
                  <button
                    className="btn btn-sm btn-error btn-outline gap-1"
                    onClick={() => clearLibrary(longLibraryVideos)}
                    disabled={clearing}
                    title={t("account.clearAllTitle")}
                  >
                    {clearing ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                    {t("account.clearAll")}
                  </button>
                )}
              </div>
            </div>

            {longVideoGens.length > 0 && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                {longVideoGens.map((opt) => {
                  const checked = longVideoDecks.includes(opt.id);
                  const inLibrary = longLibraryVideos.filter((v) => v.deck === opt.id).length;
                  const total = opt.total ?? Math.max(opt.available ?? 0, inLibrary);
                  const remaining = Math.min(opt.available ?? total, Math.max(0, total - inLibrary));
                  const busy = addingLongVideoDeck === opt.id;
                  return (
                    <label key={opt.id} className="flex items-center gap-2 rounded-md border border-base-300 bg-base-200/30 p-2 text-sm">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={checked}
                        onChange={(e) =>
                          updateLongVideoDecks(
                            e.target.checked ? [...longVideoDecks, opt.id] : longVideoDecks.filter((deckId) => deckId !== opt.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold" title={deckName(opt.id)}>
                          {deckName(opt.id)}
                        </span>
                      </span>
                      <span className="badge badge-ghost shrink-0">{remaining}</span>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary gap-1 shrink-0"
                        disabled={!checked || !isConnected || busy || saving || remaining < 1}
                        title={
                          !checked
                            ? t("account.longVideoEnableFirst")
                            : remaining < 1
                              ? t("account.longVideoNoFresh")
                              : t("account.longVideoAddTitle")
                        }
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void addLongVideoToLibrary(opt.id);
                        }}
                      >
                        {busy ? <Loader2 className="animate-spin" size={12} /> : <Plus size={12} />}
                        {t("account.longVideoAddButton")}
                      </button>
                    </label>
                  );
                })}
              </div>
            )}

            {longLibraryVideos.length > 0 && (
              <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                {longLibraryVideos.map((v) => (
                  <div key={v.id} className="group min-w-0">
                    <div className="relative mx-auto aspect-video w-full max-w-[360px] overflow-hidden rounded-lg border border-base-300 bg-base-200">
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
                          <img src={`/files/${v.imageRel}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-base-content/30">
                            <Play size={28} />
                          </span>
                        )}
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                          <Play size={34} fill="currentColor" className="text-white opacity-0 drop-shadow-lg transition group-hover:opacity-100" />
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVid(v.id)}
                        title={t("account.removeFromLibrary")}
                        className="btn btn-error btn-xs btn-circle absolute right-1 top-1 z-10 opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => postNow(v.id)}
                        disabled={posting === v.id || account.status !== "connected"}
                        title={account.status !== "connected" ? t("account.connectFirst") : t("account.postNowTitle")}
                        className="btn btn-primary btn-xs absolute inset-x-1.5 bottom-1.5 z-10 gap-1 opacity-0 transition group-hover:opacity-100"
                      >
                        {posting === v.id ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                        {t("account.post")}
                      </button>
                    </div>
                    <div className="mx-auto mt-1.5 max-w-[360px] text-sm font-medium leading-tight line-clamp-2" title={cleanDisplayText(v.title)}>
                      {cleanDisplayText(v.title)}
                    </div>
                    <div className="mx-auto mt-1 max-w-[360px] truncate text-[11px] text-base-content/50">
                      {librarySourceName(v.deck)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
