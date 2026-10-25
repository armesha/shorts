import {
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
  realpathSync,
  copyFileSync,
  statSync,
} from "node:fs";
import { resolve, sep, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Cookie } from "playwright";
import type { Db } from "../../db.ts";
import {
  normalizeSocialCookies,
  SocialError,
  type SocialPlatform,
} from "./cookies.ts";
import type { SocialBrowser, SocialProfile } from "./browser.ts";
import * as metrics from "../../infra/metrics.ts";

type Connection = {
  user_id: number;
  platform: SocialPlatform;
  status: string;
  handle: string | null;
  profile_id: string | null;
  checked_at: string | null;
  error: string | null;
};
export type SocialJob = {
  id: number;
  user_id: number;
  platform: SocialPlatform;
  video_id: number;
  title: string;
  caption: string;
  run_at: string;
  state: string;
  url: string | null;
  error: string | null;
  created_at: string;
};
export function createSocialService(
  db: Db,
  root: string,
  outputDir: string,
  browser: SocialBrowser,
) {
  const sessions = join(root, "sessions");
  const media = join(root, "media");
  for (const dir of [root, sessions, media]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  const locks = new Set<string>();
  let stopped = false;
  let active: Promise<void> | null = null;
  const key = (uid: number, p: SocialPlatform) => `${uid}-${p}`;
  const sessionPath = (uid: number, p: SocialPlatform) =>
    join(sessions, `${key(uid, p)}.json`);
  const jobPath = (id: number) => join(media, `${id}.mp4`);
  const connection = (uid: number, p: SocialPlatform) =>
    db.db
      .prepare(
        "SELECT * FROM social_connections WHERE user_id=? AND platform=?",
      )
      .get(uid, p) as Connection | undefined;
  function readCookies(uid: number, p: SocialPlatform): Cookie[] {
    try {
      return normalizeSocialCookies(
        readFileSync(sessionPath(uid, p), "utf8"),
        p,
      );
    } catch {
      throw new SocialError("Загрузите свежий файл cookies.", 409);
    }
  }
  async function locked<T>(
    uid: number,
    p: SocialPlatform,
    action: () => Promise<T>,
  ): Promise<T> {
    const id = key(uid, p);
    if (locks.has(id))
      throw new SocialError(
        "Аккаунт занят. Дождитесь завершения текущего действия.",
        409,
      );
    locks.add(id);
    try {
      return await action();
    } finally {
      locks.delete(id);
    }
  }
  function list(uid: number) {
    return (["instagram", "tiktok"] as const).map((platform) => {
      const c = connection(uid, platform);
      return {
        platform,
        status: c?.status || "disconnected",
        handle: c?.handle || null,
        checkedAt: c?.checked_at || null,
        error: c?.error || null,
      };
    });
  }
  const jobs = (uid: number) =>
    db.db
      .prepare(
        "SELECT id,user_id,platform,video_id,title,caption,run_at,state,url,error,created_at FROM social_jobs WHERE user_id=? ORDER BY id DESC LIMIT 100",
      )
      .all(uid) as SocialJob[];
  function importCookies(uid: number, p: SocialPlatform, input: unknown) {
    if (locks.has(key(uid, p)))
      throw new SocialError(
        "Аккаунт занят. Дождитесь завершения текущего действия.",
        409,
      );
    const cookies = normalizeSocialCookies(input, p);
    const path = sessionPath(uid, p),
      temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(cookies), { mode: 0o600, flag: "wx" });
      renameSync(temp, path);
    } finally {
      rmSync(temp, { force: true });
    }
    db.db
      .prepare(
        "INSERT INTO social_connections(user_id,platform,status) VALUES (?,?,'unchecked') ON CONFLICT(user_id,platform) DO UPDATE SET status='unchecked',handle=NULL,profile_id=NULL,checked_at=NULL,error=NULL",
      )
      .run(uid, p);
    // New cookies may belong to a different account. Existing plans must be explicitly recreated.
    cancelPending(uid, p);
    return list(uid);
  }
  function cancelPending(uid: number, p: SocialPlatform) {
    const cancelled = db.db
      .prepare(
        "UPDATE social_jobs SET state='cancelled' WHERE user_id=? AND platform=? AND state='pending' RETURNING id",
      )
      .all(uid, p) as { id: number }[];
    for (const j of cancelled) rmSync(jobPath(j.id), { force: true });
  }
  async function verify(uid: number, p: SocialPlatform) {
    return locked(uid, p, async () => {
      try {
        const profile = await browser.verify(p, readCookies(uid, p));
        const previous = connection(uid, p);
        if (previous?.profile_id && previous.profile_id !== profile.userId)
          cancelPending(uid, p);
        db.db
          .prepare(
            "UPDATE social_connections SET status='connected',handle=?,profile_id=?,checked_at=?,error=NULL WHERE user_id=? AND platform=?",
          )
          .run(
            profile.handle,
            profile.userId,
            new Date().toISOString(),
            uid,
            p,
          );
      } catch (error) {
        if (error instanceof SocialError && error.statusCode === 429)
          throw error;
        db.db
          .prepare(
            "UPDATE social_connections SET status='needs_login',error=? WHERE user_id=? AND platform=?",
          )
          .run(
            "Не удалось подтвердить вход. Войдите на площадке и загрузите свежие cookies.",
            uid,
            p,
          );
      }
      return list(uid);
    });
  }
  function disconnect(uid: number, p: SocialPlatform) {
    if (locks.has(key(uid, p)))
      throw new SocialError("Дождитесь окончания отправки или проверки.", 409);
    rmSync(sessionPath(uid, p), { force: true });
    db.db
      .prepare("DELETE FROM social_connections WHERE user_id=? AND platform=?")
      .run(uid, p);
    cancelPending(uid, p);
    return list(uid);
  }
  function videos(uid: number) {
    return db.db
      .prepare(
        `SELECT * FROM (
      SELECT v.id,v.title,a.channel_name AS channel FROM videos v JOIN accounts a ON a.id=v.account_id WHERE a.user_id=?
      UNION ALL
      SELECT -id AS id,title,'Creator' AS channel FROM creator_gallery_items WHERE user_id=? AND video_rel IS NOT NULL AND format='mp4'
    ) ORDER BY id DESC LIMIT 300`,
      )
      .all(uid, uid);
  }
  function enqueue(
    uid: number,
    p: SocialPlatform,
    videoId: number,
    caption: string,
    runAt: string,
  ) {
    const c = connection(uid, p);
    if (c?.status !== "connected")
      throw new SocialError(
        "Сначала загрузите cookies и проверьте подключение.",
        409,
      );
    if (locks.has(key(uid, p)))
      throw new SocialError(
        "Аккаунт занят. Повторите после завершения проверки.",
        409,
      );
    if (!Number.isSafeInteger(videoId) || videoId === 0)
      throw new SocialError("Выберите ролик.");
    const video = (
      videoId > 0
        ? db.db
            .prepare(
              "SELECT v.title,v.video_rel FROM videos v JOIN accounts a ON a.id=v.account_id WHERE v.id=? AND a.user_id=?",
            )
            .get(videoId, uid)
        : db.db
            .prepare(
              "SELECT title,video_rel FROM creator_gallery_items WHERE id=? AND user_id=? AND format='mp4'",
            )
            .get(-videoId, uid)
    ) as { title: string; video_rel: string } | undefined;
    if (!video) throw new SocialError("Ролик не найден.", 404);
    if (
      db.db
        .prepare(
          "SELECT id FROM social_jobs WHERE user_id=? AND platform=? AND video_id=? AND state IN ('pending','uploading','published','needs_review')",
        )
        .get(uid, p, videoId)
    )
      throw new SocialError(
        "Этот ролик уже отправлен или добавлен в очередь этой площадки.",
        409,
      );
    if (
      Number(
        (
          db.db
            .prepare(
              "SELECT count(*) AS n FROM social_jobs WHERE user_id=? AND state IN ('pending','uploading')",
            )
            .get(uid) as { n: number }
        ).n,
      ) >= 100
    )
      throw new SocialError("В очереди уже 100 заданий.", 409);
    const when = Date.parse(runAt);
    if (
      !Number.isFinite(when) ||
      when < Date.now() - 60_000 ||
      when > Date.now() + 366 * 86_400_000
    )
      throw new SocialError("Укажите время в пределах ближайшего года.");
    if (caption.length > 2200)
      throw new SocialError("Подпись должна содержать не более 2200 символов.");
    let source: string;
    try {
      const base = realpathSync(outputDir);
      source = realpathSync(resolve(base, video.video_rel));
      if (
        !source.startsWith(base + sep) ||
        !statSync(source).isFile() ||
        !source.toLowerCase().endsWith(".mp4")
      )
        throw new Error();
    } catch {
      throw new SocialError(
        "Файл ролика недоступен. Выберите другой ролик.",
        409,
      );
    }
    const info = db.db
      .prepare(
        "INSERT INTO social_jobs(user_id,platform,video_id,title,caption,run_at,state) VALUES (?,?,?,?,?,?,'preparing')",
      )
      .run(uid, p, videoId, video.title, caption, new Date(when).toISOString());
    const id = Number(info.lastInsertRowid);
    try {
      copyFileSync(source, jobPath(id));
      chmodSync(jobPath(id), 0o600);
      db.db
        .prepare("UPDATE social_jobs SET state='pending' WHERE id=?")
        .run(id);
    } catch {
      rmSync(jobPath(id), { force: true });
      db.db.prepare("DELETE FROM social_jobs WHERE id=?").run(id);
      throw new SocialError("Не удалось подготовить файл для отправки.", 409);
    }
    return jobs(uid);
  }
  function cancel(uid: number, id: number) {
    const row = db.db
      .prepare(
        "UPDATE social_jobs SET state='cancelled' WHERE id=? AND user_id=? AND state='pending' RETURNING id",
      )
      .get(id, uid);
    if (!row)
      throw new SocialError("Можно отменить только ожидающее задание.", 409);
    rmSync(jobPath(id), { force: true });
    return jobs(uid);
  }
  function confirmNotPublished(uid: number, id: number) {
    const changed = db.db
      .prepare(
        "UPDATE social_jobs SET state='failed',error='Пользователь подтвердил отсутствие публикации. Можно отправить заново.' WHERE id=? AND user_id=? AND state='needs_review' RETURNING id",
      )
      .get(id, uid);
    if (!changed)
      throw new SocialError("Это задание не требует проверки.", 409);
    rmSync(jobPath(id), { force: true });
    return jobs(uid);
  }
  async function tick() {
    if (stopped || active) return;
    active = (async () => {
      const job = db.db
        .prepare(
          `SELECT j.* FROM social_jobs j
           JOIN social_connections c ON c.user_id=j.user_id AND c.platform=j.platform
           JOIN users u ON u.id=j.user_id
           WHERE j.state='pending' AND j.run_at<=? AND c.status='connected'
           ORDER BY j.run_at,j.id LIMIT 1`,
        )
        .get(new Date().toISOString()) as SocialJob | undefined;
      if (!job || locks.has(key(job.user_id, job.platform))) return;
      const c = connection(job.user_id, job.platform);
      if (c?.status !== "connected") return;
      const claimed = db.db
        .prepare(
          "UPDATE social_jobs SET state='uploading' WHERE id=? AND state='pending' RETURNING id",
        )
        .get(job.id);
      if (!claimed) return;
      let submitted = false;
      try {
        const url = await locked(job.user_id, job.platform, () =>
          metrics.track("upload", () =>
            browser.publish(
              job.platform,
              readCookies(job.user_id, job.platform),
              { handle: c.handle!, userId: c.profile_id! },
              jobPath(job.id),
              job.caption,
              () => {
                submitted = true;
              },
            ),
          ),
        );
        db.db
          .prepare(
            "UPDATE social_jobs SET state='published',url=?,error=NULL WHERE id=?",
          )
          .run(url, job.id);
        rmSync(jobPath(job.id), { force: true });
      } catch {
        db.db
          .prepare("UPDATE social_jobs SET state=?,error=? WHERE id=?")
          .run(
            submitted ? "needs_review" : "failed",
            submitted
              ? "Проверьте профиль: результат отправки не подтверждён. Автоматический повтор отключён."
              : "Отправка не началась. Проверьте cookies и доступность редактора площадки.",
            job.id,
          );
        rmSync(jobPath(job.id), { force: true });
      }
    })();
    try {
      await active;
    } finally {
      active = null;
    }
  }
  function start() {
    // A process may die after clicking Share. Never resend such a job automatically.
    db.db
      .prepare(
        "UPDATE social_jobs SET state='needs_review',error='Сервис был перезапущен во время отправки. Проверьте профиль.' WHERE state='uploading'",
      )
      .run();
    const preparing = db.db
      .prepare(
        "UPDATE social_jobs SET state='failed',error='Подготовка была прервана. Создайте задание заново.' WHERE state='preparing' RETURNING id",
      )
      .all() as { id: number }[];
    for (const j of preparing) rmSync(jobPath(j.id), { force: true });
    const timer = setInterval(() => {
      void tick().catch(() => {});
    }, 10_000);
    timer.unref();
    return {
      stop: () => {
        stopped = true;
        clearInterval(timer);
      },
      drain: async () => {
        await active;
      },
    };
  }
  return {
    confirmNotPublished,
    list,
    importCookies,
    verify,
    disconnect,
    videos,
    jobs,
    enqueue,
    cancel,
    start,
    tick,
  };
}
export type SocialService = ReturnType<typeof createSocialService>;
