import { useEffect, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { apiClient, type MyDecks, type AdminUser } from "../lib/api";
import { useAuth } from "../lib/auth";

const fmt = (n: number) => n.toLocaleString("ru-RU");

// «Паки» — pack overview for everyone: how many cards are left in each pack.
// Regular user sees their own; admin can switch to any user.
export default function Packs() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [data, setData] = useState<MyDecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [viewUser, setViewUser] = useState<number | "">(""); // admin: whose packs to view ("" = self)

  useEffect(() => {
    if (isAdmin) apiClient.adminUsers().then(setUsers).catch(() => {});
  }, [isAdmin]);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Паков доступно" value={fmt(decks.length)} />
        <Stat label="Осталось карточек" value={fmt(totals.available)} />
        <Stat label="Потрачено карточек" value={fmt(totals.used)} />
      </div>

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
                : "Тебе пока не открыт ни один пак. Обратись к администратору."}
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
