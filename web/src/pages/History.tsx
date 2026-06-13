import { useEffect, useState } from "react";
import { apiClient, type HistoryItem } from "../lib/api";

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    apiClient.history().then(setItems).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">История</h1>
        <p className="text-base-content/60">Сгенерированные и загруженные ролики</p>
      </header>

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
                        <span className="badge badge-success badge-sm">{h.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
