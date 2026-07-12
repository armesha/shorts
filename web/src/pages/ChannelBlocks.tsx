import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  apiClient,
  type Account,
  type ChannelThemeBlock,
  type ChannelThemeBlockAccount,
  type ChannelThemeBlockNormalizeResult,
  type ChannelThemeBlocksResponse,
  type OAuthClient,
} from "../lib/api";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { langTag } from "../lib/deck";
import { useGenQueue } from "../lib/genQueue";

type Props = {
  onShowClassic: () => void;
};

const DAILY_KEY_CAP = 100;

type BusyState = { blockId: string; kind: "normalize_all" | "schedule" | "account"; lang?: string } | null;
type NormalizeShortage = NonNullable<ChannelThemeBlockNormalizeResult["shortages"]>[number] & { blockTitle?: string };

function shortageDeckLabel(shortage: NormalizeShortage, t: (key: string, vars?: Record<string, string | number>) => string): string {
  return shortage.deckId === "__block_sources" ? t("channelBlocks.availableSources") : shortage.deckName;
}

type BlockDeckSummary = {
  id: string;
  name: string;
  lang: string | null;
  groupId?: string | null;
  groupTitle?: string | null;
  available: number;
  queued: number;
  channels: number;
};

type DeckRunway = {
  account: ChannelThemeBlockAccount;
  deck: ChannelThemeBlockAccount["sourceDecks"][number];
  queued: number;
  postsPerDay: number;
  days: number;
};

type OperationalAccount = Pick<Account, "enabled" | "schedule" | "uploadsToday" | "oauthClientId">;

let channelBlocksCache: ChannelThemeBlocksResponse | null = null;
let accountsCache: Account[] = [];
let clientsCache: OAuthClient[] = [];

function accountsInBlock(block: ChannelThemeBlock): ChannelThemeBlockAccount[] {
  return block.cells.flatMap((cell) => cell.accounts);
}

function deckSummaries(block: ChannelThemeBlock): BlockDeckSummary[] {
  const map = new Map<string, BlockDeckSummary>();
  for (const account of accountsInBlock(block)) {
    for (const deck of account.sourceDecks) {
      const key = deck.id;
      const cur = map.get(key);
      if (cur) {
        cur.available += deck.available;
        cur.queued += deck.queued;
        cur.channels += 1;
      } else {
        map.set(key, {
          id: key,
          name: deck.groupTitle || deck.name,
          lang: deck.lang,
          groupId: deck.groupId,
          groupTitle: deck.groupTitle,
          available: deck.available,
          queued: deck.queued,
          channels: 1,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => (a.lang || "").localeCompare(b.lang || "") || a.name.localeCompare(b.name));
}

function formatRunwayDays(days: number | null): string {
  if (days == null) return "—";
  if (days <= 0) return "0";
  if (days < 1) return "<1";
  return days.toFixed(days < 10 ? 1 : 0);
}

function deckRunways(account: ChannelThemeBlockAccount): DeckRunway[] {
  return account.sourceDecks
    .map((deck) => {
      const postsPerDay = Number(account.scheduledByDeck?.[deck.id] ?? 0);
      if (postsPerDay <= 0) return null;
      const queued = Number(account.queuedByDeck?.[deck.id] ?? deck.queued ?? 0);
      return {
        account,
        deck,
        queued,
        postsPerDay,
        days: queued / postsPerDay,
      };
    })
    .filter((item): item is DeckRunway => !!item && Number.isFinite(item.days))
    .sort((a, b) => a.days - b.days || a.deck.name.localeCompare(b.deck.name));
}

function accountBottleneck(account: ChannelThemeBlockAccount): DeckRunway | null {
  return deckRunways(account)[0] ?? null;
}

function blockBottleneck(block: ChannelThemeBlock): DeckRunway | null {
  return accountsInBlock(block)
    .flatMap((account) => deckRunways(account))
    .sort((a, b) => a.days - b.days || a.account.channelName.localeCompare(b.account.channelName))[0] ?? null;
}

function blockBottleneckLabelKey(block: ChannelThemeBlock, bottleneck: DeckRunway | null): "channelBlocks.bottleneck" | "channelBlocks.weakSource" {
  if (!bottleneck || block.runwayDays == null) return "channelBlocks.bottleneck";
  return bottleneck.days + 0.01 < block.runwayDays ? "channelBlocks.weakSource" : "channelBlocks.bottleneck";
}

function deckDisplayName(deck: ChannelThemeBlockAccount["sourceDecks"][number]): string {
  return deck.groupTitle || deck.name;
}

function accountTotalRunwayDays(account: ChannelThemeBlockAccount): number | null {
  if (account.effectiveRunwayDays !== undefined) return account.effectiveRunwayDays;
  const postsPerDay = account.enabled ? account.schedule.length : 0;
  return postsPerDay > 0 ? (account.effectiveQueued ?? account.queued) / postsPerDay : null;
}

function compactDeckList(decks: string[], max = 4): string {
  const head = decks.slice(0, max);
  const rest = decks.length - head.length;
  return rest > 0 ? `${head.join(", ")} +${rest}` : head.join(", ");
}

function sourceGapTitle(account: ChannelThemeBlockAccount, t: ReturnType<typeof useT>["t"]): string {
  const gaps = account.sourceGaps ?? [];
  if (!gaps.length) return "";
  const lines = gaps.slice(0, 6).map((gap) => {
    const reason =
      gap.reason === "no_free_cards"
        ? ` · ${t("channelBlocks.sourceGapNoFree")}`
        : ` · ${t("channelBlocks.sourceGapEmpty")}`;
    return `${gap.deckName}: ${gap.queued} ${t("channelBlocks.inQueueShort")} · ${gap.postsPerDay} ${t("channelBlocks.perDayShort")}${reason}`;
  });
  if (gaps.length > lines.length) lines.push(`+${gaps.length - lines.length}`);
  return t("channelBlocks.sourceGapWarning", { gaps: lines.join("; ") });
}

function languagePanelClass(count: number): string {
  const base = "rounded-md border border-base-300 bg-base-100";
  if (count >= 4) return `${base} xl:col-span-2`;
  return base;
}

function languageChannelsGridClass(count: number): string {
  if (count >= 4) return "grid grid-cols-1 gap-1.5 p-2 sm:grid-cols-2";
  return "grid grid-cols-1 gap-1.5 p-2";
}

export default function ChannelBlocks({ onShowClassic }: Props) {
  const { t } = useT();
  const queue = useGenQueue();
  const [data, setData] = useState<ChannelThemeBlocksResponse | null>(channelBlocksCache);
  const [accounts, setAccounts] = useState<Account[]>(accountsCache);
  const [clients, setClients] = useState<OAuthClient[]>(clientsCache);
  const [err, setErr] = useState("");
  const [topUpDays, setTopUpDays] = useState(7);
  const [topUpShortages, setTopUpShortages] = useState<NormalizeShortage[]>([]);
  const [topUpPreviewBusy, setTopUpPreviewBusy] = useState(false);
  const [perDay, setPerDay] = useState(12);
  const [sourceWeights, setSourceWeights] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<BusyState>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const [notice, setNotice] = useState("");

  const load = () =>
    apiClient
      .channelThemeBlocks()
      .then((res) => {
        channelBlocksCache = res;
        setData(res);
        setErr("");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));

  const loadOps = () => {
    apiClient.accounts().then((res) => {
      accountsCache = res;
      setAccounts(res);
    }).catch(() => {});
    apiClient.youtubeClients().then((res) => {
      clientsCache = res.clients;
      setClients(res.clients);
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    loadOps();
  }, []);

  const selectedBlock = data?.blocks[0] ?? null;
  const selectedBlockId = selectedBlock?.id ?? null;
  const activeLanguageLabels = data?.languages.map((lang) => lang.label).join(", ") ?? "";
  useEffect(() => {
    if (selectedBlock) setPerDay(Math.max(0, Math.min(20, selectedBlock.postsPerDay)));
  }, [selectedBlock?.id, selectedBlock?.postsPerDay]);
  const savedWeightsKey = useRef<string>("");
  useEffect(() => {
    if (!selectedBlock) return;
    const loaded = Object.fromEntries((selectedBlock.sourceGroups ?? []).map((group) => [group.id, group.weight]));
    savedWeightsKey.current = JSON.stringify(loaded);
    setSourceWeights(loaded);
  }, [selectedBlock?.id, selectedBlock?.sourceGroups]);
  const sourceWeightsKey = useMemo(() => JSON.stringify(sourceWeights), [sourceWeights]);
  // Auto-save the source mix whenever the user edits it (debounced), so it persists on reload.
  useEffect(() => {
    if (!selectedBlock || !selectedBlockId) return;
    const groups = selectedBlock.sourceGroups ?? [];
    if (!groups.length) return;
    const weightsReady = groups.every((group) => Object.prototype.hasOwnProperty.call(sourceWeights, group.id));
    if (!weightsReady) return;
    if (sourceWeightsKey === savedWeightsKey.current) return;
    const blockId = selectedBlockId;
    const weights = sourceWeights;
    const handle = setTimeout(() => {
      apiClient
        .saveChannelThemeBlockSourceWeights(blockId, weights)
        .then((res) => {
          savedWeightsKey.current = JSON.stringify(weights);
          if (channelBlocksCache) {
            channelBlocksCache = {
              ...channelBlocksCache,
              blocks: channelBlocksCache.blocks.map((b) =>
                b.id === blockId ? { ...b, sourceGroups: res.sourceGroups } : b,
              ),
            };
            setData(channelBlocksCache);
          }
        })
        .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    }, 500);
    return () => clearTimeout(handle);
  }, [sourceWeightsKey, selectedBlockId, selectedBlock, sourceWeights]);
  const operationalAccounts = useMemo<OperationalAccount[]>(() => {
    if (!selectedBlock) return accounts;
    const fullById = new Map(accounts.map((account) => [account.id, account]));
    return accountsInBlock(selectedBlock).map((account) => {
      const full = fullById.get(account.id);
      return {
        enabled: full?.enabled ?? account.enabled,
        schedule: full?.schedule ?? account.schedule,
        uploadsToday: full?.uploadsToday ?? 0,
        oauthClientId: full?.oauthClientId ?? null,
      };
    });
  }, [accounts, selectedBlock]);

  useEffect(() => {
    if (!data || !selectedBlock) {
      setTopUpShortages([]);
      setTopUpPreviewBusy(false);
      return;
    }
    if (selectedBlock.totalAccounts <= 0) {
      setTopUpShortages([]);
      setTopUpPreviewBusy(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setTopUpPreviewBusy(true);
      try {
        const res = await apiClient.previewChannelThemeBlockNormalize(selectedBlock.id, undefined, undefined, topUpDays);
        const shortages = (res.shortages ?? []).map((shortage) => ({ ...shortage, blockTitle: selectedBlock.title }));
        if (!cancelled) setTopUpShortages(shortages);
      } catch {
        if (!cancelled) setTopUpShortages([]);
      } finally {
        if (!cancelled) setTopUpPreviewBusy(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, selectedBlock, topUpDays]);

  async function normalizeAllBlocks() {
    if (!data) return;
    setBusy({ blockId: "__all", kind: "normalize_all" });
    setNotice("");
    setTopUpShortages([]);
    try {
      const results: { block: ChannelThemeBlock; res: ChannelThemeBlockNormalizeResult }[] = [];
      for (const block of data.blocks.filter((candidate) => candidate.totalAccounts > 0)) {
        const res = await apiClient.normalizeChannelThemeBlock(block.id, undefined, undefined, topUpDays);
        results.push({ block, res });
        queue.trackJobs(res.jobs);
      }
      const shortages = results.flatMap(({ block, res }) => (res.shortages ?? []).map((shortage) => ({ ...shortage, blockTitle: block.title })));
      setTopUpShortages(shortages);
      setNotice(
        t("channelBlocks.normalizeAllQueued", {
          blocks: results.length,
          jobs: results.reduce((sum, item) => sum + item.res.jobs.length, 0),
          videos: results.reduce((sum, item) => sum + item.res.jobs.reduce((inner, job) => inner + job.total, 0), 0),
          shortages: shortages.length,
        }),
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function applySchedule(block: ChannelThemeBlock) {
    setBusy({ blockId: block.id, kind: "schedule" });
    setNotice("");
    try {
      const res = await apiClient.setChannelThemeBlockSchedule(block.id, perDay, undefined, block.sourceGroups.length ? sourceWeights : undefined);
      const details = res.skipped.length
        ? " (" +
          res.skipped
            .map((s) => {
              const reasonKey = `channelBlocks.skipReason.${s.reason}`;
              let reason = t(reasonKey, { cap: s.cap ?? 0, available: s.available ?? 0 });
              if (reason === reasonKey) reason = t("channelBlocks.skipReason.unknown", { cap: s.cap ?? 0, available: s.available ?? 0 });
              return `${s.channelName} — ${reason}`;
            })
            .join("; ") +
          ")"
        : "";
      setNotice(t("channelBlocks.scheduleApplied", { updated: res.updated.length, skipped: res.skipped.length, details }));
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function addBlockAccount(block: ChannelThemeBlock, lang: string) {
    setBusy({ blockId: block.id, kind: "account", lang });
    setNotice("");
    try {
      await apiClient.createChannelThemeBlockAccount(block.id, lang);
      setNotice(t("channelBlocks.channelCreated", { lang: langTag(lang) }));
      await load();
      loadOps();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function postOneToAllChannels() {
    setPublishingAll(true);
    setNotice("");
    try {
      const res = await apiClient.postOneShortToAllChannels();
      const details = res.items
        .filter((item) => item.status !== "published")
        .slice(0, 4)
        .map((item) => `${item.channelName} — ${item.reason ?? item.status}`)
        .join("; ");
      setNotice(
        t("channelBlocks.bulkPostDone", {
          published: res.published,
          skipped: res.skipped,
          failed: res.failed,
          total: res.total,
          details: details ? ` (${details}${res.items.filter((item) => item.status !== "published").length > 4 ? "; ..." : ""})` : "",
        }),
      );
      await load();
      loadOps();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingAll(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedBlock ? selectedBlock.title : t("channelBlocks.title")}</h1>
          <p className="mt-1 text-sm text-base-content/60">
            {data && activeLanguageLabels
              ? t("channelBlocks.subtitleActive", { languages: activeLanguageLabels })
              : t("channelBlocks.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm btn-error gap-2"
            disabled={publishingAll}
            onClick={() => void postOneToAllChannels()}
            title={t("channelBlocks.bulkPostTitle")}
          >
            {publishingAll ? <span className="loading loading-spinner loading-xs" /> : <BrandIcon name="youtube" size={15} />}
            {t("channelBlocks.bulkPost")}
          </button>
          <button className="btn btn-sm btn-outline gap-2" onClick={onShowClassic}>
            <AppIcon name="library" size={15} />
            {t("channelBlocks.classicView")}
          </button>
        </div>
      </div>

      {err && (
        <div className="alert alert-error text-sm">
          <AppIcon name="warning" size={18} />
          <span>{err}</span>
        </div>
      )}
      {notice && (
        <div className="alert text-sm">
          <AppIcon name="check" size={18} />
          <span>{notice}</span>
        </div>
      )}

      {!data && !err && (
        <div className="flex items-center gap-2 text-base-content/60">
          <span className="loading loading-spinner loading-sm" />
          {t("common.loading")}
        </div>
      )}

      <OperationalSummary accounts={operationalAccounts} clients={clients} />

      {data && selectedBlock && (
        <>
          <TopUpPanel
            days={topUpDays}
            setDays={setTopUpDays}
            busy={busy?.kind === "normalize_all"}
            previewBusy={topUpPreviewBusy}
            shortages={topUpShortages}
            onTopUp={() => void normalizeAllBlocks()}
          />
          <BlockDetail
            block={selectedBlock}
            languages={data.languages}
            perDay={perDay}
            setPerDay={setPerDay}
            busy={busy}
            sourceWeights={sourceWeights}
            setSourceWeights={setSourceWeights}
            applySchedule={applySchedule}
            addBlockAccount={addBlockAccount}
          />
        </>
      )}
    </div>
  );
}

function TopUpPanel({
  days,
  setDays,
  busy,
  previewBusy,
  shortages,
  onTopUp,
}: {
  days: number;
  setDays: (value: number) => void;
  busy: boolean;
  previewBusy: boolean;
  shortages: NormalizeShortage[];
  onTopUp: () => void;
}) {
  const { t } = useT();
  return (
    <section className="rounded-md border border-base-300 bg-base-100 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("channelBlocks.topUpTitle")}</h2>
          <p className="mt-1 text-sm text-base-content/60">{t("channelBlocks.topUpHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-base-content/60">
              {t("channelBlocks.topUpDays")}
            </span>
            <input
              type="number"
              min={1}
              max={365}
              className="input input-bordered input-sm w-24"
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            />
          </label>
          <button className="btn btn-sm btn-outline gap-1 whitespace-nowrap" disabled={busy} onClick={onTopUp}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="refresh" size={14} />}
            {t("channelBlocks.topUpButton")}
          </button>
        </div>
      </div>
      {previewBusy ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-base-content/50">
          <span className="loading loading-spinner loading-xs" />
          {t("channelBlocks.shortagesChecking")}
        </div>
      ) : shortages.length > 0 ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3">
          <div className="text-sm font-semibold text-warning-content">{t("channelBlocks.shortagesTitle")}</div>
          <div className="mt-2 grid gap-1.5">
            {shortages.slice(0, 8).map((shortage) => (
              <div key={`${shortage.blockTitle}-${shortage.accountId}-${shortage.deckId}`} className="text-sm text-base-content/75">
                <span className="font-semibold">{shortage.blockTitle ? `${shortage.blockTitle} · ` : ""}{shortage.channelName}</span>
                {" → "}
                <span>{shortageDeckLabel(shortage, t)}</span>
                {" · "}
                <span className="font-semibold">{t("channelBlocks.shortageMissing", { n: shortage.missing })}</span>
              </div>
            ))}
            {shortages.length > 8 && <div className="text-xs text-base-content/50">+{shortages.length - 8}</div>}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-base-content/45">{t("channelBlocks.shortagesNone")}</div>
      )}
    </section>
  );
}

function BlockDetail({
  block,
  languages,
  perDay,
  setPerDay,
  busy,
  sourceWeights,
  setSourceWeights,
  applySchedule,
  addBlockAccount,
}: {
  block: ChannelThemeBlock;
  languages: ChannelThemeBlocksResponse["languages"];
  perDay: number;
  setPerDay: (value: number) => void;
  busy: BusyState;
  sourceWeights: Record<string, number>;
  setSourceWeights: (value: Record<string, number>) => void;
  applySchedule: (block: ChannelThemeBlock) => Promise<void>;
  addBlockAccount: (block: ChannelThemeBlock, lang: string) => Promise<void>;
}) {
  const { t } = useT();
  const scheduleBusy = busy?.blockId === block.id && busy.kind === "schedule";
  const decks = deckSummaries(block);
  const bottleneck = blockBottleneck(block);
  const bottleneckLabel = blockBottleneckLabelKey(block, bottleneck);
  // Only languages that actually have channels are shown (no rows of empty "пусто" cells just to keep the
  // grid full). Languages with prepared block packs can still be added via the picker, including ones not
  // present yet — so hiding the empty cells doesn't take away the ability to add a new language.
  const [addLang, setAddLang] = useState("");
  const visibleLangs = [...languages]
    .filter((lang) => {
      const cell = block.cells.find((candidate) => candidate.lang === lang.code);
      return (cell?.accounts.length ?? 0) > 0;
    })
    .sort((a, b) => {
      const aCell = block.cells.find((candidate) => candidate.lang === a.code);
      const bCell = block.cells.find((candidate) => candidate.lang === b.code);
      const aViews = aCell ? aCell.accounts.reduce((sum, account) => sum + (account.views ?? 0), 0) : 0;
      const bViews = bCell ? bCell.accounts.reduce((sum, account) => sum + (account.views ?? 0), 0) : 0;
      const aHasViews = aCell?.accounts.some((account) => account.views != null) ?? false;
      const bHasViews = bCell?.accounts.some((account) => account.views != null) ?? false;
      return Number(bHasViews) - Number(aHasViews) || bViews - aViews || a.label.localeCompare(b.label);
    });
  const addableLangs = languages.filter((lang) => {
    const cell = block.cells.find((candidate) => candidate.lang === lang.code);
    return (cell?.defaultSourceDecks.length ?? 0) > 0;
  });
  // Default the picker to a language with no channel yet (the usual "add a new language" intent), then
  // fall back to the user's explicit pick, then to the first addable language.
  const defaultAddLang =
    addableLangs.find((lang) => !visibleLangs.some((vis) => vis.code === lang.code))?.code ??
    addableLangs[0]?.code ??
    "";
  const selectedAddLang = addableLangs.some((lang) => lang.code === addLang) ? addLang : defaultAddLang;
  const addSelectedBusy = busy?.blockId === block.id && busy.kind === "account" && busy.lang === selectedAddLang;
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <MiniStat label={t("channelBlocks.runwayNoGeneration")} value={formatRunwayDays(block.runwayDays)} />
        <section className="rounded-md border border-base-300 bg-base-100 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-base-content/45">{t(bottleneckLabel)}</div>
          {bottleneck ? (
            <div className="mt-1 min-w-0">
              <div className="truncate text-lg font-semibold" title={`${bottleneck.account.channelName} → ${deckDisplayName(bottleneck.deck)}`}>
                {bottleneck.account.channelName} → {deckDisplayName(bottleneck.deck)}
              </div>
              <div className="mt-1 text-sm text-base-content/60">
                {t("channelBlocks.bottleneckMeta", {
                  queued: bottleneck.queued,
                  perDay: bottleneck.postsPerDay,
                  days: formatRunwayDays(bottleneck.days),
                })}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-sm text-base-content/45">{t("channelBlocks.bottleneckNone")}</div>
          )}
        </section>
        <MiniStat label={t("channelBlocks.postsPerDayTotal")} value={block.postsPerDay} />
      </div>

      {block.sourceGroups.length > 1 && (
        <SourceMixSettings block={block} sourceWeights={sourceWeights} setSourceWeights={setSourceWeights} />
      )}

      <section className="rounded-md border border-base-300 bg-base-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{t("channelBlocks.blockSettings")}</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="form-control w-32">
                <span className="label py-1 pr-0">
                  <span className="label-text whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-base-content/60">
                    {t("channelBlocks.schedulePerDay")}
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  className="input input-bordered input-sm w-full"
                  value={perDay}
                  onChange={(e) => setPerDay(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                />
              </label>
              <button className="btn btn-sm btn-outline gap-1 whitespace-nowrap" disabled={scheduleBusy || block.totalAccounts < 1} onClick={() => void applySchedule(block)}>
                {scheduleBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="time" size={14} />}
                {t("channelBlocks.applySchedule")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {block.rules.length > 0 && (
        <CollapsibleSection title={t("channelBlocks.blockRules")} meta={String(block.rules.length)}>
          <ul className="space-y-2 text-sm text-base-content/70">
            {block.rules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <AppIcon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      <CollapsibleSection title={t("channelBlocks.blockDecks")} meta={String(decks.length)}>
        <div className="flex flex-wrap gap-2">
          {decks.length === 0 ? (
            <span className="text-sm text-base-content/45">{t("channelBlocks.noDecks")}</span>
          ) : (
            decks.map((deck) => (
              <span key={deck.id} className="badge badge-outline gap-1 py-3">
                {deck.lang && <span className="badge badge-ghost badge-xs">{langTag(deck.lang)}</span>}
                <span>{deck.name}</span>
              </span>
            ))
          )}
        </div>
      </CollapsibleSection>

      <section className="rounded-md border border-base-300 bg-base-100 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t("channelBlocks.channelsTitle")}</h2>
          {addableLangs.length > 0 && (
            <div className="flex items-end gap-2">
              <select
                className="select select-bordered select-sm"
                value={selectedAddLang}
                onChange={(event) => setAddLang(event.target.value)}
                aria-label={t("channelBlocks.addChannelDo")}
              >
                {addableLangs.map((lang) => {
                  const count = block.cells.find((candidate) => candidate.lang === lang.code)?.accounts.length ?? 0;
                  return (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                      {count > 0 ? ` · ${count}` : ""}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-primary gap-1 whitespace-nowrap"
                disabled={!selectedAddLang || addSelectedBusy}
                onClick={() => selectedAddLang && void addBlockAccount(block, selectedAddLang)}
                title={t("channelBlocks.addChannelTitle")}
              >
                {addSelectedBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="plus" size={14} />}
                {t("channelBlocks.addChannelDo")}
              </button>
            </div>
          )}
        </div>
        {visibleLangs.length === 0 ? (
          <div className="rounded-md border border-dashed border-base-300 p-8 text-center text-sm text-base-content/45">
            {t("channelBlocks.noChannelsYet")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {visibleLangs.map((lang) => {
              const cell = block.cells.find((candidate) => candidate.lang === lang.code);
              if (!cell) return null;
              const canAdd = cell.defaultSourceDecks.length > 0;
              const addBusy = busy?.blockId === block.id && busy.kind === "account" && busy.lang === lang.code;
              return (
                <div
                  key={lang.code}
                  className={languagePanelClass(cell.accounts.length)}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-base-300 bg-base-200/60 px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-base-content/65">{lang.label}</span>
                      <span className="text-xs text-base-content/40">{cell.accounts.length}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost gap-1"
                      disabled={!canAdd || addBusy}
                      onClick={() => void addBlockAccount(block, lang.code)}
                      title={canAdd ? t("channelBlocks.addChannelTitle") : t("channelBlocks.noDefaultSources")}
                    >
                      {addBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="plus" size={12} />}
                      {t("channelBlocks.addChannel")}
                    </button>
                  </div>
                  <div className={languageChannelsGridClass(cell.accounts.length)}>
                    {[...cell.accounts]
                      .sort((a, b) => Number(b.views != null) - Number(a.views != null) || (b.views ?? 0) - (a.views ?? 0) || a.channelName.localeCompare(b.channelName))
                      .map((account) => (
                      <ChannelCell key={account.id} account={account} t={t} />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function CollapsibleSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-md border border-base-300 bg-base-100">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 text-base font-semibold marker:text-base-content/35">
        <span>{title}</span>
        {meta && <span className="rounded border border-base-300 px-2 py-0.5 text-xs font-semibold text-base-content/55">{meta}</span>}
      </summary>
      <div className="border-t border-base-300 px-4 py-3">{children}</div>
    </details>
  );
}

function OperationalSummary({ accounts, clients }: { accounts: OperationalAccount[]; clients: OAuthClient[] }) {
  const { t } = useT();
  const uploadsToday = accounts.reduce((sum, account) => sum + account.uploadsToday, 0);
  const perDay = accounts.filter((account) => account.enabled).reduce((sum, account) => sum + account.schedule.length, 0);
  const nextRun = useMemo(() => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const mins = accounts
      .filter((account) => account.enabled)
      .flatMap((account) => account.schedule)
      .map((time) => {
        const [h, m] = time.split(":").map(Number);
        return h * 60 + m;
      });
    if (!mins.length) return { time: "—", rel: "" };
    const up = mins.filter((min) => min > cur).sort((a, b) => a - b);
    const next = up.length ? up[0] : Math.min(...mins);
    const until = (next - cur + 1440) % 1440;
    const h = Math.floor(until / 60);
    const m = until % 60;
    const rel =
      until === 0
        ? t("accounts.now")
        : h && m
          ? t("accounts.inHM", { h, m })
          : h
            ? t("accounts.inH", { h })
            : t("accounts.inM", { m });
    return {
      time: `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`,
      rel,
    };
  }, [accounts, t]);
  const multiKey = clients.length > 1;
  const perKeyStats = multiKey
    ? clients.map((client) => {
        const channels = accounts.filter((account) => account.oauthClientId === client.id);
        return {
          id: client.id,
          label: client.label,
          projectId: client.projectId,
          channels: channels.length,
          perDay: channels.filter((account) => account.enabled).reduce((sum, account) => sum + account.schedule.length, 0),
        };
      })
    : [];
  const noKeyChannels = multiKey ? accounts.filter((account) => !account.oauthClientId).length : 0;
  const keyTileCount = perKeyStats.length + (noKeyChannels > 0 ? 1 : 0);
  const keyGridClass =
    keyTileCount <= 1
      ? "grid gap-3"
      : keyTileCount === 2
        ? "grid gap-3 sm:grid-cols-2"
        : keyTileCount === 3
          ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          : keyTileCount === 4
            ? "grid gap-3 sm:grid-cols-2"
            : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<AppIcon name="accounts" />} label={t("accounts.statChannels")} value={accounts.length} />
        <Stat icon={<AppIcon name="queue" />} label={t("accounts.statPerDay")} value={perDay} />
        <Stat icon={<AppIcon name="video" />} label={t("accounts.statUploadedToday")} value={uploadsToday} />
        <Stat
          icon={<AppIcon name="time" />}
          label={nextRun.rel ? `${t("accounts.statNextRun")} · ${nextRun.rel}` : t("accounts.statNextRun")}
          value={nextRun.time}
        />
      </div>

      {multiKey && (
        <CollapsibleSection title={t("accounts.byKeyTitle")} meta={String(keyTileCount)}>
          <div className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
            <BrandIcon name="youtube" size={16} />
            {t("accounts.byKeyTitle")}
          </div>
          <div className={`mt-3 ${keyGridClass}`}>
            {perKeyStats.map((key) => (
              <div key={key.id} className="rounded-md border border-base-300 bg-base-100 px-4 py-3">
                <div className="truncate text-base font-semibold" title={key.label}>{key.label}</div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-3xl font-bold leading-none">{key.channels}</div>
                    <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.channels")}</div>
                  </div>
                  <div>
                    <div
                      className={`text-3xl font-bold leading-none ${
                        key.perDay > DAILY_KEY_CAP ? "text-error" : key.perDay > DAILY_KEY_CAP * 0.85 ? "text-warning" : ""
                      }`}
                    >
                      {key.perDay}/{DAILY_KEY_CAP}
                    </div>
                    <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.postsPerDayLimit")}</div>
                  </div>
                </div>
              </div>
            ))}
            {noKeyChannels > 0 && (
              <div className="rounded-md border border-dashed border-base-300 bg-base-100 px-4 py-3">
                <div className="truncate text-sm font-semibold text-base-content/70">{t("accounts.byKeyNoKey")}</div>
                <div className="mt-3">
                  <div className="text-2xl font-bold leading-none">{noKeyChannels}</div>
                  <div className="mt-1 text-xs text-base-content/55">{t("channelBlocks.channels")}</div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-base-300 bg-base-100 px-5 py-4">
      <div className="text-base-content/80">{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-2xl font-bold leading-none">{value}</div>
        <div className="mt-1 text-sm text-base-content/60">{label}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2">
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs text-base-content/55">{label}</div>
    </div>
  );
}

function SourceMixSettings({
  block,
  sourceWeights,
  setSourceWeights,
}: {
  block: ChannelThemeBlock;
  sourceWeights: Record<string, number>;
  setSourceWeights: (value: Record<string, number>) => void;
}) {
  const { t } = useT();
  const groups = block.sourceGroups;
  const resolvedWeights = groups.map((group) => ({
    ...group,
    weight: Math.max(0, Math.min(20, Math.floor(Number(sourceWeights[group.id] ?? group.weight) || 0))),
  }));
  const total = resolvedWeights.reduce((sum, group) => sum + group.weight, 0);
  const sections = Array.from(new Set(resolvedWeights.map((group) => group.section || "").filter(Boolean)));
  const grouped =
    sections.length > 0
      ? sections.map((section) => ({ section, groups: resolvedWeights.filter((group) => group.section === section) }))
      : [{ section: "", groups: resolvedWeights }];

  return (
    <section className="rounded-md border border-base-300 bg-base-100 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{t("channelBlocks.sourceMix")}</h2>
          <div className="text-xs font-semibold uppercase tracking-wide text-base-content/45">
            {t("channelBlocks.sourceRatio")} · {total}
          </div>
        </div>
        <div className="grid gap-3">
          {grouped.map((section) => (
            <div key={section.section || "default"} className={sourceMixSectionClass(section.section)}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-base-content/70">
                  {section.section || t("channelBlocks.sourceMix")}
                </div>
                <div className="text-xs font-semibold text-base-content/45">
                  {total > 0
                    ? `${Math.round((section.groups.reduce((sum, group) => sum + group.weight, 0) / total) * 100)}%`
                    : "0%"}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {section.groups.map((group) => {
                  const share = total > 0 ? Math.round((group.weight / total) * 100) : 0;
                  return (
                    <label key={group.id} className="form-control min-w-0">
                      <span className="label py-1 pr-0">
                        <span className="label-text truncate text-xs font-semibold uppercase tracking-wide text-base-content/60" title={group.title}>
                          {group.title}
                        </span>
                        <span className="label-text-alt whitespace-nowrap text-xs text-base-content/45">
                          {share}%
                        </span>
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        className="input input-bordered input-sm w-full"
                        value={group.weight}
                        aria-label={t("channelBlocks.sourceWeight", { name: group.title })}
                        onChange={(e) =>
                          setSourceWeights({
                            ...sourceWeights,
                            [group.id]: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function sourceMixSectionClass(section: string): string {
  const base = "rounded-md border bg-base-100 p-3";
  if (section === "Ислам") return `${base} border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/45`;
  if (section === "Христианство") return `${base} border-sky-200 border-l-4 border-l-sky-500 bg-sky-50/45`;
  if (section === "Общее") return `${base} border-amber-200 border-l-4 border-l-amber-500 bg-amber-50/45`;
  return `${base} border-base-300`;
}

function ChannelCell({ account, t }: { account: ChannelThemeBlockAccount; t: ReturnType<typeof useT>["t"] }) {
  const bottleneck = accountBottleneck(account);
  const totalRunwayDays = accountTotalRunwayDays(account);
  const readyVideos = account.effectiveQueued ?? account.queued;
  const gapTitle = sourceGapTitle(account, t);
  const missingScheduledDeck = bottleneck && bottleneck.postsPerDay > 0 && bottleneck.queued <= 0 ? bottleneck : null;
  const depletedSources = account.sourceDecks.filter((deck) => deck.available <= 0 && deck.queued > 0);
  const missingTitle = missingScheduledDeck
    ? t("channelBlocks.sourceMissingWarning", {
        deck: deckDisplayName(missingScheduledDeck.deck),
        queued: missingScheduledDeck.queued,
        perDay: missingScheduledDeck.postsPerDay,
      })
    : "";
  const depletedTitle = depletedSources.length
    ? t("channelBlocks.sourceDepletedWarning", {
        decks: compactDeckList(depletedSources.map(deckDisplayName)),
      })
    : "";
  const warningTitle = [gapTitle, missingTitle, depletedTitle].filter(Boolean).join("\n");
  const youtubeUrl = account.ytChannelId ? `https://www.youtube.com/channel/${account.ytChannelId}` : null;
  const avatar = account.avatar ? (
    <img src={account.avatar} alt="" className="h-8 w-8 rounded-md border border-base-300 object-cover" loading="lazy" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
      <AppIcon name="accounts" size={14} />
    </div>
  );
  return (
    <div className="relative rounded-md border border-base-300 bg-base-100 p-2 transition-colors hover:border-primary/50 hover:bg-base-200/30">
      <Link
        to={`/accounts/${account.id}`}
        className="absolute inset-0 z-0 rounded-md"
        aria-label={account.channelName}
      />
      <div className="pointer-events-none relative z-10 flex items-start gap-1.5">
        {youtubeUrl ? (
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto shrink-0 rounded-md transition-opacity hover:opacity-80"
            title="YouTube"
          >
            {avatar}
          </a>
        ) : (
          <div className="shrink-0">{avatar}</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-semibold leading-tight" title={account.channelName}>
            {account.channelName}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <span className="badge badge-ghost badge-xs">{langTag(account.channelLang)}</span>
            {account.connected ? (
              <span className="badge badge-success badge-xs">{t("accounts.connected")}</span>
            ) : (
              <span className="badge badge-warning badge-xs">{t("accounts.needsAuth")}</span>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none relative z-10 mt-2 block rounded bg-base-200/70 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">{t("channelBlocks.videosLeft")}</span>
          <span className="flex items-center gap-1 text-sm font-bold">
            {readyVideos}
            {warningTitle && (
              <span className="pointer-events-auto text-warning" title={warningTitle} aria-label={warningTitle}>
                <AppIcon name="warning" size={13} />
              </span>
            )}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-base-content/55">
          {totalRunwayDays == null ? t("channelBlocks.bottleneckNone") : `${formatRunwayDays(totalRunwayDays)} ${t("channelBlocks.runwayDays")}`}
        </div>
      </div>
      {account.authError && (
        <div className="pointer-events-none relative z-10 mt-2 flex items-start gap-1 text-[11px] leading-snug text-error">
          <AppIcon name="warning" size={12} className="mt-0.5 shrink-0" />
          <span>{account.authError}</span>
        </div>
      )}
    </div>
  );
}
