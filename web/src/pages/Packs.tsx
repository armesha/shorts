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
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { CONTENT_LANGS, langTag } from "../lib/deck";
import { AppIcon } from "../components/AppIcon";

const fmt = (n: number) => n.toLocaleString("ru-RU");

// «Паки» — pack overview for everyone: how many cards are left in each pack.
// Regular user sees their own; admin can switch to any user.
export default function Packs() {
  const { t } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
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
  const [deletingPack, setDeletingPack] = useState<string | null>(null);
  const [savingLang, setSavingLang] = useState<string | null>(null);
  const [confirmPack, setConfirmPack] = useState<PackSummary | null>(null); // пак, ожидающий подтверждения удаления

  // Сменить язык (тег) пака — доступно админу прямо здесь.
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

  // Удаление пака (админ — любой, юзер — свой): клик открывает модалку-подтверждение (всегда видна,
  // браузер её не подавляет), а реально удаляет doRemovePack после «Удалить».
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
    if (!isAdmin) return;
    apiClient.adminUsers().then(setUsers).catch(() => {});
    apiClient.adminUserDecks().then(setUserDecks).catch(() => {});
    apiClient
      .generators()
      .then((gs: Generator[]) => setDeckNames(Object.fromEntries(gs.map((g) => [g.id, g.name]))))
      .catch(() => {});
  }, [isAdmin]);

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
      .myDecks(isAdmin && viewUser !== "" ? Number(viewUser) : undefined)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [viewUser, isAdmin]);

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
        {isAdmin && (
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
                  {u.role === "admin" ? ` ${t("packs.adminSuffix")}` : ""}
                </option>
              ))}
          </select>
        )}
      </header>

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

      {/* Shared, editable "running low" threshold — visible to EVERYONE. Drives the red highlight on
          the pack cards below AND (for admins) the cross-user report at the bottom. Persisted. */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm">
        <AlertTriangle className="text-warning shrink-0" size={16} />
        <span className="text-base-content/70">{t("packs.lowThresholdHint")}</span>
        <input
          type="number"
          min={1}
          max={100000}
          step={50}
          className="input input-bordered input-xs w-24"
          value={threshold}
          onChange={(e) => setThreshold(Math.max(1, Math.min(100000, Number(e.target.value) || 0)))}
          aria-label={t("packs.thresholdAria")}
        />
        <span className="text-base-content/60">{t("packs.freeShort")}</span>
      </div>

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
          {decks.map((d) => {
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
            {customPacks.map((p) => {
              const owned = !!user && p.owners.includes(user.id);
              const canDelete = isAdmin || owned;
              const foreign = isAdmin && !owned; // админ не владелец — пак чужой/ничей
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
                      {isAdmin ? (
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
          </div>
        </div>
      )}

      {/* Admin: cross-user "running low" report — packs below the shared editable threshold (default
          100), across everyone (incl. admin). The threshold input lives at the top of the page. */}
      {isAdmin && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="text-warning" size={18} />
              <h2 className="card-title text-base">{t("packs.lowTitle")}</h2>
              <span className="badge badge-ghost badge-sm">{lowDecks.length}</span>
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
                      <th className="text-right">{t("packs.thRemaining")}</th>
                      <th className="text-right">{t("packs.thPosted")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowDecks.map((r) => (
                      <tr key={`${r.userId}:${r.deckId}`}>
                        <td className="whitespace-nowrap font-medium">
                          {r.username}
                          {r.userId === user?.id ? ` ${t("packs.youSuffix")}` : ""}
                        </td>
                        <td className="whitespace-nowrap">{r.deckName}</td>
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
