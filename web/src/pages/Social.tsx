import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Upload, Check, Unplug, ExternalLink, Clock } from "lucide-react";
import { get, send } from "../lib/api/http";
import { confirmDialog } from "../lib/confirm";

type Platform = "instagram" | "tiktok";
type Connection = {
  platform: Platform;
  status: string;
  handle: string | null;
  checkedAt: string | null;
  error: string | null;
};
type Job = {
  id: number;
  platform: Platform;
  title: string;
  caption: string;
  run_at: string;
  state: string;
  url: string | null;
  error: string | null;
};
type Video = { id: number; title: string; channel: string };
const labels: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};
const statuses: Record<string, string> = {
  disconnected: "Не подключён",
  unchecked: "Cookies загружены — нужна проверка",
  connected: "Подключён",
  needs_login: "Нужен повторный вход",
};
const jobStates: Record<string, string> = {
  pending: "В очереди",
  uploading: "Отправляется",
  published: "Опубликовано",
  needs_review: "Проверьте профиль",
  failed: "Ошибка",
  cancelled: "Отменено",
  preparing: "Подготовка",
};
export default function Social() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [videoId, setVideoId] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00");
  async function reload() {
    const [state, library] = await Promise.all([
      get<{ connections: Connection[]; jobs: Job[] }>("/social"),
      get<{ videos: Video[] }>("/social/videos"),
    ]);
    setConnections(state.connections);
    setJobs(state.jobs);
    setVideos(library.videos);
  }
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const state = await get<{ connections: Connection[]; jobs: Job[] }>(
          "/social",
        );
        if (alive) {
          setConnections(state.connections);
          setJobs(state.jobs);
        }
      } catch {
        if (alive)
          setError("Не удалось обновить подключения. Обновите страницу.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    void get<{ videos: Video[] }>("/social/videos")
      .then((r) => {
        if (alive) setVideos(r.videos);
      })
      .catch(() => {
        if (alive)
          setError(
            "Не удалось загрузить библиотеку роликов. Обновите страницу.",
          );
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  async function action(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие.",
      );
    } finally {
      setBusy("");
    }
  }
  async function upload(p: Platform, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await action(`${p}-upload`, async () => {
      if (file.size > 512_000)
        throw new Error("Максимальный размер файла — 500 КБ.");
      const cookies = await file.text();
      await send(`/social/${p}/cookies`, "POST", { cookies });
      await reload();
      setNotice(`${labels[p]}: cookies загружены. Нажмите «Проверить вход».`);
    });
  }
  async function verify(p: Platform) {
    await action(`${p}-verify`, async () => {
      const r = await send<{ connections: Connection[] }>(
        `/social/${p}/verify`,
        "POST",
        {},
      );
      setConnections(r.connections);
      const c = r.connections.find((c) => c.platform === p);
      if (c?.status === "connected")
        setNotice(`${labels[p]}: вход подтверждён, @${c.handle}.`);
      else setError(c?.error || "Вход не подтверждён.");
    });
  }
  async function disconnect(p: Platform) {
    await action(`${p}-disconnect`, async () => {
      await send(`/social/${p}`, "DELETE");
      await reload();
      setNotice(`${labels[p]} отключён. Ожидающие задания отменены.`);
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await action("schedule", async () => {
      let when = new Date();
      if (scheduled) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
        )
          throw new Error("Укажите дату и время в формате ЧЧ:ММ.");
        when = new Date(`${date}T${time}:00`);
        if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now())
          throw new Error("Выберите время в будущем.");
      }
      await send(`/social/${platform}/jobs`, "POST", {
        videoId: Number(videoId),
        caption,
        runAt: when.toISOString(),
      });
      await reload();
      setNotice("Ролик добавлен в очередь. Результат появится ниже.");
    });
  }
  const connected =
    connections.find((c) => c.platform === platform)?.status === "connected";
  return (
    <div className="space-y-8 max-w-4xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Instagram и TikTok</h1>
        <p className="text-base-content/75">
          Подключите свой аккаунт через cookies и отправляйте готовые ролики из
          библиотеки.
        </p>
        <Link className="link text-sm" to="/channels">
          Каналы YouTube
        </Link>
        <a className="link text-sm ml-4" href="/creator">
          Создать ролик
        </a>
      </header>
      {error && (
        <div className="alert alert-error text-sm" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert alert-success text-sm" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <p role="status">Загружаем подключения…</p>
      ) : (
        <section
          aria-label="Подключения"
          className="divide-y divide-base-300 border-y border-base-300"
        >
          {connections.map((c) => (
            <div key={c.platform} className="py-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-lg">
                    {labels[c.platform]}{" "}
                    {c.handle && (
                      <span className="font-normal">@{c.handle}</span>
                    )}
                  </h2>
                  <p className="text-sm text-base-content/75">
                    {statuses[c.status] || c.status}
                  </p>
                </div>
                {c.checkedAt && (
                  <span className="text-sm text-base-content/75">
                    Проверен{" "}
                    {new Date(c.checkedAt).toLocaleString("ru-RU", {
                      hour12: false,
                    })}
                  </span>
                )}
              </div>
              {c.error && <p className="text-sm text-error">{c.error}</p>}
              <div className="flex flex-wrap gap-2">
                <label
                  className={`btn btn-sm btn-outline focus-within:outline focus-within:outline-2 focus-within:outline-primary focus-within:outline-offset-2 ${busy ? "btn-disabled" : ""}`}
                >
                  <Upload size={16} />
                  {c.status === "disconnected"
                    ? "Загрузить cookies"
                    : "Заменить cookies"}
                  <input
                    aria-label={`Загрузить cookies ${labels[c.platform]}`}
                    type="file"
                    accept=".json,.txt"
                    className="sr-only"
                    disabled={!!busy}
                    onChange={(e) => void upload(c.platform, e)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!!busy || c.status === "disconnected"}
                  onClick={() => void verify(c.platform)}
                >
                  {busy === `${c.platform}-verify` ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Check size={16} />
                  )}
                  Проверить вход
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  disabled={!!busy || c.status === "disconnected"}
                  onClick={() => void disconnect(c.platform)}
                >
                  <Unplug size={16} />
                  Отключить
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Как подготовить cookies
        </summary>
        <div className="pt-3 space-y-2 max-w-prose text-base-content/80">
          <p>
            Войдите в свой аккаунт на instagram.com или tiktok.com в браузере.
            Экспортируйте cookies этого сайта в JSON или cookies.txt и выберите
            файл здесь. Поддерживается также Playwright storageState.
          </p>
          <p>
            Загружайте полный экспорт: для Instagram нужны sessionid и
            ds_user_id. После загрузки нажмите «Проверить вход». Если площадка
            просит подтверждение, завершите его в своём браузере и экспортируйте
            cookies заново.
          </p>
          <p>
            Cookies дают доступ к аккаунту. Они хранятся на сервере и удаляются
            при отключении. Замена cookies отменяет ожидающие задания, чтобы
            ролики не ушли в другой аккаунт.
          </p>
        </div>
      </details>
      <section className="space-y-4" aria-labelledby="social-publish">
        <h2 id="social-publish" className="text-xl font-semibold">
          Отправить ролик
        </h2>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-control gap-1">
              <span className="label-text">Площадка</span>
              <select
                className="select select-bordered w-full"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
              >
                {(["instagram", "tiktok"] as const).map((p) => (
                  <option key={p} value={p}>
                    {labels[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control gap-1">
              <span className="label-text">Ролик из библиотеки</span>
              <select
                className="select select-bordered w-full"
                value={videoId}
                required
                onChange={(e) => {
                  setVideoId(e.target.value);
                  setCaption(
                    videos.find((v) => v.id === Number(e.target.value))
                      ?.title || "",
                  );
                }}
              >
                <option value="">Выберите ролик</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.channel} · {v.title || `Ролик ${v.id}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!videos.length && (
            <p className="text-sm text-base-content/75">
              В библиотеке пока нет роликов. Создайте MP4 в Creator или добавьте
              готовый ролик в библиотеку канала.
            </p>
          )}
          <label className="form-control gap-1">
            <span className="label-text">Подпись</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={3}
              maxLength={2200}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <span className="text-xs text-base-content/75">
              {caption.length} / 2200
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={scheduled}
              onChange={(e) => setScheduled(e.target.checked)}
            />
            Запланировать отправку
          </label>
          {scheduled && (
            <div className="flex flex-wrap gap-3">
              <label className="form-control gap-1">
                <span className="label-text">Дата</span>
                <input
                  type="date"
                  className="input input-bordered"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="form-control gap-1">
                <span className="label-text">
                  Время ·{" "}
                  {Intl.DateTimeFormat("ru-RU").resolvedOptions().timeZone}
                </span>
                <input
                  type="text"
                  className="input input-bordered w-32"
                  inputMode="numeric"
                  placeholder="ЧЧ:ММ"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  maxLength={5}
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
          )}
          {!connected && (
            <p className="text-sm text-base-content/75">
              Для отправки подтвердите вход в {labels[platform]}.
            </p>
          )}
          <button
            className="btn btn-primary"
            disabled={!!busy || !connected || !videoId}
          >
            {busy === "schedule" ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              <Clock size={16} />
            )}{" "}
            {scheduled ? "Запланировать" : "Отправить сейчас"}
          </button>
        </form>
      </section>
      <section className="space-y-3" aria-labelledby="social-history">
        <h2 id="social-history" className="text-xl font-semibold">
          Очередь и история
        </h2>
        {!jobs.length ? (
          <p className="text-base-content/75">Здесь появятся ваши отправки.</p>
        ) : (
          <ul className="divide-y divide-base-300">
            {jobs.map((j) => (
              <li key={j.id} className="py-4 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium break-words min-w-0">
                    {labels[j.platform]} · {j.title}
                  </span>
                  <span className="text-sm">
                    {jobStates[j.state] || j.state}
                  </span>
                </div>
                <p className="text-sm text-base-content/75">
                  {new Date(j.run_at).toLocaleString("ru-RU", {
                    hour12: false,
                  })}
                </p>
                {j.error && <p className="text-sm text-error">{j.error}</p>}
                {j.url && (
                  <a
                    className="link inline-flex items-center gap-1 text-sm"
                    href={j.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть публикацию <ExternalLink size={14} />
                  </a>
                )}
                {j.state === "needs_review" && (
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={!!busy}
                    onClick={() =>
                      void action(`review-${j.id}`, async () => {
                        const confirmed = await confirmDialog(
                          "Откройте профиль на площадке и убедитесь, что этот ролик не появился. После подтверждения его можно будет отправить повторно.",
                          {title:"Проверка публикации",confirmText:"Публикации нет"},
                        );
                        if (!confirmed) return;
                        await send(
                          `/social/jobs/${j.id}/not-published`,
                          "POST",
                          {},
                        );
                        await reload();
                      })
                    }
                  >
                    Публикации нет — разрешить повтор
                  </button>
                )}
                {j.state === "pending" && (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={!!busy}
                    onClick={() =>
                      void action(`cancel-${j.id}`, async () => {
                        await send(`/social/jobs/${j.id}`, "DELETE");
                        await reload();
                      })
                    }
                  >
                    Отменить отправку
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
