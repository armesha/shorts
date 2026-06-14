import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { apiClient, type HistoryItem } from "../lib/api";

// Колоризуем статус: «провал/ошибка» — красный, «опубликовано/готово» — зелёный, иначе — нейтральный.
function statusClass(s: string): string {
  const t = (s || "").toLowerCase();
  if (/fail|error|ошиб|отклон|skip|пропущ/.test(t)) return "badge-error";
  if (/publish|posted|success|\bok\b|выложен|опубликов|готов/.test(t)) return "badge-success";
  return "badge-ghost";
}

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .history()
      .then(setItems)
      .catch(() => setError("Не удалось загрузить историю"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">История</h1>
        <p className="text-base-content/60">Сгенерированные и загруженные ролики</p>
      </header>

      {error ? (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      ) : loading ? (
        <div className="py-16 text-center">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body">
            {items.length === 0 ? (
              <div className="text-center text-base-content/50 py-12">
                Пока нет загруженных роликов
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Заголовок</th>
                      <th>Канал</th>
                      <th>Опубликовано</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((h) => (
                      <tr key={h.id}>
                        <td className="font-medium">{h.title}</td>
                        <td>#{h.accountId}</td>
                        <td className="text-base-content/70">
                          {h.publishedAt ? new Date(h.publishedAt).toLocaleString("ru-RU") : "—"}
                        </td>
                        <td>
                          <span className={`badge badge-sm ${statusClass(h.status)}`}>{h.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
