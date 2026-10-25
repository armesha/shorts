import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, Film, Download } from "lucide-react";
import { send, sendBinary } from "../lib/api/http";
export default function MontageStudio() {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [source, setSource] = useState(""),
    [segments, setSegments] = useState([{ start: 0, end: 10 }]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    setFile(next);
    setSource("");
    setResult("");
    setPreview(URL.createObjectURL(next));
    setError("");
  }
  async function build() {
    setBusy("Загрузка видео…");
    setError("");
    setResult("");
    try {
      if (!file) throw new Error("Выберите видео.");
      if (file.size > 500 * 1024 * 1024)
        throw new Error("Максимальный размер — 500 МБ.");
      let value = source;
      if (!value) {
        const uploaded = await sendBinary<{ source: string }>(
          `/circle-editor/sources/upload?filename=${encodeURIComponent(file.name)}`,
          file,
        );
        value = uploaded.source;
        setSource(value);
      }
      setBusy("Собираем нарезку…");
      const output = await send<{ videoUrl: string }>(
        "/video-templates/montage",
        "POST",
        { source: value, segments },
      );
      setResult(output.videoUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось собрать видео.");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="space-y-5 max-w-5xl">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/library" className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft size={16} />
          Библиотека
        </Link>
        <h1 className="text-2xl font-bold">Нарезка видео</h1>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <label className="form-control gap-2">
            <span className="label-text">Исходное видео</span>
            <input
              type="file"
              accept=".mp4,.mov,.mkv,.webm,.m4v,video/*"
              className="file-input file-input-bordered w-full"
              disabled={!!busy}
              onChange={choose}
            />
          </label>
          {preview && (
            <video
              controls
              playsInline
              preload="metadata"
              src={preview}
              className="max-h-72 w-full bg-black"
              onLoadedMetadata={(e) => {
                const duration = e.currentTarget.duration;
                if (Number.isFinite(duration))
                  setSegments([
                    {
                      start: 0,
                      end: Math.min(10, Math.floor(duration * 10) / 10),
                    },
                  ]);
              }}
            />
          )}
          <div className="space-y-3">
            <h2 className="font-semibold">Фрагменты</h2>
            {segments.map((segment, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3">
                <label className="form-control gap-1 flex-1 min-w-24">
                  <span className="label-text">Начало, с</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input input-bordered w-full"
                    value={segment.start}
                    disabled={!!busy}
                    onChange={(e) =>
                      setSegments((rows) =>
                        rows.map((s, i) =>
                          i === index
                            ? { ...s, start: Number(e.target.value) }
                            : s,
                        ),
                      )
                    }
                  />
                </label>
                <label className="form-control gap-1 flex-1 min-w-24">
                  <span className="label-text">Конец, с</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input input-bordered w-full"
                    value={segment.end}
                    disabled={!!busy}
                    onChange={(e) =>
                      setSegments((rows) =>
                        rows.map((s, i) =>
                          i === index
                            ? { ...s, end: Number(e.target.value) }
                            : s,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost gap-1"
                  disabled={!!busy || segments.length === 1}
                  aria-label={`Убрать фрагмент ${index + 1}`}
                  onClick={() =>
                    setSegments((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={16} />
                  Убрать
                </button>
              </div>
            ))}
            <button
              className="btn btn-outline btn-sm gap-1"
              disabled={!!busy || segments.length >= 10}
              onClick={() =>
                setSegments((rows) => [
                  ...rows,
                  {
                    start: rows.at(-1)?.end || 0,
                    end: (rows.at(-1)?.end || 0) + 5,
                  },
                ])
              }
            >
              <Plus size={16} />
              Добавить фрагмент
            </button>
          </div>
          <p className="text-sm text-base-content/70">
            До 60 секунд · MP4 · 1080 × 1920
          </p>
          {error && (
            <p className="text-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn btn-primary gap-2"
            disabled={!!busy || !file}
            onClick={() => void build()}
          >
            {busy ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Film size={16} />
            )}{" "}
            {busy || "Собрать видео"}
          </button>
        </section>
        <section className="space-y-3" aria-label="Готовое видео">
          {result ? (
            <>
              <video
                controls
                playsInline
                src={result}
                className="w-full aspect-[9/16] bg-black"
              />
              <a href={result} download className="btn btn-outline gap-1">
                <Download size={16} />
                Скачать MP4
              </a>
            </>
          ) : (
            <div className="aspect-[9/16] bg-base-200 grid place-items-center text-base-content/60">
              <Film size={40} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
