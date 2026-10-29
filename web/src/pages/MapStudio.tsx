import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { get } from "../lib/api/http";
export default function MapStudio() {
  const [themes, setThemes] = useState<{ id: string; name: string }[]>([]);
  const [theme, setTheme] = useState("traffic");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    get<{ themes: { id: string; name: string }[] }>("/map-studio/themes")
      .then((r) => {
        if (alive) setThemes(r.themes);
      })
      .catch(() => {
        if (alive) setError("Не удалось загрузить темы карт.");
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/library" className="btn btn-ghost btn-sm gap-1">
            <ArrowLeft size={16} />
            Библиотека
          </Link>
          <h1 className="text-2xl font-bold">Карты</h1>
          <Link to="/templates/maps/library" className="btn btn-outline btn-sm">Библиотека карт</Link>
        </div>
        <label className="form-control gap-1">
          <span className="sr-only">Тема карты</span>
          <select
            aria-label="Тема карты"
            className="select select-bordered select-sm max-w-full"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {!themes.some((t) => t.id === "traffic") && (
              <option value="traffic">Карта мира</option>
            )}
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <iframe
        key={theme}
        src={`/map-studio/?theme=${encodeURIComponent(theme)}&lang=ru`}
        title="Шаблон Карты"
        className="w-full h-[calc(100dvh-12rem)] min-h-[520px] border border-base-300"
        allow="fullscreen"
      />
    </div>
  );
}
