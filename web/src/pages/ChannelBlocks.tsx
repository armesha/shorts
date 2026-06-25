import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient, type Account, type ChannelThemeBlock, type ChannelThemeBlockAccount, type ChannelThemeBlocksResponse, type OAuthClient } from "../lib/api";
import { useT } from "../lib/i18n";
import { AppIcon } from "../components/AppIcon";
import { BrandIcon } from "../components/BrandIcon";
import { langTag } from "../lib/deck";
import { useGenQueue } from "../lib/genQueue";

type Props = {
  onShowClassic: () => void;
};

const DAILY_KEY_CAP = 92;

type BusyState = { blockId: string; kind: "short" | "normalize" | "schedule" | "account"; lang?: string } | null;

type BlockDeckSummary = {
  id: string;
  name: string;
  lang: string | null;
  available: number;
  queued: number;
  channels: number;
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
      const cur = map.get(deck.id);
      if (cur) {
        cur.available += deck.available;
        cur.queued += deck.queued;
        cur.channels += 1;
      } else {
        map.set(deck.id, {
          id: deck.id,
          name: deck.name,
          lang: deck.lang,
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

function queueRange(block: ChannelThemeBlock): { min: number; max: number } {
  const values = accountsInBlock(block).map((account) => account.queued);
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export default function ChannelBlocks({ onShowClassic }: Props) {
  const { t } = useT();
  const queue = useGenQueue();
  const [data, setData] = useState<ChannelThemeBlocksResponse | null>(channelBlocksCache);
  const [accounts, setAccounts] = useState<Account[]>(accountsCache);
  const [clients, setClients] = useState<OAuthClient[]>(clientsCache);
  const [searchParams, setSearchParams] = useSearchParams();
  const [err, setErr] = useState("");
  const [shortCount, setShortCount] = useState(1);
  const [perDay, setPerDay] = useState(12);
  const [busy, setBusy] = useState<BusyState>(null);
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

  const selectedBlockId = searchParams.get("block");
  const selectedBlock = data?.blocks.find((block) => block.id === selectedBlockId) ?? null;
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

  async function generateShort(block: ChannelThemeBlock) {
    setBusy({ blockId: block.id, kind: "short" });
    setNotice("");
    try {
      const res = await apiClient.generateChannelThemeBlock(block.id, shortCount);
      queue.trackJobs(res.jobs);
      setNotice(
        t("channelBlocks.shortQueued", {
          jobs: res.jobs.length,
          videos: res.jobs.reduce((sum, job) => sum + job.total, 0),
          skipped: res.skipped.length,
        }),
      );
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function normalizeQueue(block: ChannelThemeBlock) {
    setBusy({ blockId: block.id, kind: "normalize" });
    setNotice("");
    try {
      const res = await apiClient.normalizeChannelThemeBlock(block.id);
      queue.trackJobs(res.jobs);
      setNotice(
        t("channelBlocks.normalizeQueued", {
          jobs: res.jobs.length,
          videos: res.jobs.reduce((sum, job) => sum + job.total, 0),
          target: res.targetQueued,
          skipped: res.skipped.length,
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
      const res = await apiClient.setChannelThemeBlockSchedule(block.id, perDay);
      setNotice(t("channelBlocks.scheduleApplied", { updated: res.updated.length, skipped: res.skipped.length }));
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedBlock ? selectedBlock.title : t("channelBlocks.title")}</h1>
          {!selectedBlock && <p className="mt-1 text-sm text-base-content/60">{t("channelBlocks.subtitle")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedBlock && (
            <button className="btn btn-sm btn-outline gap-2" onClick={() => setSearchParams({})}>
              <AppIcon name="chevron-left" size={15} />
              {t("channelBlocks.backToBlocks")}
            </button>
          )}
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

      {data && !selectedBlock && (
        <>
          <div className="grid gap-3">
            {data.blocks.map((block) => (
              <BlockCard key={block.id} block={block} onOpen={() => setSearchParams({ block: block.id })} />
            ))}
          </div>

          {data.unassignedAccounts.length > 0 && (
            <section className="rounded-md border border-base-300 bg-base-100 p-4">
              <div>
                <h2 className="text-base font-semibold">{t("channelBlocks.unassignedTitle")}</h2>
                <p className="mt-1 text-sm text-base-content/60">{t("channelBlocks.unassignedHint")}</p>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.unassignedAccounts.map((account) => (
                  <ChannelCell key={account.id} account={account} t={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {data && selectedBlock && (
        <BlockDetail
          block={selectedBlock}
          languages={data.languages}
          shortCount={shortCount}
          setShortCount={setShortCount}
          perDay={perDay}
          setPerDay={setPerDay}
          busy={busy}
          generateShort={generateShort}
          normalizeQueue={normalizeQueue}
          applySchedule={applySchedule}
          addBlockAccount={addBlockAccount}
        />
      )}
    </div>
  );
}

function BlockCard({ block, onOpen }: { block: ChannelThemeBlock; onOpen: () => void }) {
  const { t } = useT();
  const decks = deckSummaries(block);
  return (
    <button
      type="button"
      className="grid gap-3 rounded-md border border-base-300 bg-base-100 p-4 text-left transition-colors hover:border-primary/50 hover:bg-base-200/30 md:grid-cols-[minmax(220px,1fr)_440px_minmax(260px,1.4fr)_24px] md:items-center"
      onClick={onOpen}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold">{block.title}</h2>
          <span className="badge badge-ghost badge-sm">{block.totalAccounts}</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Metric value={block.queued} label={t("channelBlocks.metricQueued")} />
        <Metric value={block.shortAvailable} label={t("channelBlocks.metricShort")} />
        <Metric value={block.postsPerDay} label={t("channelBlocks.postsPerDay")} />
        <Metric value={formatRunwayDays(block.runwayDays)} label={t("channelBlocks.runwayDays")} />
      </div>
      <div className="flex min-w-0 flex-wrap gap-1">
        {decks.length === 0 ? (
          <span className="text-xs text-base-content/35">{t("channelBlocks.noDecks")}</span>
        ) : (
          decks.slice(0, 5).map((deck) => (
            <span key={deck.id} className="inline-flex max-w-full items-center gap-1 border border-base-300 bg-base-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none">
              {deck.lang && <span className="shrink-0 text-base-content/45">{langTag(deck.lang)}</span>}
              <span className="truncate">{deck.name}</span>
              <span className="shrink-0 text-base-content/50">· {deck.available}</span>
            </span>
          ))
        )}
        {decks.length > 5 && <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold text-base-content/50">+{decks.length - 5}</span>}
      </div>
      <AppIcon name="chevron-right" size={18} className="justify-self-end text-base-content/40" />
    </button>
  );
}

function BlockDetail({
  block,
  languages,
  shortCount,
  setShortCount,
  perDay,
  setPerDay,
  busy,
  generateShort,
  normalizeQueue,
  applySchedule,
  addBlockAccount,
}: {
  block: ChannelThemeBlock;
  languages: ChannelThemeBlocksResponse["languages"];
  shortCount: number;
  setShortCount: (value: number) => void;
  perDay: number;
  setPerDay: (value: number) => void;
  busy: BusyState;
  generateShort: (block: ChannelThemeBlock) => Promise<void>;
  normalizeQueue: (block: ChannelThemeBlock) => Promise<void>;
  applySchedule: (block: ChannelThemeBlock) => Promise<void>;
  addBlockAccount: (block: ChannelThemeBlock, lang: string) => Promise<void>;
}) {
  const { t } = useT();
  const shortBusy = busy?.blockId === block.id && busy.kind === "short";
  const normalizeBusy = busy?.blockId === block.id && busy.kind === "normalize";
  const scheduleBusy = busy?.blockId === block.id && busy.kind === "schedule";
  const decks = deckSummaries(block);
  const range = queueRange(block);
  const canNormalize = block.totalAccounts > 1 && range.max > range.min;
  return (
    <>
      <div className="grid gap-3 md:grid-cols-5">
        <MiniStat label={t("channelBlocks.channels")} value={block.totalAccounts} />
        <MiniStat label={t("channelBlocks.queued")} value={block.queued} />
        <MiniStat label={t("channelBlocks.shortLeft")} value={block.shortAvailable} />
        <MiniStat label={t("channelBlocks.postsPerDay")} value={block.postsPerDay} />
        <MiniStat label={t("channelBlocks.runwayDays")} value={formatRunwayDays(block.runwayDays)} />
      </div>

      <section className="rounded-md border border-base-300 bg-base-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">{t("channelBlocks.blockSettings")}</h2>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="form-control w-28">
                <span className="label py-1 pr-0">
                  <span className="label-text whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-base-content/60">
                    {t("channelBlocks.shortCount")}
                  </span>
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="input input-bordered input-sm w-full"
                  value={shortCount}
                  onChange={(e) => setShortCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                />
              </label>
              <button
                className="btn btn-sm btn-primary gap-1 whitespace-nowrap"
                disabled={shortBusy || block.totalAccounts < 1 || block.shortAvailable < 1}
                onClick={() => void generateShort(block)}
                title={block.shortAvailable < 1 ? t("channelBlocks.noShortLeft") : t("channelBlocks.generateShortTitle")}
              >
                {shortBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="plus" size={14} />}
                {t("channelBlocks.generateShort")}
              </button>
              <button
                className="btn btn-sm btn-outline gap-1 whitespace-nowrap"
                disabled={normalizeBusy || !canNormalize}
                onClick={() => void normalizeQueue(block)}
                title={canNormalize ? t("channelBlocks.normalizeTitle", { target: range.max }) : t("channelBlocks.normalizeAlready")}
              >
                {normalizeBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="refresh" size={14} />}
                {t("channelBlocks.normalizeQueue")}
              </button>
            </div>
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
        <section className="rounded-md border border-base-300 bg-base-100 p-4">
          <h2 className="text-base font-semibold">{t("channelBlocks.blockRules")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-base-content/70">
            {block.rules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <AppIcon name="check" size={14} className="mt-0.5 shrink-0 text-success" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-md border border-base-300 bg-base-100 p-4">
        <h2 className="text-base font-semibold">{t("channelBlocks.blockDecks")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {decks.length === 0 ? (
            <span className="text-sm text-base-content/45">{t("channelBlocks.noDecks")}</span>
          ) : (
            decks.map((deck) => (
              <span key={deck.id} className="badge badge-outline gap-1 py-3">
                {deck.lang && <span className="badge badge-ghost badge-xs">{langTag(deck.lang)}</span>}
                <span>{deck.name}</span>
                <span className="opacity-60">
                  · {deck.available} / {deck.queued}
                </span>
              </span>
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border border-base-300 bg-base-100 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {languages.map((lang) => {
            const cell = block.cells.find((candidate) => candidate.lang === lang.code);
            const canAdd = (cell?.defaultSourceDecks.length ?? 0) > 0;
            const addBusy = busy?.blockId === block.id && busy.kind === "account" && busy.lang === lang.code;
            return (
              <div key={lang.code} className="flex min-h-44 flex-col rounded-md border border-base-300 bg-base-100">
                <div className="flex items-center justify-between gap-2 border-b border-base-300 bg-base-200/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-base-content/65">{lang.label}</span>
                    <span className="text-xs text-base-content/40">{cell?.accounts.length ?? 0}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline gap-1"
                    disabled={!canAdd || addBusy}
                    onClick={() => void addBlockAccount(block, lang.code)}
                    title={canAdd ? t("channelBlocks.addChannelTitle") : t("channelBlocks.noDefaultSources")}
                  >
                    {addBusy ? <span className="loading loading-spinner loading-xs" /> : <AppIcon name="plus" size={12} />}
                    {t("channelBlocks.addChannel")}
                  </button>
                </div>
                <div className="flex-1 p-2">
                {!cell || cell.accounts.length === 0 ? (
                  <div className="flex h-full min-h-28 items-center justify-center text-xs text-base-content/35">
                    {t("channelBlocks.emptyCell")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cell.accounts.map((account) => (
                      <ChannelCell key={account.id} account={account} t={t} />
                    ))}
                  </div>
                )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
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
        <section className="rounded-md border border-base-300 bg-base-100 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrandIcon name="youtube" size={16} />
            {t("accounts.byKeyTitle")}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {perKeyStats.map((key) => (
              <div key={key.id} className="rounded-md border border-base-300 px-3 py-2">
                <div className="truncate text-sm font-medium">{key.label}</div>
                {key.projectId && <div className="truncate text-xs text-base-content/45">{key.projectId}</div>}
                <div className="mt-1 text-xs text-base-content/60">
                  {t("accounts.byKeyChannels", { n: key.channels })} ·{" "}
                  <span className={key.perDay > DAILY_KEY_CAP ? "font-medium text-error" : key.perDay > DAILY_KEY_CAP * 0.85 ? "text-warning" : ""}>
                    {t("accounts.byKeyPerDay", { used: key.perDay, cap: DAILY_KEY_CAP })}
                  </span>
                </div>
              </div>
            ))}
            {noKeyChannels > 0 && (
              <div className="rounded-md border border-dashed border-base-300 px-3 py-2">
                <div className="text-sm font-medium text-base-content/60">{t("accounts.byKeyNoKey")}</div>
                <div className="mt-1 text-xs text-base-content/60">{t("accounts.byKeyChannels", { n: noKeyChannels })}</div>
              </div>
            )}
          </div>
        </section>
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

function ChannelCell({ account, t }: { account: ChannelThemeBlockAccount; t: ReturnType<typeof useT>["t"] }) {
  return (
    <Link to={`/accounts/${account.id}`} className="block rounded-md border border-base-300 bg-base-100 p-3 transition-colors hover:border-primary/50 hover:bg-base-200/30">
      <div className="flex items-start gap-2">
        {account.avatar ? (
          <img src={account.avatar} alt="" className="h-10 w-10 shrink-0 rounded-md border border-base-300 object-cover" loading="lazy" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <AppIcon name="accounts" size={16} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug" title={account.channelName}>
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

      <DeckLine label={t("channelBlocks.sources")} decks={account.sourceDecks} />
      {account.authError && (
        <div className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-error">
          <AppIcon name="warning" size={12} className="mt-0.5 shrink-0" />
          <span>{account.authError}</span>
        </div>
      )}
    </Link>
  );
}

function Metric({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded bg-base-200 px-1.5 py-1">
      <div className="font-bold leading-none">{value}</div>
      <div className="mt-0.5 text-base-content/50">{label}</div>
    </div>
  );
}

function DeckLine({ label, decks }: { label: string; decks: ChannelThemeBlockAccount["sourceDecks"] }) {
  if (!decks.length) return null;
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-base-content/40">{label}</div>
      <div className="grid gap-1">
        {decks.map((deck) => (
          <span key={deck.id} className="flex min-w-0 items-center justify-between gap-2 border border-base-300 bg-base-100 px-2 py-1 text-[11px] leading-none" title={`${deck.name}: ${deck.available}`}>
            <span className="truncate font-semibold uppercase">{deck.name}</span>
            <span className="shrink-0 text-base-content/55">· {deck.available}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
