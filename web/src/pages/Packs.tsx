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

const fmt = (n: number) => n.toLocaleString("ru-RU");

// «Паки» — pack overview for everyone: how many cards are left in each pack.
// Regular user sees their own; admin can switch to any user.
export default function Packs() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [actionErr, setActionErr] = useState("");
  const [data, setData] = useState<MyDecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [viewUser, setViewUser] = useState<number | "">(""); // admin: whose packs to view ("" = self)
  const [userDecks, setUserDecks] = useState<UserDeckRow[]>([]); // per-user deck stats (admin)
  const [deckNames, setDeckNames] = useState<Record<string, string>>({}); // deckId → human name
  const [threshold, setThreshold] = useState<number>(
    () => Number(localStorage.getItem("lowDeckThreshold")) || 300,
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
      setActionErr("Не удалось сменить язык пака: " + (e instanceof Error ? e.message : String(e)));
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
      setActionErr("Не удалось удалить пак: " + (e instanceof Error ? e.message : String(e)));
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
      localStorage.setItem("lowDeckThreshold", String(threshold));
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
            <h1 className="text-2xl font-bold">Паки</h1>
            <p className="text-base-content/60">Сколько карточек осталось в каждом паке</p>
          </div>
        </div>
        {isAdmin && (
          <select
            className="select select-bordered select-sm"
            aria-label="Чьи паки смотреть"
            value={viewUser === "" ? "" : String(viewUser)}
            onChange={(e) => setViewUser(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">Мои паки{user?.username ? ` (${user.username})` : ""}</option>
            {users
              .filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                  {u.role === "admin" ? " (админ)" : ""}
                </option>
              ))}
          </select>
        )}
      </header>

      {actionErr && (
        <div className="alert alert-error text-sm" role="alert">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">{actionErr}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setActionErr("")} aria-label="Скрыть">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Встроенных паков" value={fmt(decks.length)} />
        <Stat label="Осталось карточек" value={fmt(totals.available)} />
        <Stat label="Потрачено карточек" value={fmt(totals.used)} />
      </div>

      {!loading && decks.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-bold">Встроенные паки</h2>
          <span className="badge badge-ghost badge-sm">{decks.length}</span>
          <span className="text-xs text-base-content/50 ml-1">
            готовый контент системы — язык у них фиксирован, не редактируется
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
                ? "У этого пользователя нет доступных паков."
                : "Вам пока не открыт ни один пак. Обратитесь к администратору."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((d) => {
            const low = d.total > 0 && d.available < 50;
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
                      <div className="text-xs text-base-content/50">осталось из {fmt(d.total)}</div>
                    </div>
                    <div className="text-right text-xs text-base-content/60 leading-snug">
                      <div>потрачено {fmt(d.used)}</div>
                      <div>выложено {fmt(d.posted)}</div>
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
            <h2 className="text-lg font-bold">{isAdmin ? "Кастомные паки" : "Мои паки"}</h2>
            <span className="badge badge-ghost badge-sm">{customPacks.length}</span>
            <span className="text-xs text-base-content/50 ml-1">свои наборы — язык-тег можно менять</span>
            <Link to="/cards" className="link link-primary text-sm ml-auto">
              Управлять в «Карточках» →
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
                          title={foreign ? "Удалить чужой пак (админ)" : "Удалить мой пак"}
                          aria-label="Удалить пак"
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
                          return names.length ? `владельц${names.length > 1 ? "ы" : "ец"}: ${names.join(", ")}` : "без владельца";
                        })()}
                      </div>
                    )}
                    <div className="text-2xl font-bold leading-none">{fmt(p.cards)}</div>
                    <div className="text-xs text-base-content/50 flex items-center gap-1 flex-wrap">
                      <span>карточек{p.templates ? ` · ${p.templates} шабл.` : ""} ·</span>
                      {isAdmin ? (
                        <select
                          className="select select-xs select-bordered h-6 min-h-0 py-0"
                          value={p.lang}
                          disabled={savingLang === p.id}
                          onChange={(e) => changePackLang(p, e.target.value)}
                          title="Язык пака (тег) — влияет на проверку «язык пака = язык канала»"
                        >
                          {["ru", "de", "it", "fr", "en", "ar"].map((c) => (
                            <option key={c} value={c}>
                              {c.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{p.lang.toUpperCase()}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: cross-user "running low" report — packs with remaining < 100, across everyone (incl. admin). */}
      {isAdmin && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="text-warning" size={18} />
              <h2 className="card-title text-base">Скоро закончится (по всем, включая вас)</h2>
              <span className="badge badge-ghost badge-sm">{lowDecks.length}</span>
              <label className="ml-auto flex items-center gap-2 text-xs text-base-content/60">
                Порог
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
                  aria-label="Порог: меньше скольких свободных карточек считать «близко к концу»"
                />
                своб.
              </label>
            </div>
            <p className="text-xs text-base-content/50">
              Паки, где у пользователя осталось меньше {fmt(threshold)} свободных карточек — кто близок к концу.
            </p>
            {lowDecks.length === 0 ? (
              <div className="text-sm text-base-content/50 py-2">Пока ни у кого пак не близок к концу 👍</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Пользователь</th>
                      <th>Пак</th>
                      <th className="text-right">Осталось</th>
                      <th className="text-right">Выложено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowDecks.map((r) => (
                      <tr key={`${r.userId}:${r.deckId}`}>
                        <td className="whitespace-nowrap font-medium">
                          {r.username}
                          {r.userId === user?.id ? " (вы)" : ""}
                        </td>
                        <td className="whitespace-nowrap">{r.deckName}</td>
                        <td className={`text-right font-semibold ${r.available < 30 ? "text-error" : "text-warning"}`}>
                          {fmt(r.available)}{" "}
                          <span className="text-xs font-normal text-base-content/40">из {fmt(r.total)}</span>
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
              <Trash2 className="text-error" size={18} /> Удалить пак?
            </h3>
            <p className="py-3 text-sm">
              Пак <b>«{confirmPack.name}»</b> и все его карточки ({fmt(confirmPack.cards)}) будут удалены
              без возможности восстановить.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmPack(null)}>
                Отмена
              </button>
              <button className="btn btn-error btn-sm gap-1" onClick={doRemovePack}>
                <Trash2 size={15} /> Удалить пак
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
