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
  existsSync,
} from "node:fs";
import { resolve, sep, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Cookie } from "playwright";
import type { Account, Db } from "../../db.ts";
import {
  normalizeSocialCookies,
  SocialError,
  type SocialPlatform,
} from "./cookies.ts";
import type { SocialBrowser } from "./browser.ts";
import * as metrics from "../../infra/metrics.ts";
import { INFINITE_PACKS_FEATURE } from "../infinite-packs.ts";
import { isPackDeckId } from "../../../src/anecdotes/decks.ts";
import { isSuperAdminUser } from "../../auth.ts";
import { markPackLibraryVideoUsed } from "../pack-gen.ts";
import { cleanupDrainedAutoExpireDecksForAccount } from "../auto-expire-packs.ts";
import {
  accountDailyScheduleCap,
  isMgsUser,
} from "../../infra/account-limits.ts";

type Connection = {
  account_id: number;
  user_id: number;
  platform: SocialPlatform;
  status: string;
  handle: string | null;
  profile_id: string | null;
  checked_at: string | null;
  error: string | null;
};
export type SocialConnection = {
  accountId: number;
  platform: SocialPlatform;
  status: string;
  handle: string | null;
  checkedAt: string | null;
  error: string | null;
};
export type SocialJob = {
  id: number;
  account_id: number;
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
const ACTIVE_JOB_STATES = "('preparing','pending','uploading','needs_review')";

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
  const locks = new Set<number>();
  let stopped = false;
  let active: Promise<void> | null = null;
  const sessionPath = (uid: number, accountId: number) =>
    join(sessions, `${uid}-account-${accountId}.json`);
  const jobPath = (id: number) => join(media, `${id}.mp4`);
  const connection = (accountId: number) =>
    db.db
      .prepare("SELECT * FROM social_channel_connections WHERE account_id=?")
      .get(accountId) as Connection | undefined;
  function ownedAccount(
    uid: number,
    accountId: number,
  ): Account & { platform: SocialPlatform } {
    const account =
      Number.isSafeInteger(accountId) && accountId > 0
        ? db.getAccount(accountId)
        : null;
    if (
      !account ||
      account.userId !== uid ||
      !["instagram", "tiktok"].includes(account.platform)
    )
      throw new SocialError("Канал не найден.", 404);
    return account as Account & { platform: SocialPlatform };
  }
  function deleteFile(path: string) {
    try {
      rmSync(path, { force: true });
    } catch {
      /* cleanup is best-effort */
    }
  }
  function writeCookies(uid: number, accountId: number, cookies: Cookie[]) {
    const path = sessionPath(uid, accountId),
      temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(cookies), { mode: 0o600, flag: "wx" });
      renameSync(temp, path);
    } finally {
      deleteFile(temp);
    }
  }
  function readCookies(
    account: Account & { platform: SocialPlatform },
  ): Cookie[] {
    try {
      return normalizeSocialCookies(
        readFileSync(sessionPath(account.userId!, account.id), "utf8"),
        account.platform,
      );
    } catch {
      throw new SocialError("Загрузите свежие cookies для этого канала.", 409);
    }
  }
  async function locked<T>(
    accountId: number,
    action: () => Promise<T>,
  ): Promise<T> {
    if (locks.has(accountId))
      throw new SocialError(
        "Канал занят. Дождитесь завершения текущего действия.",
        409,
      );
    locks.add(accountId);
    try {
      return await action();
    } finally {
      locks.delete(accountId);
    }
  }
  function listForAccount(uid: number, accountId: number): SocialConnection {
    const account = ownedAccount(uid, accountId),
      c = connection(accountId);
    return {
      accountId,
      platform: account.platform,
      status: c?.status || "disconnected",
      handle: c?.handle || null,
      checkedAt: c?.checked_at || null,
      error: c?.error || null,
    };
  }
  function list(uid: number) {
    return db
      .listAccountsByUser(uid)
      .filter((a) => a.platform !== "youtube")
      .map((a) => listForAccount(uid, a.id));
  }
  function jobs(uid: number) {
    return db.db
      .prepare(
        "SELECT * FROM social_jobs WHERE user_id=? AND account_id IS NOT NULL ORDER BY id DESC LIMIT 100",
      )
      .all(uid) as SocialJob[];
  }
  function jobsForAccount(uid: number, accountId: number) {
    ownedAccount(uid, accountId);
    return db.db
      .prepare(
        "SELECT * FROM social_jobs WHERE user_id=? AND account_id=? ORDER BY id DESC LIMIT 100",
      )
      .all(uid, accountId) as SocialJob[];
  }
  function hasPendingVideo(accountId: number, videoId: number) {
    const account = db.getAccount(accountId);
    const recycling =
      account?.userId != null &&
      db.hasFeature(account.userId, INFINITE_PACKS_FEATURE);
    return !!db.db
      .prepare(
        `SELECT id FROM social_jobs WHERE account_id=? AND video_id=? AND (state IN ${ACTIVE_JOB_STATES} ${recycling ? "" : "OR state='published'"})`,
      )
      .get(accountId, videoId);
  }
  function releaseClaim(accountId: number, videoId: number) {
    if (db.getVideo(videoId)?.accountId === accountId)
      db.releaseVideoPost(videoId);
  }
  function cancelPending(accountId: number) {
    const cancelled = db.db
      .prepare(
        "UPDATE social_jobs SET state='cancelled' WHERE account_id=? AND state IN ('pending','preparing') RETURNING id,video_id",
      )
      .all(accountId) as { id: number; video_id: number }[];
    for (const job of cancelled) {
      releaseClaim(accountId, job.video_id);
      deleteFile(jobPath(job.id));
    }
  }
  function importForAccount(uid: number, accountId: number, input: unknown) {
    const account = ownedAccount(uid, accountId);
    if (locks.has(accountId))
      throw new SocialError(
        "Канал занят. Дождитесь завершения текущего действия.",
        409,
      );
    const cookies = normalizeSocialCookies(input, account.platform);
    writeCookies(uid, accountId, cookies);
    db.db
      .prepare(
        "INSERT INTO social_channel_connections(account_id,user_id,platform,status) VALUES (?,?,?,'unchecked') ON CONFLICT(account_id) DO UPDATE SET status='unchecked',handle=NULL,profile_id=NULL,checked_at=NULL,error=NULL",
      )
      .run(accountId, uid, account.platform);
    cancelPending(accountId);
    db.db
      .prepare(
        "UPDATE accounts SET status='needs_auth',social_handle=NULL WHERE id=?",
      )
      .run(accountId);
    return listForAccount(uid, accountId);
  }
  async function verifyForAccount(uid: number, accountId: number) {
    const account = ownedAccount(uid, accountId);
    return locked(accountId, async () => {
      try {
        const profile = await browser.verify(
          account.platform,
          readCookies(account),
        );
        const previous = connection(accountId);
        if (previous?.profile_id && previous.profile_id !== profile.userId)
          cancelPending(accountId);
        db.db
          .prepare(
            "UPDATE social_channel_connections SET status='connected',handle=?,profile_id=?,checked_at=?,error=NULL WHERE account_id=? AND user_id=?",
          )
          .run(
            profile.handle,
            profile.userId,
            new Date().toISOString(),
            accountId,
            uid,
          );
        db.db
          .prepare(
            "UPDATE accounts SET status='connected',social_handle=?,channel_name=CASE WHEN channel_name IN ('Новый канал','Instagram','TikTok') THEN ? ELSE channel_name END,auth_error=NULL,auth_failed_at=NULL WHERE id=?",
          )
          .run(profile.handle, `@${profile.handle}`, accountId);
      } catch (error) {
        if (error instanceof SocialError && error.statusCode === 429)
          throw error;
        const message =
          "Не удалось подтвердить вход. Войдите на площадке и загрузите свежие cookies этого канала.";
        db.db
          .prepare(
            "UPDATE social_channel_connections SET status='needs_login',error=? WHERE account_id=? AND user_id=?",
          )
          .run(message, accountId, uid);
        db.db
          .prepare(
            "UPDATE accounts SET status='needs_auth',auth_error=?,auth_failed_at=COALESCE(auth_failed_at,?) WHERE id=?",
          )
          .run(message, new Date().toISOString(), accountId);
      }
      return listForAccount(uid, accountId);
    });
  }
  function disconnectForAccount(uid: number, accountId: number) {
    ownedAccount(uid, accountId);
    if (locks.has(accountId))
      throw new SocialError("Дождитесь окончания отправки или проверки.", 409);
    deleteFile(sessionPath(uid, accountId));
    db.db
      .prepare(
        "DELETE FROM social_channel_connections WHERE account_id=? AND user_id=?",
      )
      .run(accountId, uid);
    cancelPending(accountId);
    db.db
      .prepare(
        "UPDATE accounts SET status='needs_auth',social_handle=NULL,auth_error=NULL,auth_failed_at=NULL WHERE id=?",
      )
      .run(accountId);
    return listForAccount(uid, accountId);
  }
  function cleanupAccount(uid: number, accountId: number) {
    disconnectForAccount(uid, accountId);
    const rows = db.db
      .prepare("SELECT id FROM social_jobs WHERE account_id=?")
      .all(accountId) as { id: number }[];
    for (const row of rows) deleteFile(jobPath(row.id));
    db.db.prepare("DELETE FROM social_jobs WHERE account_id=?").run(accountId);
  }
  function videos(uid: number) {
    return db.db
      .prepare(
        "SELECT v.id,v.title,a.id AS accountId,a.channel_name AS channel FROM videos v JOIN accounts a ON a.id=v.account_id WHERE a.user_id=? AND a.platform IN ('instagram','tiktok') ORDER BY v.id DESC LIMIT 300",
      )
      .all(uid);
  }
  function enqueueForAccount(
    uid: number,
    accountId: number,
    videoId: number,
    caption: string,
    runAt: string,
  ) {
    const account = ownedAccount(uid, accountId),
      c = connection(accountId);
    if (c?.status !== "connected")
      throw new SocialError(
        "Сначала загрузите cookies и проверьте подключение канала.",
        409,
      );
    if (locks.has(accountId))
      throw new SocialError(
        "Канал занят. Повторите после завершения проверки.",
        409,
      );
    if (!Number.isSafeInteger(videoId) || videoId <= 0)
      throw new SocialError("Выберите ролик из библиотеки этого канала.");
    const video = db.getVideo(videoId);
    if (!video || video.accountId !== accountId)
      throw new SocialError("Ролик не найден в библиотеке этого канала.", 404);
    if (hasPendingVideo(accountId, videoId))
      throw new SocialError(
        "Этот ролик уже отправлен или добавлен в очередь канала.",
        409,
      );
    const count = db.db
      .prepare(
        "SELECT count(*) AS n FROM social_jobs WHERE user_id=? AND state IN ('pending','preparing','uploading')",
      )
      .get(uid) as { n: number };
    if (Number(count.n) >= 100)
      throw new SocialError("В очереди уже 100 заданий.", 409);
    const when = Date.parse(runAt);
    if (
      !Number.isFinite(when) ||
      when < Date.now() - 60_000 ||
      when > Date.now() + 366 * 86_400_000
    )
      throw new SocialError("Укажите время в пределах ближайшего года.");
    const owner = db.getUserById(uid);
    const dailyCap = accountDailyScheduleCap(
      owner?.role === "admin",
      isMgsUser(owner),
    );
    const dayStart =
      new Date(when).toISOString().slice(0, 10) + "T00:00:00.000Z";
    const dayEnd = new Date(Date.parse(dayStart) + 86_400_000).toISOString();
    const dailyUsed = db.db
      .prepare(
        "SELECT count(*) AS n FROM social_jobs WHERE account_id=? AND run_at>=? AND run_at<? AND state IN ('preparing','pending','uploading','published','needs_review')",
      )
      .get(accountId, dayStart, dayEnd) as { n: number };
    if (Number(dailyUsed.n) >= dailyCap)
      throw new SocialError(
        `На этот день уже запланировано ${dailyCap} публикаций канала. Выберите другой день.`,
        409,
      );
    if (caption.length > 2200)
      throw new SocialError("Подпись должна содержать не более 2200 символов.");
    let source: string;
    try {
      const base = realpathSync(outputDir);
      source = realpathSync(resolve(base, video.videoRel));
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
    if (!db.claimVideoForPost(videoId))
      throw new SocialError("Этот ролик уже публикуется или опубликован.", 409);
    let id: number | undefined;
    try {
      const info = db.db
        .prepare(
          "INSERT INTO social_jobs(account_id,user_id,platform,video_id,title,caption,run_at,state) VALUES (?,?,?,?,?,?,?,'preparing')",
        )
        .run(
          accountId,
          uid,
          account.platform,
          videoId,
          video.title,
          caption,
          new Date(when).toISOString(),
        );
      id = Number(info.lastInsertRowid);
      copyFileSync(source, jobPath(id));
      chmodSync(jobPath(id), 0o600);
      db.db
        .prepare("UPDATE social_jobs SET state='pending' WHERE id=?")
        .run(id);
    } catch {
      if (id != null) {
        deleteFile(jobPath(id));
        db.db.prepare("DELETE FROM social_jobs WHERE id=?").run(id);
      }
      db.releaseVideoPost(videoId);
      throw new SocialError("Не удалось подготовить файл для отправки.", 409);
    }
    return jobsForAccount(uid, accountId);
  }
  function ownedJob(uid: number, id: number) {
    const job = db.db
      .prepare("SELECT * FROM social_jobs WHERE id=? AND user_id=?")
      .get(id, uid) as SocialJob | undefined;
    if (!job) throw new SocialError("Задание не найдено.", 404);
    ownedAccount(uid, job.account_id);
    return job;
  }
  function cancel(uid: number, id: number) {
    const job = ownedJob(uid, id);
    const row = db.db
      .prepare(
        "UPDATE social_jobs SET state='cancelled' WHERE id=? AND state='pending' RETURNING id",
      )
      .get(id);
    if (!row)
      throw new SocialError("Можно отменить только ожидающее задание.", 409);
    releaseClaim(job.account_id, job.video_id);
    deleteFile(jobPath(id));
    return jobsForAccount(uid, job.account_id);
  }
  function confirmNotPublished(uid: number, id: number) {
    const job = ownedJob(uid, id);
    const changed = db.db
      .prepare(
        "UPDATE social_jobs SET state='failed',error='Пользователь подтвердил отсутствие публикации. Можно отправить заново.' WHERE id=? AND state='needs_review' RETURNING id",
      )
      .get(id);
    if (!changed)
      throw new SocialError("Это задание не требует проверки.", 409);
    releaseClaim(job.account_id, job.video_id);
    deleteFile(jobPath(id));
    return jobsForAccount(uid, job.account_id);
  }
  function cancelForAccount(uid: number, accountId: number, id: number) {
    ownedAccount(uid, accountId);
    if (ownedJob(uid, id).account_id !== accountId)
      throw new SocialError("Задание не найдено.", 404);
    return cancel(uid, id);
  }
  function confirmNotPublishedForAccount(
    uid: number,
    accountId: number,
    id: number,
  ) {
    ownedAccount(uid, accountId);
    if (ownedJob(uid, id).account_id !== accountId)
      throw new SocialError("Задание не найдено.", 404);
    return confirmNotPublished(uid, id);
  }
  function recordResult(
    job: SocialJob,
    state: "published" | "failed" | "needs_review",
    url: string | null,
    error: string | null,
  ) {
    db.db.exec("BEGIN");
    try {
      const updated = db.db
        .prepare(
          "UPDATE social_jobs SET state=?,url=?,error=? WHERE id=? AND state='uploading' RETURNING id",
        )
        .get(state, url, error, job.id);
      if (updated) {
        const video = db.getVideo(job.video_id);
        db.addHistory({
          accountId: job.account_id,
          title: job.title,
          description: job.caption,
          status: state,
          platform: job.platform,
          platformUrl: url,
          videoPath: video?.videoRel,
          publishedAt: new Date().toISOString(),
          error,
          deck: video?.deck,
        });
        if (state === "failed") releaseClaim(job.account_id, job.video_id);
      }
      db.db.exec("COMMIT");
    } catch (error) {
      db.db.exec("ROLLBACK");
      throw error;
    }
  }
  function completeLibraryVideo(job: SocialJob) {
    const video = db.getVideo(job.video_id),
      account = db.getAccount(job.account_id);
    if (!video || video.accountId !== job.account_id || !account) return;
    if (db.hasFeature(job.user_id, INFINITE_PACKS_FEATURE)) {
      db.recycleVideoForRepost(video.id);
      return;
    }
    if (isPackDeckId(video.deck))
      markPackLibraryVideoUsed(
        db,
        job.user_id,
        account.id,
        video.deck,
        video,
        isSuperAdminUser(db.getUserById(job.user_id)),
      );
    const base = realpathSync(outputDir);
    for (const rel of [video.videoRel, video.imageRel]) {
      if (!rel) continue;
      try {
        const path = realpathSync(resolve(base, rel));
        if (path.startsWith(base + sep)) deleteFile(path);
      } catch {
        /* source may already have been removed after the private snapshot */
      }
    }
    db.deleteVideo(video.id);
    cleanupDrainedAutoExpireDecksForAccount(db, account);
  }
  async function tick() {
    if (stopped || active) return;
    active = (async () => {
      const job = db.db
        .prepare(
          `SELECT j.* FROM social_jobs j JOIN social_channel_connections c ON c.account_id=j.account_id AND c.user_id=j.user_id JOIN accounts a ON a.id=j.account_id AND a.user_id=j.user_id JOIN users u ON u.id=j.user_id WHERE j.state='pending' AND j.run_at<=? AND c.status='connected' ORDER BY j.run_at,j.id LIMIT 1`,
        )
        .get(new Date().toISOString()) as SocialJob | undefined;
      if (!job || locks.has(job.account_id)) return;
      const account = ownedAccount(job.user_id, job.account_id),
        c = connection(job.account_id);
      if (c?.status !== "connected") return;
      const claimed = db.db
        .prepare(
          "UPDATE social_jobs SET state='uploading' WHERE id=? AND state='pending' RETURNING id",
        )
        .get(job.id);
      if (!claimed) return;
      let submitted = false;
      try {
        const url = await locked(job.account_id, () =>
          metrics.track("upload", () =>
            browser.publish(
              job.platform,
              readCookies(account),
              { handle: c.handle!, userId: c.profile_id! },
              jobPath(job.id),
              job.caption,
              () => {
                submitted = true;
              },
            ),
          ),
        );
        recordResult(job, "published", url, null);
        // Delivery is already confirmed; cleanup failures must never create a retry.
        try {
          completeLibraryVideo(job);
        } catch {
          /* retry-free cleanup */
        }
        metrics.notePost();
      } catch {
        recordResult(
          job,
          submitted ? "needs_review" : "failed",
          null,
          submitted
            ? "Проверьте профиль: результат отправки не подтверждён. Автоматический повтор отключён."
            : "Отправка не началась. Проверьте cookies и доступность редактора площадки.",
        );
      } finally {
        deleteFile(jobPath(job.id));
      }
    })();
    try {
      await active;
    } finally {
      active = null;
    }
  }
  function migrateLegacyConnections() {
    const legacy = db.db
      .prepare("SELECT * FROM social_connections")
      .all() as Omit<Connection, "account_id">[];
    for (const old of legacy) {
      if (!db.getUserById(old.user_id)) continue;
      const mappingKey = `social.legacy-account.${old.user_id}.${old.platform}`;
      const mapped = Number(db.getSetting(mappingKey));
      let account = mapped ? db.getAccount(mapped) : null;
      if (
        !account ||
        account.userId !== old.user_id ||
        account.platform !== old.platform
      ) {
        db.db.exec("BEGIN");
        try {
          account = db.createAccount({
            userId: old.user_id,
            platform: old.platform,
            socialHandle: old.handle,
            channelName: old.handle
              ? `@${old.handle}`
              : old.platform === "instagram"
                ? "Instagram"
                : "TikTok",
            lang: "",
            sourceDecks: [],
            channelLang: "",
            schedule: [],
            status: old.status === "connected" ? "connected" : "needs_auth",
          });
          db.setSetting(mappingKey, String(account.id));
          db.db.exec("COMMIT");
        } catch (error) {
          db.db.exec("ROLLBACK");
          throw error;
        }
      }
      const previousPath = join(
          sessions,
          `${old.user_id}-${old.platform}.json`,
        ),
        nextPath = sessionPath(old.user_id, account.id);
      if (existsSync(previousPath) && !existsSync(nextPath)) {
        renameSync(previousPath, nextPath);
        chmodSync(nextPath, 0o600);
      }
      db.db.exec("BEGIN");
      try {
        db.db
          .prepare(
            "INSERT OR IGNORE INTO social_channel_connections(account_id,user_id,platform,status,handle,profile_id,checked_at,error) VALUES (?,?,?,?,?,?,?,?)",
          )
          .run(
            account.id,
            old.user_id,
            old.platform,
            old.status,
            old.handle,
            old.profile_id,
            old.checked_at,
            old.error,
          );
        db.db
          .prepare(
            "UPDATE social_jobs SET account_id=? WHERE user_id=? AND platform=? AND account_id IS NULL",
          )
          .run(account.id, old.user_id, old.platform);
        db.db
          .prepare(
            "DELETE FROM social_connections WHERE user_id=? AND platform=?",
          )
          .run(old.user_id, old.platform);
        db.db.exec("COMMIT");
      } catch (error) {
        db.db.exec("ROLLBACK");
        throw error;
      }
      // Jobs from the older shared library retain snapshots but cannot reserve unrelated channels' videos.
      const linked = db.db
        .prepare(
          "SELECT video_id FROM social_jobs WHERE account_id=? AND state IN ('pending','uploading','needs_review')",
        )
        .all(account.id) as { video_id: number }[];
      for (const job of linked) {
        const video = db.getVideo(job.video_id);
        if (video?.accountId === account.id) db.claimVideoForPost(video.id);
      }
    }
  }
  function start() {
    migrateLegacyConnections();
    const interrupted = db.db
      .prepare(
        "SELECT * FROM social_jobs WHERE state='uploading' AND account_id IS NOT NULL",
      )
      .all() as SocialJob[];
    for (const job of interrupted)
      recordResult(
        job,
        "needs_review",
        null,
        "Сервис был перезапущен во время отправки. Проверьте профиль.",
      );
    const preparing = db.db
      .prepare(
        "UPDATE social_jobs SET state='failed',error='Подготовка была прервана. Создайте задание заново.' WHERE state='preparing' RETURNING id,video_id",
      )
      .all() as { id: number; video_id: number }[];
    for (const job of preparing) {
      const accountId = (
        db.db
          .prepare("SELECT account_id FROM social_jobs WHERE id=?")
          .get(job.id) as { account_id: number | null }
      ).account_id;
      if (accountId != null) releaseClaim(accountId, job.video_id);
      deleteFile(jobPath(job.id));
    }
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
  // Old endpoints resolve existing channels only. They never create an implicit channel.
  function legacyAccount(uid: number, platform: SocialPlatform) {
    const accounts = db
      .listAccountsByUser(uid)
      .filter((a) => a.platform === platform);
    if (accounts.length !== 1)
      throw new SocialError(
        "Откройте нужный канал в общем списке каналов.",
        409,
      );
    return accounts[0].id;
  }
  return {
    cancelForAccount,
    confirmNotPublishedForAccount,
    listForAccount,
    importForAccount,
    verifyForAccount,
    disconnectForAccount,
    cleanupAccount,
    jobsForAccount,
    enqueueForAccount,
    hasPendingVideo,
    migrateLegacyConnections,
    list,
    jobs,
    videos,
    cancel,
    confirmNotPublished,
    start,
    tick,
    importCookies: (uid: number, p: SocialPlatform, input: unknown) => {
      importForAccount(uid, legacyAccount(uid, p), input);
      return list(uid);
    },
    verify: async (uid: number, p: SocialPlatform) => {
      await verifyForAccount(uid, legacyAccount(uid, p));
      return list(uid);
    },
    disconnect: (uid: number, p: SocialPlatform) => {
      disconnectForAccount(uid, legacyAccount(uid, p));
      return list(uid);
    },
    enqueue: (
      uid: number,
      p: SocialPlatform,
      videoId: number,
      caption: string,
      runAt: string,
    ) => enqueueForAccount(uid, legacyAccount(uid, p), videoId, caption, runAt),
  };
}
export type SocialService = ReturnType<typeof createSocialService>;
