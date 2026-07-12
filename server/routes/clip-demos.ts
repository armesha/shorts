// Clip-demos gallery API. The page is open to ALL logged-in users, but each user only sees the packs
// they may access: pack id === deck id, so visibility follows the same deck-access rules as channel
// sources (admin → all; others → granted preFact decks). The raw admin-demos manifest stays admin-only
// (served via /files) — this endpoint returns the already-filtered list so non-admins never see the
// titles of packs they can't access.
import type { FastifyInstance } from "fastify";
import { readFileSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";

type ManifestPack = { id: string; title: string; lang?: string; items: unknown[] };
type ManifestItem = { id: string; title?: string };
const VOICED_MEMES_PACK = "voiced-memes-ru";
const VOICED_MEMES_ITEM = /^vmru_batch_([a-z0-9_-]+)$/i;

function writeJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

export function registerClipDemosRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { deckAllowed } = deps.deckAccess;
  const MANIFEST = resolve(process.cwd(), deps.outputDir, "admin-demos/manifest.json");
  const VOICED_MEMES_VIDEOS = resolve(process.cwd(), `data/${VOICED_MEMES_PACK}/videos.json`);
  const VOICED_MEMES_SAFETY = resolve(process.cwd(), `data/${VOICED_MEMES_PACK}/safety-review.json`);
  const VOICED_MEMES_WAV = resolve(process.cwd(), "output/speech/memoteka-267-batch/wav");
  const VOICED_MEMES_RENDERED = resolve(process.cwd(), "tmp/memoteka-267-videos");

  const isArmen = (req: unknown) => db.getUserById((req as { userId?: number }).userId ?? 0)?.username.trim().toLowerCase() === "armen";

  app.get("/api/clip-demos/packs", async (req) => {
    if (!existsSync(MANIFEST)) return { packs: [] };
    let packs: ManifestPack[] = [];
    try {
      packs = (JSON.parse(readFileSync(MANIFEST, "utf8")).packs as ManifestPack[]) ?? [];
    } catch {
      return { packs: [] };
    }
    const visible = packs.filter(
      (p) => Array.isArray(p.items) && p.items.length > 0 && deckAllowed(req, p.id),
    );
    return { packs: visible };
  });

  app.delete<{ Params: { packId: string; itemId: string } }>("/api/clip-demos/packs/:packId/items/:itemId", async (req, reply) => {
    const { packId, itemId } = req.params;
    if (packId !== VOICED_MEMES_PACK || !isArmen(req)) return reply.code(403).send({ error: "Этот ролик может удалить только его владелец." });
    if (!/^[a-z0-9_-]+$/i.test(itemId)) return reply.code(400).send({ error: "Некорректный идентификатор ролика." });
    if (!existsSync(MANIFEST)) return reply.code(404).send({ error: "Ролик не найден." });

    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { packs?: ManifestPack[] };
    const pack = manifest.packs?.find((entry) => entry.id === packId);
    const item = pack?.items.find((entry): entry is ManifestItem => typeof entry === "object" && entry !== null && (entry as ManifestItem).id === itemId);
    if (!pack || !item) return reply.code(404).send({ error: "Ролик не найден." });

    const sourceId = VOICED_MEMES_ITEM.exec(itemId)?.[1] ?? null;
    if (sourceId) {
      const safety = existsSync(VOICED_MEMES_SAFETY)
        ? JSON.parse(readFileSync(VOICED_MEMES_SAFETY, "utf8")) as Record<string, unknown>
        : {};
      const userRemoved = (safety.userRemoved && typeof safety.userRemoved === "object" ? safety.userRemoved : {}) as Record<string, unknown>;
      userRemoved[sourceId] = { removedAt: new Date().toISOString(), reason: "Удалено владельцем из Нарезок" };
      safety.userRemoved = userRemoved;
      writeJsonAtomic(VOICED_MEMES_SAFETY, safety);
    }

    pack.items = pack.items.filter((entry) => !(typeof entry === "object" && entry !== null && (entry as ManifestItem).id === itemId));
    writeJsonAtomic(MANIFEST, manifest);

    if (existsSync(VOICED_MEMES_VIDEOS)) {
      const videos = JSON.parse(readFileSync(VOICED_MEMES_VIDEOS, "utf8")) as Array<{ file?: string }>;
      writeJsonAtomic(VOICED_MEMES_VIDEOS, videos.filter((entry) => entry.file !== `${VOICED_MEMES_PACK}/${itemId}.mp4`));
    }

    for (const file of [
      resolve(process.cwd(), `assets/fact-videos/${VOICED_MEMES_PACK}/${itemId}.mp4`),
      resolve(process.cwd(), deps.outputDir, `admin-demos/${itemId}.mp4`),
      resolve(process.cwd(), deps.outputDir, `admin-demos/${itemId}.jpg`),
      ...(sourceId ? [resolve(VOICED_MEMES_WAV, `${sourceId}.wav`), resolve(VOICED_MEMES_RENDERED, `${sourceId}.mp4`)] : []),
    ]) rmSync(file, { force: true });

    return { ok: true, itemId };
  });
}
