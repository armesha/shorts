import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Tv, Clapperboard, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { apiClient, type Account, type AppStatus } from "../lib/api";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    apiClient.accounts().then(setAccounts).catch(() => setError(true));
    apiClient.status().then(setStatus).catch(() => setError(true));
  }, []);

  const uploadsToday = accounts.reduce((s, a) => s + a.uploadsToday, 0);

  const nextRun = (() => {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const mins = accounts
      .filter((a) => a.enabled)
      .flatMap((a) => a.schedule)
      .map((t) => {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + m;
      });
    if (!mins.length) return { time: "—", rel: "" };
    const up = mins.filter((m) => m > cur).sort((a, b) => a - b);
    const n = up.length ? up[0] : Math.min(...mins);
    const until = (n - cur + 1440) % 1440;
    const h = Math.floor(until / 60);
    const m = until % 60;
    const rel =
      until === 0 ? "сейчас" : h && m ? `через ${h} ч ${m} мин` : h ? `через ${h} ч` : `через ${m} мин`;
    return {
      time: `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
      rel,
    };
  })();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Обзор</h1>
          <p className="text-base-content/60">Автоматическая фабрика YouTube Shorts</p>
        </div>
        <StatusBadge status={status} error={error} />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={<Tv />} label="Каналов" value={accounts.length} />
        <Stat icon={<Clapperboard />} label="Загружено сегодня" value={uploadsToday} />
        <Stat
          icon={<Clock />}
          label={nextRun.rel ? `Ближайший запуск · ${nextRun.rel}` : "Ближайший запуск"}
          value={nextRun.time}
        />
      </div>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body">
          <h2 className="card-title text-base">Каналы</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Канал</th>
                  <th>Тема</th>
                  <th>Язык</th>
                  <th>Расписание</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="hover">
                    <td className="font-medium">
                      <Link to={`/accounts/${a.id}`} className="link link-hover">
                        {a.channelName}
                      </Link>
                    </td>
                    <td>{a.theme}</td>
                    <td className="uppercase">{a.lang}</td>
                    <td className="text-base-content/70">{a.schedule.join(", ")}</td>
                    <td>
                      {a.status === "connected" ? (
                        <span className="badge badge-success badge-sm">подключён</span>
                      ) : (
                        <span className="badge badge-warning badge-sm">нужна авторизация</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body flex-row items-center gap-4 py-5">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-sm text-base-content/60 mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, error }: { status: AppStatus | null; error: boolean }) {
  if (error || (status && !status.credsConfigured)) {
    return (
      <div className="badge badge-error gap-1 badge-lg">
        <AlertTriangle size={14} /> Нет ключа Google
      </div>
    );
  }
  if (!status) return <div className="badge badge-ghost badge-lg">…</div>;
  return (
    <div className="badge badge-success gap-1 badge-lg">
      <CheckCircle2 size={14} /> Google подключён
    </div>
  );
}
