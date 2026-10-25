import { useEffect, useState, type ChangeEvent } from "react";
import { Check, ExternalLink, Unplug, Upload } from "lucide-react";
import { apiClient, type Account, type SocialConnection } from "../../lib/api";
import { confirmDialog } from "../../lib/confirm";
import { get, send } from "../../lib/api/http";

type Props = {
  account: Account;
  onChange: () => Promise<void>;
  notify: (text: string, kind?: "info" | "success" | "error") => void;
};
type PendingJob = {
  id: number;
  title: string;
  run_at: string;
  state: "pending" | "uploading" | "needs_review" | string;
  error: string | null;
};
const ACTIVE_JOB_STATES = new Set(["pending", "uploading", "needs_review"]);
const JOB_LABELS: Record<string, string> = {
  pending: "Ожидает отправки",
  uploading: "Отправляется",
  needs_review: "Требует проверки",
};
const STATUSES: Record<string, string> = {
  disconnected: "Не подключён",
  unchecked: "Cookies загружены — проверьте вход",
  connected: "Подключён",
  needs_login: "Нужно обновить cookies",
  needs_auth: "Нужно обновить cookies",
};

export default function SocialConnectionCard({
  account,
  onChange,
  notify,
}: Props) {
  const [connection, setConnection] = useState<SocialConnection | null>(null);
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [jobsError, setJobsError] = useState("");
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const platform = account.platform === "instagram" ? "Instagram" : "TikTok";
  const profileUrl = connection?.handle
    ? account.platform === "instagram"
      ? `https://www.instagram.com/${encodeURIComponent(connection.handle)}/`
      : `https://www.tiktok.com/@${encodeURIComponent(connection.handle)}`
    : null;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setText("");
    setConnection(null);
    setJobs([]);
    setJobsError("");
    get<{ connection: SocialConnection; jobs: PendingJob[] }>(
      `/accounts/${account.id}/social`,
    )
      .then((result) => {
        if (alive) {
          setConnection(result.connection);
          setJobs(
            result.jobs.filter((job) => ACTIVE_JOB_STATES.has(job.state)),
          );
        }
      })
      .catch((reason) => {
        if (alive)
          setError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить подключение.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void get<{ jobs: PendingJob[] }>(`/accounts/${account.id}/social/jobs`)
        .then((result) => {
          if (alive) {
            setJobs(
              result.jobs.filter((job) => ACTIVE_JOB_STATES.has(job.state)),
            );
            setJobsError("");
          }
        })
        .catch(() => {
          if (alive) setJobsError("Не удалось обновить очередь отправки.");
        });
    }, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [account.id]);
  async function reloadJobs() {
    const result = await get<{ jobs: PendingJob[] }>(
      `/accounts/${account.id}/social/jobs`,
    );
    setJobs(result.jobs.filter((job) => ACTIVE_JOB_STATES.has(job.state)));
    setJobsError("");
  }
  async function action(kind: string, callback: () => Promise<void>) {
    setBusy(kind);
    setError("");
    try {
      await callback();
      await reloadJobs().catch(() =>
        setJobsError("Не удалось обновить очередь отправки."),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось выполнить действие. Попробуйте ещё раз.",
      );
    } finally {
      setBusy("");
    }
  }
  async function importCookies(cookies: string) {
    if (!cookies.trim()) throw new Error("Выберите файл или вставьте cookies.");
    if (new Blob([cookies]).size > 512_000)
      throw new Error("Максимальный размер cookies — 500 КБ.");
    const result = await apiClient.importSocialCookies(account.id, cookies);
    setConnection(result.connection);
    setText("");
    await onChange();
    notify("Cookies сохранены. Нажмите «Проверить вход».", "success");
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await action("upload", async () => {
      if (file.size > 512_000)
        throw new Error("Максимальный размер файла — 500 КБ.");
      await importCookies(await file.text());
    });
  }
  async function verify() {
    await action("verify", async () => {
      const result = await apiClient.verifySocialConnection(account.id);
      setConnection(result.connection);
      await onChange();
      if (result.connection.status === "connected")
        notify(
          `${platform}: вход подтверждён${result.connection.handle ? `, @${result.connection.handle}` : ""}.`,
          "success",
        );
      else
        setError(
          result.connection.error ||
            "Вход не подтверждён. Войдите на площадке и загрузите свежие cookies.",
        );
    });
  }
  async function disconnect() {
    if (
      !(await confirmDialog(
        "Cookies этого канала будут удалены, ожидающие отправки отменены. Библиотека и настройки останутся.",
        {
          title: `Отключить ${platform}?`,
          confirmText: "Отключить",
          danger: true,
        },
      ))
    )
      return;
    await action("disconnect", async () => {
      const result = await apiClient.disconnectSocial(account.id);
      setConnection(result.connection);
      await onChange();
      notify(`${platform} отключён.`, "success");
    });
  }
  async function cancelJob(job: PendingJob) {
    await action(`cancel-${job.id}`, async () => {
      await send(`/accounts/${account.id}/social/jobs/${job.id}`, "DELETE");
      await onChange();
      notify("Отправка отменена.", "success");
    });
  }
  async function confirmNotPublished(job: PendingJob) {
    if (
      !(await confirmDialog(
        "Проверьте профиль на площадке и убедитесь, что этот ролик не опубликован. После подтверждения его можно будет отправить повторно.",
        { title: "Проверка публикации", confirmText: "Публикации нет" },
      ))
    )
      return;
    await action(`review-${job.id}`, async () => {
      await send(
        `/accounts/${account.id}/social/jobs/${job.id}/not-published`,
        "POST",
        {},
      );
      await onChange();
      notify(
        "Повторная отправка разрешена. Ролик доступен в библиотеке.",
        "success",
      );
    });
  }
  const disconnected = !connection || connection.status === "disconnected";
  return (
    <section
      className="card bg-base-100 border border-base-300"
      aria-labelledby="social-connection-title"
    >
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="social-connection-title" className="card-title text-base">
            Подключение {platform}
          </h2>
          {loading ? (
            <span
              className="loading loading-spinner loading-sm"
              aria-label="Загрузка подключения"
            />
          ) : (
            <span
              className={`badge ${connection?.status === "connected" ? "badge-success" : "badge-warning"}`}
            >
              {STATUSES[connection?.status || "disconnected"] ||
                connection?.status}
            </span>
          )}
        </div>
        {connection?.handle && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <b>@{connection.handle}</b>
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center gap-1"
              >
                Открыть профиль
                <ExternalLink size={13} />
              </a>
            )}
            {connection.checkedAt && (
              <span className="text-base-content/70">
                Проверен{" "}
                {new Date(connection.checkedAt).toLocaleString("ru-RU", {
                  hour12: false,
                })}
              </span>
            )}
          </div>
        )}
        <p className="text-sm text-base-content/75">
          Войдите в {platform} в своём браузере, экспортируйте cookies сайта и
          загрузите их сюда. Для каждого канала cookies сохраняются отдельно.
        </p>
        {(error || connection?.error) && (
          <div className="alert alert-error text-sm" role="alert">
            {error || connection?.error}
          </div>
        )}
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Способ загрузки cookies"
        >
          <button
            type="button"
            className={`btn btn-sm ${mode === "file" ? "btn-neutral" : "btn-outline"}`}
            aria-pressed={mode === "file"}
            disabled={!!busy}
            onClick={() => setMode("file")}
          >
            Загрузить файл
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === "text" ? "btn-neutral" : "btn-outline"}`}
            aria-pressed={mode === "text"}
            disabled={!!busy}
            onClick={() => setMode("text")}
          >
            Вставить cookies
          </button>
        </div>
        {mode === "file" ? (
          <div className="space-y-2">
            <label className="form-control gap-2">
              <span className="label-text">Файл cookies · JSON или TXT</span>
              <input
                type="file"
                className="file-input file-input-bordered w-full"
                accept=".json,.txt,application/json,text/plain"
                disabled={!!busy || loading}
                onChange={(event) => void upload(event)}
              />
            </label>
            <p className="text-xs text-base-content/70">
              Поддерживаются JSON-экспорт, Playwright storageState и
              cookies.txt. До 500 КБ.
            </p>
          </div>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void action("upload", () => importCookies(text));
            }}
          >
            <label className="form-control gap-2">
              <span className="label-text">
                Cookies в формате JSON, cookies.txt или строки Cookie
              </span>
              <textarea
                className="textarea textarea-bordered w-full"
                rows={5}
                value={text}
                disabled={!!busy || loading}
                autoComplete="off"
                spellCheck={false}
                placeholder="Вставьте cookies из своего браузера"
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <button
              className="btn btn-sm btn-outline gap-2"
              disabled={!!busy || !text.trim() || loading}
            >
              {busy === "upload" ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Upload size={15} />
              )}
              Сохранить cookies
            </button>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2"
            disabled={!!busy || disconnected || loading}
            onClick={() => void verify()}
          >
            {busy === "verify" ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Check size={15} />
            )}
            Проверить вход
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            disabled={!!busy || disconnected || loading}
            onClick={() => void disconnect()}
          >
            <Unplug size={15} />
            Отключить
          </button>
        </div>
        <p className="text-xs text-base-content/70">
          Cookies дают доступ к аккаунту. Они хранятся на сервере и удаляются
          при отключении. Сайт не показывает сохранённые cookies.
        </p>
        {(jobs.length > 0 || jobsError) && (
          <section
            className="border-t border-base-300 pt-4 space-y-3"
            aria-labelledby="social-active-jobs-title"
          >
            <h3 id="social-active-jobs-title" className="font-semibold text-sm">
              Активные отправки
            </h3>
            {jobsError && (
              <p className="text-sm text-error" role="status">
                {jobsError}
              </p>
            )}
            <ul className="divide-y divide-base-300">
              {jobs.map((job) => (
                <li key={job.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-sm">
                      {job.title}
                    </span>
                    <span
                      className={`badge badge-sm ${job.state === "needs_review" ? "badge-warning" : "badge-ghost"}`}
                    >
                      {JOB_LABELS[job.state]}
                    </span>
                  </div>
                  <p className="text-xs text-base-content/70">
                    {new Date(job.run_at).toLocaleString("ru-RU", {
                      hour12: false,
                    })}
                  </p>
                  {job.state === "needs_review" && (
                    <p className="text-sm text-base-content/80">
                      {job.error ||
                        "Результат отправки не подтверждён. Проверьте профиль перед повторной отправкой."}
                    </p>
                  )}
                  {job.state === "pending" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={!!busy}
                      onClick={() => void cancelJob(job)}
                    >
                      {busy === `cancel-${job.id}` && (
                        <span className="loading loading-spinner loading-xs" />
                      )}
                      Отменить отправку
                    </button>
                  )}
                  {job.state === "needs_review" && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={!!busy}
                      onClick={() => void confirmNotPublished(job)}
                    >
                      {busy === `review-${job.id}` && (
                        <span className="loading loading-spinner loading-xs" />
                      )}
                      Публикации нет — разрешить повтор
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );
}
