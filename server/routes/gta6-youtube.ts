import { stat } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.ts";
import { uid } from "../infra/auth-session.ts";
import type { CircleYouTubePublisher } from "../services/circle-pipeline/youtube-publisher.ts";
import { GTA6_BANNERS, GTA6_CLIP_ID, type Gta6Banner, type Gta6Library } from "../services/gta6-library.ts";
import { probeCuttingMedia } from "../services/video-cutting.ts";
import { sameOrigin } from "./gta6-live.ts";

const API = "/api/creator/gta6-youtube";
const params = z.object({ id: z.string().regex(GTA6_CLIP_ID), banner: z.enum(GTA6_BANNERS) });
const targetInput = z.object({ banner: z.enum(GTA6_BANNERS), accountId: z.number().int().positive().nullable() }).strict();
const confirmedTarget = z.object({ accountId: z.number().int().positive(), channelId: z.string().regex(/^UC[\w-]{22}$/u) }).strict();
const captions = {
  shortrobot: { text: "@shortrobot — бот для скачивания видео в Telegram.", tag: "#Shortrobot" },
  simka: { text: "SIMKA VPN в Telegram — @simka_dbot.", tag: "#SimkaVPN" },
};

export function isGta6YouTubeUploading(db: Db, ownerId: number, clipId: string) {
  return Boolean(db.db.prepare(`SELECT 1 FROM gta6_youtube_publications WHERE owner_id=? AND clip_id=? AND state IN ('uploading','submitted')`).get(ownerId, clipId));
}

export function registerGta6YouTubeRoutes(app: FastifyInstance, db: Db, libraryFor: (ownerId: number) => Gta6Library,
  uploader: Pick<CircleYouTubePublisher, "publishManually">, probe = probeCuttingMedia) {
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

  app.post(`${API}/:id/:banner`, async (req, reply) => {
    const ownerId = uid(req);
    if (!ownerId) return reply.code(401).send({ error: "Не авторизован" });
    if (!sameOrigin(req)) return reply.code(403).send({ error: "Запрос с другого сайта запрещён." });
    const input = params.safeParse(req.params);
    if (!input.success) return reply.code(400).send({ error: "Проверьте ролик и баннер." });
    const confirmed = confirmedTarget.safeParse(req.body);
    if (!confirmed.success) return reply.code(400).send({ error: "Подтвердите канал публикации." });
    const { id, banner } = input.data;
    const started = db.db.prepare("SELECT 1 FROM gta6_youtube_publications WHERE owner_id=? AND clip_id=? AND banner=? AND state<>'failed'")
      .get(ownerId, id, banner);
    if (started) return reply.code(409).send({ error: "Отправка уже началась или ролик уже опубликован." });
    const library = libraryFor(ownerId);
    const file = library.file(id, banner);
    if (!(await stat(file).catch(() => null))?.isFile()) return reply.code(404).send({ error: "Ролик не найден." });
    const media = await probe(file).catch(() => null);
    if (!media || !Number.isFinite(media.width) || !Number.isFinite(media.height) || media.width <= 0 ||
      media.height < media.width || !Number.isFinite(media.duration) || media.duration <= 0 || media.duration > 180) {
      return reply.code(422).send({ error: "Для Shorts нужен вертикальный или квадратный ролик длительностью до 3 минут." });
    }
    const target = view(ownerId).targets.find(item => item.banner === banner);
    if (target?.accountId !== confirmed.data.accountId || target.channelId !== confirmed.data.channelId) {
      return reply.code(409).send({ error: "Канал для этого баннера изменился. Обновите страницу." });
    }
    const insert = db.db.prepare(`INSERT INTO gta6_youtube_publications(owner_id,clip_id,banner,state) VALUES(?,?,?,'uploading')
      ON CONFLICT(owner_id,clip_id,banner) DO UPDATE SET state='uploading',url=NULL,error=NULL,comment_status=NULL WHERE state='failed'`).run(ownerId, id, banner);
    if (!insert.changes) return reply.code(409).send({ error: "Отправка уже началась или ролик уже опубликован." });

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
      comment: caption.text,
      onSubmit(url) { update("submitted", url); submitted = url; },
      onPublished(url) { update("published", url, null, "pending"); published = url; },
    }).then(commented => {
      if (published) update("published", published, null, commented ? "posted" : "unconfirmed");
    }).catch(() => {
      if (published) update("published", published, null, "unconfirmed");
      else if (submitted) update("review", submitted, "Проверьте результат в YouTube. Повторная отправка заблокирована.");
      else update("failed", null, "Отправка не началась. Проверьте вход и попробуйте ещё раз.");
    }).catch(error => app.log.error({ err: error }, "Could not update GTA 6 publication status"));
    return reply.code(202).send(view(ownerId));
  });
}
