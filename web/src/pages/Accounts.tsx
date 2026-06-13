import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Tv } from "lucide-react";
import { apiClient, type Account } from "../lib/api";

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.accounts().then(setAccounts).catch(() => {});
  }, []);

  async function addAccount() {
    setCreating(true);
    try {
      const a = await apiClient.createAccount();
      navigate(`/accounts/${a.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Каналы</h1>
          <p className="text-base-content/60">Подключённые YouTube-аккаунты и их настройки</p>
        </div>
        <button className="btn btn-primary gap-2" onClick={addAccount} disabled={creating}>
          {creating ? <span className="loading loading-spinner loading-sm" /> : <Plus size={18} />}
          Добавить канал
        </button>
      </header>

      {accounts.length === 0 ? (
        <div className="card bg-base-100 border border-base-300 border-dashed">
          <div className="card-body items-center text-center py-16">
            <Tv className="text-base-content/30" size={40} />
            <p className="text-base-content/60">
              Пока нет каналов. Добавьте первый — и настройте тему, язык и расписание.
            </p>
            <button className="btn btn-primary btn-sm gap-2 mt-2" onClick={addAccount} disabled={creating}>
              <Plus size={16} /> Добавить канал
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Link
              key={a.id}
              to={`/accounts/${a.id}`}
              className="card bg-base-100 border border-base-300 hover:border-primary transition-colors"
            >
              <div className="card-body">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary rounded-full w-12 h-12 flex items-center justify-center">
                    <Tv size={22} />
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold">{a.channelName}</div>
                    <div className="text-sm text-base-content/60">
                      {a.theme || "тема не задана"} · {a.lang.toUpperCase()}
                    </div>
                  </div>
                  {a.status === "connected" ? (
                    <span className="badge badge-success badge-sm">подключён</span>
                  ) : (
                    <span className="badge badge-warning badge-sm">нужна авторизация</span>
                  )}
                </div>
                <div className="mt-3 text-sm text-base-content/70">
                  Расписание:{" "}
                  <span className="font-medium text-base-content">{a.schedule.join(", ")}</span>
                </div>
                {a.ytChannelId && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(`https://www.youtube.com/channel/${a.ytChannelId}`, "_blank");
                    }}
                    className="btn btn-ghost btn-xs gap-1 mt-2 w-fit text-error"
                    title="Открыть канал на YouTube"
                  >
                    ▶ Открыть на YouTube ↗
                  </button>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
