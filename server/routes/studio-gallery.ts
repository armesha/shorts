// Studio + Gallery + generators list + backgrounds/music + the random pre-built fact-video preview.
// Handlers moved VERBATIM from index.ts. The disk-render serialization chain (galleryChain) and the
// preview/video filename counters are LOCAL to this module (they were module-level in index.ts).
import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";
import { getDeck, isPlainAnecdoteDeck, pickGenericTitle } from "../../src/anecdotes/decks.ts";
import { randomAnecdote, firstAnecdote, libraryStats, anecdoteKey, packItemKey, deckCards } from "../../src/anecdotes/library.ts";
import type { PackItem } from "../../src/anecdotes/library.ts";
import { renderAnecdote, renderJokeMotionOverlay, listBackgrounds } from "../../src/anecdotes/render.ts";
import {
  assembleStillVideo,
  assembleVideoBackground,
  listAudio,
  pickJokeMotionOverlay,
  pickJokeVideoBackground,
  pickLifehackMotionOverlay,
  resolveAudio,
  downscaleImage,
} from "../../src/video.ts";
import { INFINITE_PACKS_FEATURE, infiniteCounts } from "../services/infinite-packs.ts";
import * as metrics from "../infra/metrics.ts";
import { rememberOutputOwner } from "../infra/output-access.ts";
import { uid } from "../infra/auth-session.ts";
import type { RouteDeps, LimitedReplyish } from "./deps.ts";

const STUDIO_IMAGE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 };
const STUDIO_VIDEO_LIMIT = { limit: 3, windowMs: 10 * 60 * 1000 };

export function registerStudioGalleryRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { enforceGenerationWindow, runHeavyGenerationLimited, outputDir } = deps;
  const { deckAllowed, visibleDecksForUser } = deps.deckAccess;
  const OUTPUT_ROOT = resolve(process.cwd(), outputDir);

  // ---- Generators / Studio (per-user used counter) ----
  app.get("/api/generators", async (req) => {
    const userId = uid(req);
    const used = db.usedAnecdoteKeys(userId);
    // «Бесконечный пак»: у этого юзера деки показывают полный размер свободным.
    // Реальный учёт не трогаем (см. infinite-packs.ts).
    const infinite = db.hasFeature(userId, INFINITE_PACKS_FEATURE);
    const base = visibleDecksForUser(userId).map((d) => {
      const s = libraryStats(d.id, used);
      const c = infinite ? infiniteCounts(s.total) : { total: s.total, used: s.used, available: s.available };
      return {
        id: d.id,
        name: d.name,
        ai: false,
        preFact: !!d.preFact, // pre-built video pack (no text render) — Studio shows a random video
        longVideo: !!d.longVideo, // long compilation built from many short scenes
        gallery: !!d.gallery, // static deck (deterministic per-card render) — browsable in the Gallery page
        total: c.total,
        titled: infinite ? c.total : s.titled,
        used: c.used,
        available: c.available,
        packs: s.packs,
        range: s.range,
        readyPacks: s.readyPacks,
        untitledPacks: infinite ? 0 : s.untitledPacks,
        untitledTotal: infinite ? 0 : s.untitledTotal,
      };
    });
    return base;
  });

  // ---- Gallery (static "gallery" decks: browse all cards + pick a specific one) ----
  // Thumbnails are rendered on demand (deterministic per card) and cached on disk; one render at a time.
  let galleryChain: Promise<unknown> = Promise.resolve();
  function galleryQueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = galleryChain.then(fn, fn);
    galleryChain = next.then(() => {}, () => {});
    return next as Promise<T>;
  }

  app.get("/api/gallery/:deck/cards", async (req, reply) => {
    const deckId = (req.params as { deck: string }).deck;
    const deck = getDeck(deckId);
    if (!deck.gallery) return reply.code(400).send({ error: "Это не статичный пак (нет галереи)." });
    if (db.getUserById(uid(req))?.role !== "admin") return reply.code(403).send({ error: "Галерея доступна только администраторам." });
    if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
    const cards = deckCards(deck.id).map((c, i) => {
      let caption = c.title || "";
      try {
        const j = JSON.parse(c.text) as { caption?: string; text?: string };
        caption = (j.caption || j.text || caption).trim();
      } catch {
        caption = (c.text || caption).trim();
      }
      return { i, title: c.title || "", caption, text: c.text };
    });
    return { deck: deck.id, name: deck.name, count: cards.length, cards };
  });

  app.get("/api/gallery/:deck/:i/thumb", async (req, reply) => {
    const { deck: deckId, i } = req.params as { deck: string; i: string };
    const deck = getDeck(deckId);
    if (!deck.gallery || !deckAllowed(req, deck.id)) return reply.code(404).send({ error: "not found" });
    if (db.getUserById(uid(req))?.role !== "admin") return reply.code(404).send({ error: "not found" });
    const idx = Math.max(0, parseInt(i, 10) || 0);
    const card = deckCards(deck.id)[idx];
    if (!card) return reply.code(404).send({ error: "not found" });
    const thumb = resolve(OUTPUT_ROOT, `gallery/${deck.id}/${idx}.jpg`);
    if (!existsSync(thumb)) {
      await galleryQueue(async () => {
        if (existsSync(thumb)) return;
        const png = resolve(OUTPUT_ROOT, `gallery/${deck.id}/${idx}.full.png`);
        await metrics.track("render", () =>
          renderAnecdote({ title: card.title, text: card.text, channel: deck.name, deck: deck.id, profession: card.profession }, png),
        );
        await downscaleImage(png, thumb, 360);
        try { unlinkSync(png); } catch { /* best effort */ }
      });
    }
    if (!existsSync(thumb)) return reply.code(500).send({ error: "render failed" });
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.type("image/jpeg").send(createReadStream(thumb));
  });

  // Random PRE-BUILT fact video (preFact deck) for the Studio preview player — no rendering, no "used" filter.
  app.get("/api/fact/random", async (req, reply) => {
    const deckId = (req.query as { deck?: string })?.deck || "fact-en";
    const deck = getDeck(deckId);
    if (!deck.preFact) return reply.code(400).send({ error: "Это не видео-пак." });
    if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
    const a = db.hasFeature(uid(req), INFINITE_PACKS_FEATURE) ? firstAnecdote(deck.id) : randomAnecdote(deck.id);
    if (!a?.videoFile) return { error: "В этом паке пока нет видео." };
    return { videoUrl: `/fact-videos/${a.videoFile}`, title: a.title, text: a.text };
  });

  let previewCounter = 0;
  app.post("/api/generate/anecdote", async (req, reply) => {
    const body = (req.body as { text?: string; title?: string; bg?: string; avoidBg?: string; deck?: string }) ?? {};
    const deck = getDeck(body.deck);
    if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
    if (!enforceGenerationWindow(req, reply as LimitedReplyish, "studio-image", STUDIO_IMAGE_LIMIT)) return;
    return runHeavyGenerationLimited(req, reply as LimitedReplyish, "studio-image", async () => {
      let text = body.text;
      let title = body.title;
      let profession: string | undefined;
      let pickedItem: PackItem | undefined;
      if (!text) {
        const infinite = db.hasFeature(uid(req), INFINITE_PACKS_FEATURE);
        const a = infinite ? firstAnecdote(deck.id) : randomAnecdote(deck.id, db.usedAnecdoteKeys(uid(req)));
        if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
        text = a.text;
        title = a.title || undefined;
        profession = a.profession;
        pickedItem = a;
        if (!infinite) db.markAnecdoteUsed(uid(req), pickedItem ? packItemKey(pickedItem) : anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот
      }
      if (!title) title = pickGenericTitle(deck);

      previewCounter++;
      const rel = `preview/anek-${Date.now()}-${previewCounter}.png`;
      const out = resolve(process.cwd(), outputDir, rel);
      const r = await metrics.track("render", () =>
        renderAnecdote(
          { title, text, channel: deck.name, bg: body.bg, avoidBg: body.avoidBg, deck: deck.id, profession },
          out,
          pickedItem,
        ),
      );
      rememberOutputOwner([rel], uid(req));
      return { imageUrl: `/files/${rel}`, title, text, chars: text.length, bg: r.bg, fontPx: r.fontPx };
    });
  });

  app.get("/api/backgrounds", async () => listBackgrounds());
  app.get("/api/music", async () => listAudio());

  let videoCounter = 0;
  app.post("/api/generate/anecdote-video", async (req, reply) => {
    const body = (req.body as { text?: string; title?: string; bg?: string; music?: string; deck?: string }) ?? {};
    const deck = getDeck(body.deck);
    if (!deckAllowed(req, deck.id)) return reply.code(403).send({ error: "Этот пак вам недоступен." });
    if (!enforceGenerationWindow(req, reply as LimitedReplyish, "studio-video", STUDIO_VIDEO_LIMIT)) return;
    return runHeavyGenerationLimited(req, reply as LimitedReplyish, "studio-video", async () => {
      let text = body.text;
      let title = body.title;
      let profession: string | undefined;
      let pickedItem: PackItem | undefined;
      if (!text) {
        const infinite = db.hasFeature(uid(req), INFINITE_PACKS_FEATURE);
        const a = infinite ? firstAnecdote(deck.id) : randomAnecdote(deck.id, db.usedAnecdoteKeys(uid(req)));
        if (!a) return { error: "Нет свободных анекдотов (все уже использованы)" };
        text = a.text;
        title = a.title || undefined;
        profession = a.profession;
        pickedItem = a;
        if (!infinite) db.markAnecdoteUsed(uid(req), pickedItem ? packItemKey(pickedItem) : anecdoteKey(text)); // студийная генерация тоже «вычёркивает» анекдот
      }
      if (!title) title = pickGenericTitle(deck);

      // Music: explicit track | "none" = silent | empty = random; islamic/christian get their own ambient bed.
      const { music, audioPath } = resolveAudio(body.music, deck);

      videoCounter++;
      const stamp = `${Date.now()}-${videoCounter}`;
      const imgRel = `preview/anek-${stamp}.png`;
      const vidRel = `preview/anek-${stamp}.mp4`;
      const imgOut = resolve(process.cwd(), outputDir, imgRel);
      const vidOut = resolve(process.cwd(), outputDir, vidRel);
      const seed = `${deck.id}|${profession ?? ""}|${title}|${text}`;
      const motionOverlay = deck.lifehack
        ? pickLifehackMotionOverlay(seed)
        : isPlainAnecdoteDeck(deck)
          ? pickJokeMotionOverlay(seed, text.length)
          : null;
      const videoBg = isPlainAnecdoteDeck(deck) ? pickJokeVideoBackground(seed, text.length) : null;
      const r = await metrics.track("render", async () => {
        const rr = videoBg
          ? await renderJokeMotionOverlay({ title, text, channel: deck.name, deck: deck.id }, imgOut)
          : await renderAnecdote({ title, text, channel: deck.name, bg: body.bg, deck: deck.id, profession }, imgOut, pickedItem);
        if (videoBg) await assembleVideoBackground(videoBg, imgOut, vidOut, { durationSec: 6, audioPath, motionOverlay });
        else await assembleStillVideo(imgOut, vidOut, { durationSec: 6, audioPath, motionOverlay });
        return rr;
      });
      rememberOutputOwner([imgRel, vidRel], uid(req));
      return { videoUrl: `/files/${vidRel}`, imageUrl: `/files/${imgRel}`, title, text, chars: text.length, bg: r.bg, music };
    });
  });
}
