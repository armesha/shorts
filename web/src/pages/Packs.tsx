import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, AlertTriangle, Trash2, Loader2 } from "lucide-react";
import {
  apiClient,
  type MyDecks,
  type AdminUser,
  type LowDeckRow,
  type UserDeckRow,
  type Generator,
  type PackSummary,
  type ContentCatalogItem,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { isMainAdmin, roleLabelKey } from "../lib/authz";
import { useT } from "../lib/i18n";
import { CONTENT_LANGS, DECK_LANG, langTag } from "../lib/deck";
import { AppIcon, type AppIconName } from "../components/AppIcon";

const fmt = (n: number) => n.toLocaleString("ru-RU");
const CATALOG_PAGE_SIZE = 12;
const BUILTIN_PAGE_SIZE = 18;
const CUSTOM_PAGE_SIZE = 18;
const LOW_PAGE_SIZE = 25;

const pagesFor = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));
const pageItems = <T,>(items: T[], page: number, pageSize: number) =>
  items.slice((page - 1) * pageSize, page * pageSize);

// «Паки» — pack overview for everyone: how many cards are left in each pack.
// Regular users and regular admins see their own; the main admin can switch to any user.
export default function Packs() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const canManageAllPacks = isMainAdmin(user);
  const [actionErr, setActionErr] = useState("");
  const [data, setData] = useState<MyDecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [viewUser, setViewUser] = useState<number | "">(""); // admin: whose packs to view ("" = self)
  const [userDecks, setUserDecks] = useState<UserDeckRow[]>([]); // per-user deck stats (admin)
  const [deckNames, setDeckNames] = useState<Record<string, string>>({}); // deckId → human name
  // NB: new storage key on purpose — the old "lowDeckThreshold" auto-persisted 300 on first visit, so
  // bumping the key lets the new default (100) actually take effect for people who already have 300.
  const [threshold, setThreshold] = useState<number>(
    () => Number(localStorage.getItem("packsLowThreshold")) || 100,
  );
  const [customPacks, setCustomPacks] = useState<PackSummary[]>([]); // кастомные паки, видимые мне
  const [catalog, setCatalog] = useState<ContentCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogFilter, setCatalogFilter] = useState<"all" | ContentCatalogItem["kind"]>("all");
  const [catalogPage, setCatalogPage] = useState(1);
  const [builtinPage, setBuiltinPage] = useState(1);
  const [customPage, setCustomPage] = useState(1);
  const [lowPage, setLowPage] = useState(1);
  const [deletingPack, setDeletingPack] = useState<string | null>(null);
  const [savingLang, setSavingLang] = useState<string | null>(null);
  const [confirmPack, setConfirmPack] = useState<PackSummary | null>(null); // пак, ожидающий подтверждения удаления

  // Сменить язык (тег) пака — доступно владельцу или главному админу прямо здесь.
  const changePackLang = async (p: PackSummary, lang: string) => {
    setSavingLang(p.id);
    try {
      await apiClient.setPackLang(p.id, lang);
      setCustomPacks((cur) => cur.map((x) => (x.id === p.id ? { ...x, lang } : x)));
    } catch (e) {
      setActionErr(t("packs.errChangeLang") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingLang(null);
    }
  };

  // Кастомные паки грузим для всех (юзер видит свои/гранченные, админ — все).
  useEffect(() => {
    apiClient.packs().then(setCustomPacks).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setCatalogLoading(true);
    apiClient
      .contentCatalog()
      .then((res) => {
        if (alive) setCatalog(res.items);
      })
      .catch(() => {
        if (alive) setCatalog([]);
      })
      .finally(() => {
        if (alive) setCatalogLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Удаление пака: главный админ — любой, обычный админ — только созданный им, юзер — свой.
  // Клик открывает модалку-подтверждение, а реально удаляет doRemovePack после «Удалить».
  const removePack = (p: PackSummary) => setConfirmPack(p);
  const doRemovePack = async () => {
    const p = confirmPack;
    if (!p) return;
    setConfirmPack(null);
    setDeletingPack(p.id);
    try {
      await apiClient.deletePack(p.id);
      setCustomPacks((cur) => cur.filter((x) => x.id !== p.id));
    } catch (e) {
      setActionErr(t("packs.errDelete") + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDeletingPack(null);
    }
  };

  useEffect(() => {
    if (!canManageAllPacks) return;
    apiClient.adminUsers().then(setUsers).catch(() => {});
    apiClient.adminUserDecks().then(setUserDecks).catch(() => {});
    apiClient
      .generators()
      .then((gs: Generator[]) => setDeckNames(Object.fromEntries(gs.map((g) => [g.id, g.name]))))
      .catch(() => {});
  }, [canManageAllPacks]);

  // Remember the chosen threshold between visits.
  useEffect(() => {
    try {
      localStorage.setItem("packsLowThreshold", String(threshold));
    } catch {
      /* private mode */
    }
  }, [threshold]);

  // «Кто близок к концу» — computed client-side from the per-user deck stats, so the threshold is
  // instantly adjustable (no server round-trip). Covers the decks each user is actually using.
  const lowDecks = useMemo<LowDeckRow[]>(() => {
    const rows: LowDeckRow[] = [];
    for (const u of userDecks) {
      for (const [deckId, s] of Object.entries(u.deckStats ?? {})) {
        if (s.available < threshold) {
          rows.push({
            userId: u.userId,
            username: u.username,
            deckId,
            deckName: deckNames[deckId] ?? deckId,
            lang: DECK_LANG[deckId] || null,
            available: s.available,
            total: s.total,
            used: s.used,
            posted: s.posted,
          });
        }
      }
    }
    return rows.sort((a, b) => a.available - b.available);
  }, [userDecks, threshold, deckNames]);

  useEffect(() => {
    setLoading(true);
    apiClient
      .myDecks(canManageAllPacks && viewUser !== "" ? Number(viewUser) : undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [viewUser, canManageAllPacks]);

  const decks = data?.decks ?? [];
  const totals = useMemo(
    () =>
      decks.reduce(
        (a, d) => {
          a.available += d.available;
          a.used += d.used;
          return a;
        },
        { available: 0, used: 0 },
      ),
    [decks],
  );
  const filteredCatalog = useMemo(
    () => (catalogFilter === "all" ? catalog : catalog.filter((item) => item.kind === catalogFilter)),
    [catalog, catalogFilter],
  );
  const catalogPages = pagesFor(filteredCatalog.length, CATALOG_PAGE_SIZE);
  const catalogPageItems = useMemo(
    () => pageItems(filteredCatalog, catalogPage, CATALOG_PAGE_SIZE),
    [filteredCatalog, catalogPage],
  );
  const builtinPages = pagesFor(decks.length, BUILTIN_PAGE_SIZE);
  const builtinPageItems = useMemo(() => pageItems(decks, builtinPage, BUILTIN_PAGE_SIZE), [decks, builtinPage]);
  const customPages = pagesFor(customPacks.length, CUSTOM_PAGE_SIZE);
  const customPageItems = useMemo(
    () => pageItems(customPacks, customPage, CUSTOM_PAGE_SIZE),
    [customPacks, customPage],
  );
  const catalogTotals = useMemo(
    () =>
      catalog.reduce(
        (acc, item) => {
          acc.queued += item.queued;
          acc.sources += 1;
          if (item.available != null) acc.available += item.available;
          return acc;
        },
        { sources: 0, queued: 0, available: 0 },
      ),
    [catalog],
  );
  const lowPages = pagesFor(lowDecks.length, LOW_PAGE_SIZE);
  const lowPageItems = useMemo(() => pageItems(lowDecks, lowPage, LOW_PAGE_SIZE), [lowDecks, lowPage]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogFilter]);

  useEffect(() => {
    setCatalogPage((p) => Math.min(p, catalogPages));
  }, [catalogPages]);

  useEffect(() => {
    setBuiltinPage((p) => Math.min(p, builtinPages));
  }, [builtinPages]);

  useEffect(() => {
    setCustomPage((p) => Math.min(p, customPages));
  }, [customPages]);

  useEffect(() => {
    setLowPage((p) => Math.min(p, lowPages));
  }, [lowPages]);

  const kindLabel = (kind: ContentCatalogItem["kind"]) => {
    if (kind === "builtin") return t("packs.catalogKindBuiltin");
    if (kind === "custom_pack") return t("packs.catalogKindCustom");
    if (kind === "manual") return t("packs.catalogKindManual");
    return t("packs.catalogKindClip");
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t("packs.title")}</h1>
            <p className="text-base-content/60">{t("packs.subtitle")}</p>
          </div>
        </div>
        {canManageAllPacks && (
          <select
            className="select select-bordered select-sm"
            aria-label={t("packs.whoseAria")}
            value={viewUser === "" ? "" : String(viewUser)}
            onChange={(e) => setViewUser(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">{t("packs.myPacks")}{user?.username ? ` (${user.username})` : ""}</option>
            {users
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                  {u.role !== "user" ? ` (${t(roleLabelKey(u.role))})` : ""}
                </option>
              ))}
          </select>
        )}
      </header>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <LibraryLink to="/cards" icon="cards" title={t("packs.libraryCards")} hint={t("packs.libraryCardsHint")} />
        <LibraryLink to="/editor" icon="skin" title={t("packs.libraryTemplates")} hint={t("packs.libraryTemplatesHint")} />
        <LibraryLink to="/long-videos" icon="video" title={t("packs.libraryLongVideos")} hint={t("packs.libraryLongVideosHint")} />
        {isAdmin && <LibraryLink to="/gallery" icon="library" title={t("packs.libraryGallery")} hint={t("packs.libraryGalleryHint")} />}
        <LibraryLink to="/admin/banners" icon="ads" title={t("packs.libraryBanners")} hint={t("packs.libraryBannersHint")} />
      </div>

      {actionErr && (
        <div className="alert alert-error text-sm" role="alert">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">{actionErr}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setActionErr("")} aria-label={t("packs.hide")}>
            <AppIcon name="close" size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={t("packs.statBuiltin")} value={fmt(decks.length)} />
        <Stat label={t("packs.statRemaining")} value={fmt(totals.available)} />
        <Stat label={t("packs.statSpent")} value={fmt(totals.used)} />
      </div>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AppIcon name="packs" size={20} className="text-primary" />
                <h2 className="card-title">{t("packs.catalogTitle")}</h2>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-base-content/60">{t("packs.catalogSubtitle")}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center sm:flex">
              <div className="rounded-xl bg-base-200 px-3 py-2">
                <div className="text-lg font-black">{fmt(catalogTotals.sources)}</div>
                <div className="text-[11px] text-base-content/50">{t("packs.catalogSources")}</div>
              </div>
              <div className="rounded-xl bg-base-200 px-3 py-2">
                <div className="text-lg font-black">{fmt(catalogTotals.available)}</div>
                <div className="text-[11px] text-base-content/50">{t("packs.catalogAvailable")}</div>
              </div>
              <div className="rounded-xl bg-base-200 px-3 py-2">
                <div className="text-lg font-black">{fmt(catalogTotals.queued)}</div>
                <div className="text-[11px] text-base-content/50">{t("packs.catalogQueued")}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ["all", t("packs.catalogFilterAll")],
              ["builtin", t("packs.catalogKindBuiltin")],
              ["custom_pack", t("packs.catalogKindCustom")],
              ["manual", t("packs.catalogKindManual")],
              ["clip_demo", t("packs.catalogKindClip")],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`btn btn-xs ${catalogFilter === value ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setCatalogFilter(value as typeof catalogFilter)}
              >
                {label}
              </button>
            ))}
          </div>

          {catalogLoading ? (
            <div className="py-10 text-center">
              <span className="loading loading-spinner text-primary" />
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-base-300 p-6 text-center text-sm text-base-content/60">
              {t("packs.catalogEmpty")}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {catalogPageItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-base-300 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="badge badge-outline">{kindLabel(item.kind)}</span>
                        {item.lang && <span className="badge badge-ghost">{langTag(item.lang)}</span>}
                      </div>
                      <h3 className="mt-2 truncate text-base font-bold" title={item.title}>
                        {item.title}
                      </h3>
                      <div className="mt-1 text-xs text-base-content/50">{item.id}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black">{item.available == null ? "—" : fmt(item.available)}</div>
                      <div className="text-[11px] text-base-content/50">
                        {item.total == null ? t("packs.catalogManualPool") : t("packs.catalogOf", { n: fmt(item.total) })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-base-200 p-2">
                      <div className="font-black">{fmt(item.queued)}</div>
                      <div className="text-[11px] text-base-content/50">{t("packs.catalogQueued")}</div>
                    </div>
                    <div className="rounded-xl bg-base-200 p-2">
                      <div className="font-black">{fmt(item.usedByAccounts.length)}</div>
                      <div className="text-[11px] text-base-content/50">{t("packs.catalogChannels")}</div>
                    </div>
                    <div className="rounded-xl bg-base-200 p-2">
                      <div className="font-black">{fmt(item.demoCount)}</div>
                      <div className="text-[11px] text-base-content/50">{t("packs.catalogDemos")}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.usedByAccounts.slice(0, 3).map((account) => (
                      <Link key={account.id} to={`/accounts/${account.id}`} className="badge badge-ghost hover:badge-primary">
                        {account.channelName}
                      </Link>
                    ))}
                    {item.usedByAccounts.length > 3 && (
                      <span className="badge badge-ghost">+{item.usedByAccounts.length - 3}</span>
                    )}
                    {!item.usedByAccounts.length && <span className="badge badge-ghost">{t("packs.catalogUnused")}</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isAdmin && (
                      <Link to="/queue" className="btn btn-xs btn-outline">
                        {t("packs.catalogOpenQueue")}
                      </Link>
                    )}
                    {item.kind === "custom_pack" && (
                      <Link to="/cards" className="btn btn-xs btn-outline">
                        {t("packs.catalogEditCards")}
                      </Link>
                    )}
                    {item.demoCount > 0 && (
                      <Link to="/clip-demos" className="btn btn-xs btn-outline">
                        {t("packs.catalogOpenDemos")}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {!catalogLoading && filteredCatalog.length > CATALOG_PAGE_SIZE && (
            <Pager
              page={catalogPage}
              pages={catalogPages}
              total={filteredCatalog.length}
              onPage={setCatalogPage}
              label={t("packs.paginationCatalog")}
              pageText={t("packs.pageOf", { page: catalogPage, pages: catalogPages })}
              totalText={t("packs.totalN", { n: fmt(filteredCatalog.length) })}
            />
          )}
        </div>
      </section>

      {!loading && decks.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold">{t("packs.builtinHeading")}</h2>
          <span className="badge badge-ghost badge-sm">{decks.length}</span>
          <span className="text-xs text-base-content/50 ml-1">
            {t("packs.builtinHint")}
          </span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : decks.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <Layers className="text-base-content/30" size={40} />
            <p className="text-base-content/60 max-w-md">
              {isAdmin && viewUser !== ""
                ? t("packs.emptyForUser")
                : t("packs.emptyForSelf")}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtinPageItems.map((d) => {
            const low = d.total > 0 && d.available < threshold;
            return (
              <div key={d.id} className="card bg-base-100 border border-base-300">
                <div className="card-body gap-2 p-4">
                  <div className="font-semibold truncate" title={d.name}>
                    {d.name}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <div className={`text-2xl font-bold leading-none ${low ? "text-error" : ""}`}>
                        {fmt(d.available)}
                      </div>
                      <div className="text-xs text-base-content/50">{t("packs.remainingOf", { n: fmt(d.total) })}</div>
                    </div>
                    <div className="text-right text-xs text-base-content/60 leading-snug">
                      <div>{t("packs.spentN", { n: fmt(d.used) })}</div>
                      <div>{t("packs.postedN", { n: fmt(d.posted) })}</div>
                    </div>
                  </div>
                  <progress
                    className={`progress w-full h-1.5 ${low ? "progress-error" : "progress-primary"}`}
                    value={d.used}
                    max={d.total || 1}
                  />
                </div>
              </div>
            );
          })}
          {decks.length > BUILTIN_PAGE_SIZE && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Pager
                page={builtinPage}
                pages={builtinPages}
                total={decks.length}
                onPage={setBuiltinPage}
                label={t("packs.paginationBuiltin")}
                pageText={t("packs.pageOf", { page: builtinPage, pages: builtinPages })}
                totalText={t("packs.totalN", { n: fmt(decks.length) })}
              />
            </div>
          )}
        </div>
      )}

      {/* Кастомные («свои») паки из /cards — показываем в собственном представлении (не при просмотре чужих). */}
      {viewUser === "" && customPacks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold">{isAdmin ? t("packs.customHeading") : t("packs.myHeading")}</h2>
            <span className="badge badge-ghost badge-sm">{customPacks.length}</span>
            <span className="text-xs text-base-content/50 ml-1">{t("packs.customHint")}</span>
            <Link to="/cards" className="link link-primary text-sm ml-auto">
              {t("packs.manageInCards")}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {customPageItems.map((p) => {
              const owned = !!user && p.owners.includes(user.id);
              const createdByMe = !!user && p.createdBy === user.id;
              const canEditPack = canManageAllPacks || owned;
              const canDelete = canManageAllPacks || (isAdmin ? createdByMe : owned);
              const foreign = canManageAllPacks && !owned; // главный админ не владелец — пак чужой/ничей
              return (
                <div key={p.id} className="card bg-base-100 border border-base-300">
                  <div className="card-body gap-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold truncate" title={p.name}>
                        {p.name}
                      </div>
                      {canDelete && (
                        <button
                          className="btn btn-ghost btn-xs btn-square text-error shrink-0"
                          onClick={() => removePack(p)}
                          disabled={deletingPack === p.id}
                          title={foreign ? t("packs.deleteForeignTitle") : t("packs.deleteMineTitle")}
                          aria-label={t("packs.deletePackAria")}
                        >
                          {deletingPack === p.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="text-[11px] -mt-0.5 text-base-content/40">
                        {(() => {
                          const names = p.owners.map((id) => users.find((u) => u.id === id)?.username || `#${id}`);
                          if (!names.length) return t("packs.noOwner");
                          return t(names.length > 1 ? "packs.ownersN" : "packs.ownerOne", { names: names.join(", ") });
                        })()}
                      </div>
                    )}
                    <div className="text-2xl font-bold leading-none">{fmt(p.cards)}</div>
                    <div className="text-xs text-base-content/50 flex items-center gap-1 flex-wrap">
                      <span>{t("packs.cardsWord")}{p.templates ? ` · ${t("packs.templatesN", { n: p.templates })}` : ""} ·</span>
                      {canEditPack ? (
                        <select
                          className="select select-xs select-bordered h-6 min-h-0 py-0"
                          value={p.lang}
                          disabled={savingLang === p.id}
                          onChange={(e) => changePackLang(p, e.target.value)}
                          title={t("packs.langTagTitle")}
                        >
                          {CONTENT_LANGS.map((c) => (
                            <option key={c.code} value={c.code}>
                              {langTag(c.code)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{langTag(p.lang)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {customPacks.length > CUSTOM_PAGE_SIZE && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Pager
                  page={customPage}
                  pages={customPages}
                  total={customPacks.length}
                  onPage={setCustomPage}
                  label={t("packs.paginationCustom")}
                  pageText={t("packs.pageOf", { page: customPage, pages: customPages })}
                  totalText={t("packs.totalN", { n: fmt(customPacks.length) })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin: cross-user "running low" report — packs below the editable threshold (default 100),
          across everyone (incl. admin). The threshold input lives in this card's header; the same
          threshold also drives the red "low" highlight on the pack cards above. */}
      {canManageAllPacks && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="text-warning" size={18} />
              <h2 className="card-title text-base">{t("packs.lowTitle")}</h2>
              <span className="badge badge-ghost badge-sm">{lowDecks.length}</span>
              <label className="ml-auto flex items-center gap-2 text-xs text-base-content/60">
                {t("packs.thresholdLabel")}
                <input
                  type="number"
                  min={1}
                  max={100000}
                  step={50}
                  className="input input-bordered input-xs w-24"
                  value={threshold}
                  onChange={(e) =>
                    setThreshold(Math.max(1, Math.min(100000, Number(e.target.value) || 0)))
                  }
                  aria-label={t("packs.thresholdAria")}
                />
                {t("packs.freeShort")}
              </label>
            </div>
            <p className="text-xs text-base-content/50">
              {t("packs.lowDesc", { n: fmt(threshold) })}
            </p>
            {lowDecks.length === 0 ? (
              <div className="text-sm text-base-content/50 py-2">{t("packs.lowEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t("packs.thUser")}</th>
                      <th>{t("packs.thPack")}</th>
                      <th>{t("packs.thLang")}</th>
                      <th className="text-right">{t("packs.thRemaining")}</th>
                      <th className="text-right">{t("packs.thPosted")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowPageItems.map((r) => (
                      <tr key={`${r.userId}:${r.deckId}`}>
                        <td className="whitespace-nowrap font-medium">
                          {r.username}
                          {r.userId === user?.id ? ` ${t("packs.youSuffix")}` : ""}
                        </td>
                        <td className="whitespace-nowrap">{r.deckName}</td>
                        <td className="whitespace-nowrap">
                          <span className="badge badge-ghost badge-sm">{langTag(r.lang || DECK_LANG[r.deckId] || "")}</span>
                        </td>
                        <td className={`text-right font-semibold ${r.available < 30 ? "text-error" : "text-warning"}`}>
                          {fmt(r.available)}{" "}
                          <span className="text-xs font-normal text-base-content/40">{t("packs.ofN", { n: fmt(r.total) })}</span>
                        </td>
                        <td className="text-right text-base-content/60">{fmt(r.posted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lowDecks.length > LOW_PAGE_SIZE && (
              <Pager
                page={lowPage}
                pages={lowPages}
                total={lowDecks.length}
                onPage={setLowPage}
                label={t("packs.paginationLow")}
                pageText={t("packs.pageOf", { page: lowPage, pages: lowPages })}
                totalText={t("packs.totalN", { n: fmt(lowDecks.length) })}
              />
            )}
          </div>
        </div>
      )}
      {confirmPack && (
        <div className="modal modal-open" role="dialog">
          <div className="modal-box">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Trash2 className="text-error" size={18} /> {t("packs.deleteConfirmTitle")}
            </h3>
            <p className="py-3 text-sm">
              {t("packs.deleteConfirmPre")} <b>«{confirmPack.name}»</b>{" "}
              {t("packs.deleteConfirmPost", { n: fmt(confirmPack.cards) })}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmPack(null)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-error btn-sm gap-1" onClick={doRemovePack}>
                <Trash2 size={15} /> {t("packs.deletePackBtn")}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setConfirmPack(null)} />
        </div>
      )}
    </div>
  );
}

function LibraryLink({ to, icon, title, hint }: { to: string; icon: AppIconName; title: string; hint: string }) {
  return (
    <Link to={to} className="rounded-lg border border-base-300 bg-base-100 p-3 transition-colors hover:border-primary/50 hover:bg-base-200/60">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <AppIcon name={icon} size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-base-content/55">{hint}</span>
        </span>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body flex-row items-center gap-4 py-5">
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-sm text-base-content/60 mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function Pager({
  page,
  pages,
  total,
  onPage,
  label,
  pageText,
  totalText,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
  label: string;
  pageText: string;
  totalText: string;
}) {
  if (total === 0 || pages <= 1) return null;
  return (
    <nav className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-3" aria-label={label}>
      <div className="text-xs text-base-content/50">
        {pageText} · {totalText}
      </div>
      <div className="join">
        <button className="btn btn-xs join-item" disabled={page <= 1} onClick={() => onPage(1)} aria-label="first page">
          «
        </button>
        <button
          className="btn btn-xs join-item"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          aria-label="previous page"
        >
          ‹
        </button>
        <button
          className="btn btn-xs join-item"
          disabled={page >= pages}
          onClick={() => onPage(Math.min(pages, page + 1))}
          aria-label="next page"
        >
          ›
        </button>
        <button className="btn btn-xs join-item" disabled={page >= pages} onClick={() => onPage(pages)} aria-label="last page">
          »
        </button>
      </div>
    </nav>
  );
}
