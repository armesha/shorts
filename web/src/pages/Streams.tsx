import { useEffect, useState } from "react";
import Gta6LiveCard from "./Gta6LiveCard";
import { get } from "../lib/api/http";

const statusLabels = {
  checking: "Проверяем…",
  live: "В эфире",
  offline: "Не в эфире",
  unknown: "Статус недоступен",
};
type WatchedChannel = { login: string; label: string; url: string; status: keyof typeof statusLabels };

export default function Streams() {
  const [channels, setChannels] = useState<WatchedChannel[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await get<{ channels: WatchedChannel[] }>("/gta6-live/twitch-watch");
        if (active) {
          setChannels(result.channels);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="space-y-2 border border-base-300 bg-base-100 p-4" aria-labelledby="twitch-watch-title">
        <h2 id="twitch-watch-title" className="text-lg font-semibold">Наблюдение Twitch</h2>
        {error && <p role="status" className="text-sm text-error">Не удалось обновить статусы Twitch.</p>}
        {channels.length > 0 && (
          <ul className="divide-y divide-base-300">
            {channels.map(({ login, label, url, status }) => (
              <li key={login} className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-0 py-2">
                <a href={url} target="_blank" rel="noreferrer" className="link font-medium">
                  {label} <span className="text-sm font-normal text-base-content/70">{login}</span>
                </a>
                <span className={`text-sm ${status === "live" ? "font-medium" : "text-base-content/70"}`}>
                  {statusLabels[status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Gta6LiveCard />
    </div>
  );
}
