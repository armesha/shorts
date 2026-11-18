import { randomInt } from "node:crypto";
import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { CircleYouTubePublisher } from "../services/circle-pipeline/youtube-publisher.ts";
import { GTA6_BANNERS, GTA6_CLIP_ID, type Gta6Banner, type Gta6Library } from "../services/gta6-library.ts";
import { DEFAULT_ACCOUNT_TIMEZONE, nextLocalTimeAt, timePartsInTimeZone } from "../services/timezone.ts";
import { probeCuttingMedia } from "../services/video-cutting.ts";
import { sameOrigin } from "./gta6-live.ts";
import { prepareGta6Preview } from "./gta6-previews.ts";

const API = "/api/creator/gta6-youtube";
const params = z.object({ id: z.string().regex(GTA6_CLIP_ID), banner: z.enum(GTA6_BANNERS) });
const targetInput = z.object({ banner: z.enum(GTA6_BANNERS), accountId: z.number().int().positive().nullable() }).strict();
const confirmedTarget = z.object({ accountId: z.number().int().positive(), channelId: z.string().regex(/^UC[\w-]{22}$/u) }).strict();
const automationInput = z.object({ banner: z.enum(GTA6_BANNERS), enabled: z.boolean() }).strict();
const HOUR_MS = 60 * 60_000;
const PUBLICATION_START = "08:00";
const PUBLICATION_END = "23:00";
type Target = { accountId: number; channelId: string };
type Automation = { ownerId: number; banner: Gta6Banner; initialRemaining: number; nextAt: number; pendingClip: string | null };

class PublicationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

class NightPause extends PublicationError {
  constructor(readonly resumeAt: number) { super(409, "Ночная пауза. Ролик вернётся в очередь утром."); }
}

function nextAllowedTime(timestamp: number) {
  const time = new Date(timestamp);
  const { hhmm } = timePartsInTimeZone(time, DEFAULT_ACCOUNT_TIMEZONE);
  if (hhmm >= PUBLICATION_START && hhmm < PUBLICATION_END) return timestamp;
  const morning = nextLocalTimeAt(PUBLICATION_START, DEFAULT_ACCOUNT_TIMEZONE, time);
  if (!morning) throw new Error("Could not determine the next GTA Shorts publication time");
  return Date.parse(morning);
}

const captions = {
  shortrobot: { text: "@shortrobot — бот для скачивания видео в Telegram.", tag: "#Shortrobot" },
  simka: { text: "SIMKA VPN в Telegram — @simka_dbot.", tag: "#SimkaVPN" },
};

export function isGta6YouTubeUploading(db: Db, ownerId: number, clipId: string) {
  return Boolean(db.db.prepare(`SELECT 1 FROM gta6_youtube_publications WHERE owner_id=? AND clip_id=? AND state IN ('uploading','submitted')`).get(ownerId, clipId));
}

export function registerGta6YouTubeRoutes(app: FastifyInstance, db: Db, libraryFor: (ownerId: number) => Gta6Library,
  uploader: Pick<CircleYouTubePublisher, "publishManually">, probe = probeCuttingMedia, now = Date.now) {
  db.db.prepare("UPDATE gta6_youtube_publications SET state='failed',error=? WHERE state='uploading'")
    .run("Отправка была прервана. Можно повторить.");
  db.db.prepare("UPDATE gta6_youtube_publications SET state='review',error=? WHERE state='submitted'")
    .run("Проверьте результат в YouTube. Повторная отправка заблокирована.");
  db.db.prepare("UPDATE gta6_youtube_publications SET comment_status='unconfirmed' WHERE comment_status='pending'").run();

  function accounts(ownerId: number) {
    return db.db.prepare(`SELECT a.id, a.channel_name AS name, c.channel_id AS channelId
      FROM circle_youtube_connections c JOIN accounts a ON a.id=c.account_id
      WHERE c.owner_id=? AND a.user_id=? AND a.platform='youtube' AND c.status='connected' AND c.channel_id IS NOT NULL
      ORDER BY a.channel_name, a.id`).all(ownerId, ownerId) as Array<{ id: number; name: string; channelId: string }>;
  }

  function view(ownerId: number) {
    const connected = accounts(ownerId);
    const targets = db.db.prepare("SELECT banner,account_id AS accountId,channel_id AS channelId FROM gta6_youtube_targets WHERE owner_id=?")
      .all(ownerId) as Array<{ banner: Gta6Banner; accountId: number; channelId: string }>;
    return {
      accounts: connected,
      targets: targets.filter(target => connected.some(account => account.id === target.accountId && account.channelId === target.channelId)),
      publications: db.db.prepare("SELECT clip_id AS clipId,banner,state,url,error,comment_status AS commentStatus FROM gta6_youtube_publications WHERE owner_id=?").all(ownerId),
      automation: db.db.prepare(`SELECT banner,enabled,initial_remaining AS initialRemaining,next_at AS nextAt,error
        FROM gta6_youtube_automation WHERE owner_id=?`).all(ownerId),
    };
  }

  app.get(API, async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    reply.header("Cache-Control", "private, no-store");
    return view(ownerId);
  });

  app.put(`${API}/target`, async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const input = targetInput.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: "Выберите канал YouTube." });
    const { banner, accountId } = input.data;
    if (accountId === null) {
      db.db.prepare("DELETE FROM gta6_youtube_targets WHERE owner_id=? AND banner=?").run(ownerId, banner);
      return view(ownerId);
    }
    const channel = accounts(ownerId).find(account => account.id === accountId);
    if (!channel) return reply.code(400).send({ error: "Сначала подтвердите вход в этот канал YouTube." });
    if (db.db.prepare("SELECT 1 FROM gta6_youtube_targets WHERE owner_id=? AND banner<>? AND channel_id=?").get(ownerId, banner, channel.channelId)) {
      return reply.code(409).send({ error: "Для каждого баннера нужен отдельный канал YouTube." });
    }
    db.db.prepare(`INSERT INTO gta6_youtube_targets(owner_id,banner,account_id,channel_id) VALUES(?,?,?,?)
      ON CONFLICT(owner_id,banner) DO UPDATE SET account_id=excluded.account_id,channel_id=excluded.channel_id`).run(ownerId, banner, accountId, channel.channelId);
    return view(ownerId);
  });

  function deferClip(ownerId: number, banner: Gta6Banner, id: string, resumeAt: number) {
    db.db.prepare(`UPDATE gta6_youtube_automation SET pending_clip=NULL,next_at=?,error=NULL
      WHERE owner_id=? AND banner=? AND pending_clip=?`).run(resumeAt, ownerId, banner, id);
  }

  async function publish(ownerId: number, id: string, banner: Gta6Banner, confirmed: Target, scheduled = false) {
    const checkSchedule = () => {
      if (!scheduled) return;
      if (!db.db.prepare(`SELECT 1 FROM gta6_youtube_automation WHERE owner_id=? AND banner=? AND pending_clip=? AND enabled=1`)
        .get(ownerId, banner, id)) throw new PublicationError(409, "Автопубликация выключена.");
      const timestamp = now();
      const resumeAt = nextAllowedTime(timestamp);
      if (resumeAt > timestamp) throw new NightPause(resumeAt);
    };
    const started = db.db.prepare("SELECT 1 FROM gta6_youtube_publications WHERE owner_id=? AND clip_id=? AND banner=? AND state<>'failed'")
      .get(ownerId, id, banner);
    if (started) throw new PublicationError(409, "Отправка уже началась или ролик уже опубликован.");
    const library = libraryFor(ownerId);
    const file = library.file(id, banner);
    if (!(await stat(file).catch(() => null))?.isFile()) throw new PublicationError(404, "Ролик не найден.");
    const media = await probe(file).catch(() => null);
    if (!media || !Number.isFinite(media.width) || !Number.isFinite(media.height) || media.width <= 0 ||
      media.height < media.width || !Number.isFinite(media.duration) || media.duration <= 0 || media.duration > 180) {
      throw new PublicationError(422, "Для Shorts нужен вертикальный или квадратный ролик длительностью до 3 минут.");
    }
    const thumbnail = await prepareGta6Preview(library, id, banner).catch(() => undefined);
    const target = view(ownerId).targets.find(item => item.banner === banner);
    if (target?.accountId !== confirmed.accountId || target.channelId !== confirmed.channelId) {
      throw new PublicationError(409, "Канал для этого баннера изменился. Обновите страницу.");
    }
    checkSchedule();
    const insert = db.db.prepare(`INSERT INTO gta6_youtube_publications(owner_id,clip_id,banner,state) VALUES(?,?,?,'uploading')
      ON CONFLICT(owner_id,clip_id,banner) DO UPDATE SET state='uploading',url=NULL,error=NULL,comment_status=NULL WHERE state='failed'`).run(ownerId, id, banner);
    if (!insert.changes) throw new PublicationError(409, "Отправка уже началась или ролик уже опубликован.");

    const caption = captions[banner];
    const update = (state: string, url: string | null, error: string | null = null, commentStatus: string | null = null) => {
      db.db.prepare("UPDATE gta6_youtube_publications SET state=?,url=?,error=?,comment_status=? WHERE owner_id=? AND clip_id=? AND banner=?")
        .run(state, url, error, commentStatus, ownerId, id, banner);
    };
    let submitted: string | null = null;
    let published: string | null = null;
    void uploader.publishManually({
      ownerId, accountId: target.accountId, channelId: target.channelId, file,
      title: "GTA 6 — момент со стрима #Shorts",
      description: `Момент из GTA 6. ${caption.text}\n\n#GTA6 #Shorts ${caption.tag}`,
      thumbnail,
      comment: caption.text,
      onSubmit(url) {
        checkSchedule();
        update("submitted", url); submitted = url;
      },
      onPublished(url) { update("published", url, null, "pending"); published = url; },
    }).then(commented => {
      if (published) update("published", published, null, commented ? "posted" : "unconfirmed");
    }).catch(error => {
      if (error instanceof NightPause && !submitted) {
        update("failed", null, error.message);
        deferClip(ownerId, banner, id, error.resumeAt);
        return;
      }
      const diagnostic = error instanceof Error ? error.message.replace(/https?:[^\s]+/giu, "[url]").slice(0, 240) : "Unknown error";
      app.log.warn({ banner, stage: published ? "published" : submitted ? "submitted" : "before submit", diagnostic }, "GTA Shorts upload was interrupted");
      if (published) update("published", published, null, "unconfirmed");
      else if (submitted) update("review", submitted, "Проверьте результат в YouTube. Повторная отправка заблокирована.");
      else update("failed", null, "Отправка не началась. Проверьте вход и попробуйте ещё раз.");
    }).catch(error => app.log.error({ err: error }, "Could not update GTA 6 publication status"));
  }

  app.post(`${API}/:id/:banner`, async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const input = params.safeParse(req.params);
    if (!input.success) return reply.code(400).send({ error: "Проверьте ролик и баннер." });
    const confirmed = confirmedTarget.safeParse(req.body);
    if (!confirmed.success) return reply.code(400).send({ error: "Подтвердите канал публикации." });
    try { await publish(ownerId, input.data.id, input.data.banner, confirmed.data); }
    catch (error) {
      if (error instanceof PublicationError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
    return reply.code(202).send(view(ownerId));
  });

  async function runAutomation(job: Automation) {
    const { ownerId, banner, pendingClip, initialRemaining } = job;
    const timestamp = now();
    if (pendingClip) {
      const receipt = db.db.prepare(`SELECT state,comment_status AS commentStatus FROM gta6_youtube_publications
        WHERE owner_id=? AND banner=? AND clip_id=?`).get(ownerId, banner, pendingClip);
      if (receipt?.state === "uploading" || receipt?.state === "submitted" || receipt?.commentStatus === "pending") return;
      if (receipt?.state === "review") {
        db.db.prepare("UPDATE gta6_youtube_automation SET enabled=0,error=? WHERE owner_id=? AND banner=?")
          .run("Проверьте последнюю отправку в YouTube.", ownerId, banner);
        return;
      }
      const posted = receipt?.state === "published";
      const remaining = posted ? Math.max(0, initialRemaining - 1) : initialRemaining;
      db.db.prepare(`UPDATE gta6_youtube_automation SET pending_clip=NULL,initial_remaining=?,next_at=?,error=?
        WHERE owner_id=? AND banner=?`).run(remaining, nextAllowedTime(posted && remaining > 0 ? timestamp : timestamp + HOUR_MS),
          posted ? null : "Не удалось отправить ролик. Очередь попробует снова по расписанию.", ownerId, banner);
      return;
    }
    const nextAt = nextAllowedTime(Math.max(timestamp, job.nextAt));
    if (nextAt > timestamp) {
      if (nextAt !== job.nextAt) db.db.prepare("UPDATE gta6_youtube_automation SET next_at=? WHERE owner_id=? AND banner=?")
        .run(nextAt, ownerId, banner);
      return;
    }
    const target = view(ownerId).targets.find(item => item.banner === banner);
    if (!target) return;
    const receipts = db.db.prepare("SELECT clip_id AS id,state FROM gta6_youtube_publications WHERE owner_id=? AND banner=?").all(ownerId, banner);
    if (receipts.some(item => item.state === "uploading" || item.state === "submitted")) return;
    const used = new Set(receipts.filter(item => item.state !== "failed").map(item => item.id));
    const clips = (await libraryFor(ownerId).list()).filter(clip => !clip.published && !used.has(clip.id) && (clip.duration ?? 0) <= 180);
    while (clips.length) {
      const [clip] = clips.splice(randomInt(clips.length), 1);
      if (!clip) break;
      const reserve = db.db.prepare(`UPDATE gta6_youtube_automation SET pending_clip=?,error=NULL
        WHERE owner_id=? AND banner=? AND enabled=1 AND pending_clip IS NULL`).run(clip.id, ownerId, banner);
      if (!reserve.changes) return;
      try { await publish(ownerId, clip.id, banner, target, true); return; }
      catch (error) {
        if (error instanceof NightPause) {
          deferClip(ownerId, banner, clip.id, error.resumeAt);
          return;
        }
        db.db.prepare("UPDATE gta6_youtube_automation SET pending_clip=NULL WHERE owner_id=? AND banner=? AND pending_clip=?")
          .run(ownerId, banner, clip.id);
        if (!(error instanceof PublicationError) || ![404, 422].includes(error.status)) return;
      }
    }
    db.db.prepare("UPDATE gta6_youtube_automation SET next_at=? WHERE owner_id=? AND banner=?")
      .run(nextAllowedTime(timestamp + 60_000), ownerId, banner);
  }

  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const jobs = db.db.prepare(`SELECT owner_id AS ownerId,banner,initial_remaining AS initialRemaining,next_at AS nextAt,
        pending_clip AS pendingClip FROM gta6_youtube_automation WHERE enabled=1`).all() as Automation[];
      for (const job of jobs) await runAutomation(job).catch(error => app.log.error({ err: error }, "Could not schedule GTA Shorts"));
    } finally { running = false; }
  }
  app.addHook("onReady", async () => {
    timer = setInterval(() => { void tick(); }, 15_000).unref();
  });
  app.addHook("onClose", async () => { clearInterval(timer); });

  app.put(`${API}/automation`, async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const data = automationInput.safeParse(req.body);
    if (!data.success) return reply.code(400).send({ error: "Проверьте настройку автопубликации." });
    const { banner, enabled } = data.data;
    db.db.prepare(`INSERT INTO gta6_youtube_automation(owner_id,banner,enabled) VALUES(?,?,?)
      ON CONFLICT(owner_id,banner) DO UPDATE SET enabled=excluded.enabled,
        next_at=CASE WHEN excluded.enabled=1 AND initial_remaining>0 AND pending_clip IS NULL THEN 0 ELSE next_at END,
        error=CASE WHEN excluded.enabled=1 AND initial_remaining>0 AND pending_clip IS NULL THEN NULL ELSE error END`)
      .run(ownerId, banner, Number(enabled));
    return view(ownerId);
  });

  return { tick };
}
